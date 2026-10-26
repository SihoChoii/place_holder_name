import AVFoundation
import SwiftUI
import simd

private enum SkyPanel: String, Identifiable {
  case account, explore, visible, calibration, notes, guide
  var id: String { rawValue }
}

struct ContentView: View {
  @EnvironmentObject var session: SessionStore
  @Environment(\.scenePhase) private var phase
  @StateObject private var sky = SkyModel()
  @StateObject private var camera = CameraManager()
  @StateObject private var notes = NoteStore()
  @State private var selected: SkyStar?
  @State private var panel: SkyPanel?
  @State private var visibleIDs: [Int] = []
  @State private var overlays: [Int: StarOverlay] = [:]
  @State private var overlayError: String?
  @State private var showLines = false
  @State private var target: SkyStar?
  @State private var auth = false
  @State private var aligning = false
  @State private var calibrationStar: SkyStar?
  var body: some View {
    ZStack {
      Color.black.ignoresSafeArea()
      if camera.status == .authorized {
        CameraPreview(session: camera.session).ignoresSafeArea().accessibilityHidden(true)
      }
      GeometryReader { geo in
        let marks = marks(size: geo.size)
        Canvas { ctx, size in draw(&ctx, size, marks) }.accessibilityHidden(true)
          .contentShape(Rectangle())
          .onTapGesture { point in
            if aligning, let calibrationStar {
              let projector = projector(geo.size)
              let ray = simd_normalize(
                SIMD3<Double>(
                  (Double(point.x) - projector.cx) / projector.f,
                  -(Double(point.y) - projector.cy) / projector.f, -1))
              let observed = SkyMath.altAz(sky.attitude.act(ray)).az
              let expected = SkyMath.altAz(
                SkyMath.refVector(
                  raHours: calibrationStar.ra, decDeg: calibrationStar.dec, latDeg: sky.latitude,
                  lstDeg: sky.lstDeg)
              ).az
              sky.azimuthOffsetDeg += wrappedDifference(expected - observed)
              aligning = false
              self.calibrationStar = nil
            } else if let i = StarPicker.pick(marks, at: point) {
              selected = marks[i].star
            } else {
              selected = nil
            }
          }
          .onChange(of: marks.map { $0.star.id }, initial: true) { _, ids in visibleIDs = ids }
      }.ignoresSafeArea()
      VStack(alignment: .leading, spacing: 12) {
        HStack {
          Text("StarTagger").font(AppTheme.font(24, weight: .semibold, relativeTo: .title2))
          Spacer()
          Button {
            panel = .account
          } label: {
            Image(systemName: "person.crop.circle").font(.title2).frame(width: 48, height: 48)
          }.accessibilityLabel("Account and server")
        }
        HStack {
          Text("LIVE SKY").font(.caption.weight(.medium)).accessibilityIdentifier("sky.status")
            .accessibilityValue(
              sky.hasLocation && sky.hasMotion
                ? "\(visibleIDs.count) stars in view; \(Int(SkyFrameCounter.shared.framesPerSecond.rounded())) frames per second"
                : "Waiting for location and orientation")
          Spacer()
          Text(
            sky.hasMotion
              ? String(format: "%03.0f° · Alt %.0f°", sky.azimuth, sky.altitude)
              : "Waiting for orientation"
          ).font(.caption).monospacedDigit()
        }.foregroundStyle(AppTheme.secondary)
        if !sky.hasLocation || !sky.hasMotion || camera.status != .authorized { permissionStatus }
        if sky.hasLocation && sky.daylight {
          StatusMessage(
            message:
              "Daylight — these are predicted star positions; most stars will not be visible to the eye."
          ).background(AppTheme.overlay)
        }
        if sky.needsCalibration {
          StatusMessage(message: "Compass accuracy is low. Open Calibrate to align a known star.")
            .background(AppTheme.overlay)
        }
        if aligning {
          Text("Tap the real position of \(calibrationStar?.title ?? "the star") in the camera.")
            .padding(12).background(AppTheme.overlay)
          Button("Cancel alignment") { aligning = false }
        }
        if let target {
          if sky.hasLocation && sky.hasMotion {
            targetHint(target)
          } else {
            StatusMessage(message: "Location and orientation are needed to find \(target.title).")
          }
        }
        Spacer()
        HStack {
          Button("Stars in view (\(visibleIDs.count))") { panel = .visible }.buttonStyle(
            SecondaryButtonStyle())
          Spacer()
          Button("Calibrate") { panel = .calibration }.frame(minHeight: 44)
        }
        HStack(spacing: 0) {
          navButton("Sky", "viewfinder") { target = nil }
          navButton("Explore", "sparkle.magnifyingglass") { panel = .explore }
          navButton("Guide", "sparkles") {
            if session.signedIn { panel = .guide } else { auth = true }
          }
        }.background(AppTheme.surface).overlay(alignment: .top) {
          Rectangle().fill(AppTheme.border).frame(height: 1)
        }
      }.padding(.horizontal, 24).padding(.top, 8).padding(.bottom, 8)
    }.appScreen()
      .onAppear { activate() }
      .onDisappear {
        camera.stop()
        sky.stop()
      }
      .onChange(of: phase) { _, _ in activate() }
      .onChange(of: selected?.id) { _, _ in activate() }
      .onChange(of: panel) { _, _ in activate() }
      .onChange(of: auth) { _, _ in activate() }
      .sheet(item: $selected) { StarDetailSheet(star: $0) }
      .sheet(isPresented: $auth) { AuthView() }
      .sheet(item: $panel) { value in panelView(value) }
      .task(id: "\(session.identity)|\(phase)") {
        overlays = [:]
        guard phase == .active else { return }
        while !Task.isCancelled {
          await refreshOverlays()
          do { try await Task.sleep(for: .seconds(5)) } catch { break }
        }
      }
      .task(id: visibleIDs.prefix(200).map(String.init).joined(separator: ",")) {
        do {
          try await Task.sleep(for: .milliseconds(800))
          await refreshOverlays()
        } catch {}
      }
  }
  private func navButton(_ title: String, _ icon: String, action: @escaping () -> Void) -> some View
  {
    Button(action: action) {
      VStack(spacing: 4) {
        Image(systemName: icon)
        Text(title).font(.caption)
      }.frame(maxWidth: .infinity, minHeight: 56)
    }
  }
  @ViewBuilder private var permissionStatus: some View {
    VStack(alignment: .leading, spacing: 8) {
      #if targetEnvironment(simulator)
        StatusMessage(
          message:
            "Simulator: camera and orientation are unavailable. Use Explore to test real catalog and account features."
        )
      #else
        StatusMessage(
          message: camera.status == .denied || camera.status == .restricted
            ? "Allow camera access to see the live sky."
            : sky.locationDenied
              ? "Allow location to align stars with your sky."
              : !sky.hasLocation ? "Finding your location…" : "Waiting for phone orientation…")
      #endif
      if camera.status == .denied || camera.status == .restricted || sky.locationDenied {
        Button("Open Settings") {
          if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
          }
        }.frame(minHeight: 44)
      }
    }.padding(12).background(AppTheme.overlay)
  }
  private func targetHint(_ star: SkyStar) -> some View {
    let aa = SkyMath.altAz(
      SkyMath.refVector(
        raHours: star.ra, decDeg: star.dec, latDeg: sky.latitude, lstDeg: sky.lstDeg))
    let difference = wrappedDifference(aa.az - sky.azimuth)
    return VStack(alignment: .leading) {
      Text("Find \(star.title)").font(.headline)
      Text(
        aa.alt < 0
          ? "Below your horizon"
          : String(
            format: "Turn %@ %.0f° · %@ %.0f°", difference >= 0 ? "right" : "left", abs(difference),
            aa.alt > sky.altitude ? "raise" : "lower", abs(aa.alt - sky.altitude))
      ).font(.subheadline)
    }.padding(12).background(AppTheme.overlay)
  }
  private func activate() {
    if phase == .active {
      sky.start()
      if selected == nil && panel == nil && !auth { camera.start() } else { camera.stop() }
    } else {
      sky.stop()
      camera.stop()
      SkyFrameCounter.shared.reset()
    }
  }
  private func wrappedDifference(_ angle: Double) -> Double {
    (angle + 540).truncatingRemainder(dividingBy: 360) - 180
  }
  private func projector(_ size: CGSize) -> Projector {
    Projector(
      attitude: sky.attitude, width: size.width, height: size.height,
      longAxisFOVDeg: camera.longAxisFOVDeg, sensorAspect: camera.sensorAspect)
  }
  private func marks(size: CGSize) -> [StarMark] {
    guard sky.hasLocation, sky.hasMotion else { return [] }
    let p = projector(size)
    return StarCatalog.stars.enumerated().compactMap { index, star in
      guard index < sky.starVectors.count else { return nil }
      let vector = sky.starVectors[index]
      guard vector.z >= 0, let point = p.project(vector), point.x >= 0, point.x <= size.width,
        point.y >= 0, point.y <= size.height
      else { return nil }
      return StarMark(
        star: star, point: point, radius: SkyMath.dotRadius(mag: star.mag),
        label: star.mag < 2.5 || selected?.id == star.id ? star.title : "", hasNote: false)
    }
  }
  private func draw(_ ctx: inout GraphicsContext, _ size: CGSize, _ marks: [StarMark]) {
    SkyFrameCounter.shared.record()
    let p = projector(size)
    var horizon = Path()
    var previous: CGPoint?
    for degree in stride(from: 0.0, through: 360.0, by: 2) {
      let a = degree * SkyMath.deg
      if let point = p.project(SIMD3(cos(a), -sin(a), 0)), abs(point.x) < size.width * 4,
        abs(point.y) < size.height * 4
      {
        if previous != nil { horizon.addLine(to: point) } else { horizon.move(to: point) }
        previous = point
      } else {
        previous = nil
      }
    }
    ctx.stroke(horizon, with: .color(.white.opacity(0.45)), lineWidth: 1)
    for (label, azimuth) in [("N", 0.0), ("E", 90.0), ("S", 180.0), ("W", 270.0)] {
      let a = azimuth * SkyMath.deg
      if let point = p.project(SIMD3(cos(a), -sin(a), 0)), point.x >= 0, point.x <= size.width,
        point.y >= 0, point.y <= size.height
      {
        ctx.draw(
          Text(label).font(.caption.bold()).foregroundColor(.white),
          at: CGPoint(x: point.x, y: point.y + 12))
      }
    }
    if showLines, let bundle = StarCatalog.constellations {
      for group in bundle.constellations {
        for line in group.lines_hyg {
          for (a, b) in zip(line, line.dropFirst()) {
            func point(_ id: Int) -> CGPoint? {
              let r = StarCatalog.byID[id]
              let endpoint = bundle.line_stars[String(id)]
              guard let ra = r?.ra_deg ?? endpoint?.ra_deg,
                let dec = r?.dec_deg ?? endpoint?.dec_deg
              else { return nil }
              let v = SkyMath.refVector(
                raHours: ra / 15, decDeg: dec, latDeg: sky.latitude, lstDeg: sky.lstDeg)
              return v.z >= 0 ? p.project(v) : nil
            }
            if let pa = point(a), let pb = point(b), abs(pa.x - pb.x) < size.width * 2,
              abs(pa.y - pb.y) < size.height * 2
            {
              var path = Path()
              path.move(to: pa)
              path.addLine(to: pb)
              ctx.stroke(path, with: .color(.white.opacity(0.2)), lineWidth: 1)
            }
          }
        }
      }
    }
    for m in marks {
      let r = m.radius
      let rect = CGRect(x: m.point.x - r, y: m.point.y - r, width: r * 2, height: r * 2)
      ctx.fill(
        Path(ellipseIn: rect),
        with: .color(.white.opacity(max(0.25, min(1, 1 - (m.star.mag + 1) / 10)))))
      if let overlay = overlays[m.star.id]
        ?? session.checkedStars[m.star.id].flatMap({
          Date().timeIntervalSince($0.checkedAt) < 15 ? $0.overlay : nil
        })
      {
        ctx.stroke(
          Path(ellipseIn: rect.insetBy(dx: -4, dy: -4)), with: .color(.white), lineWidth: 1)
        if overlay.claim != nil {
          ctx.stroke(
            Path(ellipseIn: rect.insetBy(dx: -7, dy: -7)), with: .color(.white), lineWidth: 1)
        }
        if overlay.tagCount > 0 {
          ctx.fill(
            Path(CGRect(x: rect.maxX + 8, y: rect.minY - 7, width: 3, height: 3)),
            with: .color(.white))
        }
      }
      if !m.label.isEmpty {
        ctx.draw(
          Text(m.label).font(.caption).foregroundColor(.white),
          at: CGPoint(x: m.point.x + 12, y: m.point.y), anchor: .leading)
      }
    }
    let center = CGPoint(x: size.width / 2, y: size.height / 2)
    ctx.stroke(
      Path(CGRect(x: center.x - 10, y: center.y - 10, width: 20, height: 20)),
      with: .color(.white.opacity(0.65)), lineWidth: 1)
  }
  private func refreshOverlays() async {
    guard phase == .active, panel == nil, selected == nil, session.signedIn, !visibleIDs.isEmpty
    else { return }
    let identity = session.identity
    do {
      let response: ViewContentResponse = try await session.api.send(
        "/api/view/content",
        body: APIClient.encode(ViewContentRequest(hygIds: Array(visibleIDs.prefix(200)))))
      guard !Task.isCancelled, session.identity == identity else { return }
      overlays = Dictionary(uniqueKeysWithValues: response.stars.map { ($0.hygId, $0) })
      overlayError = nil
    } catch {
      if !Task.isCancelled {
        overlays = [:]
        overlayError = error.localizedDescription
      }
    }
  }
  @ViewBuilder private func panelView(_ value: SkyPanel) -> some View {
    switch value {
    case .account: AccountView()
    case .explore: ExploreView { target = $0 }
    case .notes:
      NotesListView(
        store: notes, latitude: sky.hasLocation ? sky.latitude : nil,
        longitude: sky.hasLocation ? sky.longitude : nil)
    case .guide: GuideView(selectedID: nil, scopeIDs: Array(visibleIDs.prefix(200)), explore: false)
    case .visible:
      NavigationStack {
        List {
          if visibleIDs.isEmpty { Text("Point the phone toward the sky to see stars here.") }
          if let overlayError { StatusMessage(message: overlayError) }
          ForEach(visibleIDs, id: \.self) { id in
            if let star = StarCatalog.byID[id]?.skyStar {
              Button(star.title) {
                panel = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { selected = star }
              }.frame(minHeight: 44)
            }
          }
        }.scrollContentBackground(.hidden).appScreen().navigationTitle("Stars in view").toolbar {
          Button("Done") { panel = nil }
        }
      }
    case .calibration:
      NavigationStack {
        Form {
          Section("Heading") {
            Slider(value: $sky.azimuthOffsetDeg, in: -180...180, step: 0.5).accessibilityLabel(
              "Heading correction")
            Text(String(format: "Offset %+.1f°", sky.azimuthOffsetDeg))
            Button("Reset heading") { sky.azimuthOffsetDeg = 0 }
          }
          Section("Align a known star") {
            Text("Choose a star you can identify, then tap its real location in the camera.")
            ForEach(visibleIDs.prefix(12), id: \.self) { id in
              if let star = StarCatalog.byID[id]?.skyStar {
                Button(star.title) {
                  calibrationStar = star
                  aligning = true
                  panel = nil
                }
              }
            }
          }
          Section("Sky") {
            Toggle("Constellation lines", isOn: $showLines)
            Button("Local notes") { panel = .notes }
          }
        }.scrollContentBackground(.hidden).appScreen().navigationTitle("Calibrate").toolbar {
          Button("Done") { panel = nil }
        }
      }
    }
  }
}
