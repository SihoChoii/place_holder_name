# Stargaze iOS

SwiftUI AR star catalog prototype app.

## Current State

`ContentView.swift` is a standalone AR star overlay prototype (~1,500 lines):
- **Local HYG star catalog** (hardcoded JSON array, same catalog as the web app)
- **CoreMotion + CoreLocation** for device orientation and position
- **Camera preview** with live star positions overlaid
- **Star identification** with tap/proximity detection
- **Local notes** (UserDefaults storage, not yet wired to `/api` backend)

**Not yet integrated:**
- Backend API calls for claims/posts/comments
- Shared account/auth flow
- Photo upload to backend

## Build Requirements

- Xcode 15+ (iOS 17.0+)
- Camera and location permissions are required

```bash
# from repo root
pnpm ios:gen
open apps/ios/Stargaze.xcodeproj
```

Requires [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`.

After changing `project.yml`, run `pnpm ios:gen` to regenerate the Xcode project.

## Permissions

The app requests:
- **Camera**: "Stargaze uses the camera to overlay star positions on your live sky view"
- **Location**: "Stargaze uses your location to accurately display stars visible from your position"

## Credits

Star data from [HYG Database v4.4](https://github.com/astronexus/HYG-Database) (CC BY-SA 4.0).
