import Combine
import Foundation
import Security

struct StoredSession: Codable {
  let token: String
  let user: PrivateUser
  let expiresAt: Int64
}
enum KeychainStore {
  static func load(_ origin: String) -> StoredSession? {
    var query = base(origin)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data
    else { return nil }
    return try? JSONDecoder().decode(StoredSession.self, from: data)
  }
  static func save(_ value: StoredSession, origin: String) throws {
    var query = base(origin)
    SecItemDelete(query as CFDictionary)
    query[kSecValueData as String] = try JSONEncoder().encode(value)
    query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else {
      throw ClientError(message: "The session could not be saved securely. Please sign in again.")
    }
  }
  static func delete(_ origin: String) { SecItemDelete(base(origin) as CFDictionary) }
  private static func base(_ origin: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "com.stargaze.session", kSecAttrAccount as String: origin,
    ]
  }
}

@MainActor
final class SessionStore: ObservableObject {
  @Published var user: PrivateUser?
  @Published var me: MeResponse?
  @Published var message: String?
  @Published private(set) var origin: String
  @Published var revision = 0
  var checkedStars: [Int: (overlay: StarOverlay, checkedAt: Date)] = [:]
  private var serverOffset: TimeInterval = 0
  let api: APIClient
  init() {
    let configured = UserDefaults.standard.string(forKey: "StarTagger.apiOrigin") ?? ""
    #if DEBUG
      let origin = ProcessInfo.processInfo.environment["STARTAGGER_API_ORIGIN"] ?? configured
    #else
      let origin = configured
    #endif
    self.origin = origin
    api = APIClient(origin: origin)
    if let stored = KeychainStore.load(origin),
      stored.expiresAt > Int64(Date().timeIntervalSince1970 * 1000)
    {
      user = stored.user
      api.token = stored.token
    }
    api.onUnauthorized = { [weak self] in
      self?.clear()
      self?.message = "Your session expired. Sign in again."
    }
  }
  var signedIn: Bool { user != nil }
  var identity: String { "\(origin)|\(user?.id ?? "public")" }
  var cooldown: Int {
    guard let next = me?.nextClaimAt else { return 0 }
    return max(0, Int(ceil(Double(next) / 1000 - Date().timeIntervalSince1970 - serverOffset)))
  }
  func setOrigin(_ raw: String) throws {
    var raw = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    while raw.hasSuffix("/") { raw.removeLast() }
    if raw.hasSuffix("/api") { raw = String(raw.dropLast(4)) }
    guard let url = URL(string: raw), ["http", "https"].contains(url.scheme ?? ""), url.host != nil,
      url.user == nil, url.password == nil, url.query == nil, url.fragment == nil, url.path.isEmpty
    else {
      throw ClientError(
        message: "Enter a server origin such as http://your-mac.local:4000, without a path.")
    }
    clear()
    origin = raw
    api.origin = raw
    UserDefaults.standard.set(raw, forKey: "StarTagger.apiOrigin")
    if let stored = KeychainStore.load(raw),
      stored.expiresAt > Int64(Date().timeIntervalSince1970 * 1000)
    {
      user = stored.user
      api.token = stored.token
    }
    revision += 1
  }
  func authenticate(email: String, password: String, name: String, signup: Bool) async throws {
    let body =
      signup
      ? try APIClient.encode(SignupRequest(email: email, password: password, displayName: name))
      : try APIClient.encode(LoginRequest(email: email, password: password))
    let requestedOrigin = origin
    let response: AuthResponse = try await api.send(
      "/api/auth/\(signup ? "signup" : "login")", body: body)
    guard origin == requestedOrigin else { throw CancellationError() }
    try KeychainStore.save(
      StoredSession(token: response.token, user: response.user, expiresAt: response.expiresAt),
      origin: origin)
    api.token = response.token
    user = response.user
    message = nil
    revision += 1
    try await refreshMe()
  }
  func refreshMe() async throws {
    guard signedIn else { return }
    let requestedIdentity = identity
    let requestedToken = api.token
    let value: MeResponse = try await api.get("/api/me")
    guard identity == requestedIdentity, api.token == requestedToken else { return }
    me = value
    user = value.user
    serverOffset = Double(value.serverTime) / 1000 - Date().timeIntervalSince1970
  }
  func claimSucceeded(_ response: ClaimResponse) {
    if let me {
      self.me = MeResponse(
        user: me.user, serverTime: me.serverTime, nextClaimAt: response.nextClaimAt,
        claimCooldownSeconds: me.claimCooldownSeconds)
    }
    revision += 1
  }
  func logout() async {
    let requestedIdentity = identity
    _ = try? await api.data("/api/auth/logout", method: "POST")
    if identity == requestedIdentity { clear() }
  }
  func clear() {
    checkedStars = [:]
    KeychainStore.delete(origin)
    api.token = nil
    user = nil
    me = nil
    revision += 1
  }
}
