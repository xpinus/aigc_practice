/* Fleur & Motor — hero micro-interactions */
(function () {
  const bg = document.getElementById('bg');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!bg || reduced) return;
  let tx = 0, ty = 0, cx = 0, cy = 0;
  addEventListener('pointermove', (e) => {
    tx = (e.clientX / innerWidth - 0.5) * -10;
    ty = (e.clientY / innerHeight - 0.5) * -6;
  }, { passive: true });
  (function loop() {
    cx += (tx - cx) * 0.055;
    cy += (ty - cy) * 0.055;
    bg.style.translate = cx.toFixed(2) + 'px ' + cy.toFixed(2) + 'px';
    requestAnimationFrame(loop);
  })();
})();
