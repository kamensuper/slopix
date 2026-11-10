/** Keyboard helpers: spatial arrow-key navigation between controls and Tab focus trapping. */

const SELECTOR = 'button:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(SELECTOR)).filter((n) => !n.closest('[inert]') && n.getClientRects().length > 0);
}

const isRange = (n: Element | null): boolean => n instanceof HTMLInputElement && n.type === 'range';

/** Moves focus to the nearest control in the arrow direction. Returns true if the key was consumed. */
export function arrowNav(e: KeyboardEvent, root: HTMLElement): boolean {
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!dir) return false;
  const items = focusables(root);
  if (items.length === 0) return false;
  const current = items.find((n) => n === document.activeElement);
  if (!current) {
    items[0]?.focus();
    return true;
  }
  // Sliders keep left / right for changing their value.
  if (isRange(current) && dir[0] !== 0) return false;
  const from = current.getBoundingClientRect();
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const item of items) {
    if (item === current) continue;
    const r = item.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    const along = dir[0] !== 0 ? dx * dir[0]! : dy * dir[1]!;
    const across = dir[0] !== 0 ? Math.abs(dy) : Math.abs(dx);
    if (along < 4) continue;
    const score = along + across * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  if (!best) return false;
  best.focus();
  return true;
}

/** Keeps Tab / Shift+Tab inside `root`. */
export function trapTab(e: KeyboardEvent, root: HTMLElement): boolean {
  if (e.key !== 'Tab') return false;
  const items = focusables(root);
  if (items.length === 0) return false;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;
  if (!root.contains(active)) {
    first.focus();
    return true;
  }
  if (e.shiftKey && active === first) {
    last.focus();
    return true;
  }
  if (!e.shiftKey && active === last) {
    first.focus();
    return true;
  }
  return false;
}
