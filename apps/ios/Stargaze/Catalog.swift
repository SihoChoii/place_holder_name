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
    guard let url = Bundle.main.url(forResource: "stars", withExtension: "json") else {
      throw CatalogError.missing
    }
    let records = try JSONDecoder().decode([CatalogRecord].self, from: Data(contentsOf: url))
    guard records.count == 8920, Set(records.map(\.hyg_id)).count == 8920 else {
      throw CatalogError.invalid
    }
    return records
  }
  static var records: [CatalogRecord] { (try? result.get()) ?? [] }
  static let stars = records.map(\.skyStar)
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
