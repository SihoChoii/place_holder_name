import { AstralIntro, INTRO_DURATION } from './intro.js';
const stage = document.querySelector('#motion-stage');
const artwork = document.querySelector('#motion-artwork');
const replay = document.querySelector('#replay');
const pause = document.querySelector('#pause');
const final = document.querySelector('#final');
const reduced = document.querySelector('#reduce-motion');
const inverse = document.querySelector('#motion-inverse');
const status = document.querySelector('#motion-status');
const time = document.querySelector('#motion-time');
const timeline = document.querySelector('#timeline');
const intro = new AstralIntro(artwork, {
  viewport: stage,
  onChange: state => {
    status.textContent = state.message;
    pause.textContent = state.paused ? 'Resume' : 'Pause';
    pause.disabled = !state.active || state.reduced;
    replay.disabled = state.reduced;
    timeline.disabled = state.reduced;
    timeline.setAttribute('aria-valuetext', `${(Number(timeline.value) / 1000).toFixed(2)} seconds`);
  },
  onTick: milliseconds => {
    timeline.value = Math.round(milliseconds);
    time.textContent = `${(milliseconds / 1000).toFixed(2)} / ${(INTRO_DURATION / 1000).toFixed(2)} s`;
  }
});
replay.addEventListener('click', () => intro.play());
pause.addEventListener('click', () => intro.togglePause());
final.addEventListener('click', () => intro.finish());
reduced.addEventListener('change', () => intro.setReduced(reduced.checked));
timeline.addEventListener('input', () => intro.seek(timeline.value));
inverse.addEventListener('click', () => {
  const light = stage.classList.toggle('light');
  inverse.textContent = light ? 'Preview on black' : 'Preview on white';
  inverse.setAttribute('aria-pressed', String(light));
});
window.addEventListener('pagehide', event => { if (!event.persisted) intro.destroy(); });
intro.play();
