import SwiftUI

struct CommentsView: View {
  let tagID: String
  let changed: () -> Void
  @EnvironmentObject var session: SessionStore
  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var phase
  @State private var items: [Comment] = []
  @State private var cursor: String?
  @State private var loadedPages = 1
  @State private var text = ""
  @State private var key: String?
  @State private var submittedText: String?
  @State private var busy = false
  @State private var error: String?
  @State private var auth = false
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          if items.isEmpty { Text("No visible comments yet.").foregroundStyle(AppTheme.secondary) }
          ForEach(items, id: \.id) { comment in
            VStack(alignment: .leading, spacing: 8) {
              Text(comment.author.displayName).font(.headline)
              Text(comment.body)
              if comment.moderationStatus != .approved {
                Text(
                  comment.processingState == .reviewFailed
                    ? "Review failed — server retry needed"
                    : comment.moderationStatus == .rejected
                      ? "Rejected · visible only to you" : "Pending · visible only to you"
                ).font(.caption).foregroundStyle(AppTheme.secondary)
              }
              if comment.author.id == session.user?.id {
                Button("Delete comment") {
                  Task {
                    do {
                      _ = try await session.api.data(
                        "/api/comments/\(comment.id)", method: "DELETE")
                      await load()
                      changed()
                    } catch { self.error = error.localizedDescription }
                  }
                }.frame(minHeight: 44)
              }
            }.padding(.vertical, 12)
            Divider()
          }
          if let cursor { Button("Load more") { Task { await load(cursor) } }.frame(minHeight: 44) }
          if session.signedIn {
            TextField("Add a comment", text: $text, axis: .vertical).appField().disabled(
              busy || key != nil)
            Text("\(text.unicodeScalars.count) / 280").font(.caption)
            Button(busy ? "Sending…" : key == nil ? "Post comment" : "Retry comment") {
              Task { await send() }
            }.buttonStyle(PrimaryButtonStyle()).disabled(
              busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || text.unicodeScalars.count > 280)
          } else {
            Button("Sign in to comment") { auth = true }.buttonStyle(PrimaryButtonStyle())
          }
          if let error { StatusMessage(message: error) }
        }.padding(24)
      }.appScreen().navigationTitle("Comments").toolbar { Button("Done") { dismiss() } }
        .sheet(isPresented: $auth) { AuthView() }
        .onChange(of: session.identity) { _, _ in
          items = []
          cursor = nil
          loadedPages = 1
          key = nil
          submittedText = nil
          text = ""
        }
        .onAppear {
          if let saved = PendingWrites.load(
            PendingComment.self, namespace: session.identity, resource: "comment-\(tagID)")
          {
            key = saved.key
            submittedText = saved.body
            text = saved.body
          }
        }
        .task(id: "\(session.identity)|\(phase)") {
          guard phase == .active else { return }
          while !Task.isCancelled {
            await load()
            do { try await Task.sleep(for: .seconds(5)) } catch { break }
          }
        }
    }
  }
  private func load(_ next: String? = nil) async {
    do {
      let page: Page<Comment> = try await session.api.pages(
        "/api/\(session.signedIn ? "" : "public/")tags/\(tagID)/comments"
          + (next.map { "?cursor=\(APIClient.query($0))" } ?? ""),
        count: next == nil ? loadedPages : 1)
      guard !Task.isCancelled else { return }
      if next == nil {
        items = page.items
      } else {
        items.append(contentsOf: page.items.filter { item in !items.contains { $0.id == item.id } })
      }
      if next != nil { loadedPages += 1 }
      cursor = page.nextCursor
    } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
  }
  private func send() async {
    busy = true
    defer { busy = false }
    if key == nil {
      key = UUID().uuidString
      submittedText = text
    }
    do {
      try PendingWrites.save(
        PendingComment(key: key!, body: submittedText ?? text), namespace: session.identity,
        resource: "comment-\(tagID)")
      let _: CreateCommentResponse = try await session.api.send(
        "/api/tags/\(tagID)/comments",
        body: APIClient.encode(CreateCommentRequest(body: submittedText ?? text)), key: key)
      PendingWrites.remove(namespace: session.identity, resource: "comment-\(tagID)")
      key = nil
      submittedText = nil
      text = ""
      error = nil
      await load()
      changed()
    } catch let failure as APIErrorBody {
      error = failure.localizedDescription
      if failure.error.code == "validation_failed" {
        PendingWrites.remove(namespace: session.identity, resource: "comment-\(tagID)")
        key = nil
        submittedText = nil
      }
    } catch { self.error = error.localizedDescription }
  }
}
