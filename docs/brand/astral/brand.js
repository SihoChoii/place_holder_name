import { AstralIntro } from './motion/intro.js';
const inverse = document.querySelector('#inverse');
const hero = document.querySelector('.hero');
inverse.addEventListener('click', () => {
  const light = hero.classList.toggle('light');
  inverse.setAttribute('aria-pressed', String(light));
  inverse.textContent = light ? 'Preview on black' : 'Preview on white';
});
const question = document.querySelector('#question');
const note = document.querySelector('#composer-note');
for (const button of document.querySelectorAll('[data-question]')) {
  button.addEventListener('click', () => {
    question.value = button.dataset.question;
    note.textContent = 'Question selected. Preview only; nothing is sent.';
    question.focus({preventScroll: true});
  });
}
document.querySelector('#clear-question').addEventListener('click', () => {
  question.value = '';
  note.textContent = 'Preview only. Questions stay on this page.';
  question.focus({preventScroll: true});
});

const intro = new AstralIntro(document.querySelector('#hero-intro'));
document.querySelector('#replay-hero').addEventListener('click', () => intro.play());
window.addEventListener('pagehide', event => { if (!event.persisted) intro.destroy(); });
intro.play();
