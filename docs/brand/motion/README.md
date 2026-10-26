# StarTagger LED motion

Version 0.4 · October 25, 2026. [Open the interactive lab](../logo.html#motion).

## Studies

| Study | Behavior | Duration | Proposed placement |
| --- | --- | --- | --- |
| Power on | Dots fade from 8% to full brightness in a deterministic row-weighted order. The wordmark stays steady. | About 1.3 seconds total; 240 ms fades with up to 1050 ms stagger | One landing-page entrance, once per page visit |
| Scan line | One brightness band travels left to right; the mark returns to full brightness. | 1.8 seconds | An intentional brand interaction or a short transition |
| Quiet pulse | The symbol changes gently between 100% and 55% brightness. No individual flicker. | 4.4 seconds per cycle | Optional ambient hero treatment with a visible pause control |

Power on is the recommended website starting point. Scan line and Quiet pulse are alternatives to evaluate, not additional effects to layer on top. Do not put brand loops over the live sky or move factual star positions to support branding.

## Interaction and accessibility contract

- The lab is static until Play is pressed. Mode changes and Reset immediately restore the complete static logo.
- Finite effects finish on a complete, full-brightness logo. The wordmark never disappears or moves.
- Quiet pulse runs only after the user starts it. Pause/Resume preserves animation progress; Reset cancels it.
- The system's `prefers-reduced-motion` preference is always respected. The preview checkbox can also simulate reduced motion. Both cancel active motion, show the complete logo, and disable Play.
- Animation pauses when its specimen is outside the viewport or the document is hidden. It resumes only when visible, unless the user paused it.
- Provide one stable accessible name for the identity. Hide the animated circles from assistive technology. Announce control-level state changes, not each dot.
- Do not make an animation a loading gate. Real loading, errors, or data availability need their own honest text state.
- Use one active brand effect per region. Avoid rapid flashing, glow, blur, random flicker, or ambient animation throughout the interface.

## Implementation

[`led-motion.js`](led-motion.js) exports `LedMotion`, a dependency-free controller using the browser's Web Animations API. It expects a group containing the detailed mark's circles, in its original 256-unit coordinate system. Supply the visible preview container as `viewport` for offscreen pausing. The group may use `fill="currentColor"` for a black or white surface.

```js
import { LedMotion } from './led-motion.js';

const controller = new LedMotion(svgGroup, {
  viewport: heroElement,
  onChange({ message, active, paused, reduced }) {
    // Reflect status and control availability in the UI.
  },
});

controller.setMode('assemble'); // 'assemble' | 'scan' | 'pulse'
controller.play();
controller.togglePause();
controller.setReduced(true);   // Optional user preference or preview.
controller.reset();
// On component cleanup:
controller.destroy();
```

Set `onChange` only after its referenced UI elements exist. The constructor immediately reports its initial state. Call `destroy()` on unmount to cancel animations, disconnect the observer, and remove preference/visibility listeners.

[`lab.js`](lab.js) binds the controller to the review page's radios, buttons, reduced-motion checkbox, and inverse-color control. The initial SVG is complete and visible without JavaScript. No animation framework or project dependency was added.

The animated work is bounded: Power on and Scan line use one opacity animation per detailed star dot (194); Quiet pulse animates the group once. No ongoing JavaScript frame loop, canvas redraw, network requests, or random timer stream is used. Performance still needs checking on the actual production devices before integration.

## Website handoff

For the first integration, use the compact static LED star and live Inter name in the header, and the detailed lockup with a single Power on entrance in a marketing hero. Preserve content visibility and all current product accessibility behavior. Keep repeated/ambient animation optional. This prototype does not change the running website's header, favicon, or live sky renderer.

## Review record

Verified in the in-app browser on October 25, 2026: Power on and Scan line reach Complete; Quiet pulse plays, pauses, and resumes; reduced-motion preview cancels motion and disables Play; leaving the preview pauses the active loop; Reset and mode changes restore the static logo. The identity was inspected on black and white, at desktop width, and in 390 px / 320 px iframe viewports. SVG structure, inverse geometry, outlined-letter portability, dot counts, local links, and script syntax were checked. These checks cover this prototype, not production-device performance or a shipped-app integration.
