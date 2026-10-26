import XCTest

final class DeviceSkyTests: XCTestCase {
  func testPhysicalCameraLocationOrientationAndRendering() throws {
    #if targetEnvironment(simulator)
      throw XCTSkip("This acceptance check requires physical camera and motion sensors.")
    #else
      let app = XCUIApplication()
      addUIInterruptionMonitor(withDescription: "Camera and location permissions") { alert in
        for label in ["Allow While Using App", "Allow", "OK"] {
          if alert.buttons[label].exists {
            alert.buttons[label].tap()
            return true
          }
        }
        return false
      }
      app.launch()
      app.tap()
      let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
      for _ in 0..<4 {
        for label in ["Allow While Using App", "Allow", "OK"] {
          if springboard.alerts.buttons[label].exists { springboard.alerts.buttons[label].tap() }
        }
        if app.staticTexts["sky.status"].exists { break }
      }
      let status = app.staticTexts["sky.status"]
      XCTAssertTrue(status.waitForExistence(timeout: 15))
      let ready = NSPredicate { _, _ in
        let value = status.value as? String ?? ""
        return (value.split(separator: " ").first.flatMap { Int($0) } ?? 0) > 0
      }
      expectation(for: ready, evaluatedWith: status)
      waitForExpectations(timeout: 45)
      let attachment = XCTAttachment(screenshot: app.screenshot())
      attachment.name = "Physical iPhone live sky"
      attachment.lifetime = .keepAlways
      add(attachment)
      let performance = NSPredicate { _, _ in
        let value = status.value as? String ?? ""
        let words = value.components(separatedBy: "; ")
        let rate = words.last?.split(separator: " ").first.flatMap { Double($0) } ?? 0
        return rate >= 30
      }
      expectation(for: performance, evaluatedWith: status)
      waitForExpectations(timeout: 20)
      print("DEVICE_SKY_EVIDENCE: \(status.value ?? "unknown")")
    #endif
  }
}
