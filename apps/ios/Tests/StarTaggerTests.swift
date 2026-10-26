import UIKit
import XCTest

@testable import Stargaze

final class StarTaggerTests: XCTestCase {
  func testCatalogUnitsIdentityAndUnknownDistances() throws {
    let records = try StarCatalog.result.get()
    XCTAssertEqual(records.count, 8920)
    XCTAssertEqual(Set(records.map(\.hyg_id)).count, 8920)
    XCTAssertEqual(records.filter { $0.dist_ly == nil }.count, 205)
    let sirius = try XCTUnwrap(StarCatalog.byID[32263])
    XCTAssertEqual(sirius.skyStar.ra * 15, sirius.ra_deg, accuracy: 0.000001)
    XCTAssertEqual(sirius.skyStar.noteKey, "hyg:32263")
    XCTAssertEqual(StarCatalog.constellations?.constellations.count, 88)
  }
  func testCodePointLimitsAndStableMultipartBytes() throws {
    let valid = try MultipartDraft(
      starID: 32263, note: String(repeating: "e\u{301}", count: 70), links: [], images: [])
    XCTAssertTrue(String(data: valid.body, encoding: .utf8)!.contains("name=\"hyg_id\""))
    XCTAssertThrowsError(
      try MultipartDraft(
        starID: 32263, note: String(repeating: "e\u{301}", count: 71), links: [], images: []))
    XCTAssertThrowsError(try MultipartDraft(starID: 32263, note: "  \n", links: [], images: []))
    XCTAssertThrowsError(
      try MultipartDraft(
        starID: 32263, note: "a", links: Array(repeating: "https://example.com", count: 5),
        images: []))
  }
  func testPrivateLinksRejected() {
    for link in [
      "file:///etc/passwd", "http://localhost/a", "http://user:pass@example.com",
      "http://192.168.1.1", "http://127.0.0.1", "http://10.2.3.4", "http://172.16.1.2",
      "http://[::1]",
    ] { XCTAssertThrowsError(try LinkValidation.validate(link), link) }
    XCTAssertNoThrow(try LinkValidation.validate("https://example.com/sky"))
  }
  @MainActor func testBearerRestrictedToPrivateAPIAnd401Recovery() throws {
    let client = APIClient(origin: "https://example.com")
    client.token = "test"
    XCTAssertEqual(
      try client.request("/api/me").value(forHTTPHeaderField: "Authorization"), "Bearer test")
    XCTAssertNil(
      try client.request("/api/public/claimed").value(forHTTPHeaderField: "Authorization"))
    XCTAssertThrowsError(try client.request("https://external.example/image"))
    var cleared = false
    client.onUnauthorized = { cleared = true }
    let response = HTTPURLResponse(
      url: URL(string: "https://example.com/api/me")!, statusCode: 401, httpVersion: nil,
      headerFields: nil)!
    XCTAssertThrowsError(
      try client.validate(
        Data("{\"error\":{\"code\":\"unauthorized\",\"message\":\"Expired\"}}".utf8), response))
    XCTAssertTrue(cleared)
  }
  func testPendingUploadSurvivesReloadWithExactBytes() throws {
    let namespace = "test-" + UUID().uuidString
    defer { PendingWrites.remove(namespace: namespace, resource: "post") }
    let original = try MultipartDraft(
      starID: 32263, note: "Persist me", links: [], images: [Data([1, 2, 3])])
    try PendingWrites.save(original, namespace: namespace, resource: "post")
    let loaded = try XCTUnwrap(
      PendingWrites.load(MultipartDraft.self, namespace: namespace, resource: "post"))
    XCTAssertEqual(loaded.key, original.key)
    XCTAssertEqual(loaded.boundary, original.boundary)
    XCTAssertEqual(loaded.body, original.body)
    XCTAssertNil(PendingWrites.load(MultipartDraft.self, namespace: "other-user", resource: "post"))
  }
  func testStreamParserPreservesUnicodeAndTerminalErrors() throws {
    var parser = GuideEventParser()
    XCTAssertNil(try parser.consume("event: delta"))
    XCTAssertNil(try parser.consume("data: {\"text\":\"✨ Vega\"}"))
    guard case .delta(let text) = try parser.consume("") else { return XCTFail("Missing delta") }
    XCTAssertEqual(text, "✨ Vega")
    _ = try parser.consume("event: error")
    _ = try parser.consume("data: {\"message\":\"Try again\"}")
    guard case .failure(let message) = try parser.consume("") else {
      return XCTFail("Missing error")
    }
    XCTAssertEqual(message, "Try again")
  }
  @MainActor func testRealAPIClaimRetryCooldownConflictAndPosting() async throws {
    guard ProcessInfo.processInfo.environment["RUN_IOS_API_TESTS"] == "1" else {
      throw XCTSkip("Run the disposable integration API on port 4400 and set RUN_IOS_API_TESTS=1.")
    }
    let api = APIClient(
      origin: ProcessInfo.processInfo.environment["TEST_API_ORIGIN"] ?? "http://127.0.0.1:4400")
    let suffix = UUID().uuidString.lowercased()
    let auth: AuthResponse = try await api.send(
      "/api/auth/signup",
      body: APIClient.encode(
        SignupRequest(
          email: "ios-\(suffix)@example.com", password: "integration-test-password",
          displayName: "Integration observer")))
    api.token = auth.token
    let me: MeResponse = try await api.get("/api/me")
    XCTAssertNil(me.nextClaimAt)
    let all: ClaimedStarsResponse = try await api.get("/api/public/claimed")
    let claimed = Set(all.stars.map(\.hygId))
    let ids = StarCatalog.stars.filter { !claimed.contains($0.id) }.prefix(2).map(\.id)
    let key = UUID().uuidString
    let first: ClaimResponse = try await api.send("/api/stars/\(ids[0])/claim", key: key)
    let retry: ClaimResponse = try await api.send("/api/stars/\(ids[0])/claim", key: key)
    XCTAssertEqual(first.claim.id, retry.claim.id)
    do {
      let _: ClaimResponse = try await api.send(
        "/api/stars/\(ids[1])/claim", key: UUID().uuidString)
      XCTFail("Expected cooldown")
    } catch let error as APIErrorBody {
      XCTAssertEqual(error.error.code, "on_cooldown")
      XCTAssertGreaterThan(error.error.retryAfterSeconds ?? 0, 0)
    }
    let other = APIClient(origin: api.origin)
    let second: AuthResponse = try await other.send(
      "/api/auth/signup",
      body: APIClient.encode(
        SignupRequest(
          email: "other-\(suffix)@example.com", password: "integration-test-password",
          displayName: "Other observer")))
    other.token = second.token
    do {
      let _: ClaimResponse = try await other.send(
        "/api/stars/\(ids[0])/claim", key: UUID().uuidString)
      XCTFail("Expected conflict")
    } catch let error as APIErrorBody { XCTAssertEqual(error.error.code, "already_claimed") }
    let draft = try MultipartDraft(
      starID: ids[0], note: "Native Swift integration test", links: ["https://example.com"],
      images: [])
    let data = try await api.data(
      "/api/tags", method: "POST", body: draft.body, key: draft.key,
      contentType: "multipart/form-data; boundary=\(draft.boundary)")
    let post = try StarTaggerAPI.decoder.decode(CreateTagResponse.self, from: data)
    XCTAssertEqual(post.tag.hygId, ids[0])
    XCTAssertEqual(post.tag.moderationStatus, .pending)
    let replay = try await api.data(
      "/api/tags", method: "POST", body: draft.body, key: draft.key,
      contentType: "multipart/form-data; boundary=\(draft.boundary)")
    XCTAssertEqual(
      try StarTaggerAPI.decoder.decode(CreateTagResponse.self, from: replay).tag.id, post.tag.id)
    do {
      _ = try await other.data(
        "/api/tags", method: "POST", body: draft.body, key: UUID().uuidString,
        contentType: "multipart/form-data; boundary=\(draft.boundary)")
      XCTFail("Expected owner-only rejection")
    } catch let error as APIErrorBody { XCTAssertEqual(error.error.code, "not_star_owner") }
    var approved = post.tag
    for _ in 0..<20 {
      approved = try await api.get("/api/tags/\(post.tag.id)")
      if approved.moderationStatus == .approved { break }
      try await Task.sleep(for: .milliseconds(250))
    }
    XCTAssertEqual(approved.moderationStatus, .approved, "Fixture moderation should complete")
    let reaction: ReactionResponse = try await other.send(
      "/api/tags/\(post.tag.id)/reactions/\(APIClient.query("✨"))", method: "PUT")
    XCTAssertEqual(reaction.reactionCounts["✨"], 1)
    let comment: CreateCommentResponse = try await other.send(
      "/api/tags/\(post.tag.id)/comments",
      body: APIClient.encode(CreateCommentRequest(body: "A native comment ✨")),
      key: UUID().uuidString)
    XCTAssertEqual(comment.comment.author.id, second.user.id)
    let comments: Page<Comment> = try await other.get("/api/tags/\(post.tag.id)/comments")
    XCTAssertTrue(comments.items.contains { $0.id == comment.comment.id })
    _ = try await other.data("/api/comments/\(comment.comment.id)", method: "DELETE")
    let image = UIGraphicsImageRenderer(size: CGSize(width: 16, height: 16)).image { context in
      UIColor.white.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 16, height: 16))
    }
    let normalized = try PostComposer.normalize(image.pngData()!)
    let photoDraft = try MultipartDraft(
      starID: ids[0], note: "Photo", links: [], images: [normalized])
    let photoResponse = try await api.data(
      "/api/tags", method: "POST", body: photoDraft.body, key: photoDraft.key,
      contentType: "multipart/form-data; boundary=\(photoDraft.boundary)")
    let photo = try StarTaggerAPI.decoder.decode(CreateTagResponse.self, from: photoResponse).tag
    XCTAssertEqual(photo.media.count, 1)
    let bytes = try await api.image(photo.media[0].url)
    XCTAssertNotNil(UIImage(data: bytes))
    _ = try await api.data("/api/tags/\(photo.id)", method: "DELETE")
    let chat = ChatRequest(
      messages: [ChatMessage(role: .user, content: "What is this star?")], mode: .local,
      scopeHygIds: [ids[0]], selectedHygId: ids[0])
    let streamRequest = try api.request(
      "/api/agent/chat", method: "POST", body: APIClient.encode(chat))
    let (stream, streamResponse) = try await api.session.bytes(for: streamRequest)
    XCTAssertEqual((streamResponse as? HTTPURLResponse)?.statusCode, 200)
    var parser = GuideEventParser()
    var answer = ""
    var finished = false
    for try await byte in stream {
      guard let event = try parser.consume(byte: byte) else { continue }
      if case .delta(let text) = event { answer += text }
      if case .done = event {
        finished = true
        break
      }
      if case .failure(let message) = event {
        XCTFail(message)
        break
      }
    }
    XCTAssertTrue(finished, "Expected done event")
    XCTAssertTrue(answer.contains("✨"), "Expected streamed Unicode text")
    _ = try await api.data("/api/tags/\(post.tag.id)", method: "DELETE")
    do {
      let _: Tag = try await api.get("/api/tags/\(post.tag.id)")
      XCTFail("Deleted post should be hidden")
    } catch let error as APIErrorBody { XCTAssertEqual(error.error.code, "not_found") }
  }
}
