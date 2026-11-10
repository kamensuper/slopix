/** Tiny DOM helpers shared by the UI modules. */
export type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', children: Child[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const child of children) if (child) node.append(child);
  return node;
}

/** Parses an SVG / HTML snippet into a node. Only ever called with trusted, hard-coded markup. */
export function fromHtml(markup: string): Element {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as Element;
}

export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

export const prefersReducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
