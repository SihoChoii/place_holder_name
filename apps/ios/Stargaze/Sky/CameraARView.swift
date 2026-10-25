import ARKit
import RealityKit
import SwiftUI

/// Camera pass-through via ARKit world tracking. Star labels / feature alignment
/// can be added as RealityKit anchors once visual calibration lands.
struct CameraARView: UIViewRepresentable {
    let engine: SkyAlignmentEngine

    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero)
        view.automaticallyConfigureSession = false

        let config = ARWorldTrackingConfiguration()
        config.worldAlignment = .gravityAndHeading
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.personSegmentationWithDepth) {
            // Keep light — no people occlusion needed for sky
        }
        view.session.run(config)
        view.environment.background = .cameraFeed()
        return view
    }

    func updateUIView(_ uiView: ARView, context: Context) {}

    static func dismantleUIView(_ uiView: ARView, coordinator: ()) {
        uiView.session.pause()
    }
}
