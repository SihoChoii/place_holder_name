import SwiftUI

struct ExploreView: View {
  var findInSky: (SkyStar) -> Void
  @EnvironmentObject var session: SessionStore
  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var phase
  @State private var query = ""
  @State private var posts: [Tag] = []
  @State private var matches: [SkyStar] = []
  @State private var nextCursor: String?
  @State private var loadedPages = 1
  @State private var selected: SkyStar?
  @State private var error: String?
  @State private var busy = false
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 20) {
          Text("Explore beyond your view").font(.title2.bold())
          TextField("Search a name, HYG ID, or post", text: $query).textInputAutocapitalization(
            .never
          ).autocorrectionDisabled().appField()
          ForEach(matches.prefix(50)) { star in
            Button {
              selected = star
            } label: {
              HStack {
                VStack(alignment: .leading) {
                  Text(star.title)
                  Text("HYG \(star.id)").font(.caption).foregroundStyle(AppTheme.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
              }.frame(minHeight: 48)
            }
          }
          if busy { ProgressView("Loading…") }
          if let error { StatusMessage(message: error) }
          if posts.isEmpty && !busy {
            Text(query.isEmpty ? "Public posts will appear here." : "No matching posts.")
              .foregroundStyle(AppTheme.secondary)
          }
          ForEach(posts, id: \.id) { post in
            Button(post.starName ?? "HYG \(post.hygId)") {
              selected = StarCatalog.byID[post.hygId]?.skyStar
            }.font(.headline).frame(minHeight: 44)
            PostCard(tag: post, changed: { Task { await load() } })
          }
          if let nextCursor {
            Button("Load more") { Task { await load(nextCursor) } }.frame(minHeight: 44)
          }
        }.padding(24)
      }.appScreen().navigationTitle("Explore").navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .confirmationAction) { Button("Back to sky") { dismiss() } }
        }
        .task(id: "\(query)|\(session.identity)|\(phase)") {
          guard phase == .active else { return }
          loadedPages = 1
          nextCursor = nil
          posts = []
          let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
          matches =
            q.isEmpty
            ? []
            : StarCatalog.stars.filter {
              $0.title.lowercased().contains(q)
                || String($0.id) == q.replacingOccurrences(of: "hyg ", with: "")
            }
          do { try await Task.sleep(for: .milliseconds(350)) } catch { return }
          while !Task.isCancelled {
            await load()
            do { try await Task.sleep(for: .seconds(5)) } catch { break }
          }
        }
        .sheet(item: $selected) { star in
          StarDetailSheet(
            star: star,
            findInSky: { target in
              findInSky(target)
              dismiss()
            })
        }
    }
  }
  private func load(_ cursor: String? = nil) async {
    busy = true
    defer { busy = false }
    let search = !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let route =
      "/api/\(session.signedIn ? "explore" : "public")/\(search ? "search?q=\(APIClient.query(query))" : "feed?limit=20")"
      + (cursor.map { "&cursor=\(APIClient.query($0))" } ?? "")
    do {
      let new: [Tag]
      let next: String?
      if search {
        var response: SearchResponse = try await session.api.get(route)
        var gathered = response.tags
        if cursor == nil && loadedPages > 1 {
          for _ in 1..<loadedPages {
            guard let next = response.nextCursor else { break }
            response = try await session.api.get(route + "&cursor=" + APIClient.query(next))
            gathered.append(contentsOf: response.tags)
          }
        }
        new = gathered
        next = response.nextCursor
      } else {
        let response: Page<Tag> = try await session.api.pages(
          route, count: cursor == nil ? loadedPages : 1)
        new = response.items
        next = response.nextCursor
      }
      guard !Task.isCancelled else { return }
      if cursor == nil {
        posts = new
      } else {
        posts.append(contentsOf: new.filter { item in !posts.contains { $0.id == item.id } })
      }
      if cursor != nil { loadedPages += 1 }
      nextCursor = next
      error = nil
    } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
  }
}
