# Astral Harness loading entrance

**Motion v0.1 · October 25, 2026**

[Play the preview](../loading.html). The [feature brand guide](../index.html) also plays the entrance once in its hero.

The working motion name is **Focus in**. The two corners trace into place, the star gains definition through a small expansion and opacity change, and the name appears with a 6-source-unit rise. The final geometry is the existing precise logo.

## Timing

One 1,400 ms entrance; no repetition, rotation, blur, glow, overshoot, or layout movement.

| Component | Timing | Treatment |
| --- | --- | --- |
| Frame visibility | 0–70 ms | Opacity 0 → 1 while the paths remain undrawn |
| Frame trace | 70–700 ms | Two 148-unit centerlines reveal simultaneously; 12-unit square-ended strokes reproduce the solid frame |
| Star | 182–910 ms | Opacity 0 → 1; scale 0.84 → 1 around its own center |
| Wordmark | 504–1,400 ms | Opacity 0 → 1; vertical translation 6 → 0 source units |
| Final | After 1,400 ms | Hold the complete, static identity |

The reveal segments use `cubic-bezier(.22,1,.36,1)`. Their overlap creates a continuous arrival. Keep the lockup in its final layout throughout; no movement of surrounding content is required.

## Use

Use once when the feature opens or when its introduction is first displayed. This is a brand entrance, not a measurement of backend progress. Do not delay usable content for it, replay it on every answer, or assign successful completion to the end of the animation. Actual loading, error, and ready states belong to the application.

The app's StarTagger LED identity keeps its own motion language. This feature motion preserves the solid Astral Harness mark.

## Browser module

`intro.js` exports the dependency-free `AstralIntro` controller and `INTRO_DURATION`. It uses the browser Web Animations API. The supplied `intro.css` establishes the exact stroke geometry, transform origins, and complete static appearance before JavaScript runs.

The controller expects supplied inline SVG groups marked `data-intro-frame`, `data-intro-star`, and `data-intro-name`. The preview and brand-guide HTML contain ready-to-use examples with outlined lettering.

```js
import { AstralIntro } from './motion/intro.js';

const intro = new AstralIntro(document.querySelector('#hero-intro'));
intro.play();

// Optional controls:
intro.togglePause();
intro.seek(700);       // Pauses at 700 ms; togglePause() resumes.
intro.finish();        // Shows the final static logo immediately.
intro.setReduced(true);

// On component unmount:
intro.destroy();
```

Optional constructor arguments: `viewport`, `onChange(state)`, and `onTick(milliseconds)`. State reports `message`, `active`, `paused`, and `reduced`. The preview's `page.js` demonstrates controls and a timeline without coupling the animation to application readiness.

The module cancels an earlier run before replay. It pauses when the observed area is outside the viewport or the document is hidden, resumes when visible, and preserves a deliberate user pause. It removes its observers/listeners on `destroy()`. The supplied pages preserve their controllers across browser back/forward-cache visits.

Reduced-motion preference changes cancel an active run and reveal the complete identity immediately. The preview checkbox can additionally request reduced motion; it cannot override a system preference for reduction. Static artwork is also the no-JavaScript fallback.

## Animated SVG exports

These files contain vector paths, CSS keyframes, and outlined lettering. They have transparent backgrounds and play once when loaded in a browser that supports SVG CSS animation. No JavaScript or font download is required.

| Arrangement | Black | White |
| --- | --- | --- |
| Horizontal | [Animated SVG](astral-harness-intro.svg) | [Animated SVG](astral-harness-intro-white.svg) |
| Stacked | [Animated SVG](astral-harness-intro-stacked.svg) | [Animated SVG](astral-harness-intro-stacked-white.svg) |

Use white on a black canvas and black on a white canvas. The CSS explicitly leaves the logo static under `prefers-reduced-motion: reduce`; non-animating SVG viewers see the final mark. For controlled playback, replay, or pausing, use the inline SVG and JavaScript controller. Standalone SVG image animation does not expose those controls to its embedding page and does not include the module’s visibility lifecycle.

The original [static SVG library](../README.md#asset-library) remains the preferred export for print, documents, and non-animated interface uses.

## Review record

The preview was reviewed at desktop width and in a 390 px iframe; the animated brand hero was also checked at 320 px. Replay, pause, 400 ms scrubbing, final completion, background inversion, and the reduced-motion preview were exercised. SVG XML, black/white parity, vector-only contents, unique inline IDs, local links, and JavaScript syntax were checked. System reduced-motion handling is implemented in both delivery formats; no operating-system settings were changed for this review.
