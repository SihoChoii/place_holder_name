import Combine
import CoreLocation
import CoreMotion
import Foundation

struct AlignedStar: Identifiable {
    let id: String
    let name: String
    let magnitude: Double?
    let altitudeDegrees: Double
    let azimuthDegrees: Double
}

/// Combines GPS + device attitude + time to estimate alt/az for catalog stars.
/// Feature (visual) alignment can refine this later with ARKit world tracking.
@MainActor
final class SkyAlignmentEngine: NSObject, ObservableObject {
    @Published var latitude: Double?
    @Published var longitude: Double?
    @Published var altitudeDegrees: Double = 0
    @Published var azimuthDegrees: Double = 0
    @Published var hasLocation = false
    @Published var hasAttitude = false
    @Published var visibleStars: [AlignedStar] = []
    @Published var formattedTime: String = "--:--"

    private let locationManager = CLLocationManager()
    private let motionManager = CMMotionManager()
    private var timer: AnyCancellable?
    private let catalog: [CatalogStar] = CatalogStar.brightSample

    func start() {
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.requestWhenInUseAuthorization()
        locationManager.startUpdatingLocation()
        locationManager.startUpdatingHeading()

        if motionManager.isDeviceMotionAvailable {
            motionManager.deviceMotionUpdateInterval = 1.0 / 30.0
            motionManager.startDeviceMotionUpdates(using: .xMagneticNorthZVertical, to: .main) { [weak self] motion, _ in
                guard let self, let motion else { return }
                self.hasAttitude = true
                // Attitude: pitch ~ altitude proxy when phone is held up; yaw ~ azimuth
                let pitch = motion.attitude.pitch * 180 / .pi
                let yaw = motion.attitude.yaw * 180 / .pi
                self.altitudeDegrees = pitch
                self.azimuthDegrees = (yaw + 360).truncatingRemainder(dividingBy: 360)
                self.recomputeVisibleStars()
            }
        }

        timer = Timer.publish(every: 1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] date in
                let formatter = DateFormatter()
                formatter.dateFormat = "HH:mm:ss"
                self?.formattedTime = formatter.string(from: date)
                self?.recomputeVisibleStars()
            }
    }

    func stop() {
        locationManager.stopUpdatingLocation()
        locationManager.stopUpdatingHeading()
        motionManager.stopDeviceMotionUpdates()
        timer?.cancel()
    }

    private func recomputeVisibleStars() {
        guard let lat = latitude else {
            visibleStars = []
            return
        }

        let lstHours = localSiderealTimeHours(longitude: longitude ?? 0, date: Date())
        visibleStars = catalog.compactMap { star in
            let (alt, az) = equatorialToHorizontal(
                raHours: star.raHours,
                decDegrees: star.decDegrees,
                latitudeDegrees: lat,
                lstHours: lstHours
            )
            guard alt > 5 else { return nil }
            return AlignedStar(
                id: star.id,
                name: star.name,
                magnitude: star.magnitude,
                altitudeDegrees: alt,
                azimuthDegrees: az
            )
        }
        .sorted { ($0.magnitude ?? 99) < ($1.magnitude ?? 99) }
    }
}

extension SkyAlignmentEngine: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in
            self.latitude = location.coordinate.latitude
            self.longitude = location.coordinate.longitude
            self.hasLocation = true
            self.recomputeVisibleStars()
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        // Prefer compass heading when motion attitude is weak
        Task { @MainActor in
            if !self.hasAttitude, newHeading.trueHeading >= 0 {
                self.azimuthDegrees = newHeading.trueHeading
            }
        }
    }
}

// MARK: - Astrometry helpers

struct CatalogStar {
    let id: String
    let name: String
    let raHours: Double
    let decDegrees: Double
    let magnitude: Double?

    static let brightSample: [CatalogStar] = [
        .init(id: "sirius", name: "Sirius", raHours: 6.7525, decDegrees: -16.7161, magnitude: -1.46),
        .init(id: "vega", name: "Vega", raHours: 18.6156, decDegrees: 38.7837, magnitude: 0.03),
        .init(id: "arcturus", name: "Arcturus", raHours: 14.261, decDegrees: 19.1824, magnitude: -0.05),
        .init(id: "betelgeuse", name: "Betelgeuse", raHours: 5.9195, decDegrees: 7.4071, magnitude: 0.42),
        .init(id: "rigel", name: "Rigel", raHours: 5.2423, decDegrees: -8.2016, magnitude: 0.13),
        .init(id: "capella", name: "Capella", raHours: 5.2782, decDegrees: 45.998, magnitude: 0.08),
        .init(id: "altair", name: "Altair", raHours: 19.8464, decDegrees: 8.8683, magnitude: 0.76),
        .init(id: "aldebaran", name: "Aldebaran", raHours: 4.5987, decDegrees: 16.5093, magnitude: 0.85),
    ]
}

func localSiderealTimeHours(longitude: Double, date: Date) -> Double {
    let jd = julianDate(from: date)
    let t = (jd - 2451545.0) / 36525.0
    var gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t
    gmst = gmst.truncatingRemainder(dividingBy: 360)
    if gmst < 0 { gmst += 360 }
    var lst = gmst + longitude
    lst = lst.truncatingRemainder(dividingBy: 360)
    if lst < 0 { lst += 360 }
    return lst / 15.0
}

func julianDate(from date: Date) -> Double {
    date.timeIntervalSince1970 / 86400.0 + 2440587.5
}

func equatorialToHorizontal(
    raHours: Double,
    decDegrees: Double,
    latitudeDegrees: Double,
    lstHours: Double
) -> (alt: Double, az: Double) {
    let ha = (lstHours - raHours) * 15.0 * .pi / 180
    let dec = decDegrees * .pi / 180
    let lat = latitudeDegrees * .pi / 180

    let sinAlt = sin(dec) * sin(lat) + cos(dec) * cos(lat) * cos(ha)
    let alt = asin(min(1, max(-1, sinAlt)))

    let cosAz = (sin(dec) - sin(alt) * sin(lat)) / (cos(alt) * cos(lat))
    var az = acos(min(1, max(-1, cosAz)))
    if sin(ha) > 0 {
        az = 2 * .pi - az
    }

    return (alt * 180 / .pi, az * 180 / .pi)
}
