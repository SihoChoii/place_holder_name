import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var tab: Tab = .sky

    enum Tab {
        case sky, stars, account
    }

    var body: some View {
        TabView(selection: $tab) {
            SkyView()
                .tabItem { Label("Sky", systemImage: "sparkles") }
                .tag(Tab.sky)

            StarListView()
                .tabItem { Label("Stars", systemImage: "star") }
                .tag(Tab.stars)

            AccountView()
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
                .tag(Tab.account)
        }
        .preferredColorScheme(.dark)
    }
}
