/* ────────── Bank Card Scanner ──────────
 * Cards scroll right-to-left; a fixed vertical scanner at ~34% viewport
 * continuously slices each card: left side = dense JS code, right side = original image.
 * No fade, no fixed split, no instant switch — only clip-path slicing of the same card.
 * Canvas particles at the intersection; mouse/touch drag with inertia.
 * ─────────────────────────────────────── */

(function () {
  'use strict';

  /* ─── constants ─── */
  const CARD_WIDTH = 400;
  const CARD_HEIGHT = 250;
  const CARD_GAP = 60;
  const CARD_STEP = CARD_WIDTH + CARD_GAP; // 460 px
  const SCANNER_RATIO = 0.34;              // 34 % from left
  const AUTO_SPEED = 65;                   // px / s
  const DRAG_INERTIA_DECAY = 0.94;
  const INERTIA_STOP = 3;
  const CODE_REFRESH_MS = 200;
  const PARTICLE_MAX = 120;

  /* ─── DOM refs ─── */
  const track = document.getElementById('cardTrack');
  const stage = document.getElementById('scanStage');
  const wrappers = Array.from(track.querySelectorAll('.card-wrapper'));
  const canvas = document.getElementById('particle-canvas');
  const ctx = canvas.getContext('2d');

  const cards = wrappers.map((w) => ({
    el: w,
    codePre: w.querySelector('.code-layer pre'),
    imageLayer: w.querySelector('.image-layer'),
    codeLayer: w.querySelector('.code-layer'),
    imgEl: w.querySelector('img'),
    x: 0,          // world-space x (px), left edge
    imgIndex: 0,   // which card image (used for code variety)
  }));

  /* ─── code-text pool ─── */
  const CODE_POOL = [
    'function hash(d){let h=0;for(const c of d){h=((h<<5)-h)+c.charCodeAt(0);h|=0}return h}',
    'const sleep=ms=>new Promise(r=>setTimeout(r,ms));',
    'class Observer{#listeners=new Map();on(e,fn){if(!this.#listeners.has(e))this.#listeners.set(e,[]);this.#listeners.get(e).push(fn)}emit(e,d){this.#listeners.get(e)?.forEach(fn=>fn(d))}}',
    'async function fetchJSON(url){const r=await fetch(url);if(!r.ok)throw Error(r.status);return r.json()}',
    'function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}',
    'function throttle(fn,ms){let last=0;return(...a)=>{const now=Date.now();if(now-last>=ms){last=now;fn(...a)}}}',
    'const memoize=fn=>{const c=new Map();return(...a)=>{const k=JSON.stringify(a);if(!c.has(k))c.set(k,fn(...a));return c.get(k)}}',
    'function deepClone(o){return JSON.parse(JSON.stringify(o))}',
    'const pipe=(...fns)=>x=>fns.reduce((v,f)=>f(v),x);',
    'const compose=(...fns)=>pipe(...fns.reverse());',
    'function curry(fn){return function c(...a){return a.length>=fn.length?fn(...a):(...b)=>c(...a,...b)}}',
    'function* range(s,e,step=1){for(let i=s;i<e;i+=step)yield i}',
    'const unique=arr=>[...new Set(arr)];',
    'function groupBy(arr,key){return arr.reduce((m,v)=>{const k=typeof key=="function"?key(v):v[key];(m[k]=m[k]||[]).push(v);return m},{})}',
    'function pick(obj,keys){return keys.reduce((r,k)=>{if(k in obj)r[k]=obj[k];return r},{})}',
    'const omit=(obj,keys)=>{const r={...obj};keys.forEach(k=>delete r[k]);return r}',
    'function clamp(v,lo,hi){return v<lo?lo:v>hi?hi:v}',
    'const lerp=(a,b,t)=>a+(b-a)*t;',
    'function mapRange(v,inLo,inHi,outLo,outHi){return outLo+(outHi-outLo)*(v-inLo)/(inHi-inLo)}',
    'class EventBus{#e=new Map();on(n,f){if(!this.#e.has(n))this.#e.set(n,[]);this.#e.get(n).push(f);return ()=>this.off(n,f)}off(n,f){const a=this.#e.get(n);if(a){const i=a.indexOf(f);if(i>-1)a.splice(i,1)}}emit(n,d){this.#e.get(n)?.forEach(f=>f(d))}}',
    'function retry(fn,{attempts=3,delay=1000}={}){return new Promise((res,rej)=>{const go=async n=>{try{res(await fn())}catch(e){if(n>=attempts)rej(e);else setTimeout(()=>go(n+1),delay)}};go(1)})}',
    'const hex2rgb=h=>{const v=parseInt(h.slice(1),16);return{v>>16,(v>>8)&255,v&255}}',
    'function rgba(r,g,b,a=1){return`rgba(${r},${g},${b},${a})`}',
  ];

  /* ─── state ─── */
  let scannerX = 0;
  let speed = AUTO_SPEED;        // px/s (positive = leftward)
  let scrollVelocity = 0;        // drag-inertia velocity
  let isDragging = false;
  let dragPrevX = 0;
  let dragSamples = [];          // recent drag deltas for inertia calc
  let lastTime = performance.now();
  let codeTimer = 0;
  let particles = [];
  let rafId = 0;

  /* ─── init card positions ─── */
  function initCardPositions() {
    const inset = (window.innerWidth - CARD_WIDTH) / 2; // start roughly centred
    for (let i = 0; i < cards.length; i++) {
      cards[i].x = inset + i * CARD_STEP;
      cards[i].imgIndex = i % 4;
      cards[i].el.style.transform = `translateX(${cards[i].x}px)`;
    }
  }

  /* ─── generate dense code text ─── */
  function generateCode(cardIdx) {
    const seed = cardIdx * 7 + Math.floor(Date.now() / CODE_REFRESH_MS);
    const lines = [];
    const count = 18 + (seed % 8);     // 18-25 lines
    const used = new Set();
    for (let i = 0; i < count; i++) {
      let idx = (seed + i * 13) % CODE_POOL.length;
      // Avoid consecutive dupes
      let tries = 0;
      while (used.has(idx) && tries < 50) { idx = (idx + 7) % CODE_POOL.length; tries++; }
      used.add(idx);
      lines.push(CODE_POOL[idx]);
    }
    return lines.join('\n');
  }

  function refreshCardCode(card) {
    const code = generateCode(card.imgIndex);
    if (card.codePre.textContent !== code) {
      card.codePre.textContent = code;
    }
  }

  /* ─── update clip-paths for one card ─── */
  function updateClip(card) {
    const rect = card.el.getBoundingClientRect();
    const codeL = card.codeLayer;
    const imgL = card.imageLayer;

    if (rect.right <= scannerX) {
      // fully past scanner → all code
      codeL.style.clipPath = 'inset(0 0 0 0)';
      imgL.style.clipPath = 'inset(0 0 0 100%)';
    } else if (rect.left >= scannerX) {
      // not yet reached scanner → all image
      codeL.style.clipPath = 'inset(0 100% 0 0)';
      imgL.style.clipPath = 'inset(0 0 0 0)';
    } else {
      // intersecting scanner → split
      const progress = Math.max(0, Math.min(1,
        (scannerX - rect.left) / rect.width
      ));
      codeL.style.clipPath = `inset(0 ${(1 - progress) * 100}% 0 0)`;
      imgL.style.clipPath = `inset(0 0 0 ${progress * 100}%)`;
    }

    // Brightness boost
    const overlapping = rect.left <= scannerX && rect.right >= scannerX;
    if (overlapping && !card.el.classList.contains('scanning')) {
      card.el.classList.add('scanning');
    } else if (!overlapping && card.el.classList.contains('scanning')) {
      card.el.classList.remove('scanning');
    }
  }

  /* ─── wrap cards for seamless loop ─── */
  function wrapCards() {
    // Find scene bounds
    let minX = Infinity;
    let maxX = -Infinity;
    for (const c of cards) { if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x; }

    for (const c of cards) {
      if (c.x + CARD_WIDTH < -CARD_WIDTH) {
        // Far off-screen left → move to right end
        c.x = maxX + CARD_STEP;
        maxX = c.x;
      }
      // Safety net: also catch rightward drift
      if (c.x > window.innerWidth + CARD_STEP * 4) {
        c.x = minX - CARD_STEP;
        minX = c.x;
      }
    }
  }

  /* ─── particles ─── */
  function spawnParticles(card) {
    const rect = card.el.getBoundingClientRect();
    if (rect.left > scannerX || rect.right < scannerX) return;
    const count = 2 + Math.floor(Math.random() * 3); // 2-4 per frame
    for (let i = 0; i < count; i++) {
      if (particles.length >= PARTICLE_MAX) break;
      const y = rect.top + Math.random() * rect.height;
      particles.push({
        x: scannerX + (Math.random() - 0.5) * 6,
        y: y,
        vx: (Math.random() - 0.5) * 40,
        vy: (Math.random() - 0.5) * 50,
        life: 0,
        maxLife: 0.3 + Math.random() * 0.5, // seconds
        size: 1 + Math.random() * 2.5,
        color: Math.random() > 0.3
          ? `rgba(180,140,255,${0.7 + Math.random() * 0.3})`
          : `rgba(255,255,255,${0.5 + Math.random() * 0.5})`,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function drawParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      const alpha = 1 - p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color.replace(/[\d.]+\)$/, (match) => {
        const base = parseFloat(match);
        return (base * alpha).toFixed(2) + ')';
      });
      ctx.fill();
    }
  }

  /* ─── resize ─── */
  function onResize() {
    const sr = stage.getBoundingClientRect();
    scannerX = sr.left + sr.width * SCANNER_RATIO;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // Reposition cards so the scene stays well-populated relative to the new viewport
    const inset = (window.innerWidth - CARD_WIDTH) / 2;
    for (let i = 0; i < cards.length; i++) {
      cards[i].x = inset + i * CARD_STEP;
    }
  }

  /* ─── main loop ─── */
  function tick(now) {
    const rawDt = (now - lastTime) / 1000;
    lastTime = now;
    const dt = Math.min(rawDt, 0.1); // cap at 100ms to avoid jumps on tab-unfocus

    if (!isDragging) {
      // Apply inertia, then auto-speed
      if (Math.abs(scrollVelocity) > INERTIA_STOP) {
        scrollVelocity *= DRAG_INERTIA_DECAY;
      } else {
        scrollVelocity = 0;
      }
      const effectiveSpeed = scrollVelocity !== 0 ? scrollVelocity : AUTO_SPEED;
      for (const c of cards) {
        c.x -= effectiveSpeed * dt;
      }
    }

    // Wrap off-screen cards
    wrapCards();

    // Apply CSS transforms + clip-paths + particles
    for (const c of cards) {
      c.el.style.transform = `translateX(${c.x}px)`;
      updateClip(c);
      spawnParticles(c);
    }

    // Code refresh
    codeTimer += dt * 1000;
    if (codeTimer >= CODE_REFRESH_MS) {
      codeTimer = 0;
      for (const c of cards) {
        refreshCardCode(c);
      }
    }

    // Particles
    updateParticles(dt);
    drawParticles();

    rafId = requestAnimationFrame(tick);
  }

  /* ─── drag / touch ─── */
  function dragStart(e) {
    isDragging = true;
    scrollVelocity = 0;
    dragSamples = [];
    const p = e.touches ? e.touches[0] : e;
    dragPrevX = p.clientX;
  }

  function dragMove(e) {
    if (!isDragging) return;
    const p = e.touches ? e.touches[0] : e;
    const dx = p.clientX - dragPrevX;
    dragPrevX = p.clientX;

    // Move all cards by the drag delta
    for (const c of cards) {
      c.x += dx;
    }

    // Record sample for inertia
    dragSamples.push({ dx, time: performance.now() });
    if (dragSamples.length > 6) dragSamples.shift();
  }

  function dragEnd() {
    if (!isDragging) return;
    isDragging = false;

    // Compute velocity from recent samples
    if (dragSamples.length >= 2) {
      const first = dragSamples[0];
      const last = dragSamples[dragSamples.length - 1];
      const elapsed = (last.time - first.time) / 1000;
      const totalDx = dragSamples.reduce((s, v) => s + v.dx, 0);
      if (elapsed > 0.01) {
        scrollVelocity = totalDx / elapsed; // px/s, positive = rightward
      }
    }
    dragSamples = [];
  }

  /* ─── boilerplate ─── */
  function bindEvents() {
    window.addEventListener('resize', onResize);

    // Mouse
    window.addEventListener('mousedown', dragStart);
    window.addEventListener('mousemove', dragMove);
    window.addEventListener('mouseup', dragEnd);
    window.addEventListener('mouseleave', dragEnd);

    // Touch
    window.addEventListener('touchstart', dragStart, { passive: false });
    window.addEventListener('touchmove', dragMove, { passive: false });
    window.addEventListener('touchend', dragEnd);
  }

  console.log('%c💳 Bank Card Scanner ready %c| scanner @ %d%% | %d cards | %d×%d px',
    'color:#b89cff', '', Math.round(SCANNER_RATIO * 100),
    cards.length, CARD_WIDTH, CARD_HEIGHT);

  /* ─── start ─── */
  onResize();
  initCardPositions();
  // Initial code fill
  for (const c of cards) refreshCardCode(c);
  bindEvents();
  lastTime = performance.now();
  rafId = requestAnimationFrame(tick);
})();
