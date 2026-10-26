@preconcurrency import AVFoundation
import Combine
import CoreLocation
import CoreMedia
import CoreMotion
import SwiftUI
import UIKit
import simd

// MARK: - SkyStar catalog

struct SkyStar: Sendable {
  let name: String  // proper name, empty if the star has none
  let desig: String  // Bayer/Flamsteed designation, e.g. "α Lyr"
  let ra: Double  // right ascension, hours
  let dec: Double  // declination, degrees
  let mag: Double  // visual magnitude (smaller = brighter)
  let id: Int  // HYG database id, -1 if missing

  /// Short label: proper name, else designation, else the HYG number.
  var title: String {
    if !name.isEmpty { return name }
    if !desig.isEmpty { return desig }
    return "HYG \(id)"
  }

  var displayName: String {
    if name.isEmpty { return title }
    if desig.isEmpty { return name }
    return name + " (" + desig + ")"
  }

  /// Stable key used to save notes for this star.
  var noteKey: String {
    if id >= 0 { return "hyg:\(id)" }
    return "pos:" + desig + "|" + String(format: "%.5f|%.4f", ra, dec)
  }
}

// MARK: - Sky math

enum SkyMath {
  static let deg = Double.pi / 180.0

  /// Local sidereal time in degrees (0..360).
  static func localSiderealTimeDeg(date: Date, longitudeDeg: Double) -> Double {
    let jd = date.timeIntervalSince1970 / 86400.0 + 2440587.5
    var lst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + longitudeDeg
    lst = lst.truncatingRemainder(dividingBy: 360.0)
    if lst < 0 { lst += 360.0 }
    return lst
  }

  /// Unit vector of a star in the CoreMotion reference frame
  /// (x = true north, y = west, z = up).
  static func refVector(raHours: Double, decDeg: Double, latDeg: Double, lstDeg: Double) -> SIMD3<
    Double
  > {
    let h = (lstDeg - raHours * 15.0) * deg  // hour angle
    let d = decDeg * deg
    let phi = latDeg * deg
    let east = -cos(d) * sin(h)
    let north = sin(d) * cos(phi) - cos(d) * sin(phi) * cos(h)
    let up = sin(d) * sin(phi) + cos(d) * cos(phi) * cos(h)
    return SIMD3<Double>(north, -east, up)
  }

  /// Altitude and azimuth (degrees, azimuth 0 = north, 90 = east) of a reference-frame vector.
  static func altAz(_ v: SIMD3<Double>) -> (alt: Double, az: Double) {
    let north = v.x
    let east = -v.y
    let up = v.z
    let alt = asin(max(-1.0, min(1.0, up)))
    var az = atan2(east, north)
    if az < 0 { az += 2.0 * Double.pi }
    return (alt / deg, az / deg)
  }

  /// RA (hours) and Dec (degrees) for an altitude/azimuth.
  static func raDec(altDeg: Double, azDeg: Double, latDeg: Double, lstDeg: Double) -> (
    ra: Double, dec: Double
  ) {
    let alt = altDeg * deg
    let az = azDeg * deg
    let phi = latDeg * deg
    let sinDec = sin(alt) * sin(phi) + cos(alt) * cos(phi) * cos(az)
    let decR = asin(max(-1.0, min(1.0, sinDec)))
    let ha = atan2(
      -sin(az) * cos(alt),
      sin(alt) * cos(phi) - cos(alt) * sin(phi) * cos(az))
    var raDeg = lstDeg - ha / deg
    raDeg = raDeg.truncatingRemainder(dividingBy: 360.0)
    if raDeg < 0 { raDeg += 360.0 }
    return (raDeg / 15.0, decR / deg)
  }

  /// Angle between two unit vectors, degrees.
  static func angleDeg(_ a: SIMD3<Double>, _ b: SIMD3<Double>) -> Double {
    let c = max(-1.0, min(1.0, simd_dot(a, b)))
    return acos(c) / deg
  }

  /// Dot size on screen for a magnitude.
  static func dotRadius(mag: Double) -> Double {
    return max(1.2, 4.5 - 0.8 * mag)
  }
}

/// Turns reference-frame directions into screen points for the back camera
/// shown full screen with resizeAspectFill, phone held in portrait.
struct Projector {
  let qInv: simd_quatd
  let f: Double  // focal length in screen points
  let cx: Double
  let cy: Double

  /// - longAxisFOVDeg: AVCaptureDevice.activeFormat.videoFieldOfView (spans the sensor's long side,
  ///   which is the screen's vertical axis in portrait).
  /// - sensorAspect: long side / short side of the camera image (4:3 -> 1.333).
  init(
    attitude: simd_quatd, width: Double, height: Double, longAxisFOVDeg: Double,
    sensorAspect: Double
  ) {
    qInv = attitude.inverse
    cx = width / 2.0
    cy = height / 2.0
    // In portrait the image is (short x long). Aspect fill scales it until it covers the view,
    // so the displayed image height is the larger of the view height and width * aspect.
    let displayedHeight = max(height, width * sensorAspect)
    let halfFOV = longAxisFOVDeg * Double.pi / 360.0
    f = (displayedHeight / 2.0) / tan(halfFOV)
  }

  /// Screen point for a reference-frame unit vector, or nil if it is behind the camera.
  func project(_ ref: SIMD3<Double>) -> CGPoint? {
    let d = qInv.act(ref)  // device frame: x right, y up, z out of screen
    if d.z > -1e-6 { return nil }  // back camera looks along -z
    let x = cx + f * d.x / (-d.z)
    let y = cy - f * d.y / (-d.z)
    return CGPoint(x: x, y: y)
  }
}

// MARK: - SkyStar notes (data + tap picking)

/// One saved note about a star.
struct StarNote: Codable, Equatable, Sendable {
  var starName: String  // label at save time, so the list still reads well
  var text: String
  var created: Date
  var updated: Date
  var latitude: Double?  // where you were when you saved it (if known)
  var longitude: Double?
  // Ring/label color (sRGB, 0...1). Optional so notes saved before colors existed
  // still load; those show the default cyan.
  var colorR: Double? = nil
  var colorG: Double? = nil
  var colorB: Double? = nil

  /// The note's chosen color, or nil if it has none (use the default).
  var rgb: NoteRGB? {
    get {
      guard let r = colorR, let g = colorG, let b = colorB else { return nil }
      return NoteRGB(r: r, g: g, b: b)
    }
    set {
      colorR = newValue?.r
      colorG = newValue?.g
      colorB = newValue?.b
    }
  }
}

/// A plain RGB color (sRGB, each 0...1) that can be saved with a note.
struct NoteRGB: Equatable, Sendable {
  let r: Double
  let g: Double
  let b: Double

  init(r: Double, g: Double, b: Double) {
    func clamp(_ v: Double) -> Double { v.isFinite ? min(1, max(0, v)) : 0 }
    self.r = clamp(r)
    self.g = clamp(g)
    self.b = clamp(b)
  }
}

/// Turns the notes dictionary into bytes for UserDefaults and back.
enum NoteCodec {
  static func encode(_ notes: [String: StarNote]) -> Data? {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    return try? encoder.encode(notes)
  }

  static func decode(_ data: Data) -> [String: StarNote] {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return (try? decoder.decode([String: StarNote].self, from: data)) ?? [:]
  }
}

/// A star drawn on screen this frame.
struct StarMark {
  let star: SkyStar
  let point: CGPoint
  let radius: Double
  let label: String  // empty = dot only
  let hasNote: Bool
  var noteRGB: NoteRGB? = nil  // the note's color, nil = default cyan
}

enum StarPicker {
  /// Index of the mark the user meant to tap, or nil if none is within `radius` points.
  /// The closest mark wins; marks within `tieSlop` points of the closest count as a tie,
  /// and ties go to stars with a note, then named stars, then brighter stars.
  static func pick(_ marks: [StarMark], at p: CGPoint, radius: Double = 36, tieSlop: Double = 8)
    -> Int?
  {
    var dists: [(index: Int, d: Double)] = []
    for (i, m) in marks.enumerated() {
      let dx = Double(m.point.x - p.x)
      let dy = Double(m.point.y - p.y)
      let d = (dx * dx + dy * dy).squareRoot()
      if d <= radius { dists.append((i, d)) }
    }
    guard let closest = dists.map({ $0.d }).min() else { return nil }
    let ties = dists.filter { $0.d <= closest + tieSlop }
    let best = ties.min { a, b in
      let ma = marks[a.index]
      let mb = marks[b.index]
      if ma.hasNote != mb.hasNote { return ma.hasNote }
      let na = !ma.star.name.isEmpty
      let nb = !mb.star.name.isEmpty
      if na != nb { return na }
      if ma.star.mag != mb.star.mag { return ma.star.mag < mb.star.mag }
      return a.d < b.d
    }
    return best?.index
  }
}

// MARK: - Motion + location

struct NearestStar: Equatable {
  let name: String
  let mag: Double
  let distanceDeg: Double
}

@MainActor
final class SkyModel: NSObject, ObservableObject, CLLocationManagerDelegate {
  @Published var daylight = false
  @Published var starVectors: [SIMD3<Double>] = []
  private var geometryUpdated = Date.distantPast
  @Published var attitude = simd_quatd(ix: 0, iy: 0, iz: 0, r: 1)
  @Published var hasMotion = false
  @Published var hasLocation = false
  @Published var locationDenied = false
  @Published var latitude = 0.0
  @Published var longitude = 0.0
  @Published var lstDeg = 0.0
  @Published var altitude = 0.0
  @Published var azimuth = 0.0
  @Published var ra = 0.0
  @Published var dec = 0.0
  @Published var nearest: NearestStar? = nil
  @Published var needsCalibration = false
  @Published var azimuthOffsetDeg = 0.0  // manual heading nudge, + turns the reported heading east

  private let motion = CMMotionManager()
  private let locationManager = CLLocationManager()
  private var timer: AnyCancellable?

  override init() {
    super.init()
    locationManager.delegate = self
    locationManager.desiredAccuracy = kCLLocationAccuracyKilometer
  }

  func start() {
    guard timer == nil else { return }
    locationManager.requestWhenInUseAuthorization()
    locationManager.startUpdatingLocation()

    if motion.isDeviceMotionAvailable
      && CMMotionManager.availableAttitudeReferenceFrames().contains(.xTrueNorthZVertical)
    {
      motion.deviceMotionUpdateInterval = 1.0 / 60.0
      motion.showsDeviceMovementDisplay = true  // lets iOS show its own calibration prompt
      motion.startDeviceMotionUpdates(using: .xTrueNorthZVertical)
    }

    timer = Timer.publish(every: 1.0 / 60.0, on: .main, in: .common)
      .autoconnect()
      .sink { [weak self] _ in self?.tick() }
  }

  func stop() {
    timer?.cancel()
    timer = nil
    motion.stopDeviceMotionUpdates()
    locationManager.stopUpdatingLocation()
  }

  private func tick() {
    if hasLocation && Date().timeIntervalSince(geometryUpdated) >= 1 {
      geometryUpdated = Date()
      lstDeg = SkyMath.localSiderealTimeDeg(date: geometryUpdated, longitudeDeg: longitude)
      let days = geometryUpdated.timeIntervalSince1970 / 86400 + 2440587.5 - 2_451_545
      let g = (357.528 + 0.9856003 * days) * SkyMath.deg
      let lambda = (280.460 + 0.9856474 * days + 1.915 * sin(g) + 0.020 * sin(2 * g)) * SkyMath.deg
      let epsilon = (23.439 - 0.0000004 * days) * SkyMath.deg
      let ra = atan2(cos(epsilon) * sin(lambda), cos(lambda)) / SkyMath.deg / 15
      let dec = asin(sin(epsilon) * sin(lambda)) / SkyMath.deg
      daylight = SkyMath.refVector(raHours: ra, decDeg: dec, latDeg: latitude, lstDeg: lstDeg).z > 0
      starVectors = StarCatalog.stars.map {
        SkyMath.refVector(raHours: $0.ra, decDeg: $0.dec, latDeg: latitude, lstDeg: lstDeg)
      }
    }

    guard let dm = motion.deviceMotion else { return }
    let cq = dm.attitude.quaternion
    let raw = simd_quatd(ix: cq.x, iy: cq.y, iz: cq.z, r: cq.w)
    // Heading nudge: rotate about the vertical axis so azimuth increases by azimuthOffsetDeg.
    let nudge = simd_quatd(angle: -azimuthOffsetDeg * SkyMath.deg, axis: SIMD3<Double>(0, 0, 1))
    let q = nudge * raw
    attitude = q
    hasMotion = true

    let acc = dm.magneticField.accuracy
    let poor = (acc == .uncalibrated || acc == .low)
    if poor != needsCalibration { needsCalibration = poor }

    let center = q.act(SIMD3<Double>(0, 0, -1))  // back camera direction
    let aa = SkyMath.altAz(center)
    altitude = aa.alt
    azimuth = aa.az

    guard hasLocation else { return }
    let rd = SkyMath.raDec(altDeg: aa.alt, azDeg: aa.az, latDeg: latitude, lstDeg: lstDeg)
    ra = rd.ra
    dec = rd.dec

  }

  nonisolated func locationManager(
    _ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]
  ) {
    guard let l = locations.last else { return }
    let la = l.coordinate.latitude
    let lo = l.coordinate.longitude
    Task { @MainActor in
      self.latitude = la
      self.longitude = lo
      self.hasLocation = true
    }
  }

  nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    let status = manager.authorizationStatus
    let denied = (status == .denied || status == .restricted)
    Task { @MainActor in
      self.locationDenied = denied
    }
  }

  nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    // Ignore transient errors; CoreLocation keeps trying.
  }
}

// MARK: - Camera

@MainActor
final class CameraManager: ObservableObject {
  let session = AVCaptureSession()
  @Published var status: AVAuthorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)
  @Published var longAxisFOVDeg = 67.0  // replaced with the real value once the camera opens
  @Published var sensorAspect = 4.0 / 3.0

  private var configured = false
  private var shouldRun = false
  private let sessionQueue = DispatchQueue(label: "startagger.camera")

  func start() {
    shouldRun = true
    let current = AVCaptureDevice.authorizationStatus(for: .video)
    status = current
    switch current {
    case .authorized:
      configureAndRun()
    case .notDetermined:
      Task { @MainActor in
        let granted = await AVCaptureDevice.requestAccess(for: .video)
        self.status = granted ? .authorized : .denied
        if granted && self.shouldRun { self.configureAndRun() }
      }
    default:
      break
    }
  }

  func stop() {
    shouldRun = false
    let s = session
    sessionQueue.async {
      if s.isRunning { s.stopRunning() }
    }
  }

  private func configureAndRun() {
    if !configured {
      session.beginConfiguration()
      // .photo uses the full 4:3 sensor, so the field of view matches videoFieldOfView.
      if session.canSetSessionPreset(.photo) {
        session.sessionPreset = .photo
      }
      if let device = AVCaptureDevice.default(
        .builtInWideAngleCamera, for: .video, position: .back),
        let input = try? AVCaptureDeviceInput(device: device),
        session.canAddInput(input)
      {
        session.addInput(input)
        session.commitConfiguration()
        configured = true

        let format = device.activeFormat
        let fov = Double(format.videoFieldOfView)
        if fov > 1 { longAxisFOVDeg = fov }
        let dims = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
        let w = Double(dims.width)
        let h = Double(dims.height)
        if w > 0 && h > 0 {
          sensorAspect = max(w, h) / min(w, h)
        }
      } else {
        session.commitConfiguration()
        return
      }
    }
    let s = session
    sessionQueue.async {
      if !s.isRunning { s.startRunning() }  // slow call, kept off the main thread
    }
  }
}

final class PreviewUIView: UIView {
  override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }

  var previewLayer: AVCaptureVideoPreviewLayer {
    return layer as! AVCaptureVideoPreviewLayer
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    // Keep the preview upright in portrait so the overlay lines up.
    guard let connection = previewLayer.connection else { return }
    if #available(iOS 17.0, *) {
      if connection.isVideoRotationAngleSupported(90) {
        connection.videoRotationAngle = 90
      }
    } else {
      if connection.isVideoOrientationSupported {
        connection.videoOrientation = .portrait
      }
    }
  }
}

struct CameraPreview: UIViewRepresentable {
  let session: AVCaptureSession

  func makeUIView(context: Context) -> PreviewUIView {
    let view = PreviewUIView()
    view.backgroundColor = .black
    view.previewLayer.session = session
    view.previewLayer.videoGravity = .resizeAspectFill
    return view
  }

  func updateUIView(_ uiView: PreviewUIView, context: Context) {
    uiView.setNeedsLayout()
  }
}

// MARK: - Note storage

@MainActor
final class NoteStore: ObservableObject {
  @Published private(set) var notes: [String: StarNote] = [:]
  private let defaultsKey = "StarTagger.notes.v1"

  init() {
    if let data = UserDefaults.standard.data(forKey: defaultsKey) {
      notes = NoteCodec.decode(data)
    }
  }

  func note(for star: SkyStar) -> StarNote? {
    return notes[star.noteKey]
  }

  func save(
    _ text: String, for star: SkyStar, color: NoteRGB?, latitude: Double?, longitude: Double?
  ) {
    let now = Date()
    var note =
      notes[star.noteKey]
      ?? StarNote(
        starName: star.displayName, text: "",
        created: now, updated: now,
        latitude: nil, longitude: nil)
    note.starName = star.displayName
    note.text = text
    note.updated = now
    if let c = color {
      note.rgb = c
    }
    if let la = latitude, let lo = longitude {
      note.latitude = la
      note.longitude = lo
    }
    notes[star.noteKey] = note
    persist()
  }

  func delete(key: String) {
    notes[key] = nil
    persist()
  }

  private func persist() {
    if let data = NoteCodec.encode(notes) {
      UserDefaults.standard.set(data, forKey: defaultsKey)
    }
  }
}

// MARK: - Note colors

/// Default ring/label color for noted stars (and for new notes in the editor).
var defaultNoteColor: Color { return .white }

extension NoteRGB {
  /// RGB of a SwiftUI color, or nil if it can't be expressed as RGB.
  init?(_ color: Color) {
    var r: CGFloat = 0
    var g: CGFloat = 0
    var b: CGFloat = 0
    var a: CGFloat = 0
    guard UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a) else { return nil }
    self.init(r: Double(r), g: Double(g), b: Double(b))
  }

  var color: Color {
    return Color(red: r, green: g, blue: b)
  }
}

extension StarNote {
  /// The color to draw this note's star with.
  var displayColor: Color {
    return .white
  }
}

/// The star whose note editor is open (used with .sheet(item:)).
struct NoteTarget: Identifiable {
  let star: SkyStar
  var id: String { star.noteKey }
}

// MARK: - Note screens

struct NoteEditorView: View {
  let star: SkyStar
  let existing: StarNote?
  let latitude: Double?
  let longitude: Double?
  @ObservedObject var store: NoteStore
  @Environment(\.dismiss) private var dismiss
  @State private var text: String
  @State private var color: Color

  init(star: SkyStar, existing: StarNote?, latitude: Double?, longitude: Double?, store: NoteStore)
  {
    self.star = star
    self.existing = existing
    self.latitude = latitude
    self.longitude = longitude
    self.store = store
    _text = State(initialValue: existing?.text ?? "")
    _color = State(initialValue: existing?.displayColor ?? defaultNoteColor)
  }

  private var trimmed: String {
    return text.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  var body: some View {
    Form {
      Section("Star") {
        Text(star.displayName).font(.headline)
        Text(String(format: "Magnitude %.2f", star.mag))
        Text(String(format: "RA %.3f h   Dec %+.2f°", star.ra, star.dec))
          .font(.system(.body, design: .monospaced))
      }
      Section("Note") {
        TextEditor(text: $text)
          .frame(minHeight: 160)
      }
      if let n = existing {
        Section("Saved") {
          Text("Created " + n.created.formatted(date: .abbreviated, time: .shortened))
          Text("Updated " + n.updated.formatted(date: .abbreviated, time: .shortened))
          if let la = n.latitude, let lo = n.longitude {
            Text(String(format: "From %.4f, %.4f", la, lo))
          }
        }
        Section {
          Button("Delete note", role: .destructive) {
            store.delete(key: star.noteKey)
            dismiss()
          }
        }
      }
    }
    .navigationTitle(star.title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button("Cancel") { dismiss() }
      }
      ToolbarItem(placement: .confirmationAction) {
        Button("Save") {
          store.save(
            trimmed, for: star, color: NoteRGB(color),
            latitude: latitude, longitude: longitude)
          dismiss()
        }
        .disabled(trimmed.isEmpty)
      }
    }
  }
}

struct NotesListView: View {
  @ObservedObject var store: NoteStore
  let latitude: Double?
  let longitude: Double?
  @Environment(\.dismiss) private var dismiss

  private var sortedKeys: [String] {
    return store.notes.keys.sorted { a, b in
      let da = store.notes[a]?.updated ?? Date.distantPast
      let db = store.notes[b]?.updated ?? Date.distantPast
      return da > db
    }
  }

  var body: some View {
    NavigationStack {
      List {
        if store.notes.isEmpty {
          Text("No notes yet. Tap a star on the camera view to add one.")
            .foregroundColor(.secondary)
        }
        ForEach(sortedKeys, id: \.self) { key in
          if let note = store.notes[key] {
            if let star = StarCatalog.byNoteKey[key] {
              NavigationLink {
                NoteEditorView(
                  star: star, existing: note,
                  latitude: latitude, longitude: longitude,
                  store: store)
              } label: {
                NoteRow(note: note)
              }
            } else {
              NoteRow(note: note)
            }
          }
        }
        .onDelete { offsets in
          let keys = sortedKeys
          for i in offsets where i < keys.count {
            store.delete(key: keys[i])
          }
        }
      }
      .navigationTitle("SkyStar notes")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { dismiss() }
        }
      }
    }
  }
}

struct NoteRow: View {
  let note: StarNote

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(spacing: 6) {
        Circle()
          .fill(note.displayColor)
          .frame(width: 10, height: 10)
        Text(note.starName).font(.headline)
      }
      Text(note.text)
        .lineLimit(2)
        .foregroundColor(.secondary)
      Text(note.updated.formatted(date: .abbreviated, time: .shortened))
        .font(.caption)
        .foregroundColor(.secondary)
    }
  }
}
