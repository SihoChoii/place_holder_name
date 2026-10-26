import { LedMotion } from './led-motion.js';

const play = document.getElementById('play');
const pause = document.getElementById('pause');
const reset = document.getElementById('reset');
const status = document.getElementById('motion-status');
const description = document.getElementById('motion-description');
const reduce = document.getElementById('reduce');
const stage = document.getElementById('motion-stage');
const descriptions = {
  assemble: 'Power on · approximately 1.3 seconds. Rows of dots assemble once; the wordmark stays still.',
  scan: 'Scan line · 1.8 seconds. A single brightness sweep crosses the star, then returns to a steady logo.',
  pulse: 'Quiet pulse · 4.4 seconds per cycle. A gentle whole-symbol change in brightness. Loops until paused or reset.'
};

const controller = new LedMotion(document.getElementById('motion-dots'), {
  viewport: stage,
  onChange({ message, active, paused, reduced }) {
    status.textContent = message;
    play.disabled = reduced;
    play.textContent = active ? 'Replay' : 'Play animation';
    pause.disabled = !active;
    pause.textContent = paused ? 'Resume' : 'Pause';
  }
});

document.querySelectorAll('input[name="motion"]').forEach(radio => radio.addEventListener('change', () => {
  if (!radio.checked) return;
  controller.setMode(radio.value);
  description.textContent = descriptions[radio.value];
}));
play.addEventListener('click', () => controller.play());
pause.addEventListener('click', () => controller.togglePause());
reset.addEventListener('click', () => controller.reset());
reduce.addEventListener('change', () => controller.setReduced(reduce.checked));

const inverse = document.getElementById('inverse');
const plate = document.getElementById('primary-lockup');
inverse.addEventListener('click', () => {
  const light = plate.classList.toggle('light');
  plate.querySelectorAll('img').forEach(img => { img.src = 'logos/led/' + img.dataset.asset + (light ? '' : '-white') + '.svg'; });
  const download = plate.querySelector('a[download]');
  download.href = 'logos/led/startagger-lockup' + (light ? '' : '-white') + '.svg';
  download.textContent = light ? 'Download black SVG' : 'Download white SVG';
  inverse.setAttribute('aria-pressed', String(light));
  inverse.textContent = light ? 'Preview on black' : 'Preview on white';
});

document.addEventListener('visibilitychange', () => { if (document.hidden) status.setAttribute('aria-live', 'off'); else status.setAttribute('aria-live', 'polite'); });
