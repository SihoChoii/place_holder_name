import SwiftUI

struct SkyView: View {
    @StateObject private var alignment = SkyAlignmentEngine()
    @State private var showLabels = true

    var body: some View {
        ZStack {
            CameraARView(engine: alignment)
                .ignoresSafeArea()

            VStack {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Sky", systemImage: "sparkles")
                            .font(.title2.bold())
                        Text(statusLine)
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.75))
                    }
                    Spacer()
                    Toggle(isOn: $showLabels) {
                        Image(systemName: "tag")
                    }
                    .toggleStyle(.button)
                    .tint(.white)
                }
                .padding()
                .background(.ultraThinMaterial.opacity(0.85))

                Spacer()

                if showLabels {
                    StarOverlay(stars: alignment.visibleStars)
                }

                sensorStrip
            }
        }
        .onAppear { alignment.start() }
        .onDisappear { alignment.stop() }
    }

    private var statusLine: String {
        let loc = alignment.hasLocation ? "GPS ✓" : "GPS…"
        let mot = alignment.hasAttitude ? "Gyro ✓" : "Gyro…"
        return "\(loc)  ·  \(mot)  ·  \(alignment.formattedTime)"
    }

    private var sensorStrip: some View {
        HStack(spacing: 16) {
            metric("Alt", String(format: "%.0f°", alignment.altitudeDegrees))
            metric("Az", String(format: "%.0f°", alignment.azimuthDegrees))
            metric("Lat", alignment.latitude.map { String(format: "%.2f", $0) } ?? "—")
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(.black.opacity(0.45))
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(label.uppercased())
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.55))
            Text(value)
                .font(.headline.monospacedDigit())
        }
        .frame(maxWidth: .infinity)
    }
}

private struct StarOverlay: View {
    let stars: [AlignedStar]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(stars.prefix(5)) { star in
                HStack {
                    Circle()
                        .fill(.white)
                        .frame(width: max(3, 10 - (star.magnitude ?? 2) * 2), height: max(3, 10 - (star.magnitude ?? 2) * 2))
                    Text(star.name)
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(String(format: "az %.0f°", star.azimuthDegrees))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.white.opacity(0.7))
                }
            }
        }
        .padding()
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding()
    }
}
