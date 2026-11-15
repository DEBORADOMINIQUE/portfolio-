/* =========================================================
   crescimento.js · "Você está crescendo no UGC?"
   Compara o período atual com o anterior usando os dados de
   todas as áreas e dá um veredito, os destaques e onde agir.
   Não usa IA: são regras claras sobre os seus números.
   ========================================================= */
(function () {
  let raiz, janela = 30;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paraISO = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dia = (v) => v ? paraISO(new Date(v.length > 10 ? v : v + 'T12:00:00')) : null;
  const somaDias = (iso, n) => { const [a, m, d] = iso.split('-').map(Number); const x = new Date(a, m - 1, d); x.setDate(x.getDate() + n); return paraISO(x); };
  const moeda = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const pctTxt = (n) => Math.round(n * 100) + '%';
  const nome = () => (window.Tarefas ? Tarefas.nome() : 'Deusa');

  function janelas() {
    const hoje = paraISO(new Date());
    const ini = somaDias(hoje, -(janela - 1));
    return { atual: [ini, hoje], anterior: [somaDias(ini, -janela), somaDias(ini, -1)] };
  }
  const dentro = (d, [a, b]) => d && d >= a && d <= b;

  // Quando a parceria fechou (primeira etapa "fechada" do histórico)
  function fechouEm(m) {
    const h = (m.historico || []).find(x => ['aguardando', 'producao', 'entregue', 'concluida'].includes(x.etapa));
    return dia(h && h.em ? h.em : m.created_at);
  }

  // ===== As métricas: cada uma diz o valor no período, o peso e uma dica se cair =====
  function metricas() {
    const ev = window.Painel ? Painel.eventos() : [], ld = window.Painel ? Painel.leads() : [];
    const mc = window.Marcas ? Marcas.lista() : [], pr = window.Prospeccao ? Prospeccao.lista() : [];
    const tf = window.Tarefas ? Tarefas.lista() : [], ct = window.Conteudo ? Conteudo.lista() : [];
    const fechadas = mc.filter(m => ['aguardando', 'producao', 'entregue', 'concluida'].includes(m.etapa));

    const M = [
      { id: 'visitas', grupo: 'Vitrine', nome: 'Visitas ao portfólio', peso: 1, fmt: 'n',
        calc: (j) => ev.filter(e => e.event_type === 'page_view' && dentro(dia(e.created_at), j)).length,
        dica: 'Divulgue o link do portfólio na bio, nos stories e em cada abordagem.' },
      { id: 'mensagens', grupo: 'Vitrine', nome: 'Mensagens pelo site', peso: 1.5, fmt: 'n',
        calc: (j) => ld.filter(l => dentro(dia(l.created_at), j)).length,
        dica: 'Deixe o botão de contato mais visível e chame para ele nos seus posts.' },
      { id: 'abordagens', grupo: 'Prospecção', nome: 'Abordagens feitas', peso: 1, fmt: 'n',
        calc: (j) => pr.filter(p => dentro(p.data_abordagem, j)).length,
        dica: 'Reserve um horário fixo nas Tarefas só para prospectar.' },
      { id: 'aprovacao', grupo: 'Prospecção', nome: 'Taxa de aprovação', peso: 1.5, fmt: '%', min: 5,
        base: (j) => pr.filter(p => dentro(p.data_abordagem, j)).length,
        calc: (j) => { const l = pr.filter(p => dentro(p.data_abordagem, j)); return l.length ? l.filter(p => p.status === 'aprovada').length / l.length : 0; },
        dica: 'Veja em "Meus textos" qual abordagem aprova mais e use mais ela.' },
      { id: 'fechadas', grupo: 'Negócio', nome: 'Parcerias fechadas', peso: 2, fmt: 'n',
        calc: (j) => fechadas.filter(m => dentro(fechouEm(m), j)).length,
        dica: 'Faça os follow-ups em dia: muita parceria fecha na segunda mensagem.' },
      { id: 'recebido', grupo: 'Negócio', nome: 'Dinheiro recebido', peso: 2.5, fmt: 'R$',
        calc: (j) => fechadas.filter(m => m.pago && dentro(m.data_pagamento, j)).reduce((s, m) => s + Number(m.valor || 0), 0),
        dica: 'Confira o "A receber" no Financeiro e cobre os pagamentos atrasados.' },
      { id: 'ticket', grupo: 'Negócio', nome: 'Valor médio por parceria', peso: 1.5, fmt: 'R$', min: 2,
        base: (j) => fechadas.filter(m => Number(m.valor) > 0 && dentro(fechouEm(m), j)).length,
        calc: (j) => { const l = fechadas.filter(m => Number(m.valor) > 0 && dentro(fechouEm(m), j)); return l.length ? l.reduce((s, m) => s + Number(m.valor), 0) / l.length : 0; },
        dica: 'Use o Simulador antes de responder: ofereça licença e pacotes em vez de baixar o preço.' },
      { id: 'lucro', grupo: 'Negócio', nome: 'Lucro', peso: 1.5, fmt: 'R$',
        calc: (j) => fechadas.filter(m => m.pago && dentro(m.data_pagamento, j)).reduce((s, m) => s + Number(m.valor || 0), 0) - (window.Financeiro ? Financeiro.gastosEntre(j[0], j[1]) : 0),
        dica: 'Revise as despesas fixas no Financeiro: alguma assinatura pode sair.' },
      { id: 'prazo', grupo: 'Qualidade', nome: 'Entregas no prazo', peso: 1, fmt: '%', min: 1,
        base: (j) => mc.filter(m => m.data_entrega && dentro(m.data_entregue, j)).length,
        calc: (j) => { const l = mc.filter(m => m.data_entrega && dentro(m.data_entregue, j)); return l.length ? l.filter(m => m.data_entregue <= m.data_entrega).length / l.length : 0; },
        dica: 'Use o "Plano para uma marca" nas Tarefas para dividir o trabalho até a entrega.' },
      { id: 'nota', grupo: 'Qualidade', nome: 'Nota das marcas', peso: 1, fmt: 'nota', min: 1,
        base: (j) => mc.filter(m => m.feedback_nota && dentro(m.data_entregue || dia(m.updated_at), j)).length,
        calc: (j) => { const l = mc.filter(m => m.feedback_nota && dentro(m.data_entregue || dia(m.updated_at), j)); return l.length ? l.reduce((s, m) => s + m.feedback_nota, 0) / l.length : 0; },
        dica: 'Releia os feedbacks: o que as marcas pedem de ajuste se repete?' },
      { id: 'postados', grupo: 'Constância', nome: 'Conteúdos postados', peso: 1, fmt: 'n',
        calc: (j) => ct.filter(c => c.etapa === 'postado' && dentro(c.data_publicacao, j)).length,
        dica: 'Planeje a semana na aba Conteúdo e grave em lote.' },
      { id: 'tarefas', grupo: 'Constância', nome: 'Tarefas concluídas', peso: 0.5, fmt: 'n',
        calc: (j) => tf.filter(t => t.concluida && dentro(dia(t.concluida_em), j)).length,
        dica: 'Reserve menos coisas por dia: constância vale mais que dia cheio.' }
    ];

    const { atual, anterior } = janelas();
    return M.map(m => {
      const a = m.calc(atual), b = m.calc(anterior);
      // Sem dados suficientes nos dois períodos, a métrica fica de fora do veredito
      const temBase = m.min ? (m.base(atual) >= m.min && m.base(anterior) >= m.min) : (a !== 0 || b !== 0);
      let variacao = null;
      if (temBase) variacao = b === 0 ? (a > 0 ? 1 : 0) : (a - b) / Math.abs(b);
      return { ...m, atual: a, anterior: b, variacao, conta: temBase };
    });
  }

  function formatar(m, v) {
    if (m.fmt === 'R$') return moeda(v);
    if (m.fmt === '%') return pctTxt(v);
    if (m.fmt === 'nota') return v ? v.toFixed(1).replace('.', ',') : '-';
    return String(Math.round(v));
  }

  // ===== O veredito =====
  function analisar() {
    const ms = metricas(), validas = ms.filter(m => m.conta);
    if (validas.length < 3) return { ms, validas, estado: 'aprendendo' };
    const limite = (v) => Math.max(-1, Math.min(1, v));
    const somaPesos = validas.reduce((s, m) => s + m.peso, 0);
    const indice = validas.reduce((s, m) => s + limite(m.variacao) * m.peso, 0) / somaPesos;
    const estado = indice > 0.1 ? 'crescendo' : indice < -0.1 ? 'caindo' : 'estavel';
    const ordenadas = validas.slice().sort((a, b) => b.variacao * b.peso - a.variacao * a.peso);
    return { ms, validas, estado, indice, melhores: ordenadas.filter(m => m.variacao > 0.05).slice(0, 3), atencao: ordenadas.filter(m => m.variacao < -0.05).reverse().slice(0, 3) };
  }

  function frase(m) {
    const d = m.atual - m.anterior;
    if (m.fmt === 'R$') return `${m.nome}: ${moeda(m.anterior)} → <b>${moeda(m.atual)}</b>`;
    if (m.fmt === '%') return `${m.nome}: ${pctTxt(m.anterior)} → <b>${pctTxt(m.atual)}</b>`;
    if (m.fmt === 'nota') return `${m.nome}: ${formatar(m, m.anterior)} → <b>${formatar(m, m.atual)}</b>`;
    return `${m.nome}: <b>${d > 0 ? '+' : ''}${Math.round(d)}</b> (${Math.round(m.anterior)} → ${Math.round(m.atual)})`;
  }

  function desenhar() {
    if (!raiz) return;
    const r = analisar();
    const VEREDITO = {
      crescendo: { emoji: '📈', titulo: `Sim, ${esc(nome())}! Você está crescendo no UGC`, cor: 'ok' },
      estavel: { emoji: '➡️', titulo: 'Você está estável', cor: 'alerta' },
      caindo: { emoji: '📉', titulo: 'Seu ritmo desacelerou neste período', cor: 'atraso' },
      aprendendo: { emoji: '✦', titulo: 'Ainda estou conhecendo os seus números', cor: 'neutro' }
    }[r.estado];
    const sub = r.estado === 'aprendendo'
      ? `Preciso de pelo menos 3 indicadores com dados nos dois períodos (agora tenho ${r.validas.length}). Continue registrando abordagens, marcas, tarefas e conteúdos que eu te digo se você está crescendo.`
      : r.estado === 'crescendo' ? 'Seus números dos últimos dias estão melhores que os do período anterior. Continua assim!'
      : r.estado === 'estavel' ? 'Seus números estão parecidos com os do período anterior. Escolha um ponto abaixo para dar o próximo passo.'
      : 'Acontece com todo mundo. Veja abaixo onde agir primeiro: um ajuste de cada vez.';
    // Sem site de portfólio (clientes), o grupo Vitrine não aparece
    const grupos = [...new Set(r.ms.map(m => m.grupo))].filter(g => g !== 'Vitrine' || !window.Painel || window.Painel.temSite);
    raiz.innerHTML = `<div class="cartao crescimento ${VEREDITO.cor}">
      <div class="cr-topo">
        <div class="cr-titulo"><span class="cr-emoji">${VEREDITO.emoji}</span><div><h2>${VEREDITO.titulo}</h2><p class="desc">${sub}</p></div></div>
        <div class="visoes cr-janela"><button class="vis-btn ${janela === 30 ? 'ativo' : ''}" data-crj="30">30 dias</button><button class="vis-btn ${janela === 90 ? 'ativo' : ''}" data-crj="90">90 dias</button></div>
      </div>
      ${r.estado !== 'aprendendo' ? `<div class="cr-medidor" title="Índice de crescimento"><div style="left:${50 + r.indice * 50}%"></div></div>
        <div class="cr-colunas">
          <div><h3>✦ O que mais melhorou</h3>${r.melhores.length ? `<ul>${r.melhores.map(m => `<li>${frase(m)}</li>`).join('')}</ul>` : '<p class="desc">Nada subiu de forma clara ainda.</p>'}</div>
          <div><h3>⚠ Onde prestar atenção</h3>${r.atencao.length ? `<ul>${r.atencao.map(m => `<li>${frase(m)}<small>${esc(m.dica)}</small></li>`).join('')}</ul>` : '<p class="desc">Nada caiu. Arrasou! ✦</p>'}</div>
        </div>` : ''}
      <details class="cr-detalhes"><summary>Ver todos os indicadores (${janela} dias atuais x ${janela} anteriores)</summary>
        <div class="cr-grade">${grupos.map(g => `<div><h4>${g}</h4>${r.ms.filter(m => m.grupo === g).map(m => {
          const seta = !m.conta ? '·' : m.variacao > 0.05 ? '▲' : m.variacao < -0.05 ? '▼' : '=';
          const cls = !m.conta ? 'sem' : m.variacao > 0.05 ? 'sobe' : m.variacao < -0.05 ? 'desce' : 'igual';
          return `<div class="cr-linha ${cls}"><span>${m.nome}</span><span>${m.conta || m.atual ? formatar(m, m.atual) : '-'} <i>${seta}${m.conta && m.variacao !== 0 && Math.abs(m.variacao) < 10 ? ' ' + (m.variacao > 0 ? '+' : '') + Math.round(m.variacao * 100) + '%' : ''}</i></span></div>`;
        }).join('')}</div>`).join('')}</div>
        <p class="desc">Indicadores com "·" ainda não têm dados suficientes e ficam fora do veredito. O veredito pesa mais dinheiro recebido e parcerias fechadas.</p>
      </details>
    </div>`;
  }

  window.Crescimento = {
    iniciar(el) {
      raiz = el;
      raiz.addEventListener('click', (e) => { const b = e.target.closest('[data-crj]'); if (b) { janela = Number(b.dataset.crj); desenhar(); } });
      // Espera as áreas carregarem e desenha (e de novo depois, para pegar quem chegou atrasado)
      setTimeout(desenhar, 1500); setTimeout(desenhar, 4000);
    },
    desenhar
  };
})();
