import XCTest

final class DeviceSkyTests: XCTestCase {
  func testAuthModeSelector() throws {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launch()
    let account = app.buttons["Account and server"]
    XCTAssertTrue(account.waitForExistence(timeout: 15))
    account.tap()
    let authenticate = app.buttons["Sign in or create account"]
    XCTAssertTrue(authenticate.waitForExistence(timeout: 10), app.debugDescription)
    authenticate.tap()
    let signup = app.buttons["auth.signUp"]
    XCTAssertTrue(signup.waitForExistence(timeout: 10), app.debugDescription)
    signup.tap()
    let name = app.textFields["Your name"]
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = "Auth after selecting Sign up"
    attachment.lifetime = .keepAlways
    add(attachment)
    XCTAssertTrue(name.waitForExistence(timeout: 5), app.debugDescription)
    XCTAssertTrue(signup.isSelected)
    let email = app.textFields["you@example.com"]
    email.tap()
    email.typeText("selector-test@example.com")
    app.buttons["auth.signIn"].tap()
    XCTAssertFalse(name.exists)
    signup.tap()
    XCTAssertTrue(name.waitForExistence(timeout: 5), app.debugDescription)
    XCTAssertEqual(email.value as? String, "selector-test@example.com")
    app.buttons["Close"].tap()
    app.buttons["Done"].tap()
  }

  func testConfigureBackendAndReadPublicStar() throws {
    guard ProcessInfo.processInfo.environment["RUN_IOS_BACKEND_SETUP"] == "1",
      let origin = ProcessInfo.processInfo.environment["TEST_API_ORIGIN"]
    else {
      throw XCTSkip("Opt in with the user-approved backend origin.")
    }
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchEnvironment["STARTAGGER_API_ORIGIN"] = origin
    app.launch()
    let account = app.buttons["Account and server"]
    XCTAssertTrue(account.waitForExistence(timeout: 15))
    account.tap()
    let useServer = app.buttons["Use server"]
    XCTAssertTrue(useServer.waitForExistence(timeout: 15))
    useServer.tap()
    app.buttons["Done"].tap()
    app.buttons["Explore"].tap()
    let search = app.textFields["Search a name, HYG ID, or post"]
    XCTAssertTrue(search.waitForExistence(timeout: 10))
    search.tap()
    search.typeText("32263")
    let sirius = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Sirius")).firstMatch
    XCTAssertTrue(sirius.waitForExistence(timeout: 10))
    sirius.tap()
    let ownership = app.staticTexts.matching(
      NSPredicate(format: "label == %@ OR label BEGINSWITH %@", "Unclaimed", "Claimed by")
    ).firstMatch
    XCTAssertTrue(ownership.waitForExistence(timeout: 20), app.debugDescription)
    print("DEVICE_BACKEND_EVIDENCE: public Sirius ownership loaded from \(origin)")
    app.terminate()
    app.launchEnvironment.removeValue(forKey: "STARTAGGER_API_ORIGIN")
    app.launch()
    XCTAssertTrue(account.waitForExistence(timeout: 15))
    account.tap()
    let server = app.textFields["http://your-mac.local:4000"]
    XCTAssertTrue(server.waitForExistence(timeout: 10))
    XCTAssertEqual(server.value as? String, origin)
    app.buttons["Done"].tap()
  }
  func testPhysicalCameraCapturePreview() throws {
    #if targetEnvironment(simulator)
      throw XCTSkip("Camera capture acceptance requires a physical iPhone.")
    #else
      continueAfterFailure = false
      let environment = ProcessInfo.processInfo.environment
      guard environment["RUN_IOS_CAMERA_TEST"] == "1",
        let origin = environment["TEST_API_ORIGIN"],
        let starID = environment["CAMERA_TEST_STAR_ID"],
        let starName = environment["CAMERA_TEST_STAR_NAME"],
        let testEmail = environment["CAMERA_TEST_EMAIL"]
      else {
        throw XCTSkip("Opt in with a disposable API and an unclaimed test star.")
      }
      let app = XCUIApplication()
      app.launchEnvironment["STARTAGGER_API_ORIGIN"] = origin
      app.launch()
      func tap(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 15), element.debugDescription)
        for _ in 0..<3 {
          if element.isHittable { break }
          app.swipeUp()
        }
        element.press(forDuration: 0.15)
      }
      tap(app.buttons["Account and server"])
      if app.buttons["Log out"].exists { tap(app.buttons["Log out"]) }
      tap(app.buttons["Sign in or create account"])
      tap(app.buttons["Show password"])
      let email = app.textFields["you@example.com"]
      tap(email)
      email.typeText(testEmail)
      let password = app.textFields["auth.password"]
      tap(password)
      password.typeText("camera-test-password\n")
      XCTAssertTrue(app.buttons["Log out"].waitForExistence(timeout: 15), app.debugDescription)
      tap(app.buttons["Done"])
      tap(app.buttons["Explore"])
      let search = app.textFields["Search a name, HYG ID, or post"]
      tap(search)
      search.typeText(starID)
      tap(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", starName)).firstMatch)
      tap(app.buttons["Claim this star"])
      XCTAssertTrue(
        app.staticTexts["Claimed by you"].waitForExistence(timeout: 15), app.debugDescription)
      tap(app.buttons["Add post"].firstMatch)
      tap(app.buttons["Take photo"])
      let shutter = app.buttons.matching(
        NSPredicate(format: "label IN %@", ["Take Picture", "Take Photo", "PhotoCapture"])
      ).firstMatch
      XCTAssertTrue(shutter.waitForExistence(timeout: 15), app.debugDescription)
      tap(shutter)
      tap(app.buttons["Use Photo"])
      XCTAssertTrue(
        app.buttons["Remove photo 1"].waitForExistence(timeout: 15), app.debugDescription)
      print("DEVICE_CAMERA_EVIDENCE: captured photo returned to composer preview; not uploaded")
      tap(app.buttons["Close"])
    #endif
  }
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
