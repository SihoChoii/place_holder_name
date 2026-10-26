import SwiftUI

struct StarDetailSheet: View {
  let star: SkyStar
  var findInSky: ((SkyStar) -> Void)? = nil
  @EnvironmentObject var session: SessionStore
  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var phase
  @State private var remote: Star?
  @State private var posts: [Tag] = []
  @State private var nextCursor: String?
  @State private var loadedPages = 1
  @State private var error: String?
  @State private var actionError: String?
  @State private var claiming = false
  @State private var auth = false
  @State private var compose = false
  @State private var guide = false
  @State private var travel: TravelTime?
  @State private var speed = "17"
  @State private var retryAt: Date?
  @State private var loading = true
  private var record: CatalogRecord? { StarCatalog.byID[star.id] }
  private var own: Bool { remote?.claim?.owner.id == session.user?.id && session.signedIn }
  private var attemptKey: String { "StarTagger.claim.\(session.identity).\(star.id)" }
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 20) {
          Text("\(record?.con ?? "Star") · HYG \(star.id)").font(.subheadline).foregroundStyle(
            AppTheme.secondary)
          Text(star.title).font(AppTheme.font(28, weight: .semibold, relativeTo: .title))
            .accessibilityAddTraits(.isHeader)
          ownership
          if let actionError { StatusMessage(message: actionError) }
          if let findInSky {
            Button("Find in sky") {
              findInSky(star)
              dismiss()
            }.buttonStyle(SecondaryButtonStyle())
          }
          VStack(spacing: 0) {
            FactRow(
              label: "Distance",
              value: record?.dist_ly.map { String(format: "%.2f light years", $0) }
                ?? "Distance unknown")
            FactRow(label: "Magnitude", value: String(format: "%.2f", star.mag))
            FactRow(label: "Spectral type", value: record?.spectral_type ?? "Unknown")
            FactRow(label: "Known exoplanets", value: String(record?.exoplanet_count ?? 0))
            if let travel {
              FactRow(
                label: "Travel at \(travel.speedKmS.formatted()) km/s",
                value: travel.travelYears.map {
                  $0.formatted(.number.precision(.fractionLength(0))) + " years"
                } ?? "Distance unknown")
            }
          }
          if session.signedIn {
            HStack {
              TextField("Speed in km/s", text: $speed).keyboardType(.decimalPad).appField()
              Button("Calculate travel time") { Task { await calculateTravel() } }.frame(
                minHeight: 44)
            }
          }
          if travel != nil {
            Text("Constant speed; ignores relativity.").font(.footnote).foregroundStyle(
              AppTheme.secondary)
          }
          if let title = record?.wiki_title,
            let url = URL(string: "https://en.wikipedia.org/wiki/\(APIClient.query(title))")
          {
            Link("Read on Wikipedia", destination: url).frame(minHeight: 44)
          }
          Button("Ask the guide about this star") {
            if session.signedIn { guide = true } else { auth = true }
          }.buttonStyle(SecondaryButtonStyle())
          HStack {
            Text("Posts").font(.title3.bold())
            Spacer()
            if own { Button("Add post") { compose = true }.frame(minHeight: 44) }
          }
          if posts.isEmpty {
            Text(loading ? "Loading posts…" : "No visible posts yet.").foregroundStyle(
              AppTheme.secondary)
          }
          ForEach(posts, id: \.id) { post in PostCard(tag: post, changed: { Task { await load() } })
          }
          if let nextCursor {
            Button("Load more posts") { Task { await more(nextCursor) } }.frame(minHeight: 44)
          }
        }.padding(24)
      }.appScreen().navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        .onChange(of: session.identity) { _, _ in
          remote = nil
          posts = []
          error = nil
          travel = nil
          loadedPages = 1
          nextCursor = nil
          retryAt = nil
          actionError = nil
          loading = true
        }
        .task(id: "\(session.identity)|\(phase)") {
          guard phase == .active else { return }
          while !Task.isCancelled {
            await load()
            do { try await Task.sleep(for: .seconds(5)) } catch { break }
          }
        }
        .sheet(isPresented: $auth) { AuthView() }
        .sheet(isPresented: $compose, onDismiss: { Task { await load() } }) {
          PostComposer(star: star)
        }
        .sheet(isPresented: $guide) {
          GuideView(selectedID: star.id, scopeIDs: [star.id], explore: findInSky != nil)
        }
    }.presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
  }
  @ViewBuilder private var ownership: some View {
    if let error {
      StatusMessage(message: "Ownership unavailable. \(error)")
      Button("Retry") { Task { await load() } }.frame(minHeight: 44)
    } else if let remote {
      if let claim = remote.claim {
        Label(
          own ? "Claimed by you" : "Claimed by \(claim.owner.displayName)",
          systemImage: "checkmark.circle")
        if own { Button("Add post") { compose = true }.buttonStyle(PrimaryButtonStyle()) }
      } else if !session.signedIn {
        Text("Unclaimed").foregroundStyle(AppTheme.secondary)
        Button("Sign in to claim") { auth = true }.buttonStyle(PrimaryButtonStyle())
      } else {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
          let seconds = max(session.cooldown, max(0, Int(ceil(retryAt?.timeIntervalSinceNow ?? 0))))
          VStack(alignment: .leading, spacing: 12) {
            Text("Unclaimed").foregroundStyle(AppTheme.secondary)
            Button(
              claiming
                ? "Claiming…"
                : seconds > 0
                  ? "Next claim in \(seconds / 60)m \(seconds % 60)s" : "Claim this star"
            ) { Task { await claim() } }
            .buttonStyle(PrimaryButtonStyle()).disabled(claiming || seconds > 0)
            Text("One owner per star, permanently. One successful claim per hour.").font(.footnote)
              .foregroundStyle(AppTheme.secondary)
          }
        }
      }
    } else {
      ProgressView("Checking ownership…")
    }
  }
  private func load() async {
    let identity = session.identity
    do {
      let value: Star
      let page: Page<Tag>
      if session.signedIn {
        value = try await session.api.get("/api/stars/\(star.id)")
        page = try await session.api.pages("/api/stars/\(star.id)/tags", count: loadedPages)
        try? await session.refreshMe()
      } else {
        let response: PublicStarResponse = try await session.api.get("/api/public/stars/\(star.id)")
        value = response.star
        page = try await session.api.pages("/api/public/stars/\(star.id)/tags", count: loadedPages)
      }
      guard !Task.isCancelled, session.identity == identity else { return }
      guard value.catalogVersion == StarCatalog.version else {
        throw ClientError(
          message: "The app and server catalogs differ. Update the app before claiming.")
      }
      session.checkedStars[star.id] = (
        StarOverlay(
          hygId: star.id, claim: value.claim, tags: Array(page.items.prefix(3)),
          tagCount: page.items.count, hasMore: page.nextCursor != nil), Date()
      )
      remote = value
      posts = page.items
      nextCursor = page.nextCursor
      error = nil
      loading = false
      if session.signedIn && travel == nil {
        travel = try? await session.api.get("/api/stars/\(star.id)/travel-time?speed_km_s=17")
      }
    } catch {
      if !Task.isCancelled, session.identity == identity {
        self.error = error.localizedDescription
        loading = false
      }
    }
  }
  private func calculateTravel() async {
    guard let number = Double(speed), number.isFinite, number > 0 else {
      actionError = "Enter a positive speed in kilometres per second."
      return
    }
    do {
      travel = try await session.api.get("/api/stars/\(star.id)/travel-time?speed_km_s=\(number)")
      actionError = nil
    } catch { actionError = error.localizedDescription }
  }
  private func more(_ cursor: String) async {
    let requestedIdentity = session.identity
    do {
      let page: Page<Tag> = try await session.api.get(
        "/api/\(session.signedIn ? "" : "public/")stars/\(star.id)/tags?cursor=\(APIClient.query(cursor))"
      )
      guard !Task.isCancelled, session.identity == requestedIdentity else { return }
      posts.append(contentsOf: page.items.filter { item in !posts.contains { $0.id == item.id } })
      loadedPages += 1
      nextCursor = page.nextCursor
    } catch { actionError = error.localizedDescription }
  }
  private func claim() async {
    guard !claiming, session.signedIn, remote?.claim == nil, error == nil else { return }
    claiming = true
    actionError = nil
    defer { claiming = false }
    let requestedIdentity = session.identity
    let storageKey = attemptKey
    let key = UserDefaults.standard.string(forKey: storageKey) ?? UUID().uuidString
    UserDefaults.standard.set(key, forKey: storageKey)
    do {
      let response: ClaimResponse = try await session.api.send(
        "/api/stars/\(star.id)/claim", key: key)
      UserDefaults.standard.removeObject(forKey: storageKey)
      guard session.identity == requestedIdentity else { return }
      session.claimSucceeded(response)
      await load()
    } catch let failure as APIErrorBody {
      guard session.identity == requestedIdentity else { return }
      actionError = failure.localizedDescription
      if failure.error.code == "on_cooldown" {
        retryAt = Date().addingTimeInterval(Double(failure.error.retryAfterSeconds ?? 0))
      }
      if ["already_claimed", "on_cooldown", "unknown_star"].contains(failure.error.code) {
        UserDefaults.standard.removeObject(forKey: storageKey)
      }
      await load()
    } catch {
      guard session.identity == requestedIdentity else { return }
      actionError =
        "Could not confirm the claim. Retry to check the same request. \(error.localizedDescription)"
    }
  }
}
