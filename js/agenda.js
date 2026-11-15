/* =========================================================
   agenda.js · Aba "Agenda" do UGC Organized
   Um calendário só com tudo: tarefas, compromissos pessoais
   (com repetição), entregas, follow-ups, cobranças, repescagens,
   licenças, posts agendados e feriados nacionais.
   ========================================================= */
(function () {
  let raiz, mes = new Date(), sel = null;
  mes.setDate(1);

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paraISO = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const deISO = (s) => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
  const hoje = () => paraISO(new Date());
  const somaDias = (iso, n) => { const d = deISO(iso); d.setDate(d.getDate() + n); return paraISO(d); };
  const hora5 = (h) => h ? String(h).slice(0, 5) : '';
  const moeda = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  // ===== Tudo o que acontece num dia =====
  function eventos(iso) {
    const lista = [];
    const f = window.Feriados && Feriados.de(iso);
    if (f) lista.push({ tipo: 'feriado', titulo: f.nome + (f.facultativo ? ' (ponto facultativo)' : ''), emoji: '🎉' });

    if (window.Tarefas) Tarefas.doDia(iso).forEach(t => {
      const c = Tarefas.categorias[t.categoria] || Tarefas.categorias.outro;
      lista.push({ tipo: Tarefas.LIVRES.includes(t.categoria) ? 'vida' : 'trabalho', hora: hora5(t.hora), titulo: t.titulo, emoji: c.emoji,
        sub: (t._rep ? '🔁 se repete · ' : '') + c.nome, feito: t.concluida, abrir: () => Tarefas.abrir(t.id) });
    });

    if (window.Marcas) Marcas.lista().forEach(m => {
      const ab = () => Marcas.abrir(m.id);
      if (m.data_entrega === iso && !m.data_entregue && !['perdida'].includes(m.etapa)) lista.push({ tipo: 'marca', titulo: `Entrega: ${m.nome}`, emoji: '📦', sub: m.entregaveis || '', abrir: ab });
      if (m.proximo_followup === iso && ['contato', 'negociando'].includes(m.etapa)) lista.push({ tipo: 'marca', titulo: `Follow-up: ${m.nome}`, emoji: '💬', abrir: ab });
      if (!m.pago && Number(m.valor) > 0 && m.lembrar_cobranca === iso) lista.push({ tipo: 'marca', titulo: `Cobrar ${m.nome}`, emoji: '💸', sub: moeda(m.valor), abrir: ab });
      else if (!m.pago && Number(m.valor) > 0 && m.data_pagamento === iso) lista.push({ tipo: 'marca', titulo: `Pagamento previsto: ${m.nome}`, emoji: '💸', sub: moeda(m.valor), abrir: ab });
      if (m.repescagem_em === iso && m.etapa === 'concluida') lista.push({ tipo: 'marca', titulo: `Repescagem: ${m.nome}`, emoji: '🔁', abrir: ab });
      if (m.uso_imagem_ate === iso) lista.push({ tipo: 'marca', titulo: `Licença de uso vence: ${m.nome}`, emoji: '📄', abrir: ab });
    });

    if (window.Conteudo) Conteudo.lista().forEach(c => {
      if (c.data_publicacao === iso) lista.push({ tipo: 'post', titulo: (c.etapa === 'postado' ? 'Postado: ' : 'Postar: ') + c.titulo, emoji: '🎬', feito: c.etapa === 'postado', abrir: () => Conteudo.abrir(c.id) });
    });

    if (window.Prospeccao) Prospeccao.lista().forEach(p => {
      if (p.status === 'enviada' && p.proximo_followup === iso) lista.push({ tipo: 'marca', titulo: `Follow-up da abordagem: ${p.marca}`, emoji: '📸', abrir: () => document.querySelector('[data-tab="aba-prospeccao"]').click() });
    });

    // Feriado primeiro, depois o dia inteiro, depois por horário
    return lista.sort((a, b) => (a.tipo === 'feriado' ? -1 : b.tipo === 'feriado' ? 1 : 0) || (a.hora || '').localeCompare(b.hora || ''));
  }

  // ===== Desenho =====
  function desenhar() {
    if (!raiz) return;
    const ano = mes.getFullYear(), m = mes.getMonth(), primeiro = new Date(ano, m, 1), dias = new Date(ano, m + 1, 0).getDate(), h = hoje();
    if (!sel) sel = h;
    let cel = '';
    for (let i = 0; i < primeiro.getDay(); i++) cel += '<div class="ag-dia fora"></div>';
    for (let d = 1; d <= dias; d++) {
      const iso = paraISO(new Date(ano, m, d)), evs = eventos(iso), fer = evs.find(e => e.tipo === 'feriado');
      const resto = evs.filter(e => e.tipo !== 'feriado');
      cel += `<button class="ag-dia ${iso === h ? 'hoje' : ''} ${iso === sel ? 'sel' : ''} ${iso < h ? 'passado' : ''} ${fer ? 'feriado' : ''}" data-ag-dia="${iso}" aria-label="${d}${fer ? ', ' + esc(fer.titulo) : ''}, ${resto.length} itens">
        <span class="num">${d}</span>
        ${fer ? `<span class="ag-fer">🎉 ${esc(fer.titulo.replace(' (ponto facultativo)', ''))}</span>` : ''}
        ${resto.slice(0, 3).map(e => `<span class="ag-ev ${e.tipo} ${e.feito ? 'feito' : ''}">${e.hora ? `<b>${e.hora}</b> ` : ''}${esc(e.titulo)}</span>`).join('')}
        ${resto.length > 3 ? `<span class="ag-mais">+${resto.length - 3}</span>` : ''}
        ${resto.length ? `<span class="ag-pontos">${resto.slice(0, 4).map(e => `<i class="${e.tipo}"></i>`).join('')}</span>` : ''}
      </button>`;
    }
    const titulo = maiuscula(primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
    const evSel = eventos(sel), nomeSel = maiuscula(deISO(sel).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
    raiz.innerHTML = `
      <div class="marcas-barra"><p class="saudacao">Trabalho e vida no mesmo calendário.</p>
        <div class="tarefas-botoes"><button class="btn-secundario" data-ag-exportar>📅 Levar para o Google ou iPhone</button><button class="btn-primario" data-ag-novo="${sel}">+ Adicionar</button></div></div>
      <div class="agenda">
        <div class="cartao ag-mes">
          <div class="cal-cab"><button class="cal-nav" data-ag-mes="-1" aria-label="Mês anterior">‹</button><h2>${titulo}</h2><button class="cal-nav" data-ag-mes="1" aria-label="Próximo mês">›</button></div>
          <div class="ag-topo-acoes"><button class="mini-btn" data-ag-hoje>Hoje</button></div>
          <div class="legenda"><span class="trabalho">Trabalho</span><span class="vida">Compromissos</span><span class="marca">Marcas</span><span class="post">Conteúdo</span><span class="feriado">Feriado</span></div>
          <div class="ag-grade">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(s => `<div class="sem">${s}</div>`).join('')}${cel}</div>
        </div>
        <div class="cartao ag-lado">
          <div class="ag-lado-cab"><h2>${nomeSel}</h2><button class="mini-btn" data-ag-novo="${sel}">+ Adicionar</button></div>
          ${evSel.length ? `<div class="ag-lista">${evSel.map((e, i) => `<button class="ag-item ${e.tipo} ${e.feito ? 'feito' : ''}" ${e.abrir ? `data-ag-abrir="${i}"` : 'disabled'}>
              <span class="ag-hora">${e.hora || (e.tipo === 'feriado' ? '' : 'dia')}</span>
              <span class="ag-txt"><b>${e.emoji} ${esc(e.titulo)}</b>${e.sub ? `<small>${esc(e.sub)}</small>` : ''}</span>
            </button>`).join('')}</div>`
            : '<p class="vazio">Nada marcado. Toque em "+ Adicionar" para colocar qualquer coisa: buscar o filho na escola, ligar para uma marca, médico...</p>'}
          <div class="ag-rapido">
            <span>Atalhos:</span>
            ${[['📌', 'Compromisso', 'compromisso'], ['🌸', 'Pessoal', 'pessoal'], ['📞', 'Ligar para marca', 'marca'], ['🎥', 'Gravar', 'gravar']].map(([e, n, c]) => `<button class="mini-btn" data-ag-novo="${sel}" data-ag-cat="${c}" data-ag-tit="${n === 'Ligar para marca' ? 'Ligar para ' : ''}">${e} ${n}</button>`).join('')}
          </div>
        </div>
      </div>`;
    raiz._eventosSel = evSel;
  }

  function novo(dataIso, cat, titulo) {
    if (!window.Tarefas) return;
    Tarefas.novaAqui({ data: dataIso, categoria: cat || 'compromisso', titulo: titulo || '', duracao_min: cat && !Tarefas.LIVRES.includes(cat) ? undefined : 30 });
  }

  function exportar() {
    const lista = (window.Tarefas ? Tarefas.lista() : []).filter(t => t.data && t.hora && !t.concluida && (t.repetir || t.data >= hoje()));
    if (!lista.length) return alert('Ainda não tem nada com dia e horário para levar.');
    Tarefas.exportar(lista);
  }

  window.Agenda = {
    iniciar(el) {
      raiz = el;
      raiz.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ag-dia], [data-ag-mes], [data-ag-hoje], [data-ag-novo], [data-ag-abrir], [data-ag-exportar]'); if (!b) return;
        if (b.dataset.agDia) { sel = b.dataset.agDia; return desenhar(); }
        if (b.dataset.agMes) { mes.setMonth(mes.getMonth() + Number(b.dataset.agMes)); return desenhar(); }
        if (b.matches('[data-ag-hoje]')) { mes = new Date(); mes.setDate(1); sel = hoje(); return desenhar(); }
        if (b.matches('[data-ag-novo]')) return novo(b.dataset.agNovo, b.dataset.agCat, b.dataset.agTit);
        if (b.matches('[data-ag-exportar]')) return exportar();
        const ev = (raiz._eventosSel || [])[Number(b.dataset.agAbrir)]; if (ev && ev.abrir) ev.abrir();
      });
      // Quando algo muda nas tarefas, a agenda se atualiza
      document.addEventListener('oug:tarefas', () => { if (raiz.classList.contains('ativo')) desenhar(); });
    },
    aoAbrir: () => desenhar()
  };
})();
