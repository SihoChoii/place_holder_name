import SwiftUI

@main
struct StargazeApp: App {
  @StateObject private var session = SessionStore()
  @State private var loaded = false
  @State private var catalogError: String?
  var body: some Scene {
    WindowGroup {
      Group {
        if loaded {
          ContentView()
        } else if let catalogError {
          VStack {
            Text("StarTagger").font(.largeTitle)
            StatusMessage(message: catalogError)
          }.padding(24)
        } else {
          VStack(spacing: 24) {
            Text("StarTagger").font(.largeTitle)
            ProgressView("Loading the sky…")
          }
        }
      }.frame(maxWidth: .infinity, maxHeight: .infinity).appScreen().environmentObject(session)
        .task {
          let result = await Task.detached { StarCatalog.result }.value
          switch result {
          case .success: loaded = true
          case .failure(let error): catalogError = error.localizedDescription
          }
          try? await session.refreshMe()
        }
    }
  }
}
