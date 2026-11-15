/* =========================================================
   glitter.js · rastro de glitter atrás do mouse (Organized UGC)
   Não roda no celular nem para quem pediu menos animação.
   ========================================================= */
(function () {
  if (!window.matchMedia('(pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const CORES = ['#ff1493', '#ff4fa3', '#ff8fc7', '#ffd1e8', '#ffffff', '#c6f05a', '#e2ff8a'];
  const FORMAS = ['✦', '✧', '•', '✦', '⋆'];
  let ultimo = 0;

  document.addEventListener('mousemove', (e) => {
    const agora = performance.now();
    if (agora - ultimo < 28) return; // no máximo ~35 brilhos por segundo
    ultimo = agora;
    for (let i = 0; i < 2; i++) {
      const g = document.createElement('span');
      g.className = 'glitter';
      g.textContent = FORMAS[Math.floor(Math.random() * FORMAS.length)];
      const tam = 7 + Math.random() * 9;
      g.style.cssText = `left:${e.clientX + (Math.random() * 10 - 5)}px;top:${e.clientY + (Math.random() * 10 - 5)}px;` +
        `font-size:${tam}px;color:${CORES[Math.floor(Math.random() * CORES.length)]};` +
        `text-shadow:0 0 6px rgba(255,20,147,.55);--dx:${Math.random() * 30 - 15}px;--dy:${12 + Math.random() * 28}px;--giro:${Math.random() * 240 - 120}deg`;
      document.body.appendChild(g);
      g.addEventListener('animationend', () => g.remove());
    }
  }, { passive: true });
})();
