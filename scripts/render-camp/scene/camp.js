// Сцена лагеря на three.js. render.mjs открывает её в Chromium и снимает картинки:
// поляну без фигур при трёх освещениях, костёр отдельным слоем и каждую фигурку на её месте.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const W = 780;
export const H = 840;

const KK = '/kaykit';
const ADV = `${KK}/KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures/Characters/gltf`;
const SKL = `${KK}/KayKit-Character-Pack-Skeletons-1.0/addons/kaykit_character_pack_skeletons`;
const HEX = `${KK}/KayKit-Medieval-Hexagon-Pack-1.0/addons/kaykit_medieval_hexagon_pack/Assets/gltf/decoration`;
const DUN = `${KK}/KayKit-Dungeon-Remastered-1.0/addons/kaykit_dungeon_remastered/Assets/gltf`;
const HAL = `${KK}/KayKit-Halloween-Bits-1.0/addons/kaykit_halloween_bits/Assets/gltf`;

// ---------- раскладка ----------

const SEAT_R = 2.3;
/** KayKit-персонажи ростом около 2.5; в лагере они ростом чуть больше метра. */
const CHAR = 0.5;
/** Насколько сдвинуть сидящего к огню, чтобы он сел на бревно, а не за него. */
const SIT_IN = 0.24;
const LIE_OFF = 0.55;
function polar(deg, r) {
  const a = (deg * Math.PI) / 180;
  return [Math.cos(a) * r, -Math.sin(a) * r];
}

/** Места на поляне: [x, z]. Костёр в начале координат, камера смотрит с +z. */
export const SPOTS = {
  ring: polar(342, 2.15),
  seat0: polar(152, SEAT_R),
  seat1: polar(108, SEAT_R),
  seat2: polar(64, SEAT_R),
  seat3: polar(203, SEAT_R),
  seat4: polar(246, SEAT_R),
  seat5: polar(292, SEAT_R),
  // Нежить идёт по дороге кучкой прямо за лагерем, чтобы не уходить под верхнюю полосу экрана.
  road0: [0.5, -3.75],
  road1: [1.3, -4.35],
  road2: [0.6, -5.0],
};

const CHEST = [2.55, -0.55];
const MESSENGER = [-1.85, -3.95];

function roadX(z) {
  // Дорога выходит из леса сверху и плавно подходит к лагерю.
  return 0.55 + Math.sin((-z - 3) * 0.32) * 0.75;
}

// ---------- рендер ----------

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 200);
camera.position.set(0, 10.6, 9.3);
camera.lookAt(0, 0, -1.9);

const loader = new GLTFLoader();
const cache = new Map();
function load(url) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url);
}

function shadows(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return obj;
}

async function prop(url, x, z, { rot = 0, scale = 1, y = 0 } = {}) {
  const g = await load(url);
  const o = g.scene.clone(true);
  o.position.set(x, y, z);
  o.rotation.y = rot;
  o.scale.setScalar(scale);
  return shadows(o);
}

const lambert = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...extra });

// ---------- свет ----------

const hemi = new THREE.HemisphereLight(0xdcefff, 0x4d6b2c, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 3;
scene.add(sun);
scene.add(sun.target);
const fireLight = new THREE.PointLight(0xffa24a, 6, 9, 1.6);
fireLight.position.set(0, 0.9, 0);
fireLight.castShadow = true;
fireLight.shadow.mapSize.set(1024, 1024);
fireLight.shadow.bias = -0.002;
scene.add(fireLight);

const LIGHTS = {
  day: { hemi: [0xdcefff, 0x4d6b2c, 1.0], sun: [0xfff4e0, 2.4, [7, 14, 6]], fire: 6, ground: 0x62a33f, exposure: 1.05 },
  evening: { hemi: [0xffc9a0, 0x3b3a4a, 0.55], sun: [0xff9a55, 2.0, [-12, 5, 3]], fire: 14, ground: 0x5d8f3a, exposure: 1.0 },
  night: { hemi: [0x6a80c8, 0x1a2236, 0.62], sun: [0x9fb4ff, 0.9, [5, 12, -8]], fire: 20, ground: 0x4a7a3c, exposure: 1.05 },
};

let groundMat;
function setLight(mode) {
  const L = LIGHTS[mode];
  hemi.color.set(L.hemi[0]);
  hemi.groundColor.set(L.hemi[1]);
  hemi.intensity = L.hemi[2];
  sun.color.set(L.sun[0]);
  sun.intensity = L.sun[1];
  sun.position.set(...L.sun[2]);
  fireLight.intensity = L.fire;
  if (groundMat) groundMat.color.set(L.ground);
  renderer.toneMappingExposure = L.exposure;
}

// ---------- поляна ----------

const world = new THREE.Group();
scene.add(world);
const seatLogs = {};
const fireGroup = new THREE.Group();
let fireGlow;

function radialTexture(inner, outer, soft = 0.25) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, inner);
  grd.addColorStop(1 - soft, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildGround() {
  groundMat = lambert(LIGHTS.day.ground);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80, 1, 1), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);

  // Утоптанная земля вокруг костра.
  const dirt = new THREE.Mesh(
    new THREE.CircleGeometry(3.55, 48),
    new THREE.MeshStandardMaterial({ map: radialTexture('rgba(150,112,66,1)', 'rgba(150,112,66,0)', 0.3), transparent: true, roughness: 1, depthWrite: false }),
  );
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.y = 0.01;
  dirt.receiveShadow = true;
  world.add(dirt);

  // Дорога в лес.
  const pts = [];
  for (let z = -2.6; z >= -24; z -= 0.4) pts.push(new THREE.Vector3(roadX(z), 0.012, z));
  const curve = new THREE.CatmullRomCurve3(pts);
  const segs = 120;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const n = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const w = 0.78 + 0.12 * Math.sin(i * 0.7);
    pos.push(p.x + n.x * w, 0.012, p.z + n.z * w, p.x - n.x * w, 0.012, p.z - n.z * w);
    uv.push(0, t, 1, t);
    if (i < segs) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  rg.setIndex(idx);
  rg.computeVertexNormals();
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 4;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 64, 0);
  grd.addColorStop(0, 'rgba(160,122,74,0)');
  grd.addColorStop(0.22, 'rgba(160,122,74,1)');
  grd.addColorStop(0.78, 'rgba(160,122,74,1)');
  grd.addColorStop(1, 'rgba(160,122,74,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const road = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, depthWrite: false, side: THREE.DoubleSide }));
  road.receiveShadow = true;
  world.add(road);

  // Пучки травы.
  const r = rand(7);
  const tuftGeo = new THREE.ConeGeometry(0.07, 0.32, 4);
  const tuftMat = lambert(0x4f8a30);
  for (let i = 0; i < 260; i++) {
    const x = (r() - 0.5) * 22;
    const z = 6 - r() * 22;
    if (Math.hypot(x, z) < 3.7) continue;
    if (Math.abs(x - roadX(z)) < 1.1 && z < -2) continue;
    const m = new THREE.Mesh(tuftGeo, tuftMat);
    m.position.set(x, 0.14, z);
    m.rotation.y = r() * 3;
    m.scale.setScalar(0.7 + r() * 0.8);
    m.castShadow = true;
    world.add(m);
  }
}

function buildFire() {
  const stoneMat = lambert(0x8e8c86);
  const r = rand(3);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + r() * 0.06, 0), stoneMat);
    s.position.set(Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62);
    s.scale.set(1, 0.7, 1);
    s.rotation.set(r(), r(), r());
    fireGroup.add(s);
  }
  const logMat = lambert(0x6a4527);
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.95, 6), logMat);
    const a = (i / 4) * Math.PI * 2 + 0.4;
    log.position.set(Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12);
    log.rotation.set(Math.PI / 2 - 0.55, 0, 0);
    log.rotation.order = 'YXZ';
    log.rotation.y = a + Math.PI / 2;
    fireGroup.add(log);
  }
  const flame = (h, rad, color, x, z, rot, tilt = 0) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 5), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, 0.2 + h / 2, z);
    m.rotation.set(tilt, rot, tilt * 0.6);
    fireGroup.add(m);
  };
  flame(0.95, 0.24, 0xe8551c, 0, 0, 0);
  flame(0.7, 0.2, 0xf27a24, 0.16, 0.06, 1, 0.18);
  flame(0.66, 0.19, 0xf27a24, -0.15, -0.04, 2, -0.2);
  flame(0.58, 0.17, 0xf59a2e, 0.04, -0.16, 0.7, -0.15);
  flame(0.5, 0.15, 0xffc04a, -0.05, 0.13, 1.4, 0.12);
  flame(0.38, 0.11, 0xffe08a, 0.02, 0.02, 0.3);
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  const er = rand(5);
  for (let i = 0; i < 10; i++) {
    const e = new THREE.Mesh(new THREE.TetrahedronGeometry(0.035 + er() * 0.02), emberMat);
    const a = er() * Math.PI * 2;
    const rr = 0.1 + er() * 0.25;
    e.position.set(Math.cos(a) * rr, 1.0 + er() * 0.7, Math.sin(a) * rr);
    e.rotation.set(er() * 3, er() * 3, 0);
    fireGroup.add(e);
  }
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 32),
    new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,170,70,0.55)', 'rgba(255,170,70,0)', 0.95), transparent: true, depthWrite: false }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  fireGroup.add(glow);
  fireGlow = glow;
  shadows(fireGroup, false, true);
  world.add(fireGroup);
}

function seatLog(name) {
  const [x, z] = SPOTS[name];
  const g = new THREE.Group();
  const bark = lambert(0x7a5230);
  const cut = lambert(0xc9a26b);
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.15, 8), bark);
  log.rotation.z = Math.PI / 2;
  log.position.y = 0.2;
  g.add(log);
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.2, 8), cut);
    cap.position.set(sx * 0.576, 0.2, 0);
    cap.rotation.y = (sx * Math.PI) / 2;
    g.add(cap);
  }
  g.position.set(x, 0, z);
  // Бревно лежит поперёк луча от костра.
  g.rotation.y = Math.atan2(x, z);
  return shadows(g);
}

/** Палатка-шалаш: полотно на двух скатах, тёмный вход к костру, полоса цвета похода по коньку. */
function tent(x, z, rot, stripe) {
  const g = new THREE.Group();
  const w = 0.9;
  const h = 1.25;
  const d = 1.7;
  const canvas = lambert(0xe9dcbc, { side: THREE.DoubleSide });
  const shade = lambert(0xcbb98f, { side: THREE.DoubleSide });
  const slope = (sx, mat) => {
    const geo = new THREE.BufferGeometry();
    const v = [0, h, -d / 2, 0, h, d / 2, sx * w, 0, d / 2, 0, h, -d / 2, sx * w, 0, d / 2, sx * w, 0, -d / 2];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  };
  g.add(slope(1, canvas), slope(-1, shade));
  const tri = (zz, mat) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, zz, w, 0, zz, 0, h, zz], 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  };
  g.add(tri(-d / 2, shade));
  const door = tri(d / 2 + 0.005, lambert(0x3a2a1c, { side: THREE.DoubleSide }));
  door.scale.set(0.55, 0.72, 1);
  g.add(door);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, d + 0.12), lambert(stripe));
  ridge.position.y = h;
  g.add(ridge);
  for (const zz of [-d / 2 - 0.05, d / 2 + 0.05]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h + 0.35, 5), lambert(0x6a4527));
    pole.position.set(0, (h + 0.35) / 2, zz);
    g.add(pole);
  }
  const pennant = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 3), lambert(stripe));
  pennant.rotation.z = -Math.PI / 2;
  pennant.position.set(0.2, h + 0.28, d / 2 + 0.05);
  g.add(pennant);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  return shadows(g);
}

async function buildProps() {
  for (const name of Object.keys(SPOTS)) {
    if (!name.startsWith('seat')) continue;
    seatLogs[name] = seatLog(name);
    world.add(seatLogs[name]);
  }

  world.add(tent(-3.0, -2.75, 0.5, 0x3d5fa8));
  world.add(tent(3.15, -2.6, -0.55, 0xb8452f));
  world.add(await prop(`${DUN}/chest_gold.glb`, CHEST[0], CHEST[1], { rot: -0.75, scale: CHAR }));
  world.add(await prop(`${HEX}/props/barrel.gltf`, -3.3, 0.3, { scale: 2.8 }));
  world.add(await prop(`${HEX}/props/crate_A_small.gltf`, -3.05, 0.95, { rot: 0.4, scale: 3.2 }));
  world.add(await prop(`${HEX}/props/sack.gltf`, -3.7, 0.95, { rot: 0.8, scale: 3.6 }));
  world.add(await prop(`${HEX}/props/weaponrack.gltf`, 3.55, 0.75, { rot: -1.1, scale: 3.4 }));
  world.add(await prop(`${HEX}/props/resource_lumber.gltf`, -3.45, -4.35, { rot: 0.5, scale: 2.8 }));
  world.add(await prop(`${HEX}/props/flag_red.gltf`, -4.6, -3.9, { rot: 0.4, scale: 6 }));
  world.add(await prop(`${HEX}/props/flag_blue.gltf`, 4.75, -3.6, { rot: -0.4, scale: 6 }));
  // Вестник: столб с фонарём у дороги, сюда приходят письма.
  world.add(await prop(`${HAL}/post_lantern.gltf`, MESSENGER[0], MESSENGER[1], { rot: 0.3, scale: CHAR }));
  world.add(await prop(`${HEX}/props/crate_open.gltf`, MESSENGER[0] + 0.6, MESSENGER[1] + 0.35, { rot: 0.2, scale: 2.4 }));

  const trees = [
    `${HEX}/nature/tree_single_A.gltf`,
    `${HEX}/nature/tree_single_B.gltf`,
    `${HEX}/nature/trees_A_medium.gltf`,
    `${HEX}/nature/trees_B_medium.gltf`,
    `${HEX}/nature/trees_A_large.gltf`,
  ];
  const autumn = [`${HAL}/tree_pine_yellow_large.gltf`, `${HAL}/tree_pine_orange_medium.gltf`, `${HAL}/tree_pine_yellow_medium.gltf`];
  const r = rand(11);
  const placed = [];
  const tryTree = async (x, z, big) => {
    if (Math.hypot(x / 6.4, z / 5.6) < 1) return;
    if (z < -2 && Math.abs(x - roadX(z)) < 1.9) return;
    for (const [px, pz] of placed) if (Math.hypot(px - x, pz - z) < 1.4) return;
    placed.push([x, z]);
    const isAutumn = r() < 0.22;
    const url = isAutumn ? autumn[Math.floor(r() * autumn.length)] : trees[Math.floor(r() * trees.length)];
    const scale = isAutumn ? CHAR * (0.85 + r() * 0.35) : (big ? 3.3 : 2.8) + r() * 0.8;
    world.add(await prop(url, x, z, { rot: r() * 6.28, scale }));
  };
  for (let i = 0; i < 140; i++) {
    const x = (r() - 0.5) * 24;
    const z = 3 - r() * 26;
    await tryTree(x, z, z < -8);
  }
  const rocks = ['A', 'B', 'C', 'D', 'E'].map((k) => `${HEX}/nature/rock_single_${k}.gltf`);
  const rocksAt = [
    [-1.9, 3.6],
    [2.7, 3.2],
    [-4.9, 2.6],
    [1.9, -5.3],
    [-0.9, -7.6],
    [5.1, 2.9],
  ];
  for (let i = 0; i < rocksAt.length; i++) {
    world.add(await prop(rocks[i % rocks.length], rocksAt[i][0], rocksAt[i][1], { rot: r() * 6, scale: 3 + r() * 1.5 }));
  }
}

// ---------- фигуры ----------

const BODY = /_(Arm|Leg|Body|Head|Eyes|Jaw|Skull)/;

/**
 * Герои: у каждого класса пять обликов. Первый (без буквы) прежний, «-b»…«-e» собраны из снаряжения,
 * которое лежит в той же модели выключенным. Плащ (cape) есть у всех: приложение красит его в цвет похода.
 */
const CHARS = {
  rogue: {
    file: `${ADV}/Rogue_Hooded.glb`,
    cape: 'Rogue_Cape',
    show: ['Knife'],
    work: ['Use_Item', 0.55],
  },
  'rogue-b': {
    file: `${ADV}/Rogue.glb`,
    cape: 'Rogue_Cape',
    show: ['2H_Crossbow'],
    work: ['2H_Ranged_Reload', 0.5],
  },
  'rogue-c': {
    file: `${ADV}/Rogue_Hooded.glb`,
    cape: 'Rogue_Cape',
    show: ['1H_Crossbow', 'Knife_Offhand'],
    work: ['Use_Item', 0.55],
  },
  'rogue-d': {
    file: `${ADV}/Rogue.glb`,
    cape: 'Rogue_Cape',
    show: ['Knife', 'Knife_Offhand'],
    work: ['Use_Item', 0.55],
  },
  'rogue-e': {
    file: `${ADV}/Rogue_Hooded.glb`,
    cape: 'Rogue_Cape',
    show: ['Throwable'],
    work: ['Throw', 0.35],
  },
  barbarian: {
    file: `${ADV}/Barbarian.glb`,
    cape: 'Barbarian_Cape',
    show: ['Barbarian_Hat', '2H_Axe'],
    work: ['2H_Melee_Attack_Chop', 0.32],
  },
  'barbarian-b': {
    file: `${ADV}/Barbarian.glb`,
    cape: 'Barbarian_Cape',
    show: ['1H_Axe', 'Barbarian_Round_Shield'],
    work: ['1H_Melee_Attack_Chop', 0.32],
  },
  'barbarian-c': {
    file: `${ADV}/Barbarian.glb`,
    cape: 'Barbarian_Cape',
    show: ['Barbarian_Hat', 'Mug', '1H_Axe_Offhand'],
    work: ['Interact', 0.6],
  },
  'barbarian-d': {
    file: `${ADV}/Barbarian.glb`,
    cape: 'Barbarian_Cape',
    show: ['Barbarian_Hat', '1H_Axe', '1H_Axe_Offhand'],
    work: ['Dualwield_Melee_Attack_Chop', 0.32],
  },
  'barbarian-e': {
    file: `${ADV}/Barbarian.glb`,
    cape: 'Barbarian_Cape',
    show: ['2H_Axe'],
    work: ['2H_Melee_Attack_Chop', 0.32],
  },
  mage: {
    file: `${ADV}/Mage.glb`,
    cape: 'Mage_Cape',
    show: ['Mage_Hat', '2H_Staff'],
    work: ['Spellcasting', 0.5],
  },
  'mage-b': {
    file: `${ADV}/Mage.glb`,
    cape: 'Mage_Cape',
    show: ['1H_Wand', 'Spellbook_open'],
    work: ['Spellcasting', 0.5],
  },
  'mage-c': {
    file: `${ADV}/Mage.glb`,
    cape: 'Mage_Cape',
    show: ['Mage_Hat', '1H_Wand', 'Spellbook'],
    work: ['Spellcasting', 0.5],
  },
  'mage-d': {
    file: `${ADV}/Mage.glb`,
    cape: 'Mage_Cape',
    show: ['2H_Staff'],
    work: ['Spellcasting', 0.5],
  },
  'mage-e': {
    file: `${ADV}/Mage.glb`,
    cape: 'Mage_Cape',
    show: ['Mage_Hat', '2H_Staff', 'Spellbook_open'],
    work: ['Spellcasting', 0.5],
  },
  knight: {
    file: `${ADV}/Knight.glb`,
    cape: 'Knight_Cape',
    show: ['Knight_Helmet', '1H_Sword', 'Round_Shield'],
    work: ['Interact', 0.6],
  },
  'knight-b': {
    file: `${ADV}/Knight.glb`,
    cape: 'Knight_Cape',
    show: ['2H_Sword'],
    work: ['Interact', 0.6],
  },
  'knight-c': {
    file: `${ADV}/Knight.glb`,
    cape: 'Knight_Cape',
    show: ['Knight_Helmet', '1H_Sword', 'Rectangle_Shield'],
    work: ['Interact', 0.6],
  },
  'knight-d': {
    file: `${ADV}/Knight.glb`,
    cape: 'Knight_Cape',
    show: ['Knight_Helmet', '1H_Sword', 'Spike_Shield'],
    work: ['Interact', 0.6],
  },
  'knight-e': {
    file: `${ADV}/Knight.glb`,
    cape: 'Knight_Cape',
    show: ['1H_Sword', 'Badge_Shield'],
    work: ['Interact', 0.6],
  },
};

const UNDEAD = {
  minion: { file: `${SKL}/Characters/gltf/Skeleton_Minion.glb`, r: 'Skeleton_Axe' },
  rogue: { file: `${SKL}/Characters/gltf/Skeleton_Rogue.glb`, r: 'Skeleton_Crossbow' },
  warrior: { file: `${SKL}/Characters/gltf/Skeleton_Warrior.glb`, r: 'Skeleton_Blade', l: 'Skeleton_Shield_Small_A' },
  mage: { file: `${SKL}/Characters/gltf/Skeleton_Mage.glb`, r: 'Skeleton_Staff' },
};

const POSES = {
  sit: ['Sit_Chair_Pose', 0],
  lie: ['Lie_Pose', 0],
  cheer: ['Cheer', 0.45],
};

async function makeCharacter(who, pose) {
  let file;
  let show = [];
  let clipName;
  let t;
  let weapons = null;
  if (who.startsWith('skeleton-')) {
    const u = UNDEAD[who.slice(9)];
    file = u.file;
    weapons = u;
    [clipName, t] = ['Idle_Combat', 0.4];
  } else {
    const c = CHARS[who];
    file = c.file;
    show = [c.cape, ...c.show];
    [clipName, t] = pose === 'work' ? c.work : POSES[pose];
  }
  const g = await load(file);
  const obj = cloneSkinned(g.scene);
  obj.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      const base = o.name;
      if (!BODY.test(base) && !show.includes(base) && !base.startsWith('Skeleton_')) o.visible = false;
      o.frustumCulled = false;
    }
  });
  if (weapons) {
    for (const side of ['r', 'l']) {
      if (!weapons[side]) continue;
      const slot = obj.getObjectByName(`handslot.${side}`);
      const wg = await load(`${SKL}/Assets/gltf/${weapons[side]}.gltf`);
      if (slot) slot.add(wg.scene.clone(true));
    }
  }
  const clip = THREE.AnimationClip.findByName(g.animations, clipName);
  const mixer = new THREE.AnimationMixer(obj);
  if (clip) {
    mixer.clipAction(clip).play();
    mixer.setTime(t * clip.duration);
  }
  obj.scale.setScalar(CHAR);
  return shadows(obj, true, true);
}

function faceFire(obj, x, z) {
  obj.rotation.y = Math.atan2(-x, -z);
}

const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.32 }));
catcher.rotation.x = -Math.PI / 2;
catcher.position.y = 0.003;
catcher.receiveShadow = true;

// ---------- снимки ----------

const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });

/**
 * Плащ отдельным слоем: белый, с тем же светом и тенями, а тело и бревно только заслоняют его.
 * Приложение умножает этот слой на цвет похода и кладёт поверх фигуры.
 */
function capeShot(ch, capeName, others) {
  const saved = [];
  let found = false;
  for (const root of [ch, ...others]) {
    root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      saved.push([o, o.material]);
      if (root === ch && o.name === capeName) {
        found = true;
        o.material = o.material.clone();
        o.material.map = null;
        o.material.color.set(0xffffff);
      } else {
        o.material = depthOnly;
      }
    });
  }
  const url = found ? shot(true) : null;
  for (const [o, m] of saved) o.material = m;
  return url;
}

function shot(transparent) {
  renderer.setClearColor(0x000000, transparent ? 0 : 1);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
}

function onlyThese(objects) {
  const keep = new Set(objects);
  world.children.forEach((c) => (c.visible = keep.has(c)));
}

function allWorld() {
  world.children.forEach((c) => (c.visible = true));
}

export function project(x, y, z) {
  camera.updateMatrixWorld();
  const v = new THREE.Vector3(x, y, z).project(camera);
  return [Math.round(((v.x + 1) / 2) * W), Math.round(((1 - v.y) / 2) * H)];
}

async function renderBackground(light) {
  setLight(light);
  allWorld();
  scene.remove(catcher);
  return shot(false);
}

// Слой костра поверх фигур, что сидят за ним: камни, поленья и пламя, без отсвета на земле.
async function renderFire(light) {
  setLight(light);
  onlyThese([fireGroup]);
  fireGlow.visible = false;
  const url = shot(true);
  fireGlow.visible = true;
  allWorld();
  return url;
}

/** Ставит фигуру на её место: на бревне лицом к огню, у огня вполоборота, на дороге к зрителю. */
function place(ch, spot, pose) {
  const [x, z] = SPOTS[spot];
  if (spot.startsWith('seat')) {
    const out = Math.hypot(x, z);
    if (pose === 'lie') {
      // Спит вдоль бревна между ним и огнём: так спящие не уходят за край картинки.
      const k = (out - LIE_OFF) / out;
      ch.position.set(x * k, 0, z * k);
      faceFire(ch, x, z);
      ch.rotation.y += Math.PI / 2;
    } else {
      const k = (out - SIT_IN) / out;
      ch.position.set(x * k, 0, z * k);
      faceFire(ch, x, z);
    }
  } else if (spot === 'ring') {
    ch.position.set(x, 0, z);
    faceFire(ch, x, z);
    // Стоит у огня вполоборота к зрителю.
    ch.rotation.y += 0.55;
  } else {
    ch.position.set(x, 0, z);
    ch.rotation.y = Math.atan2(-x * 0.3, 1) + 0.15;
  }
}

async function renderSprite(spot, who, pose, light) {
  setLight(light);
  const ch = await makeCharacter(who, pose);
  // Сидящий заслоняет своё бревно, поэтому бревно снимается вместе с ним.
  const keep = spot.startsWith('seat') ? [seatLogs[spot]] : [];
  place(ch, spot, pose);
  onlyThese(keep);
  world.add(ch);
  // Макушка фигуры на картинке: над ней встаёт номер задачи.
  ch.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(ch);
  const head = project((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
  scene.add(catcher);
  const url = shot(true);
  scene.remove(catcher);
  const capeName = CHARS[who]?.cape;
  const cape = capeName ? capeShot(ch, capeName, keep) : null;
  world.remove(ch);
  allWorld();
  return { url, head, cape };
}

/** Для проверки на глаз: вся поляна с фигурами сразу. */
async function renderPreview(light, figures) {
  setLight(light);
  allWorld();
  const added = [];
  for (const [spot, who, pose] of figures) {
    const ch = await makeCharacter(who, pose);
    place(ch, spot, pose);
    world.add(ch);
    added.push(ch);
  }
  const url = shot(false);
  for (const ch of added) world.remove(ch);
  return url;
}

async function bbox(url) {
  const g = await load(url);
  const b = new THREE.Box3().setFromObject(g.scene);
  return { min: b.min.toArray(), max: b.max.toArray() };
}

window.camp = {
  ready: (async () => {
    buildGround();
    buildFire();
    await buildProps();
    setLight('day');
  })(),
  renderBackground,
  renderFire,
  renderSprite,
  renderPreview,
  project,
  bbox,
  heroes: Object.keys(CHARS),
  spots: SPOTS,
  chest: CHEST,
  messenger: MESSENGER,
  size: [W, H],
};
