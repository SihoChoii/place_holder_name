import Foundation
import SwiftUI

@MainActor
final class SessionStore: ObservableObject {
    @Published var token: String?
    @Published var user: UserPublic?
    @Published var lastError: String?

    private let api = APIClient()
    private let tokenKey = "stargaze_token"

    init() {
        token = UserDefaults.standard.string(forKey: tokenKey)
    }

    var isLoggedIn: Bool { token != nil }

    func register(email: String, username: String, password: String) async {
        do {
            let res: AuthResponse = try await api.request(
                "/auth/register",
                method: "POST",
                body: RegisterBody(email: email, username: username, password: password, displayName: username)
            )
            apply(res)
        } catch {
            lastError = error.localizedDescription
        }
    }

    func login(email: String, password: String) async {
        do {
            let res: AuthResponse = try await api.request(
                "/auth/login",
                method: "POST",
                body: LoginBody(email: email, password: password)
            )
            apply(res)
        } catch {
            lastError = error.localizedDescription
        }
    }

    func logout() {
        token = nil
        user = nil
        UserDefaults.standard.removeObject(forKey: tokenKey)
    }

    func fetchStars() async -> [Star] {
        do {
            let res: StarsResponse = try await api.request("/stars?limit=50")
            return res.stars
        } catch {
            lastError = error.localizedDescription
            return []
        }
    }

    func fetchMedia(for starId: String) async -> [MediaItem] {
        do {
            let res: MediaListResponse = try await api.request("/stars/\(starId)/media")
            return res.media
        } catch {
            lastError = error.localizedDescription
            return []
        }
    }

    func postNote(starId: String, text: String, latitude: Double?, longitude: Double?) async -> Bool {
        guard let token else {
            lastError = "Log in to post"
            return false
        }
        do {
            let _: CreateMediaResponse = try await api.request(
                "/media",
                method: "POST",
                body: CreateMediaBody(
                    starId: starId,
                    type: "TEXT",
                    body: text,
                    mediaUrl: nil,
                    latitude: latitude,
                    longitude: longitude
                ),
                token: token
            )
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    func react(mediaId: String, emoji: String = "⭐") async {
        guard let token else { return }
        do {
            let _: ReactionResponse = try await api.request(
                "/media/\(mediaId)/reactions",
                method: "POST",
                body: ReactionBody(emoji: emoji),
                token: token
            )
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func apply(_ res: AuthResponse) {
        token = res.token
        user = res.user
        UserDefaults.standard.set(res.token, forKey: tokenKey)
        lastError = nil
    }
}
