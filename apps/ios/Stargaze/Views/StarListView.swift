import SwiftUI

struct StarListView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var stars: [Star] = []
    @State private var loading = true

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView("Loading catalog…")
                } else if stars.isEmpty {
                    ContentUnavailableView(
                        "No stars",
                        systemImage: "sparkle",
                        description: Text("Start the API and run the seed script.")
                    )
                } else {
                    List(stars) { star in
                        NavigationLink(value: star) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(star.name).font(.headline)
                                Text(meta(for: star))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Stars")
            .navigationDestination(for: Star.self) { star in
                StarDetailView(star: star)
            }
            .task {
                loading = true
                stars = await session.fetchStars()
                loading = false
            }
            .refreshable {
                stars = await session.fetchStars()
            }
        }
    }

    private func meta(for star: Star) -> String {
        var parts: [String] = []
        if let c = star.constellation { parts.append(c) }
        if let m = star.magnitude { parts.append(String(format: "mag %.2f", m)) }
        return parts.joined(separator: " · ")
    }
}

struct StarDetailView: View {
    @EnvironmentObject private var session: SessionStore
    let star: Star

    @State private var media: [MediaItem] = []
    @State private var note = ""
    @State private var posting = false

    var body: some View {
        List {
            Section("Position") {
                LabeledContent("RA", value: String(format: "%.3f h", star.raHours))
                LabeledContent("Dec", value: String(format: "%.3f°", star.decDegrees))
                if let m = star.magnitude {
                    LabeledContent("Magnitude", value: String(format: "%.2f", m))
                }
            }

            Section("Leave a note") {
                TextField("What do you see?", text: $note, axis: .vertical)
                Button {
                    Task {
                        posting = true
                        let ok = await session.postNote(
                            starId: star.id,
                            text: note,
                            latitude: nil,
                            longitude: nil
                        )
                        if ok {
                            note = ""
                            media = await session.fetchMedia(for: star.id)
                        }
                        posting = false
                    }
                } label: {
                    if posting { ProgressView() } else { Text("Post") }
                }
                .disabled(note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !session.isLoggedIn)
            }

            Section("Media") {
                if media.isEmpty {
                    Text("Nothing shared yet.").foregroundStyle(.secondary)
                } else {
                    ForEach(media) { item in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(item.body ?? item.mediaUrl ?? item.type)
                            HStack {
                                Text("@\(item.author?.username ?? "user")")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Spacer()
                                Button("⭐") {
                                    Task {
                                        await session.react(mediaId: item.id)
                                        media = await session.fetchMedia(for: star.id)
                                    }
                                }
                                .buttonStyle(.borderless)
                                if let count = item.reactionCount, count > 0 {
                                    Text("\(count)").font(.caption)
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(star.name)
        .task {
            media = await session.fetchMedia(for: star.id)
        }
    }
}
