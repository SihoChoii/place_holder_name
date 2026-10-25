# Stargaze iOS

SwiftUI + ARKit sky viewer with GPS / gyroscope / time alignment.

## Generate & open

```bash
# from repo root
brew install xcodegen   # once
cd apps/ios
xcodegen generate
open Stargaze.xcodeproj
```

1. Select your Team under Signing & Capabilities.
2. Run on a **physical iPhone** (ARKit + camera + true heading).
3. If the API runs on your Mac, set `APIClient.baseURL` in `Networking/APIClient.swift` to `http://<your-mac-lan-ip>:4000`.

## Features scaffolded

- Camera pass-through (`ARView` world tracking)
- Location + device motion + local sidereal time → horizontal coordinates
- Bright-star overlay list (alt/az)
- Account login / register against the monorepo API
- Post text media + emoji reactions on stars
