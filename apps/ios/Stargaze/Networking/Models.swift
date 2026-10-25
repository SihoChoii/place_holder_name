import Foundation

struct UserPublic: Codable, Identifiable {
    let id: String
    let email: String
    let username: String
    let displayName: String?
    let avatarUrl: String?
    let createdAt: String
}

struct AuthResponse: Codable {
    let token: String
    let user: UserPublic
}

struct Star: Codable, Identifiable, Hashable {
    let id: String
    let catalogId: String?
    let name: String
    let raHours: Double
    let decDegrees: Double
    let magnitude: Double?
    let constellation: String?
}

struct StarsResponse: Codable {
    let stars: [Star]
}

struct MediaItem: Codable, Identifiable {
    let id: String
    let starId: String
    let authorId: String
    let type: String
    let body: String?
    let mediaUrl: String?
    let latitude: Double?
    let longitude: Double?
    let createdAt: String
    let author: UserPublic?
    let reactionCount: Int?
}

struct MediaListResponse: Codable {
    let media: [MediaItem]
}

struct RegisterBody: Codable {
    let email: String
    let username: String
    let password: String
    let displayName: String?
}

struct LoginBody: Codable {
    let email: String
    let password: String
}

struct CreateMediaBody: Codable {
    let starId: String
    let type: String
    let body: String?
    let mediaUrl: String?
    let latitude: Double?
    let longitude: Double?
}

struct CreateMediaResponse: Codable {
    let media: MediaItem
}

struct ReactionBody: Codable {
    let emoji: String
}

struct ReactionResponse: Codable {
    let reaction: ReactionRecord
}

struct ReactionRecord: Codable {
    let id: String
    let mediaId: String
    let userId: String
    let emoji: String
}
