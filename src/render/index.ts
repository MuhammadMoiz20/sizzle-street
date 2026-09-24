import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Renderer } from './api';
import { createFood, disposeTree, isMobile, mats, sharedMat } from './food';

export type { Renderer } from './api';

type Kind = 'board' | 'pan' | 'fryer' | 'bowl' | 'plate';
/** Counter height under each station so props rest on it. */
const COUNTER_Y: Record<Kind, number> = { board: -0.16, pan: -0.2, fryer: -1, bowl: -0.75, plate: -0.06 };
/** Width of each station that should fill the view. */
const WIDTH: Record<Kind, number> = { board: 3.8, pan: 4.2, fryer: 3.8, bowl: 3.2, plate: 3.4 };
const CLEAR = 0x1e1510;

export function createRenderer(container: HTMLElement): Renderer {
  const gl = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: false, powerPreference: 'high-performance' });
  gl.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.shadowMap.enabled = !isMobile;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  gl.setClearColor(CLEAR);
  const canvas = gl.domElement;
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CLEAR);
  scene.fog = new THREE.Fog(CLEAR, 9, 24); // keeps the backdrop dim behind stations
  const pmrem = new THREE.PMREMGenerator(gl);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 60);

  // lights
  const key = new THREE.DirectionalLight(0xffd9a8, 2.2);
  key.position.set(4, 9, 5);
  key.castShadow = !isMobile;
  key.shadow.mapSize.set(1024, 1024);
  const sc = key.shadow.camera;
  sc.left = sc.bottom = -5; sc.right = sc.top = 5; sc.near = 1; sc.far = 25;
  key.shadow.bias = -0.0005;
  const fill = new THREE.DirectionalLight(0x9fb8ff, 0.5);
  fill.position.set(-6, 4, 3);
  const hemi = new THREE.HemisphereLight(0xffe8cc, 0x2a1c14, 0.5);
  const point = new THREE.PointLight(0xffc27a, 6, 8, 2);
  point.position.set(0, 3, 0.8);
  scene.add(key, key.target, fill, hemi, point);

  // kitchen backdrop
  const kitchen = new THREE.Group();
  kitchen.name = 'kitchen';
  const km = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.receiveShadow = !isMobile;
    kitchen.add(o);
    return o;
  };
  const counterMat = sharedMat('counter', () => new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.5, metalness: 0.1 }));
  km(new THREE.BoxGeometry(16, 1.8, 7), counterMat, 0, -0.9, -1);
  km(new THREE.PlaneGeometry(22, 10), mats.tile(), 0, 4, -4.5);
  km(new THREE.BoxGeometry(5, 1.2, 2), mats.steel(), 0, 5.2, -3.5);
  km(new THREE.CylinderGeometry(2, 2.5, 1.5, 4, 1, true), mats.steel(), 0, 6.3, -3.8).rotation.y = Math.PI / 4;
  const potGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.9, 24);
  const lidGeo = new THREE.SphereGeometry(0.72, 20, 6, 0, Math.PI * 2, 0, 0.5);
  for (const [x, z] of [[-4, -3], [4.2, -3.2], [-5.6, -2.4]]) {
    km(potGeo, mats.steel(), x, 0.45, z);
    km(lidGeo, mats.steel(), x, 0.3, z);
  }
  scene.add(kitchen);

  const stage = new THREE.Group();
  stage.name = 'stage';
  scene.add(stage);

  const tickers = new Set<(dt: number) => void>();
  const food = createFood(scene, tickers);

  let current: Kind | null = null;
  const tmp = new THREE.Vector3();

  function frame(kind: Kind | null) {
    current = kind;
    if (!kind) {
      kitchen.position.y = -0.9;
      camera.position.set(0, 3.2, 9);
      tmp.set(0, 0.6, -2);
    } else {
      kitchen.position.y = COUNTER_Y[kind];
      const vt = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const w = WIDTH[kind] * (camera.aspect < 1 ? 1.05 : 1);
      const d = Math.max(w / 2 / (vt * camera.aspect), (w * 0.75) / 2 / vt) * 1.1;
      const el = THREE.MathUtils.degToRad(55);
      camera.position.set(0, Math.sin(el) * d, Math.cos(el) * d);
      tmp.set(0, 0, 0);
    }
    camera.lookAt(tmp);
  }

  function resize() {
    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
    gl.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    frame(current);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  frame(null);

  // stats
  const times = new Float32Array(30);
  let ti = 0, filled = 0, last = performance.now(), frameMs = 0;

  const r: Renderer = {
    scene, camera, canvas, food, stage,
    clearStage() {
      for (const c of [...stage.children]) {
        stage.remove(c);
        disposeTree(c);
      }
    },
    showKitchen: () => frame(null),
    frameStation: (kind) => frame(kind),
    update(dt) {
      const now = performance.now();
      times[ti] = now - last;
      ti = (ti + 1) % 30;
      filled = Math.min(filled + 1, 30);
      last = now;
      food.update(Math.min(dt, 0.1));
      gl.render(scene, camera);
      frameMs = performance.now() - now;
    },
    stats() {
      let s = 0;
      for (let i = 0; i < filled; i++) s += times[i];
      return { fps: s > 0 ? (1000 * filled) / s : 0, frameMs, drawCalls: gl.info.render.calls };
    },
    resize,
    dispose() {
      ro.disconnect();
      r.clearStage();
      disposeTree(scene);
      envTex.dispose();
      gl.dispose();
      canvas.remove();
    },
  };
  if (import.meta.env.DEV) (window as unknown as { __renderer: Renderer }).__renderer = r;
  return r;
}
