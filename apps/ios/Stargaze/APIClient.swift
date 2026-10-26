import Foundation

struct ClientError: LocalizedError {
  let message: String
  var errorDescription: String? { message }
}
extension APIErrorBody: LocalizedError { public var errorDescription: String? { error.message } }

@MainActor
final class APIClient {
  var origin: String
  var token: String?
  var onUnauthorized: (() -> Void)?
  let session: URLSession
  init(origin: String, configuration: URLSessionConfiguration? = nil) {
    self.origin = origin
    let config = configuration ?? URLSessionConfiguration.ephemeral
    config.httpShouldSetCookies = false
    config.httpCookieStorage = nil
    config.timeoutIntervalForRequest = 20
    config.timeoutIntervalForResource = 90
    session = URLSession(configuration: config, delegate: SameOriginRedirects(), delegateQueue: nil)
  }
  func request(
    _ path: String, method: String = "GET", body: Data? = nil, key: String? = nil,
    contentType: String = "application/json"
  ) throws -> URLRequest {
    guard let base = URL(string: origin), let scheme = base.scheme,
      ["http", "https"].contains(scheme), base.host != nil
    else {
      throw ClientError(message: "Set the server address in Account → Server before connecting.")
    }
    guard path.hasPrefix("/api/"), let url = URL(string: path, relativeTo: base)?.absoluteURL,
      url.host == base.host
    else { throw ClientError(message: "Invalid API address.") }
    var req = URLRequest(url: url)
    req.httpMethod = method
    req.httpBody = body
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    if body != nil { req.setValue(contentType, forHTTPHeaderField: "Content-Type") }
    if let token, !path.hasPrefix("/api/public/"), !path.hasPrefix("/api/auth/") {
      req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }
    if let key { req.setValue(key, forHTTPHeaderField: StarTaggerAPI.idempotencyHeader) }
    return req
  }
  func validate(_ data: Data, _ response: URLResponse, expireSession: Bool = true) throws {
    guard let http = response as? HTTPURLResponse else {
      throw ClientError(message: "The server returned an invalid response.")
    }
    guard (200..<300).contains(http.statusCode) else {
      let error = try? StarTaggerAPI.decoder.decode(APIErrorBody.self, from: data)
      if expireSession, http.statusCode == 401, error?.error.code != "invalid_credentials" {
        onUnauthorized?()
      }
      throw error
        ?? APIErrorBody(
          error: .init(
            code: "http_\(http.statusCode)",
            message: "Server request failed (\(http.statusCode)). Try again.",
            retryAfterSeconds: nil))
    }
  }
  func data(
    _ path: String, method: String = "GET", body: Data? = nil, key: String? = nil,
    contentType: String = "application/json"
  ) async throws -> Data {
    let requestedOrigin = origin
    let requestedToken = token
    let req = try request(path, method: method, body: body, key: key, contentType: contentType)
    let (data, response) = try await session.data(for: req)
    guard origin == requestedOrigin, token == requestedToken else { throw CancellationError() }
    try validate(
      data, response,
      expireSession: req.value(forHTTPHeaderField: "Authorization") == token.map { "Bearer \($0)" })
    return data
  }
  func get<T: Decodable>(_ path: String, as: T.Type = T.self) async throws -> T {
    try StarTaggerAPI.decoder.decode(T.self, from: await data(path))
  }
  func send<T: Decodable>(
    _ path: String, method: String = "POST", body: Data? = nil, key: String? = nil,
    as: T.Type = T.self
  ) async throws -> T {
    try StarTaggerAPI.decoder.decode(
      T.self, from: await data(path, method: method, body: body, key: key))
  }
  func pages<T: Codable & Hashable>(_ path: String, count: Int = 1, as: T.Type = T.self)
    async throws -> Page<T>
  {
    let requestedOrigin = origin
    let requestedToken = token
    var result: [T] = []
    var cursor: String?
    for page in 0..<max(1, count) {
      guard origin == requestedOrigin, token == requestedToken else { throw CancellationError() }
      if page > 0 && cursor == nil { break }
      let suffix =
        cursor.map { (path.contains("?") ? "&" : "?") + "cursor=" + Self.query($0) } ?? ""
      let response: Page<T> = try await get(path + suffix)
      result.append(contentsOf: response.items)
      cursor = response.nextCursor
    }
    return Page(items: result, nextCursor: cursor)
  }
  func image(_ path: String) async throws -> Data { try await data(path) }
  static func encode<T: Encodable>(_ body: T) throws -> Data {
    try StarTaggerAPI.encoder.encode(body)
  }
  static func query(_ value: String) -> String {
    value.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
  }
}

struct MultipartDraft: Codable {
  let key: String
  let boundary: String
  var body = Data()
  var note: String?
  var links: [String]?
  var images: [Data]?
  init(starID: Int, note: String, links: [String], images: [Data]) throws {
    self.note = note
    self.links = links
    self.images = images
    key = UUID().uuidString
    boundary = "StarTagger-\(UUID().uuidString)"
    guard note.unicodeScalars.count <= 140, links.count + images.count <= 4,
      !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !links.isEmpty
        || !images.isEmpty
    else {
      throw ClientError(
        message: "Add a note or attachment. Use up to 140 characters and four attachments.")
    }
    func append(_ text: String) { body.append(Data(text.utf8)) }
    func field(_ name: String, _ value: String) {
      append(
        "--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n")
    }
    field("hyg_id", String(starID))
    field("note", note)
    field("links", String(data: try JSONEncoder().encode(links), encoding: .utf8)!)
    for (i, image) in images.enumerated() {
      guard image.count <= 5 * 1024 * 1024 else {
        throw ClientError(message: "Each photo must be under 5 MiB.")
      }
      append(
        "--\(boundary)\r\nContent-Disposition: form-data; name=\"images\"; filename=\"photo-\(i).jpg\"\r\nContent-Type: image/jpeg\r\n\r\n"
      )
      body.append(image)
      append("\r\n")
    }
    append("--\(boundary)--\r\n")
    guard body.count <= 22 * 1024 * 1024 else {
      throw ClientError(message: "The complete post must be under 22 MiB.")
    }
  }
}
