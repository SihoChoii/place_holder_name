// Decodes every fixture with the Swift models (top-level code, so compile it as main.swift):
//   cp check-fixtures.swift "$TMPDIR/main.swift" && swiftc StarTaggerAPI.swift "$TMPDIR/main.swift" -o "$TMPDIR/stfx" && "$TMPDIR/stfx" ../fixtures
import Foundation
let dir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "../fixtures"
func check<T: Decodable>(_ file: String, _ type: T.Type) {
    let data = try! Data(contentsOf: URL(fileURLWithPath: "\(dir)/\(file)"))
    do { _ = try StarTaggerAPI.decoder.decode(T.self, from: data); print("ok   \(file)") }
    catch { print("FAIL \(file): \(error)"); exit(1) }
}
check("auth.signup.201.json", AuthResponse.self); check("auth.login.200.json", AuthResponse.self)
check("me.200.json", MeResponse.self); check("me.eligible.200.json", MeResponse.self)
check("star.200.json", Star.self); check("star.unknown-distance.200.json", Star.self)
check("travel-time.200.json", TravelTime.self); check("travel-time.unknown.200.json", TravelTime.self)
check("claim.201.json", ClaimResponse.self); check("tag.create.201.json", CreateTagResponse.self)
for f in ["tag.approved.200.json", "tag.pending.200.json", "tag.rejected.200.json", "tag.review-failed.200.json"] { check(f, Tag.self) }
for f in ["tags.page.200.json", "me-tags.page.200.json", "feed.page.200.json"] { check(f, Page<Tag>.self) }
check("comments.page.200.json", Page<Comment>.self); check("comment.create.201.json", CreateCommentResponse.self)
check("reaction.200.json", ReactionResponse.self); check("view-content.200.json", ViewContentResponse.self)
check("search.200.json", SearchResponse.self); check("public-star.200.json", PublicStarResponse.self)
for f in ["error.on-cooldown.429.json", "error.already-claimed.409.json", "error.idempotency-conflict.409.json", "error.not-found.404.json",
          "error.unauthorized.401.json", "error.validation.400.json", "error.guide-busy.503.json"] { check(f, APIErrorBody.self) }
check("chat.request.json", ChatRequest.self)
print("all fixtures decode")
