// Star Tagger API models (contract v1). Mirrors packages/shared/src/types.ts and docs/api-contract.md.
// Decode with StarTaggerAPI.decoder (snake_case keys, timestamps are Int64 Unix milliseconds).
// Copy this file into the iOS target or reference it from apps/ios/project.yml.
import Foundation

public enum StarTaggerAPI {
    public static var decoder: JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }
    public static var encoder: JSONEncoder {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        return e
    }
    public static let reactionEmojis = ["❤️", "✨", "🚀", "🤩", "👍"]
    public static let idempotencyHeader = "Idempotency-Key"
}

public struct APIErrorBody: Codable, Error, Hashable {
    public struct Detail: Codable, Hashable {
        public let code: String
        public let message: String
        public let retryAfterSeconds: Int?
    }
    public let error: Detail
}

public struct PublicUser: Codable, Hashable { public let id: String; public let displayName: String }
public struct PrivateUser: Codable, Hashable {
    public let id: String; public let email: String; public let displayName: String; public let createdAt: Int64
}
public struct AuthResponse: Codable, Hashable { public let token: String; public let expiresAt: Int64; public let user: PrivateUser }
public struct MeResponse: Codable, Hashable {
    public let user: PrivateUser; public let serverTime: Int64; public let nextClaimAt: Int64?; public let claimCooldownSeconds: Int
}
public struct SignupRequest: Codable { public let email: String; public let password: String; public let displayName: String
    public init(email: String, password: String, displayName: String) { self.email = email; self.password = password; self.displayName = displayName } }
public struct LoginRequest: Codable { public let email: String; public let password: String
    public init(email: String, password: String) { self.email = email; self.password = password } }

public struct ClaimInfo: Codable, Hashable { public let id: String; public let hygId: Int; public let owner: PublicUser; public let claimedAt: Int64 }
public struct ClaimResponse: Codable, Hashable { public let claim: ClaimInfo; public let nextClaimAt: Int64 }

public struct Star: Codable, Hashable {
    public let hygId: Int
    public let hipId: Int?
    public let name: String?
    public let bayerFlamsteed: String?
    public let constellation: String?
    public let raHours: Double
    public let decDegrees: Double
    public let epoch: String
    public let magnitude: Double
    public let distanceLy: Double?
    public let distanceUnknownReason: String?
    public let spectralType: String?
    public let exoplanetCount: Int
    public let wikiTitle: String?
    public let catalogVersion: String
    public let claim: ClaimInfo?
}
public struct TravelTime: Codable, Hashable {
    public let hygId: Int; public let speedKmS: Double; public let distanceLy: Double?
    public let travelSeconds: Double?; public let travelYears: Double?; public let reason: String?; public let model: String
}

public enum ModerationStatus: String, Codable, Hashable { case pending, approved, rejected }
public enum ProcessingState: String, Codable, Hashable { case queued, delayed, reviewFailed = "review_failed", approved, rejected }

public struct MediaItem: Codable, Hashable {
    public enum Kind: String, Codable, Hashable { case image, link }
    public let id: String; public let kind: Kind
    /// image: API-relative path ("/api/media/<id>" or "/api/public/media/<id>"); link: external URL
    public let url: String
    public let width: Int?; public let height: Int?; public let mime: String?
}
public struct Comment: Codable, Hashable {
    public let id: String; public let tagId: String; public let author: PublicUser; public let body: String
    public let mediaId: String?; public let moderationStatus: ModerationStatus; public let processingState: ProcessingState?
    public let createdAt: Int64
}
public struct Tag: Codable, Hashable {
    public let id: String; public let hygId: Int; public let starName: String?; public let author: PublicUser
    public let note: String?; public let media: [MediaItem]; public let moderationStatus: ModerationStatus
    public let processingState: ProcessingState?; public let createdAt: Int64
    public let reactionCounts: [String: Int]; public let myReactions: [String]?; public let commentCount: Int
    public let recentComments: [Comment]?
}
public struct Page<T: Codable & Hashable>: Codable, Hashable { public let items: [T]; public let nextCursor: String? }
public struct CreateTagResponse: Codable, Hashable { public let tag: Tag }
public struct CreateCommentRequest: Codable { public let body: String; public let mediaId: String?
    public init(body: String, mediaId: String? = nil) { self.body = body; self.mediaId = mediaId } }
public struct CreateCommentResponse: Codable, Hashable { public let comment: Comment }
public struct ReactionResponse: Codable, Hashable { public let tagId: String; public let reactionCounts: [String: Int]; public let myReactions: [String] }
public struct ViewContentRequest: Codable { public let hygIds: [Int]; public init(hygIds: [Int]) { self.hygIds = hygIds } }
public struct StarOverlay: Codable, Hashable {
    public let hygId: Int; public let claim: ClaimInfo?; public let tags: [Tag]; public let tagCount: Int; public let hasMore: Bool
}
public struct ViewContentResponse: Codable, Hashable { public let stars: [StarOverlay]; public let serverTime: Int64 }
public struct SearchResponse: Codable, Hashable { public let stars: [Star]; public let tags: [Tag]; public let nextCursor: String? }
public struct PublicStarResponse: Codable, Hashable { public let star: Star; public let tagCount: Int; public let recentTags: [Tag] }

public struct ChatMessage: Codable, Hashable {
    public enum Role: String, Codable, Hashable { case user, assistant }
    public let role: Role; public let content: String
    public init(role: Role, content: String) { self.role = role; self.content = content }
}
public struct ChatRequest: Codable {
    public enum Mode: String, Codable { case local, explore }
    public let messages: [ChatMessage]; public let mode: Mode; public let scopeHygIds: [Int]?; public let selectedHygId: Int?
    public init(messages: [ChatMessage], mode: Mode, scopeHygIds: [Int]? = nil, selectedHygId: Int? = nil) {
        self.messages = messages; self.mode = mode; self.scopeHygIds = scopeHygIds; self.selectedHygId = selectedHygId
    }
}
/// One parsed SSE event from POST /api/agent/chat ("start" | "delta" | "done" | "error").
public struct ChatEventData: Codable, Hashable { public let requestId: String?; public let text: String?; public let code: String?; public let message: String? }
