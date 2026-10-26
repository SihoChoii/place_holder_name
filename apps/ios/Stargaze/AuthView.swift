import SwiftUI

struct AuthView: View {
  @EnvironmentObject var session: SessionStore
  @Environment(\.dismiss) private var dismiss
  @State private var signup = false
  @State private var showPassword = false
  @State private var email = ""
  @State private var password = ""
  @State private var name = ""
  @State private var busy = false
  @State private var error: String?
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 20) {
          Text(signup ? "Make the sky personal." : "Welcome back.").font(
            AppTheme.font(28, weight: .semibold, relativeTo: .title))
          Picker("Account action", selection: $signup) {
            Text("Sign in").tag(false)
            Text("Sign up").tag(true)
          }.pickerStyle(.segmented)
          if signup {
            VStack(alignment: .leading) {
              Text("Display name")
              TextField("Your name", text: $name).textContentType(.nickname).appField()
            }
          }
          VStack(alignment: .leading) {
            Text("Email")
            TextField("you@example.com", text: $email).textContentType(.emailAddress).keyboardType(
              .emailAddress
            ).textInputAutocapitalization(.never).autocorrectionDisabled().appField()
          }
          VStack(alignment: .leading) {
            Text("Password")
            HStack {
              Group {
                if showPassword {
                  TextField("12–128 characters", text: $password).textInputAutocapitalization(
                    .never
                  ).autocorrectionDisabled()
                } else {
                  SecureField("12–128 characters", text: $password).textContentType(
                    signup ? .newPassword : .password)
                }
              }.accessibilityIdentifier("auth.password")
              Button {
                showPassword.toggle()
              } label: {
                Image(systemName: showPassword ? "eye.slash" : "eye").frame(width: 44, height: 44)
              }.accessibilityLabel(showPassword ? "Hide password" : "Show password")
            }.appField()
          }
          Text("Use 12–128 characters. Your password is never trimmed.").font(.footnote)
            .foregroundStyle(AppTheme.secondary)
          if let error { StatusMessage(message: error) }
          Button(busy ? "Connecting…" : (signup ? "Create account" : "Sign in")) {
            Task { await submit() }
          }
          .buttonStyle(PrimaryButtonStyle()).disabled(
            busy || email.isEmpty || password.count < 12 || password.count > 128
              || (signup
                && (name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                  || name.unicodeScalars.count > 50))
          )
          if session.origin.isEmpty {
            StatusMessage(message: "Set your server address in Account before signing in.")
          }
        }.padding(24)
      }.scrollDismissesKeyboard(.interactively).appScreen().navigationTitle(
        signup ? "Create account" : "Sign in"
      ).navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
    }
  }
  private func submit() async {
    busy = true
    error = nil
    defer { busy = false }
    do {
      try await session.authenticate(
        email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password,
        name: name.trimmingCharacters(in: .whitespacesAndNewlines), signup: signup)
      dismiss()
    } catch { self.error = error.localizedDescription }
  }
}

struct AccountView: View {
  @EnvironmentObject var session: SessionStore
  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var phase
  @State private var origin = ""
  @State private var error: String?
  @State private var auth = false
  @State private var claims: [ClaimedStar] = []
  @State private var posts: [Tag] = []
  @State private var nextCursor: String?
  @State private var loadedPages = 1
  @State private var selected: SkyStar?
  @State private var credits = false
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 24) {
          if let user = session.user {
            Text(user.displayName).font(.title.bold())
            Text(user.email).foregroundStyle(AppTheme.secondary)
            TimelineView(.periodic(from: .now, by: 1)) { _ in
              Text(
                session.cooldown == 0
                  ? "Ready to claim a star"
                  : "Next claim in \(session.cooldown / 60)m \(session.cooldown % 60)s"
              ).monospacedDigit()
            }
            Text("Your stars").font(.headline)
            if claims.isEmpty {
              Text("Your claimed stars will appear here.").foregroundStyle(AppTheme.secondary)
            }
            ForEach(claims, id: \.hygId) { claim in
              Button {
                selected = StarCatalog.byID[claim.hygId]?.skyStar
              } label: {
                HStack {
                  Text(StarCatalog.byID[claim.hygId]?.skyStar.title ?? "HYG \(claim.hygId)")
                  Spacer()
                  Image(systemName: "chevron.right")
                }.frame(minHeight: 44)
              }
            }
            Text("Your posts").font(.headline)
            ForEach(posts, id: \.id) { post in
              PostCard(tag: post, changed: { Task { await load() } })
            }
            if let nextCursor {
              Button("Load more posts") { Task { await more(nextCursor) } }.frame(minHeight: 44)
            }
            Button("Log out") {
              Task {
                await session.logout()
                claims = []
                posts = []
              }
            }.buttonStyle(SecondaryButtonStyle())
          } else {
            Text("A star to come back to.").font(.title.bold())
            Text("Sign in to claim a star, publish a post, and join the conversation.")
              .foregroundStyle(AppTheme.secondary)
            Button("Sign in or create account") { auth = true }.buttonStyle(PrimaryButtonStyle())
          }
          Divider()
          Text("Server").font(.headline)
          TextField("http://your-mac.local:4000", text: $origin).textInputAutocapitalization(.never)
            .autocorrectionDisabled().keyboardType(.URL).appField()
          Button("Use server") {
            do {
              try session.setOrigin(origin)
              error = nil
            } catch { self.error = error.localizedDescription }
          }.buttonStyle(SecondaryButtonStyle())
          Text(
            "Use your backend's network address. Changing servers signs you out of the previous server."
          ).font(.footnote).foregroundStyle(AppTheme.secondary)
          if let error { StatusMessage(message: error) }
          if let message = session.message { StatusMessage(message: message) }
          Button("Credits and data sources") { credits = true }.frame(minHeight: 44)
        }.padding(24)
      }.appScreen().navigationTitle("Account").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        .onAppear { origin = session.origin }.onChange(of: session.identity) { _, _ in
          posts = []
          claims = []
          loadedPages = 1
          nextCursor = nil
        }
        .task(id: "\(session.identity)|\(phase)") {
          guard phase == .active else { return }
          while !Task.isCancelled {
            await load()
            do { try await Task.sleep(for: .seconds(5)) } catch { break }
          }
        }
        .sheet(isPresented: $auth) { AuthView() }
        .sheet(item: $selected) { StarDetailSheet(star: $0) }
        .sheet(isPresented: $credits) { CreditsView() }
    }
  }
  private func more(_ cursor: String) async {
    let identity = session.identity
    do {
      let page: Page<Tag> = try await session.api.get(
        "/api/me/tags?cursor=\(APIClient.query(cursor))")
      guard identity == session.identity, !Task.isCancelled else { return }
      posts.append(contentsOf: page.items.filter { item in !posts.contains { $0.id == item.id } })
      loadedPages += 1
      nextCursor = page.nextCursor
    } catch { self.error = error.localizedDescription }
  }

  private func load() async {
    guard session.signedIn else { return }
    let identity = session.identity
    do {
      try await session.refreshMe()
      let all: ClaimedStarsResponse = try await session.api.get("/api/public/claimed")
      guard identity == session.identity, !Task.isCancelled else { return }
      claims = all.stars.filter { $0.owner.id == session.user?.id }
      let page: Page<Tag> = try await session.api.pages("/api/me/tags", count: loadedPages)
      guard identity == session.identity, !Task.isCancelled else { return }
      posts = page.items
      nextCursor = page.nextCursor
      error = nil
    } catch { self.error = error.localizedDescription }
  }
}

struct CreditsView: View {
  @Environment(\.dismiss) private var dismiss
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 20) {
          Text("Real stars. Shared sources.").font(.title.bold())
          Text(
            "HYG Database v4.4 — David Nash / astronexus. CC BY-SA 4.0. Derived star catalog remains available under the same license."
          )
          Link("HYG database", destination: URL(string: "https://codeberg.org/astronexus/hyg")!)
          Text(
            "Stellarium modern constellation lines — CC BY-SA 4.0. IAU Catalog of Star Names — CC BY. NASA Exoplanet Archive — acknowledge NExScI. Wikidata — CC0. Inter — SIL Open Font License."
          )
          Text(
            "Coordinates are J2000. The current sensor view does not correct precession, proper motion or atmospheric refraction. Compass accuracy varies; calibrate using a known star. Distances may be unknown. A claim is an association inside StarTagger, not ownership or a scientific name for a celestial object."
          )
          Text("Catalog: \(StarCatalog.version)").font(.footnote)
        }.padding(24)
      }.appScreen().navigationTitle("Credits").toolbar { Button("Done") { dismiss() } }
    }
  }
}
