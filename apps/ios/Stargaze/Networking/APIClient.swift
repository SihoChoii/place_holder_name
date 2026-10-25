import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case badStatus(Int, String?)
    case decoding

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid API URL"
        case .badStatus(let code, let message): return message ?? "HTTP \(code)"
        case .decoding: return "Could not decode response"
        }
    }
}

final class APIClient {
    /// Point at your Mac's LAN IP when testing on a physical device.
    static var baseURL = URL(string: "http://127.0.0.1:4000")!

    private let session: URLSession
    private let decoder: JSONDecoder

    init(session: URLSession = .shared) {
        self.session = session
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601
    }

    func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: Encodable? = nil,
        token: String? = nil
    ) async throws -> T {
        guard let url = URL(string: path, relativeTo: Self.baseURL) else {
            throw APIError.invalidURL
        }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }

        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.badStatus(-1, nil)
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? decoder.decode(ErrorBody.self, from: data))?.error
            throw APIError.badStatus(http.statusCode, message)
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding
        }
    }
}

private struct ErrorBody: Decodable {
    let error: String
}

private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void

    init(_ value: Encodable) {
        self.encodeFunc = value.encode
    }

    func encode(to encoder: Encoder) throws {
        try encodeFunc(encoder)
    }
}
