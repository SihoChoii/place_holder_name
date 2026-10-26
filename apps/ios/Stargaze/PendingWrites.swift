import CryptoKit
import Foundation

/// Request bytes survive a timeout, sheet dismissal, and process termination. Files are scoped to server/user.
enum PendingWrites {
  private static func file(_ namespace: String, _ resource: String) throws -> URL {
    let root = try FileManager.default.url(
      for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
    ).appendingPathComponent("PendingWrites", isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let hash = SHA256.hash(data: Data("\(namespace)|\(resource)".utf8)).map {
      String(format: "%02x", $0)
    }.joined()
    return root.appendingPathComponent(hash + ".json")
  }
  static func load<T: Decodable>(_ type: T.Type, namespace: String, resource: String) -> T? {
    guard let url = try? file(namespace, resource), let data = try? Data(contentsOf: url) else {
      return nil
    }
    return try? JSONDecoder().decode(T.self, from: data)
  }
  static func save<T: Encodable>(_ value: T, namespace: String, resource: String) throws {
    let data = try JSONEncoder().encode(value)
    try data.write(to: file(namespace, resource), options: [.atomic, .completeFileProtection])
  }
  static func remove(namespace: String, resource: String) {
    if let url = try? file(namespace, resource) { try? FileManager.default.removeItem(at: url) }
  }
}
struct PendingComment: Codable {
  let key: String
  let body: String
}

final class SameOriginRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    let original = task.originalRequest?.url
    let next = request.url
    completionHandler(
      original?.scheme == next?.scheme && original?.host == next?.host
        && original?.port == next?.port ? request : nil)
  }
}
