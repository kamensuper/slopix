/** Small DOM particle bursts (sparkles, confetti) for the results screen. They clean up after themselves. */
import { el } from './dom';
import { icon } from './icons';

const CONFETTI = ['#ff6b5e', '#ffd23f', '#7ed957', '#4fc3f7', '#ff9ad5', '#ffffff'];

export function sparkleBurst(host: HTMLElement, x: number, y: number, count = 10, spread = 90): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
    const d = spread * (0.55 + Math.random() * 0.6);
    const s = el('span', 'fx-spark');
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
    s.style.setProperty('--s', `${0.5 + Math.random() * 0.8}`);
    s.style.setProperty('--r', `${Math.round(Math.random() * 180 - 90)}deg`);
    s.append(icon('sparkle'));
    s.addEventListener('animationend', () => s.remove(), { once: true });
    host.append(s);
  }
}

export function confettiBurst(host: HTMLElement, x: number, y: number, count = 26): void {
  for (let i = 0; i < count; i++) {
    const p = el('span', 'fx-confetti');
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const d = 110 + Math.random() * 190;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = CONFETTI[i % CONFETTI.length]!;
    p.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    p.style.setProperty('--dy', `${Math.sin(a) * d}px`);
    p.style.setProperty('--fall', `${180 + Math.random() * 160}px`);
    p.style.setProperty('--r', `${Math.round(Math.random() * 720 - 360)}deg`);
    p.style.animationDelay = `${Math.random() * 0.12}s`;
    p.addEventListener('animationend', () => p.remove(), { once: true });
    host.append(p);
  }
}
