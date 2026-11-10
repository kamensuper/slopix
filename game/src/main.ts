import '@fontsource/lilita-one';
import '@fontsource-variable/fredoka';
import './styles/base.css';
import './styles/ui.css';
import { Game } from './app/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const boot = document.getElementById('boot');
const fill = document.getElementById('boot-fill');

const game = new Game(canvas, ui);
(window as unknown as { __game: Game }).__game = game;
game
  .start((f) => {
    if (fill) fill.style.width = `${Math.round(f * 100)}%`;
  })
  .then(() => boot?.classList.add('done'))
  .catch((error: unknown) => {
    console.error(error);
    const text = document.getElementById('boot-text');
    if (text) text.textContent = 'Something went wrong while loading.';
  });
