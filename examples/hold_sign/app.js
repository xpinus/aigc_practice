/* PixelNest hero — mouse-delta video scrubber with frame-locked glass card.
 *
 * Four engineering cores:
 *  1. Catmull-Rom spline  getCardTop(t) over per-second keyframe calibration
 *     (C1-continuous: no lerp jitter while the arms accelerate / decelerate).
 *  2. Mouse-delta scrubbing: relative movementY accumulated in rAF with a
 *     sensitivity coefficient -> targetTime (knob-like, no absolute zones).
 *  3. Dual-channel physical frame sync: requestVideoFrameCallback updates
 *     --card-y from the *decoded* frame's mediaTime; fastSeek() while moving,
 *     exact currentTime seek to calibrate the resting frame ('seeked').
 *  4. CSS container queries: .video-stage is the video's virtual viewport
 *     (cover rect, container-type:size); the card lives in cqw/cqh of it, so
 *     it stays glued on any screen aspect ratio.
 *
 * Calibration (measured on assets/video.mp4, 864x496 @24fps, 121 frames):
 *   card left 39.24% | width 22.51% | height 21.37%  (see styles.css)
 *   card TOP (% of video height) per second:
 */
const CARD_TOP = [60.28,60.28,60.28,60.08,60.08,59.88,59.88,59.68,59.48,59.27,59.07,58.87,58.67,58.47,58.06,57.66,57.46,57.06,56.65,56.25,55.85,55.24,54.64,54.23,53.63,53.02,52.42,51.61,51.01,50,49.19,48.19,46.98,45.77,44.56,43.15,41.94,40.52,38.91,37.1,35.48,33.87,32.26,30.65,29.03,27.42,25.81,24.19,22.78,21.37,19.96,18.55,17.14,15.93,14.92,13.91,12.9,12.1,11.09,10.28,9.68,9.07,8.27,7.66,7.06,6.65,6.05,5.44,5.04,4.64,4.23,3.83,3.43,3.02,2.62,2.22,2.02,1.61,1.21,0.81,0.6,0.4,0.4,0.4,-1.21,-1.61,-1.81,-2.02,-2.22,-2.42,-3.02,-3.23,-3.43,-3.63,-3.83,-3.83,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03,-4.03];

const VIDEO = { duration: 5.0417, fps: 24 };

/* ---------------- 1. Catmull-Rom spline ---------------- */
/* per-frame lookup (121 calibrated points) with Catmull-Rom sub-frame
   interpolation for C1 continuity between decoded frames */
function getCardTop(seconds) {
  const n = CARD_TOP.length;
  const u = Math.min(Math.max(seconds * VIDEO.fps, 0), n - 1);
  const i = Math.min(Math.floor(u), n - 2);
  const f = u - i, f2 = f * f, f3 = f2 * f;
  const p0 = CARD_TOP[Math.max(i - 1, 0)], p1 = CARD_TOP[i];
  const p2 = CARD_TOP[i + 1], p3 = CARD_TOP[Math.min(i + 2, n - 1)];
  return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
}

/* ---------------- dom ---------------- */
const hero  = document.getElementById('hero');
const stage = document.getElementById('videoStage');
const video = document.getElementById('bgVideo');

/* ---------------- 2. mouse-delta scrubbing ---------------- */
const state = {
  target: 0,     // where the knob says we should be (s)
  current: 0,    // damped playback position (s)
  moving: false, // target != current -> use fastSeek channel
  restSeeked: true,
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// full timeline sweep ~= 1.15 viewport heights of vertical mouse travel
const sensitivity = () => VIDEO.duration / (window.innerHeight * 1.15);

function nudge(deltaSeconds) {
  state.target = clamp(state.target + deltaSeconds, 0, VIDEO.duration);
  state.restSeeked = false;
}

let lastMouseY = null;
window.addEventListener('mousemove', (e) => {
  const dy = (typeof e.movementY === 'number' && e.movementY !== 0)
    ? e.movementY
    : (lastMouseY === null ? 0 : e.clientY - lastMouseY);
  lastMouseY = e.clientY;
  if (dy) nudge(-dy * sensitivity());          // up = raise the sign = forward
}, { passive: true });

window.addEventListener('wheel', (e) => {
  e.preventDefault();                           // same physical metaphor as mouse
  nudge(-e.deltaY * sensitivity() * 0.9);
}, { passive: false });

let lastTouchY = null;
window.addEventListener('touchstart', (e) => { lastTouchY = e.touches[0].clientY; }, { passive: true });
window.addEventListener('touchmove', (e) => {
  const y = e.touches[0].clientY;
  if (lastTouchY !== null) nudge(-(y - lastTouchY) * sensitivity() * 1.8);
  lastTouchY = y;
  e.preventDefault();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp')   { nudge( 0.2); e.preventDefault(); }
  if (e.key === 'ArrowDown') { nudge(-0.2); e.preventDefault(); }
});

/* ---------------- 3. dual-channel frame sync ---------------- */
function setCardY(seconds) {
  stage.style.setProperty('--card-y', getCardTop(seconds).toFixed(3));
}

let hasRVFC = 'requestVideoFrameCallback' in video;
if (hasRVFC) {
  const onFrame = (_now, meta) => {
    setCardY(meta.mediaTime);                   // decoded-frame truth
    video.requestVideoFrameCallback(onFrame);
  };
  video.requestVideoFrameCallback(onFrame);
}
video.addEventListener('seeked', () => { setCardY(video.currentTime); });
video.addEventListener('timeupdate', () => { if (!hasRVFC) setCardY(video.currentTime); });

let mediaInited = false;
video.addEventListener('loadedmetadata', () => {
  video.pause();                                // never autoplay
  if (!mediaInited) {                           // first load: start at rest frame
    mediaInited = true;
    video.currentTime = 0;
    setCardY(0);
  } else {
    // media resource reloaded behind our back (tab eviction etc.):
    // restore the user's scrub position instead of wiping it
    video.currentTime = state.target;
    state.restSeeked = false;
  }
});

/* ---------------- rAF loop: damping + seek strategy ---------------- */
const REST_EPS = 0.004;                         // s, ~1/10 frame
const FRAME = 1 / VIDEO.fps;
let lastSeekFrame = -1;                           // seek storm guard
let seekCount = 0;
let last = performance.now();

function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  const diff = state.target - state.current;
  if (Math.abs(diff) > REST_EPS) {
    // critically-damped glide toward the knob position
    state.current += diff * Math.min(1, dt * 14);
    if (Math.abs(state.target - state.current) < REST_EPS) state.current = state.target;
    state.moving = true;
  } else {
    state.current = state.target;
    state.moving = false;
  }

  // seek at most once per *new* video frame (frame-quantized): no seek storms
  const wantFrame = Math.round(state.current * VIDEO.fps);
  if (state.moving) {
    if (wantFrame !== lastSeekFrame) {
      if (typeof video.fastSeek === 'function') video.fastSeek(wantFrame * FRAME);
      else video.currentTime = wantFrame * FRAME;
      lastSeekFrame = wantFrame;
      seekCount++;
    }
  } else if (!state.restSeeked) {
    video.currentTime = state.target;           // exact resting-frame calibration
    lastSeekFrame = Math.round(state.target * VIDEO.fps);
    state.restSeeked = true;
  }


  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/* debug / QA hook */
window.holdSign = {
  seekTo(t) { state.target = clamp(t, 0, VIDEO.duration); state.restSeeked = false; },
  get state() { return { ...state, cardTop: getCardTop(state.current) }; },
  getCardTop, CARD_TOP,
};

/* QA bridge: DOM-attribute command channel (crosses isolated JS worlds).
   Set <html data-seek="2.5"> to scrub; the page reads current state from
   element geometry / --card-y, no globals required. */
new MutationObserver(() => {
  const raw = document.documentElement.getAttribute('data-seek');
  if (raw === null) return;
  const t = parseFloat(raw);
  if (!Number.isNaN(t)) { state.target = clamp(t, 0, VIDEO.duration); state.restSeeked = false; }
  document.documentElement.removeAttribute('data-seek');
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-seek'] });

/* opt-in perf overlay: open index.html?perf=1 */
if (location.search.includes('perf=1')) {
  const chip = document.createElement('div');
  chip.className = 'perf-chip';
  document.body.appendChild(chip);
  let frames = 0, long = 0, t0 = performance.now(), prev = t0;
  const loop = (t) => {
    frames++;
    if (t - prev > 32) long++;
    prev = t;
    if (t - t0 >= 500) {
      chip.textContent = Math.round(frames * 1000 / (t - t0)) + ' fps | long ' + long + ' | seeks ' + seekCount;
      frames = 0; long = 0; t0 = t;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
