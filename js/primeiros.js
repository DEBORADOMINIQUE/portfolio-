/* =========================================================
   primeiros.js · "Primeiros passos" no Menu Principal
   Guia quem acabou de entrar: 5 passos para deixar o app pronto.
   Some sozinho quando tudo estiver feito (ou se ela esconder).
   ========================================================= */
(function () {
  let raiz;

  function passos() {
    const p = window.Tarefas ? Tarefas.prefs() : {};
    const temRegistro = (window.Marcas && Marcas.lista().length) || (window.Prospeccao && Prospeccao.lista().length);
    return [
      { feito: !!(window.Tarefas && Tarefas.configurado()), titulo: `Conte como quer ser ${G.t('chamada', 'chamado')} e monte sua rotina`, sub: 'Seus dias e horários de trabalho. É com isso que eu sugiro horários sem te sobrecarregar.', aba: 'aba-tarefas', botao: 'Montar rotina' },
      { feito: !!p.meta_abordagens, titulo: 'Defina sua meta de abordagens por dia', sub: 'Na Prospecção, toque em "Meta" e escolha quantas marcas quer abordar por dia.', aba: 'aba-prospeccao', botao: 'Definir meta' },
      { feito: !!(p.nivel_ugc || (Array.isArray(p.precos) && p.precos.length)), titulo: 'Escolha seu nível de UGC ou cadastre seus preços', sub: 'O Simulador usa isso para montar seus orçamentos.', aba: 'aba-simulador', botao: 'Abrir Simulador' },
      { feito: !!p.meta_faturamento, titulo: 'Coloque sua meta de faturamento do mês', sub: 'No Financeiro. Eu te mostro quantas marcas faltam para chegar lá.', aba: 'aba-financeiro', botao: 'Definir meta' },
      { feito: !!temRegistro, titulo: 'Registre sua primeira marca ou abordagem', sub: 'Pode ser uma marca que você já abordou ou uma parceria em andamento.', aba: 'aba-prospeccao', botao: 'Registrar' }
    ];
  }

  function desenhar() {
    if (!raiz || !window.Tarefas || !Tarefas.pronto()) return;
    const ps = passos(), feitos = ps.filter(x => x.feito).length;
    if (Tarefas.prefs().primeiros_passos_ok || feitos === ps.length) { raiz.innerHTML = ''; return; }
    raiz.innerHTML = `<div class="cartao primeiros">
      <div class="pp-topo">
        <div><h2>Primeiros passos ✦</h2><p class="desc">Deixe o UGC Organized com a sua cara. Leva uns 5 minutos.</p></div>
        <div class="pp-progresso"><b>${feitos}/${ps.length}</b><div class="carga ok"><div style="width:${feitos / ps.length * 100}%"></div></div></div>
      </div>
      <ol class="pp-lista">${ps.map((x, i) => `<li class="${x.feito ? 'feito' : ''}">
        <span class="pp-num">${x.feito ? '✓' : i + 1}</span>
        <div><strong>${x.titulo}</strong><small>${x.sub}</small></div>
        ${x.feito ? '' : `<button class="mini-btn" data-pp-aba="${x.aba}">${x.botao}</button>`}
      </li>`).join('')}</ol>
      <button class="link-precos pp-esconder" data-pp-esconder>Já sei usar, esconder</button>
    </div>`;
  }

  window.PrimeirosPassos = {
    iniciar(el) {
      raiz = el;
      raiz.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pp-aba], [data-pp-esconder]'); if (!b) return;
        if (b.dataset.ppAba) return document.querySelector(`[data-tab="${b.dataset.ppAba}"]`).click();
        Tarefas.salvarPrefsParcial({ primeiros_passos_ok: true }).then(desenhar, () => {});
      });
      setTimeout(desenhar, 1500); setTimeout(desenhar, 4000);
    },
    desenhar
  };
})();
