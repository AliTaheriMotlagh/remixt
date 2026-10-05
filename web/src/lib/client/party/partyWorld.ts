"use client";

import * as THREE from "three";

// The live party: a small club in 3D. The host is the DJ in the booth,
// everyone watching is someone on the dance floor, and the room moves with
// the music — the floor and the lights pulse on the beat, the crowd dances
// harder when the music is louder and when reactions pour in. Reactions
// float up from whoever sent them; chat pops up over their head.
//
// Plain three.js, drawn only while visible, sized for phones as well as
// desktops (pixel ratio capped, no shadows, a few hundred meshes at most).

export type PartyPerson = { id: string; name: string; color: string; you?: boolean };

/** What the music is doing now: the beat position (in beats) and how loud each band is (0..1). */
export type PartyMusic = { playing: boolean; beats: number; bpm: number; low: number; mid: number; high: number };

export type CameraMode = "crowd" | "booth" | "orbit" | "top";

type Avatar = {
  id: string;
  you: boolean;
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  label: THREE.Sprite | null;
  home: THREE.Vector3;
  phase: number;
  style: number;
  /** Seconds left of a move started by a reaction. */
  jump: number;
  spin: number;
  handsUp: number;
  bubble: { sprite: THREE.Sprite; left: number } | null;
};

type Floater = { sprite: THREE.Sprite; velocity: THREE.Vector3; life: number; max: number };

const MAX_PEOPLE = 90;
const FLOOR_W = 14;
const FLOOR_D = 10;
const TILE_COLS = 14;
const TILE_ROWS = 10;
const PALETTE = [0x8b5cf6, 0xec4899, 0x06b6d4, 0xf59e0b, 0x84cc16, 0x60a5fa];

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function canvasSprite(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number, scale: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set((w / h) * scale, scale, 1);
  return sprite;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function nameLabel(name: string, highlight: boolean) {
  const text = name.length > 16 ? `${name.slice(0, 15)}…` : name;
  return canvasSprite(
    (ctx, w, h) => {
      ctx.font = "600 34px system-ui, sans-serif";
      const width = Math.min(w - 8, ctx.measureText(text).width + 32);
      ctx.fillStyle = highlight ? "rgba(139,92,246,0.95)" : "rgba(10,10,15,0.7)";
      roundRect(ctx, (w - width) / 2, 6, width, h - 12, 20);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, w / 2, h / 2 + 1);
    },
    320,
    64,
    0.32
  );
}

function bubble(text: string) {
  const line = text.length > 42 ? `${text.slice(0, 41)}…` : text;
  return canvasSprite(
    (ctx, w, h) => {
      ctx.font = "500 30px system-ui, sans-serif";
      const width = Math.min(w - 8, ctx.measureText(line).width + 36);
      const x = (w - width) / 2;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      roundRect(ctx, x, 4, width, h - 26, 18);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w / 2 - 10, h - 23);
      ctx.lineTo(w / 2, h - 6);
      ctx.lineTo(w / 2 + 10, h - 23);
      ctx.fill();
      ctx.fillStyle = "#0a0a0f";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(line, w / 2, (h - 22) / 2 + 4);
    },
    640,
    84,
    0.5
  );
}

const emojiTextures = new Map<string, THREE.CanvasTexture>();
function emojiTexture(emoji: string) {
  let texture = emojiTextures.get(emoji);
  if (!texture) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 96;
    const ctx = canvas.getContext("2d")!;
    ctx.font = "72px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, 48, 54);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    emojiTextures.set(emoji, texture);
  }
  return texture;
}

export class PartyWorld {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  private clock = new THREE.Clock();
  private frame: number | null = null;
  private visible = true;
  private disposed = false;

  private avatars = new Map<string, Avatar>();
  private floaters: Floater[] = [];
  private tiles: THREE.InstancedMesh;
  private tileColor = new THREE.Color();
  private spots: { light: THREE.SpotLight; target: THREE.Object3D; beam: THREE.Mesh; phase: number }[] = [];
  private lasers: THREE.Mesh[] = [];
  private platters: THREE.Mesh[] = [];
  private dj: Avatar;
  private wall: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; title: string; host: string; lastDraw: number };
  private music: () => PartyMusic = () => ({ playing: false, beats: 0, bpm: 120, low: 0, mid: 0, high: 0 });
  /** 0..1, rises with reactions, falls back over a few seconds. */
  private hype = 0;

  private cameraMode: CameraMode = "crowd";
  private portrait = false;
  private orbit = { azimuth: 0, elevation: 0, distance: 1 };
  private drag: { x: number; y: number; azimuth: number; elevation: number } | null = null;
  private pinch: number | null = null;
  private reducedMotion: boolean;

  constructor(
    private canvas: HTMLCanvasElement,
    opts: { hostName: string; hostColor: string; title: string; reducedMotion?: boolean }
  ) {
    this.reducedMotion = !!opts.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(0x07070c);
    this.scene.fog = new THREE.Fog(0x07070c, 12, 30);

    this.scene.add(new THREE.HemisphereLight(0x8080ff, 0x200020, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.35);
    key.position.set(2, 8, 6);
    this.scene.add(key);

    this.buildRoom();
    this.tiles = this.buildFloor();
    this.wall = this.buildBooth(opts.title, opts.hostName);
    this.dj = this.makeAvatar("__dj", opts.hostName, opts.hostColor, false, false);
    this.dj.home.set(0, 1.05, -FLOOR_D / 2 - 1.55);
    this.dj.group.position.copy(this.dj.home);
    this.dj.group.rotation.y = 0;
    this.buildLights();
    this.attachControls();
  }

  // --- Building the room ------------------------------------------------------------------

  private buildRoom() {
    const floorBase = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x0b0b12, roughness: 0.9 })
    );
    floorBase.rotation.x = -Math.PI / 2;
    floorBase.position.y = -0.01;
    this.scene.add(floorBase);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0e0e18, roughness: 1 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), wallMat);
    back.position.set(0, 6, -FLOOR_D / 2 - 4);
    this.scene.add(back);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), wallMat);
      wall.position.set(side * 11, 6, 0);
      wall.rotation.y = -side * (Math.PI / 2);
      this.scene.add(wall);
    }
  }

  private buildFloor() {
    const tileW = FLOOR_W / TILE_COLS;
    const tileD = FLOOR_D / TILE_ROWS;
    const tiles = new THREE.InstancedMesh(
      new THREE.BoxGeometry(tileW * 0.94, 0.04, tileD * 0.94),
      // Unlit: each tile is exactly the colour it's given (lit or dark).
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      TILE_COLS * TILE_ROWS
    );
    const m = new THREE.Matrix4();
    let i = 0;
    for (let r = 0; r < TILE_ROWS; r++) {
      for (let c = 0; c < TILE_COLS; c++) {
        m.setPosition(-FLOOR_W / 2 + tileW * (c + 0.5), 0, -FLOOR_D / 2 + tileD * (r + 0.5));
        tiles.setMatrixAt(i, m);
        tiles.setColorAt(i, new THREE.Color(0x111122));
        i++;
      }
    }
    this.scene.add(tiles);
    return tiles;
  }

  private buildBooth(title: string, host: string) {
    const z = -FLOOR_D / 2 - 1.1;
    const stage = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.5, 3),
      new THREE.MeshStandardMaterial({ color: 0x15151f, roughness: 0.8 })
    );
    stage.position.set(0, 0.25, z - 0.6);
    this.scene.add(stage);
    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.9, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x1d1d2a, roughness: 0.5, metalness: 0.3 })
    );
    desk.position.set(0, 0.95, z);
    this.scene.add(desk);
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(3.22, 0.06, 0.92),
      new THREE.MeshStandardMaterial({ color: 0x8b5cf6, emissive: 0x8b5cf6, emissiveIntensity: 1.2 })
    );
    trim.position.set(0, 0.62, z + 0.0);
    this.scene.add(trim);
    for (const x of [-0.9, 0.9]) {
      const platter = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.36, 0.05, 32),
        new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.6, roughness: 0.3 })
      );
      platter.position.set(x, 1.43, z);
      const dot = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.02, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x06b6d4, emissive: 0x06b6d4, emissiveIntensity: 1 })
      );
      dot.position.set(0, 0.035, 0.12);
      platter.add(dot);
      this.scene.add(platter);
      this.platters.push(platter);
    }
    const mixer = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.06, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x2a2a3a, metalness: 0.4, roughness: 0.4 })
    );
    mixer.position.set(0, 1.43, z);
    this.scene.add(mixer);

    // The LED wall: the title, the DJ, and the spectrum.
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 384;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 3.375),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
    );
    screen.position.set(0, 4.1, -FLOOR_D / 2 - 3.9);
    this.scene.add(screen);
    return { canvas, texture, title, host, lastDraw: 0 };
  }

  private buildLights() {
    for (let i = 0; i < 4; i++) {
      const color = new THREE.Color(PALETTE[i % PALETTE.length]);
      const light = new THREE.SpotLight(color, 40, 22, Math.PI / 9, 0.5, 1.4);
      light.position.set(-6 + i * 4, 8.5, -FLOOR_D / 2 - 1);
      const target = new THREE.Object3D();
      this.scene.add(target);
      light.target = target;
      this.scene.add(light);
      // A visible beam: an open cone, additive, pointing from the light down.
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(1.4, 9, 24, 1, true),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.08,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      beam.geometry.translate(0, -4.5, 0);
      beam.position.copy(light.position);
      this.scene.add(beam);
      this.spots.push({ light, target, beam, phase: i * 1.7 });
    }
    for (let i = 0; i < 6; i++) {
      const laser = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 18, 6),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0x22ff88 : 0xff2266, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      laser.geometry.translate(0, 9, 0);
      laser.position.set(0, 2.6, -FLOOR_D / 2 - 2.2);
      this.scene.add(laser);
      this.lasers.push(laser);
    }
  }

  private makeAvatar(id: string, name: string, color: string, you: boolean, labelled: boolean): Avatar {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.55, emissive: new THREE.Color(color), emissiveIntensity: 0.12 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 10), mat);
    body.position.y = 0.55;
    const skin = new THREE.MeshStandardMaterial({ color: 0xf1d0b5, roughness: 0.7 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), skin);
    head.position.y = 1.08;
    const armGeo = new THREE.CapsuleGeometry(0.06, 0.38, 3, 6);
    const makeArm = (side: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.25, 0.85, 0);
      const arm = new THREE.Mesh(armGeo, mat);
      arm.position.y = -0.22;
      pivot.add(arm);
      return pivot;
    };
    const armL = makeArm(-1);
    const armR = makeArm(1);
    group.add(body, head, armL, armR);
    if (you) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.32, 0.4, 32),
        new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      group.add(ring);
    }
    let label: THREE.Sprite | null = null;
    if (labelled) {
      label = nameLabel(you ? `${name} (you)` : name, you);
      label.position.y = 1.5;
      group.add(label);
    }
    this.scene.add(group);
    return {
      id,
      you,
      group,
      body,
      head,
      armL,
      armR,
      label,
      home: new THREE.Vector3(),
      phase: hash(id) * Math.PI * 2,
      style: Math.floor(hash(id + "s") * 3),
      jump: 0,
      spin: 0,
      handsUp: 0,
      bubble: null,
    };
  }

  private removeAvatar(avatar: Avatar) {
    this.scene.remove(avatar.group);
    avatar.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else if (material) {
        (material as THREE.SpriteMaterial).map?.dispose();
        material.dispose();
      }
    });
  }

  // --- Feeding it ---------------------------------------------------------------------------

  /** Who's on the floor: named people, then `guests` more without names. */
  setCrowd(people: PartyPerson[], guests: number) {
    const wanted: PartyPerson[] = [...people.slice(0, MAX_PEOPLE)];
    for (let i = 0; i < guests && wanted.length < MAX_PEOPLE; i++) {
      wanted.push({ id: `guest-${i}`, name: "Guest", color: `hsl(${Math.round(hash(`g${i}`) * 360)} 45% 55%)` });
    }
    const keep = new Set(wanted.map((p) => p.id));
    for (const [id, avatar] of this.avatars) {
      if (!keep.has(id)) {
        this.removeAvatar(avatar);
        this.avatars.delete(id);
      }
    }
    for (const person of wanted) {
      if (this.avatars.has(person.id)) continue;
      const named = !person.id.startsWith("guest-");
      const avatar = this.makeAvatar(person.id, person.name, person.color, !!person.you, named);
      this.avatars.set(person.id, avatar);
    }
    this.placeCrowd();
  }

  /** Spreads the crowd over the floor, facing the booth: rows that fill from the front. */
  private placeCrowd() {
    const list = [...this.avatars.values()].sort((a, b) => hash(a.id) - hash(b.id));
    const you = list.findIndex((a) => a.you);
    // You stand near the front, in the middle.
    if (you > 0) list.unshift(list.splice(you, 1)[0]);
    list.forEach((avatar, i) => {
      const row = Math.floor(Math.sqrt(i * 1.6));
      const inRow = i - Math.floor((row * row) / 1.6);
      const perRow = Math.max(1, Math.ceil(((row + 1) * (row + 1)) / 1.6) - Math.floor((row * row) / 1.6));
      const spread = Math.min(FLOOR_W - 1.5, 2.2 + row * 1.6);
      const x = perRow === 1 ? 0 : -spread / 2 + (spread * inRow) / (perRow - 1);
      const z = -FLOOR_D / 2 + 1.6 + row * 1.05;
      const jitter = (hash(avatar.id + "j") - 0.5) * 0.4;
      avatar.home.set(x + jitter, 0, Math.min(FLOOR_D / 2 - 0.5, z + jitter));
      avatar.group.position.copy(avatar.home);
      avatar.group.lookAt(new THREE.Vector3(0, 0, -FLOOR_D / 2 - 2));
    });
  }

  setMusicSource(source: () => PartyMusic) {
    this.music = source;
  }

  setTitle(title: string) {
    this.wall.title = title;
  }

  /** A reaction: floats up from whoever sent it (someone on the floor, if we don't know who). */
  react(emoji: string, fromId: string | null) {
    this.hype = Math.min(1, this.hype + 0.08);
    const avatar = (fromId && this.avatars.get(fromId)) || this.randomAvatar();
    const origin = avatar ? avatar.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)) : new THREE.Vector3((Math.random() - 0.5) * 6, 1.2, 0);
    if (avatar) {
      // Some reactions are dance moves.
      if (emoji === "🔥" || emoji === "🤯") avatar.jump = 0.6;
      if (emoji === "💃") avatar.spin = 1;
      if (emoji === "🙌" || emoji === "👏" || emoji === "🎧") avatar.handsUp = 1.6;
    }
    if (this.floaters.length > 80) return;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emoji), transparent: true, depthWrite: false }));
    sprite.scale.set(0.45, 0.45, 1);
    sprite.position.copy(origin);
    this.scene.add(sprite);
    this.floaters.push({ sprite, velocity: new THREE.Vector3((Math.random() - 0.5) * 0.3, 1.1 + Math.random() * 0.4, 0), life: 0, max: 2.4 });
  }

  /** A chat message over the sender's head for a few seconds. */
  say(fromId: string | null, text: string) {
    // Unknown senders (guests) speak from someone unnamed on the floor.
    const guests = [...this.avatars.values()].filter((a) => a.id.startsWith("guest-"));
    const avatar =
      fromId === "__dj"
        ? this.dj
        : (fromId && this.avatars.get(fromId)) || (guests.length ? guests[Math.floor(Math.random() * guests.length)] : null);
    if (!avatar) return;
    if (avatar.bubble) {
      avatar.group.remove(avatar.bubble.sprite);
      avatar.bubble.sprite.material.map?.dispose();
      avatar.bubble.sprite.material.dispose();
    }
    const sprite = bubble(text);
    sprite.position.y = avatar.label ? 1.85 : 1.6;
    avatar.group.add(sprite);
    avatar.bubble = { sprite, left: 4.5 };
  }

  private randomAvatar() {
    const all = [...this.avatars.values()];
    return all.length ? all[Math.floor(Math.random() * all.length)] : null;
  }

  setCameraMode(mode: CameraMode) {
    this.cameraMode = mode;
    this.orbit = { azimuth: 0, elevation: 0, distance: 1 };
  }

  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Portrait screens see less across: step back so the booth and the floor fit.
    this.portrait = width < height;
    this.camera.fov = this.portrait ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (visible && this.frame === null && !this.disposed) this.loop();
  }

  start() {
    this.clock.start();
    this.loop();
  }

  // --- Camera control (drag to look around, wheel/pinch to zoom) ----------------------------

  private attachControls() {
    const c = this.canvas;
    c.style.touchAction = "none";
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    c.addEventListener("touchmove", this.onTouch, { passive: false });
    c.addEventListener("touchend", this.onTouchEnd);
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType === "touch" && !e.isPrimary) return;
    this.drag = { x: e.clientX, y: e.clientY, azimuth: this.orbit.azimuth, elevation: this.orbit.elevation };
    this.canvas.setPointerCapture?.(e.pointerId);
  };
  private onMove = (e: PointerEvent) => {
    if (!this.drag || this.pinch !== null) return;
    this.orbit.azimuth = this.drag.azimuth - (e.clientX - this.drag.x) * 0.006;
    this.orbit.elevation = Math.max(-0.35, Math.min(0.6, this.drag.elevation + (e.clientY - this.drag.y) * 0.004));
  };
  private onUp = () => {
    this.drag = null;
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.orbit.distance = Math.max(0.5, Math.min(1.6, this.orbit.distance * (1 + e.deltaY * 0.001)));
  };
  private onTouch = (e: TouchEvent) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (this.pinch !== null) this.orbit.distance = Math.max(0.5, Math.min(1.6, this.orbit.distance * (this.pinch / d)));
    this.pinch = d;
  };
  private onTouchEnd = () => {
    this.pinch = null;
  };

  // --- The loop -------------------------------------------------------------------------------

  private loop = () => {
    if (this.disposed) return;
    if (!this.visible) {
      this.frame = null;
      return;
    }
    this.frame = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.update(dt, this.clock.elapsedTime);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number, t: number) {
    const m = this.music();
    const motion = this.reducedMotion ? 0.3 : 1;
    const playing = m.playing;
    // Energy: the music's level, or a steady groove when there's no analyser yet.
    const level = playing ? Math.max(0.35, Math.min(1, (m.low * 0.6 + m.mid * 0.3 + m.high * 0.1) * 1.6)) : 0.08;
    this.hype = Math.max(0, this.hype - dt * 0.12);
    const energy = Math.min(1, level * 0.8 + this.hype * 0.6);
    const beat = m.beats;
    const beatFrac = playing ? beat - Math.floor(beat) : (t * 0.5) % 1;
    const kick = playing ? Math.pow(1 - beatFrac, 3) : 0;
    const bar = Math.floor(beat / 4);

    // Floor: a pattern that changes each bar, flashing on the kick.
    for (let r = 0, i = 0; r < TILE_ROWS; r++) {
      for (let c = 0; c < TILE_COLS; c++, i++) {
        const pattern = bar % 4;
        const lit =
          pattern === 0
            ? (r + c + Math.floor(beat)) % 2 === 0
            : pattern === 1
              ? Math.abs(c - TILE_COLS / 2) < ((beat % 4) / 4) * (TILE_COLS / 2) + 1
              : pattern === 2
                ? (c + Math.floor(beat * 2)) % 4 === 0
                : (r + Math.floor(beat)) % 3 === 0;
        const hue = PALETTE[(c + r + bar) % PALETTE.length];
        this.tileColor.setHex(hue).multiplyScalar(playing ? (lit ? 0.25 + 0.75 * kick * energy + 0.15 : 0.05) : 0.04 + 0.03 * Math.sin(t + i));
        this.tiles.setColorAt(i, this.tileColor);
      }
    }
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;

    // Spotlights sweep the floor; beams brighten with the music.
    for (const [i, spot] of this.spots.entries()) {
      const speed = (playing ? 0.6 + energy : 0.2) * motion;
      const x = Math.sin(t * speed + spot.phase) * 5;
      const z = Math.cos(t * speed * 0.8 + spot.phase) * 3;
      spot.target.position.set(x, 0, z);
      spot.light.intensity = playing ? 25 + 60 * energy + 40 * kick : 10;
      const color = new THREE.Color(PALETTE[(i + bar) % PALETTE.length]);
      spot.light.color.copy(color);
      (spot.beam.material as THREE.MeshBasicMaterial).color.copy(color);
      (spot.beam.material as THREE.MeshBasicMaterial).opacity = playing ? 0.05 + 0.1 * energy : 0.03;
      spot.beam.lookAt(spot.target.position);
      spot.beam.rotateX(-Math.PI / 2);
    }

    // Lasers come out when it gets loud (or the crowd goes wild).
    const laserOn = playing && energy > 0.6;
    for (const [i, laser] of this.lasers.entries()) {
      const material = laser.material as THREE.MeshBasicMaterial;
      material.opacity = laserOn ? 0.55 * (0.5 + 0.5 * kick) : Math.max(0, material.opacity - dt * 2);
      laser.rotation.z = Math.sin(t * 1.3 * motion + i) * 0.9;
      laser.rotation.x = -1.15 + Math.sin(t * 0.7 + i * 0.5) * 0.2;
    }

    // The decks spin while the music plays.
    for (const platter of this.platters) platter.rotation.y -= playing ? dt * Math.PI * 2 * (33.3 / 60) : 0;

    // The DJ nods on the beat and works the decks.
    this.animateAvatar(this.dj, dt, t, beat, playing, energy * 0.7, true);
    for (const avatar of this.avatars.values()) this.animateAvatar(avatar, dt, t, beat, playing, energy, false);

    // Reactions drift up and fade.
    this.floaters = this.floaters.filter((f) => {
      f.life += dt;
      f.sprite.position.addScaledVector(f.velocity, dt);
      f.sprite.material.opacity = Math.max(0, 1 - f.life / f.max);
      if (f.life < f.max) return true;
      this.scene.remove(f.sprite);
      f.sprite.material.dispose();
      return false;
    });

    this.drawWall(t, m, energy);
    this.placeCamera(t);
  }

  private animateAvatar(a: Avatar, dt: number, t: number, beat: number, playing: boolean, energy: number, isDj: boolean) {
    const p = beat * Math.PI + a.phase * 0.15;
    const amount = playing ? 0.35 + energy * 0.65 : 0.12;
    const bob = Math.abs(Math.sin(playing ? p : t * 1.2 + a.phase)) * 0.12 * amount;
    a.jump = Math.max(0, a.jump - dt);
    a.spin = Math.max(0, a.spin - dt);
    a.handsUp = Math.max(0, a.handsUp - dt);
    const jumpY = a.jump > 0 ? Math.sin((a.jump / 0.6) * Math.PI) * 0.5 : 0;
    a.group.position.y = a.home.y + bob + jumpY;
    if (!isDj) {
      const sway = Math.sin(p * 0.5) * 0.12 * amount;
      a.group.position.x = a.home.x + (a.style === 1 ? sway : 0);
      a.body.rotation.z = a.style === 2 ? sway * 1.5 : sway * 0.5;
      if (a.spin > 0) a.group.rotation.y += dt * Math.PI * 4;
      else a.group.lookAt(new THREE.Vector3(0, a.group.position.y, -FLOOR_D / 2 - 2));
    }
    a.head.rotation.x = playing ? Math.sin(p * 2) * 0.18 * amount : 0;
    // Arms: up in the air when hyped, pumping on the beat otherwise.
    const up = a.handsUp > 0 || (playing && energy > 0.8 && a.style === 0);
    const pump = playing ? Math.abs(Math.sin(p)) * 0.6 * amount : 0.05;
    if (isDj) {
      a.armL.rotation.x = -1.1 + Math.sin(t * 3) * 0.15;
      a.armR.rotation.x = -1.1 + Math.sin(t * 2.3 + 1) * 0.2;
    } else {
      a.armL.rotation.z = up ? Math.PI - 0.3 + Math.sin(p) * 0.2 : 0.15 + pump;
      a.armR.rotation.z = up ? -(Math.PI - 0.3) - Math.sin(p) * 0.2 : -0.15 - pump;
      a.armL.rotation.x = up ? 0 : -pump * 0.6;
      a.armR.rotation.x = up ? 0 : -pump * 0.6;
    }
    if (a.bubble) {
      a.bubble.left -= dt;
      a.bubble.sprite.material.opacity = Math.min(1, a.bubble.left);
      if (a.bubble.left <= 0) {
        a.group.remove(a.bubble.sprite);
        a.bubble.sprite.material.map?.dispose();
        a.bubble.sprite.material.dispose();
        a.bubble = null;
      }
    }
  }

  private drawWall(t: number, m: PartyMusic, energy: number) {
    if (t - this.wall.lastDraw < 1 / 30) return;
    this.wall.lastDraw = t;
    const { canvas, texture } = this.wall;
    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const h = canvas.height;
    const g = ctx.createLinearGradient(0, 0, w, h);
    const hueShift = (t * 20) % 360;
    g.addColorStop(0, `hsl(${(270 + hueShift) % 360} 70% ${m.playing ? 14 + energy * 10 : 8}%)`);
    g.addColorStop(1, `hsl(${(190 + hueShift) % 360} 70% ${m.playing ? 12 + energy * 8 : 6}%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Spectrum bars, from the real bands when there are any.
    const bars = 48;
    for (let i = 0; i < bars; i++) {
      const band = i < bars / 3 ? m.low : i < (bars * 2) / 3 ? m.mid : m.high;
      const wobble = 0.5 + 0.5 * Math.sin(t * 6 + i * 0.7);
      const v = m.playing ? Math.min(1, band * (0.6 + 0.6 * wobble) + 0.05) : 0.03 + 0.02 * wobble;
      const bh = v * h * 0.55;
      ctx.fillStyle = `hsl(${(i / bars) * 300 + hueShift} 85% 60%)`;
      ctx.fillRect(16 + (i * (w - 32)) / bars, h - bh - 12, (w - 32) / bars - 4, bh);
    }
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "800 64px system-ui, sans-serif";
    ctx.fillText(this.wall.title.length > 28 ? `${this.wall.title.slice(0, 27)}…` : this.wall.title, w / 2, 96);
    ctx.font = "600 36px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(m.playing ? `DJ ${this.wall.host} · ${Math.round(m.bpm)} BPM` : `DJ ${this.wall.host}`, w / 2, 150);
    texture.needsUpdate = true;
  }

  private placeCamera(t: number) {
    const { azimuth, elevation, distance } = this.orbit;
    const look = new THREE.Vector3(0, 1.6, -FLOOR_D / 2 - 0.8);
    let pos: THREE.Vector3;
    if (this.cameraMode === "booth") {
      pos = new THREE.Vector3(0, 3.2, -FLOOR_D / 2 - 2.6);
      look.set(0, 0.8, 2);
    } else if (this.cameraMode === "top") {
      pos = new THREE.Vector3(0, 14, 2);
      look.set(0, 0, -1);
    } else if (this.cameraMode === "orbit") {
      const a = t * 0.12 * (this.reducedMotion ? 0.3 : 1);
      pos = new THREE.Vector3(Math.sin(a) * 11, 5.5, Math.cos(a) * 9 - 1);
      look.set(0, 1.2, -1.5);
    } else if (this.portrait) {
      // A tall phone screen: closer in and higher, so the booth isn't a speck.
      pos = new THREE.Vector3(0, 4.2, FLOOR_D / 2 - 0.5);
      look.set(0, 1.4, -FLOOR_D / 2 - 1.2);
    } else {
      pos = new THREE.Vector3(0, 3.4, FLOOR_D / 2 + 3.5);
    }
    // The viewer's own drag and zoom on top of the mode's position.
    const offset = pos.clone().sub(look);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += azimuth;
    spherical.phi = Math.max(0.15, Math.min(Math.PI / 2 - 0.05, spherical.phi - elevation));
    spherical.radius *= distance;
    pos = look.clone().add(new THREE.Vector3().setFromSpherical(spherical));
    this.camera.position.lerp(pos, 0.12);
    this.camera.lookAt(look);
  }

  dispose() {
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("touchmove", this.onTouch);
    c.removeEventListener("touchend", this.onTouchEnd);
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
    this.wall.texture.dispose();
    this.renderer.dispose();
  }
}
