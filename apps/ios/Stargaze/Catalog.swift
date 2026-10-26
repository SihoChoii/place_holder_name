import CryptoKit
import Foundation

struct CatalogRecord: Decodable, Sendable {
  let hyg_id: Int
  let name: String?
  let bf: String?
  let con: String?
  let ra_deg: Double
  let dec_deg: Double
  let mag: Double
  let dist_ly: Double?
  let spectral_type: String?
  let exoplanet_count: Int
  let wiki_title: String?
  var skyStar: SkyStar {
    SkyStar(name: name ?? "", desig: bf ?? "", ra: ra_deg / 15, dec: dec_deg, mag: mag, id: hyg_id)
  }
}

struct ConstellationBundle: Decodable {
  struct Line: Decodable {
    let name: String
    let lines_hyg: [[Int]]
  }
  let constellations: [Line]
  let line_stars: [String: Endpoint]
  struct Endpoint: Decodable {
    let ra_deg: Double
    let dec_deg: Double
  }
}

enum StarCatalog {
  static let version = "hyg-4.4-mag6.5-20261025"
  static let result: Result<[CatalogRecord], Error> = Result {
    guard let url = Bundle.main.url(forResource: "stars", withExtension: "json"),
      let manifest = Bundle.main.url(forResource: "VERSION", withExtension: "json")
    else {
      throw CatalogError.missing
    }
    return try verifiedRecords(data: Data(contentsOf: url), manifest: Data(contentsOf: manifest))
  }
  static func verifiedRecords(data: Data, manifest: Data) throws -> [CatalogRecord] {
    struct Manifest: Decodable {
      let catalog_version: String
      let sha256: String
      let star_count: Int
    }
    let metadata = try JSONDecoder().decode(Manifest.self, from: manifest)
    let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    guard metadata.catalog_version == version, metadata.star_count == 8920,
      metadata.sha256 == digest
    else {
      throw CatalogError.invalid
    }
    let records = try JSONDecoder().decode([CatalogRecord].self, from: data)
    guard records.count == metadata.star_count,
      Set(records.map(\.hyg_id)).count == metadata.star_count
    else {
      throw CatalogError.invalid
    }
    return records
  }
  static var records: [CatalogRecord] { (try? result.get()) ?? [] }
  static let stars: [SkyStar] = {
    let mapped: [SkyStar] = records.map { $0.skyStar }
    return mapped.sorted { (lhs: SkyStar, rhs: SkyStar) -> Bool in
      if lhs.mag == rhs.mag { return lhs.id < rhs.id }
      return lhs.mag < rhs.mag
    }
  }()
  static let byID = Dictionary(uniqueKeysWithValues: records.map { ($0.hyg_id, $0) })
  static let byNoteKey = Dictionary(uniqueKeysWithValues: stars.map { ($0.noteKey, $0) })
  static let constellations: ConstellationBundle? = {
    guard let url = Bundle.main.url(forResource: "constellations", withExtension: "json"),
      let data = try? Data(contentsOf: url)
    else { return nil }
    return try? JSONDecoder().decode(ConstellationBundle.self, from: data)
  }()
  enum CatalogError: LocalizedError {
    case missing, invalid
    var errorDescription: String? {
      "The bundled star catalog could not be loaded. Reinstall the app."
    }
  }
}

extension SkyStar: Identifiable {}
