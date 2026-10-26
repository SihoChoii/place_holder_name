import SwiftUI

struct GuideEntry: Codable, Identifiable {
  let id: UUID
  let role: String
  var text: String
}
struct GuideView: View {
  let selectedID: Int?
  let scopeIDs: [Int]
  let explore: Bool
  @EnvironmentObject var session: SessionStore
  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var phase
  @State private var entries: [GuideEntry] = []
  @State private var input = ""
  @State private var error: String?
  @State private var task: Task<Void, Never>?
  @State private var streaming = false
  private var historyKey: String { "StarTagger.guide.\(session.identity)" }
  var body: some View {
    NavigationStack {
      ScrollViewReader { proxy in
        ScrollView {
          VStack(alignment: .leading, spacing: 24) {
            Text("Astral Harness").font(.title2.bold())
            Text(explore ? "Exploring the whole sky" : "About the stars in your view").font(
              .subheadline
            ).foregroundStyle(AppTheme.secondary)
            if entries.isEmpty {
              Text("Ask what you are looking at, or learn more about your selected star.")
                .foregroundStyle(AppTheme.secondary)
            }
            ForEach(entries) { entry in
              VStack(alignment: .leading, spacing: 8) {
                Text(entry.role == "user" ? "You" : "Guide").font(.caption.bold()).foregroundStyle(
                  AppTheme.secondary)
                Text(entry.text.isEmpty ? "Thinking…" : entry.text).textSelection(.enabled)
              }.frame(maxWidth: .infinity, alignment: .leading).id(entry.id)
            }
            if let error { StatusMessage(message: error) }
            TextField("Ask about the sky", text: $input, axis: .vertical).appField().disabled(
              streaming)
            Text("\(input.unicodeScalars.count) / 2,000").font(.caption)
            if streaming {
              Button("Stop response") { task?.cancel() }.buttonStyle(SecondaryButtonStyle())
            } else {
              Button("Ask guide") { task = Task { await send() } }.buttonStyle(PrimaryButtonStyle())
                .disabled(
                  !session.signedIn || input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    || input.unicodeScalars.count > 2000)
            }
          }.padding(24)
        }.onChange(of: entries.count) { _, _ in
          if let last = entries.last { proxy.scrollTo(last.id, anchor: .bottom) }
        }
      }.appScreen().navigationTitle("Star guide").navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .confirmationAction) {
            Button("Done") {
              task?.cancel()
              dismiss()
            }
          }
          ToolbarItem(placement: .cancellationAction) {
            Button("Clear") {
              task?.cancel()
              entries = []
              UserDefaults.standard.removeObject(forKey: historyKey)
            }.disabled(streaming)
          }
        }
        .onAppear {
          if let data = UserDefaults.standard.data(forKey: historyKey),
            let saved = try? JSONDecoder().decode([GuideEntry].self, from: data)
          {
            entries = saved
          }
        }
        .onChange(of: session.identity) { _, _ in
          task?.cancel()
          entries = []
          error = nil
        }
        .onDisappear { task?.cancel() }
        .onChange(of: phase) { _, state in if state != .active { task?.cancel() } }
    }
  }
  private func send() async {
    guard !streaming, session.signedIn else { return }
    guard explore || !scopeIDs.isEmpty || selectedID != nil else {
      error = "No stars are in view yet. Point your phone toward the sky or open a star in Explore."
      return
    }
    let question = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !question.isEmpty else { return }
    let requestedIdentity = session.identity
    let savedHistoryKey = historyKey
    streaming = true
    error = nil
    input = ""
    entries.append(GuideEntry(id: UUID(), role: "user", text: question))
    let history = entries.filter { !$0.text.isEmpty }.suffix(6).map {
      ChatMessage(
        role: $0.role == "user" ? .user : .assistant,
        content: String($0.text.unicodeScalars.prefix(2000)))
    }
    let responseID = UUID()
    entries.append(GuideEntry(id: responseID, role: "assistant", text: ""))
    defer {
      streaming = false
      entries.removeAll { $0.text.isEmpty }
      if requestedIdentity == session.identity,
        let data = try? JSONEncoder().encode(Array(entries.suffix(40)))
      {
        UserDefaults.standard.set(data, forKey: savedHistoryKey)
      }
    }
    do {
      let body = ChatRequest(
        messages: history, mode: explore ? .explore : .local,
        scopeHygIds: explore
          ? nil : Array(Set(scopeIDs + (selectedID.map { [$0] } ?? []))).prefix(200).map { $0 },
        selectedHygId: selectedID)
      var request = try session.api.request(
        "/api/agent/chat", method: "POST", body: APIClient.encode(body))
      request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
      let (bytes, response) = try await session.api.session.bytes(for: request)
      if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
        var data = Data()
        for try await byte in bytes {
          data.append(byte)
          if data.count > 65536 { break }
        }
        try session.api.validate(
          data, response,
          expireSession: request.value(forHTTPHeaderField: "Authorization")
            == session.api.token.map { "Bearer \($0)" })
      }
      var parser = GuideEventParser()
      var done = false
      stream: for try await byte in bytes {
        try Task.checkCancellation()
        guard requestedIdentity == session.identity else { throw CancellationError() }
        guard let event = try parser.consume(byte: byte) else { continue }
        switch event {
        case .start: break
        case .delta(let text):
          if let i = entries.firstIndex(where: { $0.id == responseID }) { entries[i].text += text }
        case .failure(let message): throw ClientError(message: message)
        case .done:
          done = true
          break stream
        }
      }
      if !done {
        throw ClientError(message: "The connection ended before the guide finished. Try again.")
      }
    } catch is CancellationError { error = "Response stopped." } catch {
      self.error = error.localizedDescription
    }
  }
}
