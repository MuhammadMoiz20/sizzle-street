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

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

const texCache = new Map<string, THREE.Texture>();
function tex(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = texCache.get(key);
  if (!t) texCache.set(key, (t = make()));
  return t;
}

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
  sprite: () => tex('sprite', () => canvasTex(64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  })),
};

function swirlCanvasTex(): THREE.CanvasTexture {
  const t = canvasTex(256, (g, s) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    g.translate(s / 2, s / 2);
    for (let k = 0; k < 5; k++) {
      g.strokeStyle = `rgba(120,100,80,${0.12 + 0.05 * k})`;
      g.lineWidth = 3;
      g.beginPath();
      for (let a = 0; a < 12; a += 0.1) {
        const r = a * 10;
        g.lineTo(Math.cos(a + k * 1.26) * r, Math.sin(a + k * 1.26) * r);
      }
      g.stroke();
    }
  });
  t.center.set(0.5, 0.5);
  return t;
}

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

// ---------- doneness ramp ----------

type Ramp = [THREE.Color, THREE.Color, THREE.Color];
const ramp = (a: number, b: number, c: number): Ramp => [new THREE.Color(a), new THREE.Color(b), new THREE.Color(c)];
const RAMPS = {
  beef: ramp(0xb0303a, 0x5e3620, 0x140e0c),
  chicken: ramp(0xe8b4a8, 0xcf9440, 0x2a1a10),
  fries: ramp(0xf0e2a4, 0xd9a038, 0x4a2a12),
  batter: ramp(0xeee2c0, 0xd49a40, 0x3c2412),
};
function applyRamp(m: THREE.MeshStandardMaterial, r: Ramp, d: number): void {
  d = THREE.MathUtils.clamp(d, 0, 2);
  if (d <= 1) m.color.lerpColors(r[0], r[1], d);
  else m.color.lerpColors(r[1], r[2], d - 1);
  m.roughness = 0.75 - 0.35 * Math.min(d, 1); // fat renders -> glossier
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
  return g;
}

const dummy = new THREE.Object3D();

// ---------- food factory ----------

interface Build {
  body: THREE.Group;
  top: number; // y of top surface for seasoning
  radius: number;
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
    return { body, top: 0, radius: half * 0.8, slices };
  }
  const sphereR = (R: number) => (x: number) => Math.sqrt(Math.max(R * R - x * x, 0));

  function cookedHalves(geoTop: THREE.BufferGeometry, geoBot: THREE.BufferGeometry, rp: Ramp, top: number, radius: number): Build {
    const mTop = new THREE.MeshStandardMaterial({ roughness: 0.75 });
    const mBot = mTop.clone();
    applyRamp(mTop, rp, 0); applyRamp(mBot, rp, 0);
    const body = new THREE.Group();
    body.add(mesh(geoTop, mTop), mesh(geoBot, mBot));
    return { body, top, radius, doneness: (d, side) => applyRamp(side === 0 ? mBot : mTop, rp, d) };
  }

  function build(id: IngredientId): Build {
    switch (id) {
      case 'onion': {
        const b = sliced(sphereR(0.6), 0.6, std('onion', { color: 0xd9b27a, roughness: 0.35 }), 8);
        b.body.position.y = 0.55;
        b.top = 0.6;
        return b;
      }
      case 'tomato': {
        const b = sliced(sphereR(0.55), 0.55, phys('tomato', { color: 0xd8321e, roughness: 0.2, clearcoat: 1 }), 8);
        b.body.position.y = 0.5;
        b.top = 0.55;
        return b;
      }
      case 'potato': {
        const b = sliced((x) => 0.5 * Math.sqrt(Math.max(1 - (x / 0.85) ** 2, 0)) * (1 + 0.06 * Math.sin(x * 11)), 0.85, std('potato', { color: 0xb08a58, roughness: 0.9 }), 9);
        b.body.scale.z = 0.8;
        b.body.position.y = 0.4;
        b.top = 0.5;
        return b;
      }
      case 'carrot': {
        const b = sliced((x) => 0.05 + 0.25 * (x + 1) / 2, 1, std('carrot', { color: 0xe8741e, roughness: 0.6 }), 10);
        b.body.position.y = 0.3;
        b.top = 0.3;
        return b;
      }
      case 'lettuce': {
        const b = sliced((x) => sphereR(0.7)(x) * (1 + 0.05 * Math.sin(x * 20)), 0.7, std('lettuce', { color: 0x6aa83a, roughness: 0.55 }), 8);
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
        const mTop = new THREE.MeshStandardMaterial({ roughness: 0.75 });
        const mBot = mTop.clone(), mSide = mTop.clone();
        const r = RAMPS.beef;
        const set = [0, 0];
        const refresh = () => { applyRamp(mTop, r, set[1]); applyRamp(mBot, r, set[0]); applyRamp(mSide, r, (set[0] + set[1]) / 2); };
        refresh();
        const body = new THREE.Group();
        const m = mesh(g, [mSide, mTop, mBot]); // cylinder groups: side, top, bottom
        body.add(m);
        body.position.y = 0.11;
        return { body, top: 0.23, radius: 0.6, doneness: (d, side) => { set[side] = d; refresh(); } };
      }
      case 'chicken_breast': {
        const top = new THREE.SphereGeometry(0.5, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const bot = new THREE.SphereGeometry(0.5, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        for (const g of [top, bot]) g.scale(1.6, 0.4, 1);
        const b = cookedHalves(top, bot, RAMPS.chicken, 0.2, 0.6);
        b.body.position.y = 0.2;
        return b;
      }
      case 'fries_cut': {
        const m = new THREE.MeshStandardMaterial();
        applyRamp(m, RAMPS.fries, 0);
        const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 0.9), m, 24);
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
        return { body, top: 0.3, radius: 0.4, doneness: (d) => applyRamp(m, RAMPS.fries, d) };
      }
      case 'onion_ring_batter': {
        const m = new THREE.MeshStandardMaterial();
        applyRamp(m, RAMPS.batter, 0);
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
        return { body, top: 0.2, radius: 0.6, doneness: (d) => applyRamp(m, RAMPS.batter, d) };
      }
      case 'broth':
      case 'dressing':
      case 'pan_sauce': {
        const [c0, c1] = id === 'broth' ? [0xc98a3a, 0x8a4f1e] : id === 'dressing' ? [0xe8d8a0, 0xd0a84a] : [0x7a2e18, 0x4a1a0c];
        const from = new THREE.Color(c0), to = new THREE.Color(c1);
        const map = swirlCanvasTex();
        const m = new THREE.MeshPhysicalMaterial({ color: from, map, roughness: 0.12, clearcoat: 1, transparent: id === 'broth', opacity: 0.92 });
        const g = new THREE.CircleGeometry(1.15, 40);
        g.rotateX(-Math.PI / 2);
        const body = new THREE.Group();
        const disc = mesh(g, m);
        disc.position.y = 0.02;
        body.add(disc);
        let stir = 0, thick = 0;
        return {
          body, top: 0.03, radius: 0.9,
          stir: (i) => (stir = THREE.MathUtils.clamp(i, 0, 1)),
          tick: (dt) => {
            if (stir <= 0) return;
            map.rotation -= stir * dt * 5;
            thick = Math.min(1, thick + stir * dt * 0.08);
            m.color.lerpColors(from, to, thick);
            disc.position.y = 0.02 + Math.sin(map.rotation * 2) * 0.01 * stir;
          },
          cleanup: () => map.dispose(),
        };
      }
    }
  }

  function make(id: IngredientId): FoodItem {
    const b = build(id);
    const object = new THREE.Group();
    object.name = id;
    object.add(b.body);
    const baseY = b.body.position.y;

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
  /** Integrate particles. bright<0: keep colors (normal-blend speckles). */
  function step(s: Sys, dt: number, gravity: number, bright: number): void {
    for (let i = 0; i < s.n; i++) {
      if (s.life[i] <= 0) continue;
      s.life[i] -= dt;
      const j = i * 3;
      if (s.life[i] <= 0) { s.pos[j + 1] = -999; continue; }
      s.vel[j + 1] -= gravity * dt;
      s.pos[j] += s.vel[j] * dt; s.pos[j + 1] += s.vel[j + 1] * dt; s.pos[j + 2] += s.vel[j + 2] * dt;
      if (bright < 0) continue;
      const f = s.life[i] / s.max[i];
      const c = bright * (bright < 1 ? Math.sin(Math.PI * f) : f); // steam eases in/out, sparks fade out
      s.col[j] = s.col[j + 1] = s.col[j + 2] = c;
    }
    (s.pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (s.pts.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  const sizzleSys = sys(Math.round(150 * scale), true, 0.06, 0xffd28a);
  const sprinkleSys = sys(Math.round(200 * scale), false, 0.05, 0x201510);
  sprinkleSys.col.fill(1);
  let sizzleI = 0, sprinkleI = 0;

  interface Steam { s: Sys; origin: THREE.Vector3; intensity: number; active: boolean; acc: number; next: number }
  const steams: Steam[] = [];
  const STEAM_N = Math.round(200 * scale);

  const effects: Effects = {
    steam(pos, intensity = 1) {
      let st = steams.find((x) => !x.active);
      if (!st) {
        st = { s: sys(STEAM_N, true, 0.5, 0xffffff), origin: new THREE.Vector3(), intensity: 0, active: false, acc: 0, next: 0 };
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
    step(sizzleSys, dt, 6, 1);
    step(sprinkleSys, dt, 3, -1);
    for (const st of steams) {
      if (!st.active) continue;
      const s = st.s;
      // emit
      st.acc += dt * 60 * st.intensity * scale;
      while (st.acc >= 1) {
        st.acc -= 1;
        const i = st.next;
        st.next = (st.next + 1) % s.n;
        s.pos[i * 3] = st.origin.x + (Math.random() - 0.5) * 0.8;
        s.pos[i * 3 + 1] = st.origin.y;
        s.pos[i * 3 + 2] = st.origin.z + (Math.random() - 0.5) * 0.8;
        s.vel[i * 3] = (Math.random() - 0.5) * 0.2; s.vel[i * 3 + 1] = 0.5 + Math.random() * 0.4; s.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
        s.life[i] = s.max[i] = 1.8 + Math.random();
      }
      step(s, dt, -0.05, 0.12 * Math.max(st.intensity, 0.3));
    }
  }
  return { make, station, effects, update };
}
