import ImageIO
import PhotosUI
import SwiftUI

struct AuthenticatedImage: View {
  let path: String
  @EnvironmentObject var session: SessionStore
  @State private var image: UIImage?
  @State private var failed = false
  var body: some View {
    Group {
      if let image {
        Image(uiImage: image).resizable().scaledToFit().accessibilityLabel(
          "Photo attached to this post")
      } else if failed {
        StatusMessage(message: "Photo unavailable")
      } else {
        ProgressView().frame(height: 100)
      }
    }.task(id: "\(session.identity)|\(path)") {
      image = nil
      failed = false
      do {
        let data = try await session.api.image(path)
        if !Task.isCancelled {
          image = UIImage(data: data)
          failed = image == nil
        }
      } catch { if !Task.isCancelled { failed = true } }
    }
  }
}

struct PostCard: View {
  let tag: Tag
  let changed: () -> Void
  @EnvironmentObject var session: SessionStore
  @State private var comments = false
  @State private var auth = false
  @State private var deleting = false
  @State private var error: String?
  @State private var busy = false
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text(tag.author.displayName).font(.headline)
        Spacer()
        Text(Date(timeIntervalSince1970: Double(tag.createdAt) / 1000), style: .date).font(.caption)
          .foregroundStyle(AppTheme.secondary)
      }
      if tag.author.id == session.user?.id, tag.moderationStatus != .approved {
        StatusMessage(message: processingLabel)
      }
      if let note = tag.note { Text(note).textSelection(.enabled) }
      ForEach(tag.media, id: \.id) { media in
        if media.kind == .image {
          AuthenticatedImage(path: media.url)
        } else if let url = URL(string: media.url), ["http", "https"].contains(url.scheme ?? "") {
          Link(media.url, destination: url).lineLimit(3).frame(minHeight: 44, alignment: .leading)
        }
      }
      if tag.moderationStatus == .approved {
        ViewThatFits(in: .horizontal) {
          reactionRow
          ScrollView(.horizontal, showsIndicators: false) { reactionRow }
        }
        Button("Comments (\(tag.commentCount))") { comments = true }.frame(minHeight: 44)
        ForEach(tag.recentComments ?? [], id: \.id) { comment in
          Text("\(comment.author.displayName): \(comment.body)").font(.subheadline).foregroundStyle(
            AppTheme.secondary)
        }
      }
      if session.user?.id == tag.author.id {
        Button("Delete post", role: .destructive) { deleting = true }.frame(minHeight: 44)
      }
      if let error { StatusMessage(message: error) }
    }.padding(.vertical, 20).overlay(alignment: .bottom) {
      Rectangle().fill(AppTheme.border).frame(height: 1)
    }
    .sheet(isPresented: $comments) { CommentsView(tagID: tag.id, changed: changed) }
    .sheet(isPresented: $auth) { AuthView() }
    .confirmationDialog(
      "Delete this post and its attachments?", isPresented: $deleting, titleVisibility: .visible
    ) {
      Button("Delete post", role: .destructive) {
        Task {
          do {
            _ = try await session.api.data("/api/tags/\(tag.id)", method: "DELETE")
            changed()
          } catch { self.error = error.localizedDescription }
        }
      }
    }
  }
  private var processingLabel: String {
    switch tag.processingState {
    case .reviewFailed:
      return "Review failed — a server operator needs to retry. This is not a rejection."
    case .delayed: return "Review delayed — the server will retry. Only you can see this post."
    case .rejected: return "Rejected — only you can see this post."
    default:
      return tag.moderationStatus == .rejected
        ? "Rejected — only you can see this post." : "Pending review — only you can see this post."
    }
  }
  private var reactionRow: some View {
    HStack(spacing: 4) {
      ForEach(StarTaggerAPI.reactionEmojis, id: \.self) { emoji in
        Button {
          Task { await react(emoji) }
        } label: {
          Text("\(emoji) \(tag.reactionCounts[emoji] ?? 0)").font(.subheadline).padding(
            .horizontal, 6
          ).frame(minHeight: 44).background(
            (tag.myReactions ?? []).contains(emoji) ? AppTheme.overlay : .clear)
        }
        .accessibilityLabel("\(emoji), \(tag.reactionCounts[emoji] ?? 0) reactions")
        .accessibilityAddTraits((tag.myReactions ?? []).contains(emoji) ? .isSelected : [])
        .disabled(busy)
      }
    }
  }
  private func react(_ emoji: String) async {
    guard session.signedIn else {
      auth = true
      return
    }
    busy = true
    defer { busy = false }
    do {
      let _: ReactionResponse = try await session.api.send(
        "/api/tags/\(tag.id)/reactions/\(APIClient.query(emoji))",
        method: (tag.myReactions ?? []).contains(emoji) ? "DELETE" : "PUT")
      changed()
    } catch { self.error = error.localizedDescription }
  }
}

struct PostComposer: View {
  let star: SkyStar
  @EnvironmentObject var session: SessionStore
  @Environment(\.dismiss) private var dismiss
  @State private var note = ""
  @State private var links = ""
  @State private var picks: [PhotosPickerItem] = []
  @State private var photos: [Data] = []
  @State private var camera = false
  @State private var busy = false
  @State private var processingPhotos = false
  @State private var error: String?
  @State private var progress: Double = 0
  @State private var draft: MultipartDraft?
  private var linkValues: [String] {
    links.split(whereSeparator: \.isNewline).map {
      String($0).trimmingCharacters(in: .whitespacesAndNewlines)
    }.filter { !$0.isEmpty }
  }
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 20) {
          Text(star.title).font(.title2.bold())
          if draft != nil {
            StatusMessage(
              message: "A submission is awaiting confirmation. Retry sends the same saved post.")
          }
          TextEditor(text: $note).frame(minHeight: 110).padding(8).background(AppTheme.overlay)
            .accessibilityLabel("Post note").disabled(busy || draft != nil)
          Text("\(note.unicodeScalars.count) / 140 characters").font(.caption).monospacedDigit()
          TextField("Links, one per line", text: $links, axis: .vertical)
            .textInputAutocapitalization(.never).autocorrectionDisabled().appField().disabled(
              busy || draft != nil)
          ForEach(Array(photos.enumerated()), id: \.offset) { i, data in
            if let image = UIImage(data: data) {
              Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 180)
            }
            Button("Remove photo \(i + 1)") { photos.remove(at: i) }.disabled(busy || draft != nil)
          }
          PhotosPicker(
            selection: $picks, maxSelectionCount: max(1, 4 - photos.count - linkValues.count),
            matching: .images
          ) { Label("Choose photos", systemImage: "photo") }.frame(minHeight: 44).disabled(
            busy || draft != nil || photos.count + linkValues.count >= 4 || processingPhotos)
          if UIImagePickerController.isSourceTypeAvailable(.camera) {
            Button("Take photo") { camera = true }.frame(minHeight: 44).disabled(
              busy || draft != nil || photos.count + linkValues.count >= 4)
          }
          Text("Up to four photos and links combined. Photos are resized before upload.").font(
            .footnote
          ).foregroundStyle(AppTheme.secondary)
          if processingPhotos { ProgressView("Preparing photos…") }
          if busy { ProgressView(value: progress) }
          if let error { StatusMessage(message: error) }
          Button(busy ? "Publishing…" : draft == nil ? "Publish post" : "Retry saved post") {
            Task { await publish() }
          }.buttonStyle(PrimaryButtonStyle()).disabled(
            busy || processingPhotos || note.unicodeScalars.count > 140)
        }.padding(24)
      }.appScreen().navigationTitle("Add post").navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Close") { dismiss() }.disabled(busy)
          }
        }
        .interactiveDismissDisabled(busy)
        .onAppear {
          draft = PendingWrites.load(
            MultipartDraft.self, namespace: session.identity, resource: "post-\(star.id)")
          if let draft {
            note = draft.note ?? ""
            links = (draft.links ?? []).joined(separator: "\n")
            photos = draft.images ?? []
          }
        }
        .onChange(of: picks) { _, values in Task { await importPhotos(values) } }
        .sheet(isPresented: $camera) {
          CameraCapture { image in
            do {
              if let data = image.jpegData(compressionQuality: 0.9) {
                photos.append(try Self.normalize(data))
              }
            } catch { self.error = error.localizedDescription }
          }
        }
    }
  }
  private func importPhotos(_ values: [PhotosPickerItem]) async {
    guard !values.isEmpty else { return }
    processingPhotos = true
    defer {
      processingPhotos = false
      picks = []
    }
    do {
      for item in values.prefix(max(0, 4 - photos.count - linkValues.count)) {
        if let data = try await item.loadTransferable(type: Data.self) {
          let normalized = try await Task.detached { try Self.normalize(data) }.value
          photos.append(normalized)
        }
      }
    } catch { self.error = error.localizedDescription }
  }
  nonisolated static func normalize(_ data: Data) throws -> Data {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let cg = CGImageSourceCreateThumbnailAtIndex(
        source, 0,
        [
          kCGImageSourceCreateThumbnailFromImageAlways: true,
          kCGImageSourceCreateThumbnailWithTransform: true,
          kCGImageSourceThumbnailMaxPixelSize: 2048,
        ] as CFDictionary),
      let jpg = UIImage(cgImage: cg).jpegData(compressionQuality: 0.85),
      jpg.count <= 5 * 1024 * 1024
    else {
      throw ClientError(message: "This photo could not be prepared. Choose a different image.")
    }
    return jpg
  }
  private func publish() async {
    let requestedIdentity = session.identity
    busy = true
    error = nil
    progress = 0
    defer { busy = false }
    do {
      if draft == nil {
        for link in linkValues { try LinkValidation.validate(link) }
        draft = try MultipartDraft(starID: star.id, note: note, links: linkValues, images: photos)
        try PendingWrites.save(draft, namespace: session.identity, resource: "post-\(star.id)")
      }
      guard let draft else { return }
      var request = try session.api.request("/api/tags", method: "POST", key: draft.key)
      request.setValue(
        "multipart/form-data; boundary=\(draft.boundary)", forHTTPHeaderField: "Content-Type")
      let delegate = UploadProgress { value in progress = value }
      let (data, response) = try await session.api.session.upload(
        for: request, from: draft.body, delegate: delegate)
      try session.api.validate(
        data, response,
        expireSession: request.value(forHTTPHeaderField: "Authorization")
          == session.api.token.map { "Bearer \($0)" })
      _ = try StarTaggerAPI.decoder.decode(CreateTagResponse.self, from: data)
      PendingWrites.remove(namespace: requestedIdentity, resource: "post-\(star.id)")
      session.revision += 1
      dismiss()
    } catch let apiError as APIErrorBody {
      if [
        "validation_failed", "empty_post", "invalid_link", "invalid_image", "payload_too_large",
        "unsupported_media_type", "not_star_owner",
      ].contains(apiError.error.code) {
        draft = nil
        PendingWrites.remove(namespace: requestedIdentity, resource: "post-\(star.id)")
      }
      error = apiError.localizedDescription
    } catch { self.error = error.localizedDescription }
  }
}

final class UploadProgress: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  let update: @MainActor (Double) -> Void
  init(update: @escaping @MainActor (Double) -> Void) { self.update = update }
  func urlSession(
    _ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
    totalBytesSent: Int64, totalBytesExpectedToSend: Int64
  ) {
    guard totalBytesExpectedToSend > 0 else { return }
    let value = Double(totalBytesSent) / Double(totalBytesExpectedToSend)
    Task { @MainActor in update(value) }
  }
}

enum LinkValidation {
  static func validate(_ text: String) throws {
    guard text.count <= 2048, let url = URL(string: text),
      ["http", "https"].contains(url.scheme?.lowercased() ?? ""), let raw = url.host,
      url.user == nil, url.password == nil
    else {
      throw ClientError(
        message: "Links must be public HTTP or HTTPS addresses without credentials.")
    }
    let host = raw.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
    let components = host.split(separator: ".").compactMap { Int($0) }
    let privateIPv4 =
      components.count == 4
      && (components[0] == 10 || components[0] == 127 || components[0] == 0
        || (components[0] == 192 && components[1] == 168)
        || (components[0] == 172 && (16...31).contains(components[1]))
        || (components[0] == 169 && components[1] == 254))
    guard host != "localhost", !host.hasSuffix(".localhost"), !host.hasSuffix(".local"),
      !privateIPv4,
      !(["::1", "[::1]", "::", "[::]"].contains(host)), !host.hasPrefix("[fc"),
      !host.hasPrefix("[fd"), !host.hasPrefix("[fe80"),
      !(host.contains(":")
        && (host.hasPrefix("fc") || host.hasPrefix("fd") || host.hasPrefix("fe80:")))
    else { throw ClientError(message: "Links must not point to local or private addresses.") }
  }
}

struct CameraCapture: UIViewControllerRepresentable {
  let received: (UIImage) -> Void
  @Environment(\.dismiss) private var dismiss
  func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
  func makeUIViewController(context: Context) -> UIImagePickerController {
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    picker.delegate = context.coordinator
    return picker
  }
  func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
  final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate
  {
    let parent: CameraCapture
    init(parent: CameraCapture) { self.parent = parent }
    func imagePickerController(
      _ picker: UIImagePickerController,
      didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
      if let image = info[.originalImage] as? UIImage { parent.received(image) }
      parent.dismiss()
    }
    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
  }
}
