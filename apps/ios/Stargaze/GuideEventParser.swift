import Foundation

enum GuideStreamEvent {
  case start
  case delta(String)
  case done
  case failure(String)
}
struct GuideEventParser {
  private var lineBytes = Data()
  mutating func consume(byte: UInt8) throws -> GuideStreamEvent? {
    if byte == 10 {
      defer { lineBytes.removeAll(keepingCapacity: true) }
      guard let line = String(data: lineBytes, encoding: .utf8) else {
        throw ClientError(message: "The guide returned invalid text.")
      }
      return try consume(line)
    }
    guard lineBytes.count < 65536 else {
      throw ClientError(message: "The guide returned an oversized event.")
    }
    lineBytes.append(byte)
    return nil
  }
  private var event = ""
  private var dataLines: [String] = []
  mutating func consume(_ raw: String) throws -> GuideStreamEvent? {
    let line = raw.hasSuffix("\r") ? String(raw.dropLast()) : raw
    if line.isEmpty {
      defer {
        event = ""
        dataLines = []
      }
      guard !dataLines.isEmpty else { return nil }
      let data = Data(dataLines.joined(separator: "\n").utf8)
      let value = try StarTaggerAPI.decoder.decode(ChatEventData.self, from: data)
      switch event {
      case "start": return .start
      case "delta": return .delta(value.text ?? "")
      case "done": return .done
      case "error":
        return .failure(value.message ?? "The guide could not finish. Please try again.")
      default: return nil
      }
    }
    if line.hasPrefix("event:") {
      event = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
    } else if line.hasPrefix("data:") {
      var data = String(line.dropFirst(5))
      if data.first == " " { data.removeFirst() }
      dataLines.append(data)
    }
    return nil
  }
}
