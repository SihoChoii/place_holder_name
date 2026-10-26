/** A single, interruptible entrance for the supplied Astral Harness SVG geometry. */
export const INTRO_DURATION = 1400;
const ease = 'cubic-bezier(.22,1,.36,1)';
const tracks = [
  ['[data-intro-frame]', [
    { opacity: 0, strokeDashoffset: '148', offset: 0 },
    { opacity: 1, strokeDashoffset: '148', offset: .05, easing: ease },
    { opacity: 1, strokeDashoffset: '0', offset: .5 },
    { opacity: 1, strokeDashoffset: '0', offset: 1 }
  ]],
  ['[data-intro-star]', [
    { opacity: 0, transform: 'scale(.84)', offset: 0 },
    { opacity: 0, transform: 'scale(.84)', offset: .13, easing: ease },
    { opacity: 1, transform: 'scale(1)', offset: .65 },
    { opacity: 1, transform: 'scale(1)', offset: 1 }
  ]],
  ['[data-intro-name]', [
    { opacity: 0, transform: 'translateY(6px)', offset: 0 },
    { opacity: 0, transform: 'translateY(6px)', offset: .36, easing: ease },
    { opacity: 1, transform: 'translateY(0)', offset: 1 }
  ]]
];

export class AstralIntro {
  constructor(root, { viewport = root, onChange = () => {}, onTick = () => {} } = {}) {
    this.root = root;
    this.viewport = viewport;
    this.onChange = onChange;
    this.onTick = onTick;
    this.animations = [];
    this.active = false;
    this.paused = false;
    this.visible = true;
    this.previewReduced = false;
    this.time = INTRO_DURATION;
    this.run = 0;
    this.raf = 0;
    this.preference = matchMedia('(prefers-reduced-motion: reduce)');
    this.preferenceChanged = () => this.reduced ? this.finish('Reduced motion · static logo') : this.notify();
    this.visibilityChanged = () => this.sync();
    this.preference.addEventListener('change', this.preferenceChanged);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.sync();
    }, { threshold: .1 });
    this.observer.observe(viewport);
    this.notify();
  }

  get reduced() { return this.previewReduced || this.preference.matches; }

  build() {
    this.cancel();
    const run = this.run;
    for (const [selector, keyframes] of tracks) {
      for (const element of this.root.querySelectorAll(selector)) {
        const animation = element.animate(keyframes, { duration: INTRO_DURATION, fill: 'both' });
        animation.pause();
        animation.currentTime = 0;
        this.animations.push(animation);
      }
    }
    Promise.all(this.animations.map(animation => animation.finished)).then(() => {
      if (run === this.run) this.finish('Complete');
    }).catch(() => { /* A replay, scrub, or preference change cancels the old run. */ });
  }

  play() {
    if (this.reduced) return this.finish('Reduced motion · static logo');
    if (typeof this.root.animate !== 'function') return this.finish('Static logo');
    this.build();
    this.time = 0;
    this.active = true;
    this.paused = false;
    this.sync();
  }

  togglePause() {
    if (!this.active || this.reduced) return;
    this.paused = !this.paused;
    this.sync();
  }

  seek(time) {
    if (this.reduced) return;
    this.time = Math.max(0, Math.min(INTRO_DURATION, Number(time) || 0));
    if (this.time === INTRO_DURATION) return this.finish('Complete');
    if (!this.animations.length) this.build();
    this.active = true;
    this.paused = true;
    this.animations.forEach(animation => {
      animation.pause();
      animation.currentTime = this.time;
    });
    this.sync();
  }

  setReduced(value) {
    this.previewReduced = Boolean(value);
    if (this.reduced) this.finish('Reduced motion · static logo');
    else this.notify();
  }

  sync() {
    if (!this.active) return;
    cancelAnimationFrame(this.raf);
    const autoPaused = !this.visible || document.hidden;
    this.animations.forEach(animation => this.paused || autoPaused ? animation.pause() : animation.play());
    if (!this.paused && !autoPaused) this.tick();
    this.notify(this.paused ? 'Paused' : autoPaused ? 'Paused outside preview' : 'Playing');
  }

  tick() {
    this.time = Math.min(INTRO_DURATION, Number(this.animations[0]?.currentTime) || 0);
    this.onTick(this.time);
    this.raf = requestAnimationFrame(() => this.tick());
  }

  finish(message = 'Complete') {
    this.cancel();
    this.active = false;
    this.paused = false;
    this.time = INTRO_DURATION;
    this.notify(this.reduced ? 'Reduced motion · static logo' : message);
  }

  cancel() {
    this.run += 1;
    cancelAnimationFrame(this.raf);
    this.animations.forEach(animation => animation.cancel());
    this.animations = [];
  }

  notify(message = this.reduced ? 'Reduced motion · static logo' : 'Complete') {
    this.viewport.dataset.motionState = message;
    this.onTick(this.time);
    this.onChange({ message, active: this.active, paused: this.paused, reduced: this.reduced });
  }

  destroy() {
    this.cancel();
    this.observer.disconnect();
    this.preference.removeEventListener('change', this.preferenceChanged);
    document.removeEventListener('visibilitychange', this.visibilityChanged);
  }
}
