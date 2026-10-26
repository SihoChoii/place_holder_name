import Foundation
import QuartzCore

/// Measures actual Canvas redraw cadence; independent of sensor timer frequency.
final class SkyFrameCounter: @unchecked Sendable {
  static let shared = SkyFrameCounter()
  private let lock = NSLock()
  private var start = CACurrentMediaTime()
  private var count = 0
  private var rate = 0.0
  func record() {
    lock.lock()
    defer { lock.unlock() }
    count += 1
    let now = CACurrentMediaTime()
    if now - start >= 3 {
      rate = Double(count) / (now - start)
      count = 0
      start = now
    }
  }
  var framesPerSecond: Double {
    lock.lock()
    defer { lock.unlock() }
    return rate
  }
  func reset() {
    lock.lock()
    defer { lock.unlock() }
    count = 0
    rate = 0
    start = CACurrentMediaTime()
  }
}
