import type { MinigameContext } from './types';

/** Big centred hit/miss flash over the stage; auto-removes. */
export function flash(ctx: MinigameContext, text: string, color: string): void {
  const el = document.createElement('div');
  el.className = 'mg-flash';
  el.textContent = text;
  el.style.cssText = 'position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);pointer-events:none;' +
    `font:900 clamp(36px,9vw,72px)/1 system-ui,sans-serif;color:${color};text-shadow:0 3px 10px #000,0 0 2px #000,0 0 2px #000;` +
    'animation:mg-flash .55s ease-out forwards';
  ctx.overlay.appendChild(el);
  setTimeout(() => el.remove(), 600);
}

/** Landscape panels sit at top:0, under the minigame header. Push them below it. */
export function clearHeader(root: HTMLElement): void {
  if (root.style.top !== '0px') return;
  const chrome = document.getElementById('mg-chrome');
  if (chrome) root.style.top = `${chrome.offsetHeight}px`;
}

/** Doneness ratio (elapsed/perfectAt) -> zone label + colour. */
export function zone(d: number): { label: string; color: string } {
  return d < 0.6 ? { label: 'RAW', color: '#c9c9c9' }
    : d < 0.85 ? { label: 'ALMOST', color: '#e0a86b' }
    : d < 1.15 ? { label: 'PERFECT - PULL!', color: '#2ecc71' }
    : d < 1.8 ? { label: 'OVER - PULL NOW', color: '#ff8c42' }
    : { label: 'BURNT', color: '#ff3b30' };
}

if (!document.getElementById('mg-flash-kf')) {
  const s = document.createElement('style');
  s.id = 'mg-flash-kf';
  s.textContent = '@keyframes mg-flash{0%{opacity:0;transform:translate(-50%,-50%) scale(.6)}20%{opacity:1;transform:translate(-50%,-50%) scale(1.15)}100%{opacity:0;transform:translate(-50%,-70%) scale(1)}}';
  document.head.appendChild(s);
}
