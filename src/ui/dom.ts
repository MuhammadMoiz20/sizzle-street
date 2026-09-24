/** Tiny DOM builder: h('button.primary#go', { 'aria-label': 'Go' }, 'Go') */
export function h(
  spec: string,
  attrs: Record<string, string | ((e: Event) => void)> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElement {
  const [tag, ...rest] = spec.split(/(?=[.#])/);
  const el = document.createElement(tag);
  for (const r of rest) r[0] === '.' ? el.classList.add(r.slice(1)) : (el.id = r.slice(1));
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v);
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

export const money = (n: number): string => `$${Math.round(n)}`;
export const clock = (s: number): string => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
