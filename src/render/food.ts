import * as THREE from 'three';
import type { IngredientId } from '../game/types';
import type { Effects, FoodFactory, FoodItem } from './api';

export const isMobile =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 700);

type Tick = (dt: number) => void;

// ---------- procedural textures + shared material cache ----------

function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

type Draw = (g: CanvasRenderingContext2D, s: number, bump: boolean) => void;

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = 1, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.center.set(0.5, 0.5);
  t.anisotropy = 4;
  return t;
}

const texCache = new Map<string, THREE.Texture>();
function tex(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = texCache.get(key);
  if (!t) texCache.set(key, (t = make()));
  return t;
}
/** Color map + grayscale bump map drawn by the same routine (bump=true → draw height as gray). */
function pair(key: string, size: number, draw: Draw, repeat = 1) {
  return {
    map: tex(key, () => canvasTex(size, (g, s) => draw(g, s, false), repeat)),
    bumpMap: tex(key + '_b', () => canvasTex(size, (g, s) => draw(g, s, true), repeat, false)),
  };
}

// small drawing helpers
const rgba = (r: number, g: number, b: number, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
function dots(g: CanvasRenderingContext2D, s: number, n: number, seed: number, r: (i: number) => number, style: (i: number) => string, squash = 1) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = style(i);
    g.beginPath();
    g.ellipse(hash(seed + i) * s, hash(seed + i + 0.5) * s, r(i), r(i) * squash, hash(seed + i + 0.25) * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
}
const gray = (v: number) => rgba(v, v, v);

export const textures = {
  wood: () => tex('wood', () => canvasTex(256, (g, s) => {
    g.fillStyle = '#9a6a3c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      const y = hash(i) * s;
      g.strokeStyle = `rgba(${60 + hash(i + 3) * 40},${35 + hash(i + 5) * 20},15,${0.15 + hash(i + 7) * 0.3})`;
      g.lineWidth = 1 + hash(i + 9) * 2;
      g.beginPath();
      for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 4);
      g.stroke();
    }
  })),
  tile: () => tex('tile', () => canvasTex(256, (g, s) => {
    g.fillStyle = '#6b5a48'; g.fillRect(0, 0, s, s);
    const n = 4, w = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 200 + hash(i * 7 + j) * 30;
      g.fillStyle = `rgb(${v},${v - 12},${v - 30})`;
      g.fillRect(i * w + 3, j * w + 3, w - 6, w - 6);
    }
  }, 6)),
  iron: () => tex('iron', () => canvasTex(128, (g, s) => {
    g.fillStyle = '#2a2826'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1500; i++) {
      const v = 25 + hash(i) * 40;
      g.fillStyle = `rgb(${v},${v},${v - 4})`;
      g.fillRect(hash(i + 1) * s, hash(i + 2) * s, 2, 2);
    }
  }, 2)),
  steel: () => tex('steel', () => canvasTex(128, (g, s) => {
    g.fillStyle = '#b8bcc0'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 200; i++) {
      g.fillStyle = `rgba(255,255,255,${hash(i) * 0.25})`;
      g.fillRect(0, hash(i + 1) * s, s, 1);
    }
  })),
  /** Soft gaussian-ish sprite for particles and blob shadows. */
  sprite: () => tex('sprite', () => canvasTex(64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.3, 'rgba(255,255,255,0.55)');
    r.addColorStop(0.7, 'rgba(255,255,255,0.12)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  })),
  /** Grayscale value noise used by the cook shader for blotchy browning + char specks. */
  noise: () => tex('noise', () => canvasTex(128, (g, s) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
    dots(g, s, 700, 900, (i) => 2 + hash(i + 1) * 7, (i) => gray(60 + hash(i + 2) * 140));
    dots(g, s, 1500, 1800, () => 1.2, (i) => gray(hash(i + 3) * 255));
  }, 1, false)),

  // ---- produce ----
  potato: () => pair('potato', 256, (g, s, b) => {
    g.fillStyle = b ? '#888' : '#b48d5c'; g.fillRect(0, 0, s, s);
    dots(g, s, 900, 10, (i) => 1 + hash(i + 1) * 2.5, (i) => b ? gray(110 + hash(i + 2) * 60) : rgba(120 + hash(i + 2) * 60, 85 + hash(i + 3) * 40, 40, 0.5));
    dots(g, s, 260, 30, (i) => 3 + hash(i + 1) * 6, (i) => b ? gray(120 + hash(i + 2) * 40) : rgba(196, 160, 110, 0.25 + hash(i + 2) * 0.25));
    // eyes: dark dimples with a brighter rim
    for (let i = 0; i < 9; i++) {
      const x = hash(50 + i) * s, y = hash(60 + i) * s, r = 4 + hash(70 + i) * 4;
      g.fillStyle = b ? '#3a3a3a' : rgba(70, 45, 25, 0.9);
      g.beginPath(); g.ellipse(x, y, r, r * 0.6, hash(80 + i) * 3, 0, Math.PI * 2); g.fill();
      if (!b) { g.strokeStyle = rgba(200, 165, 120, 0.5); g.lineWidth = 1.5; g.stroke(); }
    }
  }),
  onion: () => pair('onion', 256, (g, s, b) => {
    g.fillStyle = b ? '#909090' : '#d9ab62'; g.fillRect(0, 0, s, s);
    // papery meridian streaks (u = around the bulb)
    for (let i = 0; i < 120; i++) {
      const x = hash(i + 100) * s, w = 1 + hash(i + 101) * 4;
      g.fillStyle = b ? gray(120 + hash(i + 102) * 70) : rgba(255, 220, 150, 0.12 + hash(i + 103) * 0.22);
      g.fillRect(x, 0, w, s);
      g.fillStyle = b ? gray(70 + hash(i + 104) * 50) : rgba(150, 95, 35, 0.14 + hash(i + 105) * 0.2);
      g.fillRect(x + w, 0, 1, s);
    }
    // faint layer rings
    for (let y = 0; y < s; y += 10) { g.fillStyle = b ? gray(110) : rgba(120, 75, 25, 0.12); g.fillRect(0, y, s, 1); }
    // translucent sheen patches
    if (!b) dots(g, s, 30, 300, (i) => 12 + hash(i + 1) * 24, () => rgba(255, 240, 200, 0.14), 2.5);
  }),
  tomato: () => pair('tomato', 256, (g, s, b) => {
    g.fillStyle = b ? '#808080' : '#d5301c'; g.fillRect(0, 0, s, s);
    dots(g, s, 60, 400, (i) => 14 + hash(i + 1) * 30, (i) => b ? gray(120 + hash(i + 2) * 20) : rgba(230, 100 + hash(i + 2) * 40, 30, 0.13), 1.6);
    dots(g, s, 60, 500, (i) => 10 + hash(i + 1) * 30, (i) => b ? gray(115 + hash(i + 2) * 20) : rgba(150, 25, 20, 0.16), 1.6);
    if (!b) dots(g, s, 400, 600, () => 1, () => rgba(255, 200, 160, 0.12));
  }),
  carrot: () => pair('carrot', 256, (g, s, b) => {
    g.fillStyle = b ? '#8c8c8c' : '#e8741e'; g.fillRect(0, 0, s, s);
    // ring grooves across the root (v = along the axis) + fine lengthwise fibres
    for (let y = 0; y < s; y += 12 + (y % 3) * 4) {
      g.fillStyle = b ? '#3c3c3c' : rgba(140, 55, 10, 0.45); g.fillRect(0, y, s, 2);
      g.fillStyle = b ? '#c8c8c8' : rgba(255, 170, 90, 0.35); g.fillRect(0, y + 2, s, 1);
    }
    for (let i = 0; i < 200; i++) { g.fillStyle = b ? gray(120 + hash(i + 700) * 40) : rgba(255, 140, 60, 0.1 + hash(i + 701) * 0.15); g.fillRect(hash(i + 702) * s, 0, 1, s); }
    if (!b) dots(g, s, 120, 800, (i) => 1 + hash(i + 1) * 1.5, () => rgba(120, 50, 10, 0.5));
  }),
  lettuce: () => pair('lettuce', 256, (g, s, b) => {
    g.fillStyle = b ? '#808080' : '#6aa63a'; g.fillRect(0, 0, s, s);
    if (!b) dots(g, s, 80, 900, (i) => 10 + hash(i + 1) * 30, () => rgba(200, 235, 120, 0.16), 1.5);
    // branching veins: a main rib with side veins
    const vein = (x0: number, y0: number, x1: number, y1: number, w: number, depth: number) => {
      g.strokeStyle = b ? gray(200) : rgba(215, 240, 160, 0.75); g.lineWidth = w;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      if (depth === 0) return;
      for (let k = 0.2; k < 1; k += 0.25) {
        const px = x0 + (x1 - x0) * k, py = y0 + (y1 - y0) * k, sgn = k * 4 % 2 < 1 ? 1 : -1;
        const len = 22 + hash(px + py) * 18;
        vein(px, py, px + sgn * len, py + len * 0.6, w * 0.55, depth - 1);
      }
    };
    for (let i = 0; i < 4; i++) vein(hash(i + 950) * s, 0, hash(i + 951) * s, s, 3.5, 2);
  }),

  // ---- meat / fried ----
  beef: () => pair('beef', 256, (g, s, b) => {
    g.fillStyle = b ? '#808080' : '#a8323a'; g.fillRect(0, 0, s, s);
    // coarse grind: clumps of varying red, each with a height
    dots(g, s, 500, 1000, (i) => 3 + hash(i + 1) * 7, (i) => b ? gray(70 + hash(i + 2) * 150) : rgba(140 + hash(i + 2) * 60, 30 + hash(i + 3) * 30, 35 + hash(i + 4) * 20, 0.85), 0.7);
    // fat flecks
    dots(g, s, 70, 1100, (i) => 1.2 + hash(i + 1) * 2.8, () => b ? gray(200) : rgba(235, 210, 195, 0.7), 0.6);
    if (!b) dots(g, s, 700, 1200, () => 1, () => rgba(60, 10, 15, 0.35));
  }),
  chicken: () => pair('chicken', 256, (g, s, b) => {
    g.fillStyle = b ? '#808080' : '#ecb8ad'; g.fillRect(0, 0, s, s);
    dots(g, s, 200, 1300, (i) => 6 + hash(i + 1) * 20, (i) => b ? gray(110 + hash(i + 2) * 40) : rgba(240, 190 + hash(i + 2) * 30, 175, 0.35), 2.2);
    dots(g, s, 300, 1400, (i) => 1 + hash(i + 1) * 2, (i) => b ? gray(60 + hash(i + 2) * 60) : rgba(200, 120, 110, 0.35), 3);
  }),
  fries: () => pair('fries', 128, (g, s, b) => {
    g.fillStyle = b ? '#808080' : '#f2dd9c'; g.fillRect(0, 0, s, s);
    dots(g, s, 250, 1500, (i) => 1 + hash(i + 1) * 3, (i) => b ? gray(90 + hash(i + 2) * 110) : rgba(230, 195, 120, 0.5), 1.5);
    if (!b) dots(g, s, 80, 1600, (i) => 1 + hash(i + 1) * 2, () => rgba(180, 130, 60, 0.4));
  }),
  batter: () => pair('batter', 128, (g, s, b) => {
    g.fillStyle = b ? '#707070' : '#eedfb8'; g.fillRect(0, 0, s, s);
    // batter bubbles: raised blisters with a shaded rim
    for (let i = 0; i < 140; i++) {
      const x = hash(i + 1700) * s, y = hash(i + 1701) * s, r = 2 + hash(i + 1702) * 5;
      if (b) {
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, '#e0e0e0'); rg.addColorStop(1, '#707070');
        g.fillStyle = rg;
      } else g.fillStyle = rgba(225, 190, 130, 0.5);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      if (!b) { g.strokeStyle = rgba(200, 150, 80, 0.4); g.lineWidth = 1; g.stroke(); }
    }
  }),

  // ---- liquids ----
  liquid: (id: 'broth' | 'dressing' | 'pan_sauce') => pair(id, 256, (g, s, b) => {
    const base = id === 'broth' ? '#d4602c' : id === 'dressing' ? '#f1e6c6' : '#4e2010';
    g.fillStyle = b ? '#808080' : base; g.fillRect(0, 0, s, s);
    g.save(); g.translate(s / 2, s / 2);
    for (let k = 0; k < 5; k++) {
      g.strokeStyle = b ? gray(k % 2 ? 100 : 150) : id === 'pan_sauce' ? rgba(200, 120, 60, 0.06) : id === 'dressing' ? rgba(220, 180, 90, 0.16) : rgba(255, 190, 80, 0.16);
      g.lineWidth = id === 'dressing' ? 3 + k : 2;
      g.beginPath();
      for (let a = 0; a < 12; a += 0.1) { const r = a * 10; g.lineTo(Math.cos(a + k * 1.26) * r, Math.sin(a + k * 1.26) * r); }
      g.stroke();
    }
    g.restore();
    if (id === 'dressing') dots(g, s, 90, 2000, (i) => 1 + hash(i + 1) * 2.5, (i) => b ? gray(150) : rgba(60 + hash(i + 2) * 40, 90 + hash(i + 3) * 40, 30, 0.7), 0.5);
    if (id === 'pan_sauce' && !b) { dots(g, s, 160, 2100, (i) => 2 + hash(i + 1) * 6, () => rgba(25, 8, 4, 0.16), 1.6); dots(g, s, 200, 2300, (i) => 1 + hash(i + 1) * 2, () => rgba(255, 210, 140, 0.18)); }
    if (id === 'broth' && !b) dots(g, s, 200, 2200, (i) => 2 + hash(i + 1) * 8, () => rgba(255, 150, 70, 0.14), 2);
  }),
};

const matCache = new Map<string, THREE.Material>();
/** Shared material: never disposed by clearStage. */
export function sharedMat(key: string, make: () => THREE.Material): THREE.Material {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return m;
}
const std = (key: string, p: THREE.MeshStandardMaterialParameters) => sharedMat(key, () => new THREE.MeshStandardMaterial(p));
const phys = (key: string, p: THREE.MeshPhysicalMaterialParameters) => sharedMat(key, () => new THREE.MeshPhysicalMaterial(p));

export const mats = {
  wood: () => std('wood', { map: textures.wood(), roughness: 0.75 }),
  iron: () => std('iron', { map: textures.iron(), roughness: 0.55, metalness: 0.7 }),
  steel: () => std('steel', { map: textures.steel(), roughness: 0.3, metalness: 0.95 }),
  ceramic: () => phys('ceramic', { color: 0xf4f1ea, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
  tile: () => std('tile', { map: textures.tile(), roughness: 0.4 }),
  dark: () => std('dark', { color: 0x1a1512, roughness: 0.6 }),
  speck: () => std('speck', { color: 0x1c1410, roughness: 0.9 }),
  blob: () => sharedMat('blob', () => new THREE.MeshBasicMaterial({ map: textures.sprite(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false })),
  potato: () => std('potato', { ...textures.potato(), bumpScale: 0.6, roughness: 0.95 }),
  onion: () => phys('onion', { ...textures.onion(), bumpScale: 0.25, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.35 }),
  tomato: () => phys('tomato', { ...textures.tomato(), bumpScale: 0.15, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }),
  carrot: () => std('carrot', { ...textures.carrot(), bumpScale: 0.5, roughness: 0.6 }),
  lettuce: () => std('lettuce', { ...textures.lettuce(), bumpScale: 0.35, roughness: 0.45, emissive: 0x1e3a0a, emissiveIntensity: 0.12 }),
};

/** Dispose geometry + non-shared materials, and run item cleanup hooks. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    (o.userData.onDispose as (() => void) | undefined)?.();
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const ms = m.material;
    if (ms) for (const x of Array.isArray(ms) ? ms : [ms]) if (!x.userData.shared) x.dispose();
  });
}

// ---------- cook shader: Maillard crust spreading from the edges, char specks, grill stripes ----------

interface CookSpec { tex: { map: THREE.Texture; bumpMap: THREE.Texture }; crust: number; char: number; bump: number; rough: [number, number]; radial: number; stripe: number }
const COOK: Record<'beef' | 'chicken' | 'fries' | 'batter', CookSpec> = {
  beef: { tex: textures.beef(), crust: 0x5a2a16, char: 0x120a08, bump: 0.5, rough: [0.85, 0.5], radial: 1, stripe: 0.6 },
  chicken: { tex: textures.chicken(), crust: 0xc47a2c, char: 0x2a1a10, bump: 0.25, rough: [0.7, 0.45], radial: 1, stripe: 1 },
  fries: { tex: textures.fries(), crust: 0xd9962e, char: 0x3a2210, bump: 0.3, rough: [0.8, 0.4], radial: 0, stripe: 0 },
  batter: { tex: textures.batter(), crust: 0xcf8a2e, char: 0x2e1c0e, bump: 0.5, rough: [0.85, 0.45], radial: 0, stripe: 0 },
};

interface CookMat extends THREE.MeshStandardMaterial { setDone(d: number): void }
/** Non-shared material (per item); `radial` overrides the spec so a patty's side browns evenly. */
function cookMat(spec: CookSpec, radial = spec.radial): CookMat {
  const m = new THREE.MeshStandardMaterial({ map: spec.tex.map, bumpMap: spec.tex.bumpMap, bumpScale: spec.bump, roughness: spec.rough[0] }) as CookMat;
  const u = {
    uDone: { value: 0 }, uCrust: { value: new THREE.Color(spec.crust) }, uChar: { value: new THREE.Color(spec.char) },
    uRough: { value: spec.rough[1] }, uRadial: { value: radial }, uStripe: { value: spec.stripe }, uNoise: { value: textures.noise() },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCookPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCookPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCookPos;
        uniform float uDone, uRough, uRadial, uStripe; uniform vec3 uCrust, uChar; uniform sampler2D uNoise;
        float cookCrust = 0.0;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float n = texture2D(uNoise, vMapUv * 2.0).r;
          float n2 = texture2D(uNoise, vMapUv * 7.0 + 0.3).r;
          vec2 dc = vMapUv - 0.5;
          float edgeR = clamp(length(dc) * 2.0, 0.0, 1.0);
          float edgeB = 1.0 - smoothstep(0.0, 0.22, min(min(vMapUv.x, 1.0 - vMapUv.x), min(vMapUv.y, 1.0 - vMapUv.y)));
          float edge = mix(edgeB, edgeR, uRadial);
          float local = uDone * (0.7 + 0.55 * edge + 0.35 * (n - 0.5));
          cookCrust = smoothstep(0.3, 1.05, local);
          float burn = smoothstep(1.05, 1.75, local);
          float specks = step(0.78, n2) * smoothstep(1.25, 1.55, uDone);
          float stripe = uStripe * smoothstep(0.35, 1.0, uDone) * smoothstep(0.65, 0.9, sin(vCookPos.x * 15.0 + vCookPos.z * 2.0));
          vec3 col = mix(diffuseColor.rgb, uCrust * (0.75 + 0.5 * n), cookCrust);
          col = mix(col, uChar, max(burn, max(specks, stripe * 0.85)));
          diffuseColor.rgb = col;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, uRough, cookCrust);');
  };
  m.customProgramCacheKey = () => 'cook';
  m.setDone = (d) => (u.uDone.value = THREE.MathUtils.clamp(d, 0, 2));
  return m;
}

// ---------- geometry helpers ----------

/** Lathe slice along X of a solid with radius profile r(x), from x0 to x1, capped. */
function sliceGeo(r: (x: number) => number, x0: number, x1: number, seg: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, x0)];
  for (let i = 0; i <= 4; i++) {
    const x = x0 + ((x1 - x0) * i) / 4;
    pts.push(new THREE.Vector2(Math.max(r(x), 0.02), x));
  }
  pts.push(new THREE.Vector2(0, x1));
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateZ(-Math.PI / 2); // lathe axis Y -> X
  // a slice is ~17x wider around than along, so rescale uv to keep texture features round
  const uv = g.attributes.uv;
  const off = hash(x0 * 31 + 7);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6 + off, uv.getY(i) * 0.33 + off);
  return g;
}

const dummy = new THREE.Object3D();

// ---------- food factory ----------

interface Build {
  body: THREE.Group;
  top: number; // y of top surface for seasoning
  radius: number;
  /** y of the contact-shadow blob (world, relative to item origin). undefined = no blob (liquids). */
  floor?: number;
  doneness?: (d: number, side: 0 | 1) => void;
  slices?: THREE.Object3D[];
  stir?: (i: number) => void;
  tick?: Tick;
  cleanup?: () => void;
}

export function createFood(scene: THREE.Scene, tickers: Set<Tick>): FoodFactory & { update(dt: number): void } {
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[]) => {
    const x = new THREE.Mesh(g, m);
    x.castShadow = x.receiveShadow = !isMobile;
    return x;
  };

  function sliced(r: (x: number) => number, half: number, m: THREE.Material, n: number): Build {
    const body = new THREE.Group();
    const slices: THREE.Object3D[] = [];
    for (let i = 0; i < n; i++) {
      const x0 = -half + (2 * half * i) / n, x1 = -half + (2 * half * (i + 1)) / n;
      const s = mesh(sliceGeo(r, x0, x1, 20), m);
      s.userData.baseX = 0;
      slices.push(s);
      body.add(s);
    }
    return { body, top: 0, radius: half * 0.8, floor: 0.005, slices };
  }
  const sphereR = (R: number) => (x: number) => Math.sqrt(Math.max(R * R - x * x, 0));

  function build(id: IngredientId): Build {
    switch (id) {
      case 'onion': {
        const b = sliced(sphereR(0.6), 0.6, mats.onion(), 8);
        b.body.position.y = 0.55;
        b.top = 0.6;
        return b;
      }
      case 'tomato': {
        const b = sliced(sphereR(0.55), 0.55, mats.tomato(), 8);
        b.body.position.y = 0.5;
        b.top = 0.55;
        return b;
      }
      case 'potato': {
        const b = sliced((x) => 0.5 * Math.sqrt(Math.max(1 - (x / 0.85) ** 2, 0)) * (1 + 0.06 * Math.sin(x * 11)), 0.85, mats.potato(), 9);
        b.body.scale.z = 0.8;
        b.body.position.y = 0.4;
        b.top = 0.5;
        return b;
      }
      case 'carrot': {
        const b = sliced((x) => 0.05 + 0.25 * (x + 1) / 2, 1, mats.carrot(), 10);
        b.body.position.y = 0.3;
        b.top = 0.3;
        return b;
      }
      case 'lettuce': {
        const b = sliced((x) => sphereR(0.7)(x) * (1 + 0.05 * Math.sin(x * 20)), 0.7, mats.lettuce(), 8);
        b.body.position.y = 0.6;
        b.top = 0.65;
        return b;
      }
      case 'beef_patty': {
        const g = new THREE.CylinderGeometry(0.7, 0.7, 0.22, 40, 1);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
          const k = 1 + 0.04 * Math.sin(a * 7) + 0.03 * Math.sin(a * 13 + 1);
          p.setX(i, x * k); p.setZ(i, z * k);
        }
        g.computeVertexNormals();
        const mTop = cookMat(COOK.beef), mBot = cookMat(COOK.beef), mSide = cookMat(COOK.beef, 0);
        const set = [0, 0];
        const refresh = () => { mTop.setDone(set[1]); mBot.setDone(set[0]); mSide.setDone((set[0] + set[1]) / 2); };
        const body = new THREE.Group();
        body.add(mesh(g, [mSide, mTop, mBot])); // cylinder groups: side, top, bottom
        body.position.y = 0.11;
        return { body, top: 0.23, radius: 0.6, floor: 0.005, doneness: (d, side) => { set[side] = d; refresh(); } };
      }
      case 'chicken_breast': {
        const top = new THREE.SphereGeometry(0.5, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const bot = new THREE.SphereGeometry(0.5, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        for (const g of [top, bot]) g.scale(1.6, 0.4, 1);
        const mTop = cookMat(COOK.chicken, 0), mBot = cookMat(COOK.chicken, 0);
        const body = new THREE.Group();
        body.add(mesh(top, mTop), mesh(bot, mBot));
        body.position.y = 0.2;
        return { body, top: 0.2, radius: 0.6, floor: 0.005, doneness: (d, side) => (side === 0 ? mBot : mTop).setDone(d) };
      }
      case 'fries_cut': {
        const m = cookMat(COOK.fries);
        const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.9), m, 24);
        for (let i = 0; i < 24; i++) {
          dummy.position.set((hash(i) - 0.5) * 0.9, (hash(i + 50) - 0.5) * 0.2, (hash(i + 9) - 0.5) * 0.3);
          dummy.rotation.set(0, (hash(i + 3) - 0.5) * 1.2, (hash(i + 4) - 0.5) * 0.5);
          dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
        }
        im.castShadow = !isMobile;
        const body = new THREE.Group();
        body.add(im);
        body.position.y = 0.15;
        return { body, top: 0.3, radius: 0.4, floor: 0.16, doneness: (d) => m.setDone(d) };
      }
      case 'onion_ring_batter': {
        const m = cookMat(COOK.batter);
        const g = new THREE.TorusGeometry(0.35, 0.09, 10, 28);
        g.rotateX(Math.PI / 2);
        const body = new THREE.Group();
        for (let i = 0; i < 4; i++) {
          const r = mesh(i === 0 ? g : g.clone(), m);
          r.position.set((i - 1.5) * 0.45, (i % 2) * 0.05 - 0.02, (i % 2) * 0.2);
          r.scale.setScalar(1 - i * 0.08);
          body.add(r);
        }
        body.position.y = 0.1;
        return { body, top: 0.2, radius: 0.6, floor: 0.16, doneness: (d) => m.setDone(d) };
      }
      case 'broth':
      case 'dressing':
      case 'pan_sauce': {
        const [c0, c1] = id === 'broth' ? [0xffffff, 0xb04a20] : id === 'dressing' ? [0xffffff, 0xe0c890] : [0xffffff, 0x5a2810];
        const from = new THREE.Color(c0), to = new THREE.Color(c1);
        const { map, bumpMap } = textures.liquid(id);
        const m = new THREE.MeshPhysicalMaterial({
          color: from, map, bumpMap, bumpScale: id === 'dressing' ? 0.08 : 0.03,
          roughness: id === 'dressing' ? 0.38 : 0.06, clearcoat: id === 'dressing' ? 0.3 : 1, clearcoatRoughness: 0.1,
          transparent: id === 'broth', opacity: 0.82,
        });
        const g = new THREE.CircleGeometry(1.15, 40);
        g.rotateX(-Math.PI / 2);
        const body = new THREE.Group();
        const disc = mesh(g, m);
        disc.position.y = 0.02;
        body.add(disc);
        // floating bits (broth only): 1 instanced draw, spun with the swirl
        let bits: THREE.InstancedMesh | null = null;
        if (id === 'broth') {
          bits = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.01, 0.04), std('bits', { roughness: 0.6 }), 14);
          const c = new THREE.Color();
          for (let i = 0; i < 14; i++) {
            const a = hash(i + 40) * Math.PI * 2, r = 0.2 + hash(i + 41) * 0.8;
            dummy.position.set(Math.cos(a) * r, 0.026, Math.sin(a) * r);
            dummy.rotation.set(0, hash(i + 42) * Math.PI, 0);
            dummy.scale.setScalar(0.7 + hash(i + 43) * 0.7);
            dummy.updateMatrix();
            bits.setMatrixAt(i, dummy.matrix);
            bits.setColorAt(i, i % 3 === 0 ? c.set(0x4c7a24) : c.set(0xe8862a));
          }
          body.add(bits);
        }
        let stir = 0, thick = 0, angle = 0;
        return {
          body, top: 0.03, radius: 0.9,
          stir: (i) => (stir = THREE.MathUtils.clamp(i, 0, 1)),
          tick: (dt) => {
            if (stir <= 0) return;
            angle += stir * dt * 5;
            map.rotation = bumpMap.rotation = -angle;
            if (bits) bits.rotation.y = angle;
            thick = Math.min(1, thick + stir * dt * 0.08);
            m.color.lerpColors(from, to, thick);
            disc.position.y = 0.02 + Math.sin(angle * 2) * 0.01 * stir;
          },
        };
      }
    }
  }

  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

  function make(id: IngredientId): FoodItem {
    const b = build(id);
    const object = new THREE.Group();
    object.name = id;
    object.add(b.body);
    const baseY = b.body.position.y;

    // soft contact shadow (works on mobile where shadow maps are off)
    if (b.floor !== undefined) {
      const blob = new THREE.Mesh(blobGeo, mats.blob());
      blob.scale.set(b.radius * 3.2, 1, b.radius * 3.2);
      blob.position.y = b.floor;
      blob.renderOrder = -1;
      object.add(blob);
    }

    // seasoning speckles (instanced, 1 draw call)
    const MAXS = 150;
    const speck = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 0.012, 0.025), mats.speck(), MAXS);
    speck.count = 0;
    speck.position.y = b.top - baseY;
    b.body.add(speck);

    // flip anim state
    let flipT = -1, flipFrom = 0;
    const tick: Tick = (dt) => {
      b.tick?.(dt);
      if (flipT < 0) return;
      flipT = Math.min(flipT + dt / 0.4, 1);
      const e = flipT * flipT * (3 - 2 * flipT);
      b.body.rotation.x = flipFrom + Math.PI * e;
      b.body.position.y = baseY + Math.sin(Math.PI * flipT) * 0.5; // body is centered on its pivot, so it lands at baseY
      if (flipT >= 1) flipT = -1;
    };
    tickers.add(tick);

    let disposed = false;
    const item: FoodItem = {
      object,
      setDoneness: (d, side = 0) => b.doneness?.(d, side),
      setChopProgress: (p) => {
        if (!b.slices) return;
        const n = b.slices.length;
        p = THREE.MathUtils.clamp(p, 0, 1);
        b.slices.forEach((s, i) => (s.position.x = (i - (n - 1) / 2) * 0.18 * p));
      },
      setStir: (i) => b.stir?.(i),
      setSeasoning: (a) => {
        a = Math.max(0, a);
        const n = Math.min(MAXS, Math.round(Math.min(a, 2.5) * 60));
        const s = a > 1 ? 1 + (a - 1) * 1.2 : 1;
        for (let i = 0; i < n; i++) {
          const r = Math.sqrt(hash(i + 11)) * b.radius, t = hash(i + 23) * Math.PI * 2;
          dummy.position.set(Math.cos(t) * r, 0.005, Math.sin(t) * r);
          dummy.rotation.set(0, t, 0);
          dummy.scale.setScalar(s);
          dummy.updateMatrix();
          speck.setMatrixAt(i, dummy.matrix);
        }
        speck.count = n;
        speck.instanceMatrix.needsUpdate = true;
      },
      flip: () => {
        if (flipT >= 0) return;
        flipFrom = b.body.rotation.x;
        flipT = 0;
      },
      dispose: () => {
        if (disposed) return;
        object.removeFromParent();
        disposeTree(object);
      },
    };
    object.userData.onDispose = () => {
      disposed = true;
      tickers.delete(tick);
      b.cleanup?.();
    };
    return item;
  }

  // ---------- stations ----------

  function station(kind: 'board' | 'pan' | 'fryer' | 'bowl' | 'plate'): THREE.Group {
    const g = new THREE.Group();
    g.name = `station_${kind}`;
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const o = mesh(geo, m);
      o.position.set(x, y, z);
      g.add(o);
      return o;
    };
    switch (kind) {
      case 'board': {
        add(new THREE.BoxGeometry(3.4, 0.16, 2.2), mats.wood(), 0, -0.08, 0);
        add(new THREE.BoxGeometry(1.4, 0.02, 0.28), mats.steel(), 0.5, 0.01, 1.35).rotation.y = 0.1;
        add(new THREE.BoxGeometry(0.7, 0.07, 0.14), mats.dark(), -0.55, 0.035, 1.43).rotation.y = 0.1;
        break;
      }
      case 'pan': {
        const pts = [[0, -0.2], [1.3, -0.2], [1.5, -0.1], [1.6, 0.25], [1.5, 0.25], [1.4, 0], [0, 0]].map(([x, y]) => new THREE.Vector2(x, y));
        add(new THREE.LatheGeometry(pts, 40), mats.iron());
        add(new THREE.BoxGeometry(1.4, 0.1, 0.22), mats.iron(), 2.2, 0.15, 0).rotation.z = 0.15;
        break;
      }
      case 'fryer': {
        const vat = [[0, -1], [1.6, -1], [1.6, 0.4], [1.5, 0.4], [1.5, -0.9], [0, -0.9]].map(([x, y]) => new THREE.Vector2(x, y));
        add(new THREE.LatheGeometry(vat, 4, Math.PI / 4), mats.steel()).scale.set(1, 1, 0.8);
        add(new THREE.CylinderGeometry(1.0, 1.0, 0.7, 24, 4, true), sharedMat('basket', () => new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 1, roughness: 0.35, wireframe: true })), 0, 0.2, 0);
        add(new THREE.CircleGeometry(1.0, 24).rotateX(-Math.PI / 2), mats.steel(), 0, -0.14, 0);
        add(new THREE.BoxGeometry(0.12, 0.1, 1.4), mats.dark(), 0, 0.5, 1.6);
        add(new THREE.PlaneGeometry(2.1, 1.7).rotateX(-Math.PI / 2), phys('oil', { color: 0x8a5a12, roughness: 0.05, transparent: true, opacity: 0.7, transmission: 0 }), 0, 0.15, 0);
        break;
      }
      case 'bowl': {
        const b = add(new THREE.SphereGeometry(1.4, 36, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), sharedMat('ceramic2', () => new THREE.MeshPhysicalMaterial({ color: 0xe9e2d6, roughness: 0.25, clearcoat: 0.8, side: THREE.DoubleSide })), 0, 0.6, 0);
        b.scale.y = 0.9;
        add(new THREE.CylinderGeometry(0.55, 0.6, 0.1, 28), mats.ceramic(), 0, -0.7, 0);
        break;
      }
      case 'plate': {
        const pts = [[0, -0.06], [1.1, -0.06], [1.6, 0.06], [1.6, 0.1], [1.2, 0.03], [0, 0]].map(([x, y]) => new THREE.Vector2(x, y));
        add(new THREE.LatheGeometry(pts, 48), mats.ceramic());
        break;
      }
    }
    return g;
  }

  // ---------- effects ----------

  const scale = isMobile ? 0.5 : 1;
  const sprite = textures.sprite();

  interface Sys { pts: THREE.Points; pos: Float32Array; col: Float32Array; vel: Float32Array; life: Float32Array; max: Float32Array; n: number }
  function sys(n: number, additive: boolean, size: number, color: number): Sys {
    const pos = new Float32Array(n * 3).fill(-999), col = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
      size, map: sprite, color, vertexColors: true, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const pts = new THREE.Points(geo, m);
    pts.frustumCulled = false;
    scene.add(pts);
    return { pts, pos, col, vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n).fill(1), n };
  }
  function spawn(s: Sys, i: number, p: THREE.Vector3, vx: number, vy: number, vz: number, life: number) {
    s.pos[i * 3] = p.x; s.pos[i * 3 + 1] = p.y; s.pos[i * 3 + 2] = p.z;
    s.vel[i * 3] = vx; s.vel[i * 3 + 1] = vy; s.vel[i * 3 + 2] = vz;
    s.life[i] = s.max[i] = life;
  }
  /** Integrate particles. bright<0: keep colors (normal-blend speckles). fade: 0 = ease in/out (steam), 1 = fade out (sparks). */
  function step(s: Sys, dt: number, gravity: number, bright: number, fade = bright >= 1 ? 1 : 0): void {
    for (let i = 0; i < s.n; i++) {
      if (s.life[i] <= 0) continue;
      s.life[i] -= dt;
      const j = i * 3;
      if (s.life[i] <= 0) { s.pos[j + 1] = -999; continue; }
      s.vel[j + 1] -= gravity * dt;
      s.pos[j] += s.vel[j] * dt; s.pos[j + 1] += s.vel[j + 1] * dt; s.pos[j + 2] += s.vel[j + 2] * dt;
      if (bright < 0) continue;
      const f = s.life[i] / s.max[i];
      const c = bright * (fade ? f : Math.sin(Math.PI * f));
      s.col[j] = s.col[j + 1] = s.col[j + 2] = c;
    }
    (s.pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (s.pts.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  const sizzleSys = sys(Math.round(150 * scale), true, 0.09, 0xffe0a0);
  const sprinkleSys = sys(Math.round(200 * scale), false, 0.05, 0x201510);
  sprinkleSys.col.fill(1);
  let sizzleI = 0, sprinkleI = 0;

  interface Steam { s: Sys; origin: THREE.Vector3; intensity: number; active: boolean; acc: number; next: number }
  const steams: Steam[] = [];
  const STEAM_N = Math.round(220 * scale);

  const effects: Effects = {
    steam(pos, intensity = 1) {
      let st = steams.find((x) => !x.active);
      if (!st) {
        st = { s: sys(STEAM_N, true, 0.9, 0xfff4e8), origin: new THREE.Vector3(), intensity: 0, active: false, acc: 0, next: 0 };
        steams.push(st);
      }
      const h = st;
      h.origin.copy(pos); h.intensity = intensity; h.active = true; h.s.pts.visible = true;
      return {
        set: (i) => (h.intensity = THREE.MathUtils.clamp(i, 0, 1)),
        stop: () => {
          h.active = false; h.s.pts.visible = false;
          h.s.life.fill(0); h.s.pos.fill(-999);
        },
      };
    },
    sizzle(pos, strength = 1) {
      const n = Math.round(30 * scale * strength);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.2;
        spawn(sizzleSys, sizzleI, pos, Math.cos(a) * sp, 1 + Math.random() * 1.5, Math.sin(a) * sp, 0.3 + Math.random() * 0.2);
        sizzleI = (sizzleI + 1) % sizzleSys.n;
      }
    },
    sprinkle(pos, count = 20) {
      const n = Math.round(count * scale);
      for (let k = 0; k < n; k++) {
        spawn(sprinkleSys, sprinkleI, pos, (Math.random() - 0.5) * 0.6, -0.5 - Math.random(), (Math.random() - 0.5) * 0.6, 0.9);
        sprinkleI = (sprinkleI + 1) % sprinkleSys.n;
      }
    },
  };

  function update(dt: number) {
    for (const t of tickers) t(dt);
    step(sizzleSys, dt, 6, 1.4, 1); // >1 with additive blend = hot, bright spray
    step(sprinkleSys, dt, 3, -1);
    for (const st of steams) {
      if (!st.active) continue;
      const s = st.s;
      // emit
      st.acc += dt * 32 * st.intensity * scale;
      while (st.acc >= 1) {
        st.acc -= 1;
        const i = st.next;
        st.next = (st.next + 1) % s.n;
        s.pos[i * 3] = st.origin.x + (Math.random() - 0.5) * 1.0;
        s.pos[i * 3 + 1] = st.origin.y;
        s.pos[i * 3 + 2] = st.origin.z + (Math.random() - 0.5) * 1.0;
        s.vel[i * 3] = (Math.random() - 0.5) * 0.25; s.vel[i * 3 + 1] = 0.45 + Math.random() * 0.4; s.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
        s.life[i] = s.max[i] = 2.2 + Math.random() * 1.2;
      }
      step(s, dt, -0.04, 0.05 * Math.max(st.intensity, 0.3), 0);
    }
  }
  return { make, station, effects, update };
}
