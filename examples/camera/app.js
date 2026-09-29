import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from './vendor/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
camera.position.set(0.0, 0.02, 0.55);

const key = new THREE.DirectionalLight(0xfff2e0, 1.6);
key.position.set(0.5, 0.9, 0.7);
scene.add(key);
const rim = new THREE.DirectionalLight(0xbfe8dd, 0.7);
rim.position.set(-0.7, 0.3, -0.5);
scene.add(rim);

let mixer = null, model = null, screenMat = null, baseY = 0;
const finderClips = [], crankClips = [];
let finderActions = [];
let crankNode = null;
let finderNodes = new Set();
const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();

/* finder state machine: openHold | closing | opening | closedEnd */
const HOLD = 1.35;
let fstate = 'boot';
let pendingScene = null;
let reopenPending = false;

function startClose() { fstate = 'closing'; for (const a of finderActions) a.paused = false; }
function startOpen() { fstate = 'opening'; for (const a of finderActions) { a.reset(); a.paused = false; a.play(); } }

function playGroup(clips) {
  if (!mixer) return;
  for (const clip of clips) {
    const act = mixer.clipAction(clip);
    act.reset();
    act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = false;
    act.play();
  }
}
const playCrank = () => playGroup(crankClips);
const playFinder = () => {
  if (!finderActions.length) { playGroup(finderClips); return; }
  if (fstate === 'openHold') startClose();
  else if (fstate === 'closedEnd') startOpen();
};

const bgVideo = document.getElementById('bgVideo');
let screenVideoEl = null;
function isVideo(file) { return /\.mp4$/i.test(file); }
function setScreenVideo(file) {
  if (!screenVideoEl) {
    screenVideoEl = document.createElement('video');
    screenVideoEl.loop = true; screenVideoEl.muted = true; screenVideoEl.playsInline = true;
  }
  if (screenVideoEl.dataset.file !== file) {
    screenVideoEl.src = `assets/scenes/${file}`;
    screenVideoEl.dataset.file = file;
  }
  screenVideoEl.play().catch(() => {});
  ensureScreenCanvas();
  if (screenMat) { screenMat.map = screenCanvasTex; screenMat.emissiveMap = screenCanvasTex; screenMat.needsUpdate = true; }
}
let screenCanvas = null, screenCtx = null, screenCanvasTex = null;
function ensureScreenCanvas() {
  if (screenCanvas) return;
  screenCanvas = document.createElement('canvas');
  screenCanvas.width = 512; screenCanvas.height = 444;
  screenCtx = screenCanvas.getContext('2d');
  screenCanvasTex = new THREE.CanvasTexture(screenCanvas);
  screenCanvasTex.flipY = false;
  screenCanvasTex.colorSpace = THREE.SRGBColorSpace;
}
function drawScreenVideo() {
  const v = screenVideoEl;
  if (!v || v.paused || v.readyState < 2 || !screenCtx) return;
  const vr = v.videoWidth / v.videoHeight, cr = screenCanvas.width / screenCanvas.height;
  let sw = v.videoWidth, sh = v.videoHeight, sx = 0, sy = 0;
  if (vr > cr) { sw = v.videoHeight * cr; sx = (v.videoWidth - sw) / 2; }
  else { sh = v.videoWidth / cr; sy = (v.videoHeight - sh) / 2; }
  const cw = screenCanvas.width, ch = screenCanvas.height;
  screenCtx.save();
  screenCtx.translate(cw / 2, ch / 2);
  screenCtx.rotate(Math.PI);
  screenCtx.drawImage(v, sx, sy, sw, sh, -cw / 2, -ch / 2, cw, ch);
  screenCtx.restore();
  screenCanvasTex.needsUpdate = true;
}
function stopScreenVideo() { if (screenVideoEl) screenVideoEl.pause(); }
function setScreenTexture(file) {
  texLoader.load(`assets/scenes/${file}`, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI;
    if (screenMat) { screenMat.map = t; screenMat.emissiveMap = t; screenMat.needsUpdate = true; }
  });
}

loader.load('assets/camera.glb?v=9', (gltf) => {
  model = gltf.scene;
  for (const clip of gltf.animations) {
    if (clip.name.startsWith('Finder_OpenClose')) finderClips.push(clip);
    else if (clip.name.startsWith('Crank_Wind')) crankClips.push(clip);
  }
  crankNode = crankClips.length ? crankClips[0].tracks[0].name.split('.')[0] : null;
  finderNodes = new Set(finderClips.flatMap((c) => c.tracks.map((t) => t.name.split('.')[0])));
  const box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  model.position.sub(c);
  model.setRotationFromMatrix(new THREE.Matrix4().set(-1,0,0,0, 0,0,1,0, 0,1,0,0, 0,0,0,1));
  model.scale.setScalar(1.12);
  scene.add(model);
  let screenNode = null;
  model.traverse((n) => {
    if (n.name === 'Cam_ScreenDisplay') { screenNode = n; if (n.material) screenMat = n.material; }
  });
  model.updateMatrixWorld(true);
  if (screenNode) {
    const sv = new THREE.Vector3();
    screenNode.getWorldPosition(sv);
    model.position.y += (0.02 - sv.y);   // center the finder screen vertically
  }
  baseY = model.position.y;
  mixer = new THREE.AnimationMixer(model);
  finderActions = finderClips.map((clip) => {
    const a = mixer.clipAction(clip);
    a.setLoop(THREE.LoopOnce, 1);
    a.timeScale = 2.0;   // double-speed open/close
    a.play();
    a.paused = true;
    a.time = HOLD;
    return a;
  });
  mixer.addEventListener('finished', (e) => {
    if (fstate === 'closing' && finderActions.includes(e.action)) {
      if (pendingScene) { applyScene(pendingScene); pendingScene = null; }
      startOpen();
    }
  });
  fstate = 'openHold';
  applyScene(uiScene);
  window.__stageReady = true;
}, undefined, () => {
  document.getElementById('fallback').hidden = false;
});

/* ----- scenes: cards drive finder screen AND page background ----- */
const bgEl = document.getElementById('bg');
const cards = [...document.querySelectorAll('.card')];
const sceneNames = cards.map((c) => c.dataset.scene);
let uiScene = 'alpine_cabin';
let currentScene = 'alpine_cabin';

function fileFor(name) {
  const c = cards.find((x) => x.dataset.scene === name);
  return c && c.dataset.file ? c.dataset.file : name + '.png';
}
function applyScene(name) {
  currentScene = name;
  const file = fileFor(name);
  if (isVideo(file)) {
    setScreenVideo(file);
    if (bgVideo.dataset.file !== file) { bgVideo.src = `assets/scenes/${file}`; bgVideo.dataset.file = file; }
    bgVideo.style.display = 'block';
    bgVideo.play().catch(() => {});
    bgEl.style.display = 'none';
  } else {
    stopScreenVideo();
    setScreenTexture(file);
    bgVideo.pause();
    bgVideo.style.display = 'none';
    bgEl.style.display = '';
    bgEl.style.backgroundImage = `url(assets/scenes/${file}?v=6)`;
  }
}
function layoutCards() {
  const N = cards.length;
  const ai = sceneNames.indexOf(uiScene);
  const gap = window.innerWidth < 1100 ? 118 : 152;
  cards.forEach((c, i) => {
    let off = i - ai;
    if (off > N / 2) off -= N;
    if (off < -N / 2) off += N;
    const a = Math.abs(off);
    const scale = a === 0 ? 1.22 : a === 1 ? 1.0 : 0.86;
    c.style.transform = `translate(-50%,-50%) translateX(${off * gap}px) translateY(${a === 0 ? -10 : a * 8}px) scale(${scale})`;
    c.style.zIndex = String(30 - a * 10);
    c.style.opacity = a > 2 ? '0' : '1';
    c.style.pointerEvents = a > 2 ? 'none' : 'auto';
  });
}
function selectScene(name) {
  uiScene = name;
  cards.forEach((c) => c.classList.toggle('is-active', c.dataset.scene === name));
  layoutCards();
  if (!mixer || !finderActions.length) { applyScene(name); return; }
  pendingScene = name;
  if (fstate === 'openHold') startClose();
  else if (fstate === 'opening') reopenPending = true;
  else if (fstate === 'closedEnd') { applyScene(name); startOpen(); }
}
function nextScene() {
  const i = sceneNames.indexOf(uiScene);
  return sceneNames[(i + 1) % sceneNames.length];
}
window.scrollTo(0, 0);
window.addEventListener('resize', layoutCards);
cards.forEach((card) => card.addEventListener('click', () => {
  card.blur();
  selectScene(card.dataset.scene);
}));
cards.forEach((card) => {
  const file = card.dataset.file;
  if (!isVideo(file)) return;
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'metadata';
  v.src = `assets/scenes/${file}`;
  v.addEventListener('loadeddata', () => { v.currentTime = Math.min(1.0, (v.duration || 2) / 2); }, { once: true });
  v.addEventListener('seeked', () => {
    const cv = document.createElement('canvas');
    cv.width = 344; cv.height = 256;
    const cx = cv.getContext('2d');
    const vr = v.videoWidth / v.videoHeight, cr = cv.width / cv.height;
    let sw = v.videoWidth, sh = v.videoHeight, sx = 0, sy = 0;
    if (vr > cr) { sw = v.videoHeight * cr; sx = (v.videoWidth - sw) / 2; }
    else { sh = v.videoWidth / cr; sy = (v.videoHeight - sh) / 2; }
    cx.drawImage(v, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    card.style.setProperty('--img', `url(${cv.toDataURL('image/jpeg', 0.82)})`);
  }, { once: true });
});
layoutCards();

/* ----- film simulation ----- */
const films = [['portra', 'Portra 400'], ['velvia', 'Velvia 50'], ['acros', 'Acros 100']];
let fi = 0;
document.getElementById('filmChip').addEventListener('click', (e) => {
  e.currentTarget.blur();
  fi = (fi + 1) % films.length;
  document.body.dataset.film = films[fi][0];
  document.getElementById('filmVal').textContent = films[fi][1];
  renderer.toneMappingExposure = films[fi][0] === 'acros' ? 1.0 : 1.12;
});

/* ----- click picking: finder vs crank ----- */
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!model) return;
  const moved = downAt ? Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) : 0;
  downAt = null;
  if (moved > 6) return;
  const r = canvas.getBoundingClientRect();
  ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObject(model, true);
  if (!hits.length) return;
  let o = hits[0].object, group = null;
  while (o) {
    if (crankNode && o.name === crankNode) { group = 'crank'; break; }
    if (finderNodes.has(o.name)) { group = 'finder'; break; }
    o = o.parent;
  }
  if (group === 'crank') { playCrank(); selectScene(nextScene()); }
  else if (group === 'finder') playFinder();
  if (group) document.getElementById('hint').classList.add('gone');
});

/* ----- resize + loop ----- */
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
window.__stageReady = true;
window.__cam = { get state(){ return fstate; }, get t(){ return finderActions[0] ? finderActions[0].time : -1; } };
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);
  drawScreenVideo();
  if (fstate === 'opening' && finderActions.length && finderActions[0].time >= HOLD) {
    for (const a of finderActions) a.paused = true;
    fstate = 'openHold';
    if (reopenPending) { reopenPending = false; startClose(); }
  }
  renderer.render(scene, camera);
});