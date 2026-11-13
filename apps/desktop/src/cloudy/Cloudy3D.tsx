// Cloudy as a real 3D object (three.js): soft, glossy puffs lit from the top left, a 3D face (glossy black
// capsule eyes, a little mouth, blushing cheeks), headphones while music plays. He breathes, blinks, turns
// toward the cursor, and on his own does tricks — spins, flips, rolls, hops, peeks — or on request
// (`trick`). His 16 puffs glide between the same shapes as the flat version (heart, star, bunny…) and
// scatter when he dissolves. Falls back to the flat drawing where WebGL isn't available.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CloudyFace, LOOKS, type Expr, type Tint } from './CloudyFace';
import { SHAPES, scatter, type ShapeId } from './shapes';

export type Trick = 'spin' | 'flip' | 'roll' | 'hop' | 'peek' | 'wobble' | 'twirl';
const TRICKS: Trick[] = ['spin', 'flip', 'roll', 'hop', 'peek', 'wobble', 'twirl'];

const TINT: Record<Tint, [number, number]> = { white: [0xffffff, 0xdfe7f5], grey: [0xeef1f5, 0xb9c2d0], warm: [0xfffaf0, 0xf1dcc0], night: [0xf1f3ff, 0xc5ccf0] };

let webgl: boolean | null = null;
function hasWebGL() {
  if (webgl == null) {
    try {
      const c = document.createElement('canvas');
      webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

/** 0..1 → 0..1 with a soft start and end. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Drawing coordinates (122×96) → world units. */
const W = (x: number) => (x - 61) / 38;
const H = (y: number) => -(y - 56) / 38;

interface Props {
  expr: Expr;
  look: { x: number; y: number };
  size: number;
  tint?: Tint;
  shape?: ShapeId;
  dissolved?: boolean;
  headphones?: boolean;
  /** Ask for a trick: change `n` to play `kind` once. */
  trick?: { kind: Trick; n: number } | null;
  /** Does tricks by himself now and then. */
  playful?: boolean;
}

export function Cloudy3D(props: Props) {
  if (!hasWebGL()) return <CloudyFace {...props} />;
  return <Scene {...props} />;
}

function Scene({ expr, look, size, tint = 'white', shape = 'cloud', dissolved = false, headphones = false, trick, playful = true }: Props) {
  const host = useRef<HTMLDivElement>(null);
  // Everything the render loop reads, updated by React without re-creating the scene.
  const live = useRef({ expr, look, tint, shape, dissolved, headphones, playful });
  live.current = { expr, look, tint, shape, dissolved, headphones, playful };
  const trickReq = useRef<{ kind: Trick; at: number } | null>(null);
  useEffect(() => {
    if (trick) trickReq.current = { kind: trick.kind, at: performance.now() };
  }, [trick?.n]);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1.25, 0.1, 50);
    // The canvas is 1.5× his box (so spins and flips aren't clipped); the camera stands back to match.
    camera.position.set(0, 0.05, 10.8);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c6ff, 1.6));
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(-2.5, 3.2, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd2ff, 1.4);
    rim.position.set(2.5, 1, -3);
    scene.add(rim);

    // Cloudy: a pivot for tricks, a body for breathing and the look, then puffs and face.
    const pivot = new THREE.Group();
    const body = new THREE.Group();
    pivot.add(body);
    scene.add(pivot);

    const puffMat = new THREE.MeshPhysicalMaterial({ color: TINT[live.current.tint][0], emissive: 0x1b1f2b, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.35, sheen: 1, sheenColor: new THREE.Color(0xcfe0ff), sheenRoughness: 0.6 });
    const sphere = new THREE.SphereGeometry(1, 40, 28);
    const puffs = Array.from({ length: 16 }, () => {
      const m = new THREE.Mesh(sphere, puffMat);
      body.add(m);
      return m;
    });

    const ink = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.18, metalness: 0.1 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xff8fb1, roughness: 0.5, transparent: true, opacity: 0 });
    const tongueMat = new THREE.MeshStandardMaterial({ color: 0xff6f91, roughness: 0.4 });
    const face = new THREE.Group();
    body.add(face);
    const eyeGeo = new THREE.CapsuleGeometry(0.075, 0.13, 6, 16);
    const arcGeo = new THREE.TorusGeometry(0.085, 0.024, 10, 24, Math.PI);
    const ringGeo = new THREE.TorusGeometry(0.07, 0.022, 10, 24);
    const eyes = [-0.31, 0.31].map((x) => {
      const g = new THREE.Group();
      g.position.set(x, 0.07, 0);
      const open = new THREE.Mesh(eyeGeo, ink);
      const happy = new THREE.Mesh(arcGeo, ink);
      happy.position.y = -0.03;
      const closed = new THREE.Mesh(arcGeo, ink);
      closed.rotation.z = Math.PI;
      closed.position.y = 0.03;
      const dizzy = new THREE.Mesh(ringGeo, ink);
      g.add(open, happy, closed, dizzy);
      face.add(g);
      return { g, open, happy, closed, dizzy };
    });
    const mouth = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.08, 4, 12), ink);
    mouth.rotation.z = Math.PI / 2;
    mouth.position.set(0, -0.2, 0.02);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), tongueMat);
    tongue.position.set(0, -0.27, 0.03);
    const cheeks = [-0.45, 0.45].map((x) => {
      const c = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), pink);
      c.position.set(x, -0.08, 0.01);
      c.scale.y = 0.55;
      face.add(c);
      return c;
    });
    face.add(mouth, tongue);

    // Headphones: a band over the top and two cups, tinted with the cover's colour.
    const phones = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f27, roughness: 0.35, metalness: 0.4 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x5b8cff, emissive: 0x5b8cff, emissiveIntensity: 0.6, roughness: 0.3 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.06, 12, 48, Math.PI), dark);
    band.position.y = 0.05;
    phones.add(band);
    for (const s of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.22, 28), dark);
      cup.rotation.z = Math.PI / 2;
      cup.position.set(s * 1.42, -0.05, 0.1);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 24), glow);
      pad.rotation.z = Math.PI / 2;
      pad.position.set(s * 1.55, -0.05, 0.1);
      phones.add(cup, pad);
    }
    body.add(phones);

    // Per-puff state, eased toward the current shape each frame.
    const cur = puffs.map(() => ({ x: 0, y: 0, z: 0, r: 0 }));
    let first = true;
    let blinkAt = performance.now() + 2500;
    let nextTrick = performance.now() + 6000 + Math.random() * 6000;
    let active: { kind: Trick; at: number } | null = null;
    let phonesK = 0;
    let lookX = 0, lookY = 0;
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const w = (el.clientWidth || size) * 1.5;
      const h = (el.clientHeight || size * 0.8) * 1.5;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '150%';
      renderer.domElement.style.height = '150%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // 30 frames a second is plenty for a floating cloud and halves the cost on battery.
      if (now - last < 30) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const L = live.current;
      const sh = SHAPES[L.shape] ?? SHAPES.cloud;
      const k = first ? 1 : 1 - Math.pow(0.0008, dt); // smooth glide between shapes
      first = false;
      puffMat.color.setHex(TINT[L.tint][0]);
      sh.puffs.forEach((p, i) => {
        const [dx, dy] = L.dissolved ? scatter(p, i) : [0, 0];
        // Depth: middle puffs sit forward, outer ones further back, so he reads as round from any side.
        const depth = (1 - Math.min(1, Math.hypot(p[0] - 61, p[1] - 56) / 46)) * 0.42 + Math.sin(i * 2.3) * 0.08;
        const t = { x: W(p[0] + dx), y: H(p[1] + dy), z: L.dissolved ? depth + 0.6 : depth, r: L.dissolved ? 0 : (p[2] / 38) * 1.04 };
        const c = cur[i];
        c.x += (t.x - c.x) * k;
        c.y += (t.y - c.y) * k;
        c.z += (t.z - c.z) * k;
        c.r += (t.r - c.r) * k;
        puffs[i].position.set(c.x, c.y, c.z);
        puffs[i].scale.setScalar(Math.max(0.0001, c.r));
      });

      // The face sits on the front of the shape.
      const [fx, fy, fs] = sh.face;
      const front = Math.max(...cur.map((c) => c.z + c.r * 0.9));
      const lk = LOOKS[L.expr] ?? LOOKS.happy;
      lookX += (L.look.x - lookX) * 0.12;
      lookY += ((lk.up ? -0.8 : 0) + L.look.y - lookY) * 0.12;
      face.position.set(W(fx) + lookX * 0.07, H(fy) - lookY * 0.05, front);
      const fsc = L.dissolved ? 0.0001 : Math.max(0.0001, fs);
      face.scale.setScalar(face.scale.x + (fsc - face.scale.x) * 0.2);
      face.visible = fs > 0;

      // Eyes: open (blinking), happy ^, closed ∪ or dizzy rings.
      if (now > blinkAt) blinkAt = now + 2200 + Math.random() * 3800;
      const blink = Math.max(0, 1 - Math.abs(now - (blinkAt - 120)) / 90);
      eyes.forEach((e, i) => {
        const mode = lk.eyes[i];
        e.open.visible = mode === 'open';
        e.happy.visible = mode === 'happy';
        e.closed.visible = mode === 'closed';
        e.dizzy.visible = mode === 'dizzy';
        const big = lk.big ?? 1;
        e.open.scale.set(big, Math.max(0.08, big * lk.open * (1 - blink * 0.92)), big);
        e.dizzy.rotation.z = now / 160;
      });
      mouth.scale.set(lk.mouth[1], lk.mouth[0] * 1.3, 1);
      tongue.visible = !!lk.tongue;
      pink.opacity += ((lk.cheeks ? 0.85 : 0) - pink.opacity) * 0.1;
      cheeks.forEach((c) => (c.visible = pink.opacity > 0.02));

      // Headphones drop on while music plays.
      phonesK += ((L.headphones && L.shape === 'cloud' && !L.dissolved ? 1 : 0) - phonesK) * 0.12;
      phones.visible = phonesK > 0.02;
      phones.position.y = (1 - phonesK) * 1.2;
      phones.scale.setScalar(0.6 + phonesK * 0.4);

      // Breathing, and turning toward where he looks.
      const breathe = Math.sin(now / 900) * 0.025;
      body.scale.set(1 + breathe * 0.6, 1 - breathe, 1 + breathe * 0.6);
      body.rotation.y = lookX * 0.35 + Math.sin(now / 2600) * 0.06;
      body.rotation.x = lookY * 0.18;

      // Tricks: requested, or now and then on his own.
      if (trickReq.current) (active = { kind: trickReq.current.kind, at: now }), (trickReq.current = null);
      if (!active && L.playful && !L.dissolved && now > nextTrick) {
        active = { kind: TRICKS[Math.floor(Math.random() * TRICKS.length)], at: now };
        nextTrick = now + 9000 + Math.random() * 12000;
      }
      pivot.rotation.set(0, 0, 0);
      pivot.position.set(0, 0, 0);
      pivot.scale.set(1, 1, 1);
      if (active) {
        const dur = { spin: 1100, flip: 1000, roll: 1200, hop: 800, peek: 1600, wobble: 900, twirl: 1500 }[active.kind];
        const t = Math.min(1, (now - active.at) / dur);
        const e = ease(t);
        const arc = Math.sin(t * Math.PI);
        switch (active.kind) {
          case 'spin':
            pivot.rotation.y = e * Math.PI * 2;
            break;
          case 'flip':
            pivot.rotation.x = -e * Math.PI * 2;
            pivot.position.y = arc * 0.5;
            break;
          case 'roll':
            pivot.rotation.z = -e * Math.PI * 2;
            pivot.position.x = Math.sin(t * Math.PI * 2) * 0.25;
            break;
          case 'hop':
            pivot.position.y = Math.abs(Math.sin(t * Math.PI * 2)) * 0.35;
            pivot.scale.set(1 + (1 - arc) * 0.08 * (t < 0.15 || t > 0.85 ? 1 : 0), 1 - (1 - arc) * 0.08 * (t < 0.15 || t > 0.85 ? 1 : 0), 1);
            break;
          case 'peek':
            pivot.rotation.y = Math.sin(t * Math.PI) * 0.9;
            pivot.rotation.z = Math.sin(t * Math.PI) * 0.15;
            break;
          case 'wobble':
            pivot.scale.set(1 + Math.sin(t * Math.PI * 4) * 0.08 * (1 - t), 1 - Math.sin(t * Math.PI * 4) * 0.08 * (1 - t), 1);
            break;
          case 'twirl':
            pivot.rotation.y = e * Math.PI * 4;
            pivot.position.y = arc * 0.3;
            pivot.scale.setScalar(1 - arc * 0.1);
            break;
        }
        if (t >= 1) active = null;
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    const vis = () => (document.hidden ? cancelAnimationFrame(raf) : ((last = performance.now()), (raf = requestAnimationFrame(frame))));
    document.addEventListener('visibilitychange', vis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', vis);
      ro.disconnect();
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
      });
      [puffMat, ink, pink, tongueMat, dark, glow].forEach((m) => m.dispose());
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className={`cloudy-3d ${dissolved ? 'dissolved' : ''}`} style={{ width: size, height: size * 0.8 }} aria-hidden />;
}
