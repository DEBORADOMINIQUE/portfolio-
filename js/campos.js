/* =========================================================
   campos.js · ajudas que valem para o app inteiro
   1) Toda data opcional ganha um botão ✕ para apagar (no Safari
      não dá para apagar digitando).
   2) Todo campo de valor em reais completa sozinho: "350" → "350,00",
      "1500,5" → "1.500,50".
   ========================================================= */
(function () {
  // ----- 1) Datas com ✕ -----
  function prepararDatas(raiz) {
    raiz.querySelectorAll('input[type="date"]').forEach(inp => {
      if (inp.dataset.comLimpar || inp.required || inp.closest('.data-linha') || inp.dataset.semLimpar !== undefined) return;
      inp.dataset.comLimpar = '1';
      const caixa = document.createElement('span'); caixa.className = 'data-linha';
      inp.parentNode.insertBefore(caixa, inp); caixa.appendChild(inp);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'limpar-data'; b.textContent = '✕'; b.title = 'Apagar a data'; b.setAttribute('aria-label', 'Apagar a data');
      b.addEventListener('click', () => { inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); inp.focus(); });
      caixa.appendChild(b);
    });
  }

  // ----- 2) Valores em reais -----
  const lerValor = (v) => { const b = String(v || '').trim().replace(/[R$\s]/g, ''); if (!b) return null; const n = Number(b.includes(',') ? b.replace(/\./g, '').replace(',', '.') : b); return isFinite(n) ? n : null; };
  const formatar = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ehValor = (el) => el && el.tagName === 'INPUT' && (el.dataset.moeda !== undefined || el.name === 'valor' || el.id === 's-proposta' || el.id === 's-verba');
  document.addEventListener('focusout', (e) => {
    const el = e.target; if (!ehValor(el) || !el.value.trim()) return;
    const n = lerValor(el.value); if (n === null) return;
    const novo = formatar(n);
    if (el.value !== novo) { el.value = novo; el.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  // Ao entrar no campo, seleciona tudo para digitar por cima
  document.addEventListener('focusin', (e) => { if (ehValor(e.target)) setTimeout(() => { try { e.target.select(); } catch (x) {} }, 0); });

  // Observa a tela: toda janela/ficha nova recebe os ✕ nas datas
  const obs = new MutationObserver((muts) => { muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) prepararDatas(n.parentNode || n); })); });
  document.addEventListener('DOMContentLoaded', () => { prepararDatas(document); obs.observe(document.body, { childList: true, subtree: true }); });
})();
