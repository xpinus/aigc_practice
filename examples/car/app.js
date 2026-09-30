/* Fleur & Motor — hover-reveal bloom
   base plate + blooming clip are composited in a WebGL shader through a
   pointer-painted mask: feathered brush (smooth mask), noise-wobbled stroke
   (edge ripple) and per-frame decay (short trail). */
(function () {
  const hero = document.querySelector('.hero');
  const bg = document.getElementById('bg');
  const canvas = document.getElementById('reveal');
  const hint = document.getElementById('bloomHint');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- reveal clip ---------- */
  const video = document.createElement('video');
  video.src = 'assets/flowers_grow_4s.mp4';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.loop = false;                 // hold the fully-bloomed last frame
  let videoStarted = false, endedUp = false;
  const vt = (tag) => { if (document.body) document.body.dataset.vev = tag + ':' + video.readyState + '/' + video.currentTime.toFixed(2) + (video.paused ? '/p' : '/r'); };
  ['play', 'playing', 'pause', 'ended', 'stalled'].forEach((ev) => video.addEventListener(ev, () => vt(ev)));
  video.addEventListener('play', () => { endedUp = false; videoStarted = true; });
  /* capture the fully-bloomed frame once, so a reveal is possible even before
     the clip is allowed to play (autoplay-blocked browsers, first sweep) */
  const bloomCanvas = document.createElement('canvas');
  bloomCanvas.width = 1280; bloomCanvas.height = 720;
  const bctx = bloomCanvas.getContext('2d');
  let bloomReady = false;
  video.addEventListener('loadedmetadata', () => {
    const seek = () => {
      video.removeEventListener('seeked', seek);
      bctx.drawImage(video, 0, 0, bloomCanvas.width, bloomCanvas.height);
      bloomReady = true;
      try { video.currentTime = 0; } catch (e) {}
    };
    video.addEventListener('seeked', seek);
    try { video.currentTime = Math.max(0, (video.duration || 4) - 0.08); } catch (e) {}
  });
  video.play().then(() => vt('ok0')).catch((e) => vt('wait:' + e.name));   /* muted: allowed without gesture */

  /* ---------- pointer state ---------- */
  const ptr = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, inside: false, speed: 0 };
  let hintDone = false;

  function fallback() {              /* no WebGL / reduced motion: keep the plate */
    if (document.body) document.body.dataset.gl = '0';
    if (canvas) canvas.style.display = 'none';
    if (!bg || reduced) return;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    addEventListener('pointermove', (e) => {
      tx = (e.clientX / innerWidth - 0.5) * -10;
      ty = (e.clientY / innerHeight - 0.5) * -6;
    }, { passive: true });
    (function loop() {
      cx += (tx - cx) * 0.055; cy += (ty - cy) * 0.055;
      bg.style.translate = cx.toFixed(2) + 'px ' + cy.toFixed(2) + 'px';
      requestAnimationFrame(loop);
    })();
  }

  const gl = canvas && canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl || reduced) { fallback(); return; }
  bg.style.display = 'none';          /* the shader now draws the plate */
  if (document.body) document.body.dataset.gl = '1';

  /* ---------- shaders ---------- */
  const VS = 'attribute vec2 p;varying vec2 vuv;void main(){vuv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  const FS = [
    'precision mediump float;',
    'varying vec2 vuv;',
    'uniform sampler2D base,rev,msk;',
    'uniform vec2 mres;',
    'uniform float time,hasRev;',
    'uniform vec2 par;uniform float dbg;',
    'vec2 cover(vec2 uv,float ta,float sa){vec2 s=sa>ta?vec2(1.,ta/sa):vec2(sa/ta,1.);return .5+(uv-.5)*s;}',
    'void main(){',
    '  vec2 uv=vuv+par*.012;',
    /* feathered mask: centre tap + 4 neighbours */
    '  vec2 o=1.6/mres;',
    '  float m=texture2D(msk,vuv).a*.4;',
    '  m+=texture2D(msk,vuv+vec2(o.x,0.)).a*.15;',
    '  m+=texture2D(msk,vuv-vec2(o.x,0.)).a*.15;',
    '  m+=texture2D(msk,vuv+vec2(0.,o.y)).a*.15;',
    '  m+=texture2D(msk,vuv-vec2(0.,o.y)).a*.15;',
    '  m=smoothstep(.05,.9,m);',
    /* edge band + gentle ripple */
    '  float edge=smoothstep(0.,.45,m)*(1.-smoothstep(.55,1.,m));',
    '  float n=sin(vuv.x*46.+time*1.9)*sin(vuv.y*41.-time*1.5)+sin((vuv.x+vuv.y)*23.+time*2.6);',
    '  vec2 duv=cover(uv,1.7778,1.7778)+vec2(n*.0026,n*.002)*edge;',
    '  vec3 b=texture2D(base,duv).rgb;',
    '  vec3 r=texture2D(rev,duv).rgb;',
    '  vec3 col=mix(b,r,m*hasRev);',
    '  col+=edge*hasRev*vec3(.72,.45,.48)*.09;',   /* dusty-rose rim light on the bloom front */
    '  if(dbg>1.5){gl_FragColor=vec4(texture2D(rev,cover(vuv,1.7778,1.7778)).rgb,1.);return;}',
    '  if(dbg>.5){gl_FragColor=vec4(vec3(m),1.);return;}',
    '  gl_FragColor=vec4(col,1.);',
    '}'
  ].join('\n');

  function sh(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { fallback(); return null; }
    return s;
  }
  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { fallback(); return; }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  ['base', 'rev', 'msk', 'mres', 'time', 'hasRev', 'par', 'dbg'].forEach((k) => { U[k] = gl.getUniformLocation(prog, k); });

  function tex() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    return t;
  }
  const tBase = tex(), tRev = tex(), tMask = tex();
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  /* 1x1 placeholders so the first frames are valid */
  gl.bindTexture(gl.TEXTURE_2D, tBase);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([245, 239, 229, 255]));
  gl.bindTexture(gl.TEXTURE_2D, tRev);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([245, 239, 229, 255]));

  const baseImg = new Image();
  let baseReady = false;
  baseImg.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, tBase);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, baseImg);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    baseReady = true;
  };
  baseImg.src = 'references/car_no_flowers.png';

  /* ---------- mask canvas (quarter res, CPU painted) ---------- */
  const mask = document.createElement('canvas');
  const mctx = mask.getContext('2d');
  const wob = (a, t) => (Math.sin(a * 3 + t * 2.7) + Math.sin(a * 5.1 - t * 1.9) + Math.sin(a * 8.3 + t * 3.7)) / 3;

  function blob(x, y, r, t) {
    mctx.beginPath();
    const K = 18;
    for (let i = 0; i <= K; i++) {
      const a = (i / K) * Math.PI * 2;
      const rr = r * (1 + 0.17 * wob(a, t));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i ? mctx.lineTo(px, py) : mctx.moveTo(px, py);
    }
    mctx.closePath();
    mctx.fill();
  }

  /* ---------- events ---------- */
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    ptr.x = (e.clientX - r.left) / r.width;
    ptr.y = (e.clientY - r.top) / r.height;
    ptr.inside = true;
    if (document.body) document.body.dataset.pm = String((+document.body.dataset.pm || 0) + 1);
    if (hint && !hintDone) { hintDone = true; hint.classList.add('gone'); }
    if (!videoStarted) {
      videoStarted = true;
      video.play().then(() => vt('ok')).catch((e) => vt('err:' + e.name));
    }
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { ptr.inside = false; });
  hero.addEventListener('pointerdown', () => {           /* stronger gesture: retry playback */
    /* never restart a finished bloom here - the held last frame IS the reveal payload */
    if (video.paused && !video.ended) video.play().then(() => vt('ok2')).catch((e) => vt('err2:' + e.name));
  }, { passive: true });
  hero.addEventListener('dblclick', () => {           /* replay the bloom */
    if (video.ended || video.currentTime > 0.2) {
      video.currentTime = 0;
      video.play().catch(() => {});
    }
  });

  /* ---------- render loop ---------- */
  let lastVT = -1, dpr = 1, revSrc = '';
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.round(hero.clientWidth * dpr), h = Math.round(hero.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      mask.width = Math.max(2, w >> 2); mask.height = Math.max(2, h >> 2);
      gl.viewport(0, 0, w, h);
    }
  }
  let parX = 0, parY = 0;
  function frame(now) {
    resize();
    const t = now / 1000;
    /* decay = the short trail */
    mctx.globalCompositeOperation = 'destination-out';
    mctx.fillStyle = 'rgba(0,0,0,0.018)';
    mctx.fillRect(0, 0, mask.width, mask.height);
    mctx.globalCompositeOperation = 'source-over';
    mctx.fillStyle = 'rgba(255,255,255,0.5)';
    if (ptr.inside) {
      const mx = ptr.x * mask.width, my = ptr.y * mask.height;
      const pmx = ptr.px * mask.width, pmy = (1 - ptr.py) * mask.height;
      const d = Math.hypot(mx - pmx, my - pmy);
      const R = mask.height * 0.155 * (1 + Math.min(0.45, d * 0.012));
      const steps = Math.max(1, Math.ceil(d / (R * 0.4)));
      for (let i = 0; i <= steps; i++) {
        blob(pmx + (mx - pmx) * i / steps, pmy + (my - pmy) * i / steps, R, t + i * 0.7);
      }
      ptr.px = ptr.x; ptr.py = ptr.y;
    }
    parX += ((ptr.inside ? ptr.x - 0.5 : 0) - parX) * 0.05;
    parY += ((ptr.inside ? ptr.y - 0.5 : 0) - parY) * 0.05;

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tBase);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tRev);
    const useBloom = bloomReady && !videoStarted;
    if (useBloom) {
      if (revSrc !== 'b') {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bloomCanvas);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        revSrc = 'b';
      }
    } else if (video.readyState >= 2 && (video.currentTime !== lastVT || (video.ended && !endedUp))) {
      lastVT = video.currentTime; endedUp = video.ended;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      revSrc = 'v';
    }
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tMask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
    gl.uniform1i(U.base, 0); gl.uniform1i(U.rev, 1); gl.uniform1i(U.msk, 2);
    gl.uniform2f(U.mres, mask.width, mask.height);
    gl.uniform1f(U.time, t);
    gl.uniform1f(U.hasRev, (useBloom || video.readyState >= 2) ? 1 : 0);
    gl.uniform2f(U.par, -parX, parY);
    gl.uniform1f(U.dbg, location.hash === '#dbg' ? 1 : (location.hash === '#dbg2' ? 2 : 0));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (document.body && (now | 0) % 500 < 17) {
      document.body.dataset.vs = video.readyState + '/' + video.currentTime.toFixed(2) + '/' + (video.paused ? 'p' : 'r');
      try {
        const d = mctx.getImageData(Math.max(0, Math.min(mask.width - 1, Math.round(ptr.x * mask.width) - 2)), Math.max(0, Math.min(mask.height - 1, Math.round(ptr.y * mask.height) - 2)), 4, 4).data;
        let mx = 0; for (let i = 3; i < d.length; i += 4) mx = Math.max(mx, d[i]);
        document.body.dataset.mk = String(mx);
      } catch (e) { document.body.dataset.mk = 'err'; }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
