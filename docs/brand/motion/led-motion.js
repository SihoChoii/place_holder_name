/** Dependency-free motion for an SVG group of LED circles. */
export class LedMotion {
  constructor(group, { viewport = group, onChange = () => {} } = {}) {
    this.group = group;
    this.dots = [...group.querySelectorAll('circle')];
    this.viewport = viewport;
    this.onChange = onChange;
    this.animations = [];
    this.run = 0;
    this.mode = 'assemble';
    this.active = false;
    this.userPaused = false;
    this.previewReduced = false;
    this.visible = false;
    this.preference = matchMedia('(prefers-reduced-motion: reduce)');
    this.handlePreference = () => this.reduced ? this.reset('Reduced motion: static logo') : this.notify();
    this.handleVisibility = () => this.syncPlayback();
    this.preference.addEventListener('change', this.handlePreference);
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.observer = new IntersectionObserver(entries => {
      this.visible = entries[0].isIntersecting;
      this.syncPlayback();
    }, { threshold: 0.05 });
    this.observer.observe(viewport);
    this.notify();
  }

  get reduced() { return this.previewReduced || this.preference.matches; }

  setReduced(value) {
    this.previewReduced = value;
    if (this.reduced) this.reset('Reduced motion: static logo');
    else this.notify('Ready');
  }

  setMode(mode) {
    if (!['assemble', 'scan', 'pulse'].includes(mode)) return;
    this.mode = mode;
    this.reset();
  }

  play() {
    this.reset();
    if (this.reduced) return this.notify('Reduced motion: static logo');
    if (typeof this.group.animate !== 'function') return this.notify('Static preview: animation is unavailable');
    const run = this.run;
    this.active = true;
    if (this.mode === 'pulse') {
      this.animations = [this.group.animate(
        [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }],
        { duration: 4400, iterations: Infinity, easing: 'ease-in-out' }
      )];
    } else {
      this.animations = this.dots.map(dot => {
        const x = Number(dot.getAttribute('cx'));
        const y = Number(dot.getAttribute('cy'));
        if (this.mode === 'assemble') {
          const order = Math.max(0, Math.min(1, 0.8 * (y - 30) / 196 + 0.2 * (x - 23) / 217));
          return dot.animate([{ opacity: 0.08 }, { opacity: 1 }], {
            duration: 240, delay: order * 1050, fill: 'both', easing: 'cubic-bezier(.2,.8,.2,1)'
          });
        }
        const peak = 0.18 + 0.66 * Math.max(0, Math.min(1, (x - 16) / 224));
        return dot.animate([
          { opacity: 1, offset: 0 },
          { opacity: 0.3, offset: 0.08 },
          { opacity: 0.3, offset: peak - 0.06 },
          { opacity: 1, offset: peak },
          { opacity: 0.3, offset: peak + 0.06 },
          { opacity: 0.3, offset: 0.94 },
          { opacity: 1, offset: 1 }
        ], { duration: 1800, fill: 'both', easing: 'linear' });
      });
      Promise.all(this.animations.map(animation => animation.finished)).then(() => {
        if (run === this.run) this.reset('Complete');
      }).catch(() => { /* Cancellation is an ordinary mode change or reset. */ });
    }
    this.syncPlayback();
  }

  togglePause() {
    if (!this.active) return;
    this.userPaused = !this.userPaused;
    this.syncPlayback();
  }

  syncPlayback() {
    if (!this.active) return;
    const autoPaused = document.hidden || !this.visible;
    this.animations.forEach(animation => (this.userPaused || autoPaused) ? animation.pause() : animation.play());
    this.notify(this.userPaused ? 'Paused' : autoPaused ? 'Paused outside preview' : 'Playing');
  }

  reset(message = 'Ready') {
    this.run += 1;
    this.animations.forEach(animation => animation.cancel());
    this.animations = [];
    this.active = false;
    this.userPaused = false;
    this.notify(this.reduced ? 'Reduced motion: static logo' : message);
  }

  notify(message = this.reduced ? 'Reduced motion: static logo' : 'Ready') {
    this.viewport.dataset.motionState = message;
    this.onChange({ message, active: this.active, paused: this.userPaused, reduced: this.reduced });
  }

  destroy() {
    this.reset();
    this.observer.disconnect();
    this.preference.removeEventListener('change', this.handlePreference);
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }
}
