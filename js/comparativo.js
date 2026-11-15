/* =========================================================
   comparativo.js · Aba "Comparativo" do UGC Organized
   Mês a mês: prospecção, negócio, entrega e constância.
   Mostra o melhor mês, o que caiu e sugere metas palpáveis
   para o próximo mês, sempre a partir do que já foi feito.
   ========================================================= */
(function () {
  let raiz, meses = 6;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const moeda = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const paraISO = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dia = (v) => v ? (String(v).length > 10 ? paraISO(new Date(v)) : String(v).slice(0, 10)) : null;
  const mesDe = (v) => { const d = dia(v); return d ? d.slice(0, 7) : null; };
  const nomeMes = (k, curto) => { const [a, m] = k.split('-').map(Number); const t = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', curto ? { month: 'short' } : { month: 'long' }).replace('.', ''); return t.charAt(0).toUpperCase() + t.slice(1) + (curto ? '/' + String(a).slice(2) : ''); };
  const nome = () => (window.Tarefas ? Tarefas.nome() : G.apelido());

  function chavesMeses() {
    const hoje = new Date(), lista = [];
    for (let i = meses - 1; i >= 0; i--) { const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1); lista.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); }
    return lista;
  }
  function fechouEm(m) {
    const h = (m.historico || []).find(x => ['aguardando', 'producao', 'entregue', 'concluida'].includes(x.etapa));
    return h && h.em ? h.em : m.created_at;
  }

  // ===== As linhas da tabela =====
  function linhas() {
    const pr = window.Prospeccao ? Prospeccao.lista() : [], mc = window.Marcas ? Marcas.lista() : [];
    const tf = window.Tarefas ? Tarefas.lista() : [], ct = window.Conteudo ? Conteudo.lista() : [];
    const fechadas = mc.filter(m => ['aguardando', 'producao', 'entregue', 'concluida'].includes(m.etapa));
    const doMes = (lista, campo, k) => lista.filter(x => mesDe(typeof campo === 'function' ? campo(x) : x[campo]) === k);
    const ultimoDia = (k) => { const [a, m] = k.split('-').map(Number); return paraISO(new Date(a, m, 0)); };
    const gastos = (k) => window.Financeiro ? Financeiro.gastosEntre(k + '-01', ultimoDia(k)) : 0;
    const recebido = (k) => fechadas.filter(m => m.pago && mesDe(m.data_pagamento) === k).reduce((s, m) => s + Number(m.valor || 0), 0);
    return [
      { grupo: 'Prospecção', id: 'abordagens', nome: 'Abordagens feitas', fmt: 'n', meta: true, calc: (k) => doMes(pr, 'data_abordagem', k).length,
        dica: 'Reserve um horário fixo nas Tarefas só para prospectar.' },
      { grupo: 'Prospecção', id: 'respostas', nome: 'Marcas que responderam', fmt: 'n', calc: (k) => doMes(pr, 'data_abordagem', k).filter(p => p.status !== 'enviada').length,
        dica: 'Faça o follow-up no 3º dia: muitas marcas só respondem na segunda mensagem.' },
      { grupo: 'Prospecção', id: 'aprovadas', nome: 'Aprovadas', fmt: 'n', calc: (k) => doMes(pr, 'data_abordagem', k).filter(p => p.status === 'aprovada').length },
      { grupo: 'Prospecção', id: 'taxa', nome: 'Taxa de aprovação', fmt: '%', calc: (k) => { const l = doMes(pr, 'data_abordagem', k); return l.length >= 3 ? l.filter(p => p.status === 'aprovada').length / l.length : null; },
        dica: 'Veja em "Meus textos" qual abordagem aprova mais e use mais ela.' },
      { grupo: 'Negócio', id: 'fechadas', nome: 'Parcerias fechadas', fmt: 'n', meta: true, calc: (k) => doMes(fechadas, fechouEm, k).length,
        dica: 'Marcas do seu Banco de marcas fecham mais fácil: faça as repescagens.' },
      { grupo: 'Negócio', id: 'fechado', nome: 'Valor fechado', fmt: 'R$', meta: true, calc: (k) => doMes(fechadas, fechouEm, k).reduce((s, m) => s + Number(m.valor || 0), 0),
        dica: 'Use o Simulador antes de responder: ofereça licença e pacotes em vez de baixar o preço.' },
      { grupo: 'Negócio', id: 'recebido', nome: 'Dinheiro recebido', fmt: 'R$', calc: recebido,
        dica: 'Coloque a data de cobrança em cada parceria para eu te lembrar.' },
      { grupo: 'Negócio', id: 'ticket', nome: 'Valor médio por parceria', fmt: 'R$', calc: (k) => { const l = doMes(fechadas, fechouEm, k).filter(m => Number(m.valor) > 0); return l.length ? l.reduce((s, m) => s + Number(m.valor), 0) / l.length : null; },
        dica: 'Ofereça um pacote (ex.: vídeo + fotos + licença) em vez de um item só.' },
      { grupo: 'Negócio', id: 'despesas', nome: 'Despesas', fmt: 'R$', menosMelhor: true, calc: gastos },
      { grupo: 'Negócio', id: 'lucro', nome: 'Lucro', fmt: 'R$', calc: (k) => recebido(k) - gastos(k),
        dica: 'Revise as despesas fixas no Financeiro: alguma assinatura pode sair.' },
      { grupo: 'Entrega', id: 'entregas', nome: 'Entregas feitas', fmt: 'n', calc: (k) => doMes(mc, 'data_entregue', k).length },
      { grupo: 'Entrega', id: 'prazo', nome: 'Entregas no prazo', fmt: '%', calc: (k) => { const l = doMes(mc, 'data_entregue', k).filter(m => m.data_entrega); return l.length ? l.filter(m => m.data_entregue <= m.data_entrega).length / l.length : null; },
        dica: 'Use o "Plano para uma marca" nas Tarefas para dividir o trabalho até a entrega.' },
      { grupo: 'Entrega', id: 'nota', nome: 'Nota das marcas', fmt: 'nota', calc: (k) => { const l = doMes(mc, 'data_entregue', k).filter(m => m.feedback_nota); return l.length ? l.reduce((s, m) => s + m.feedback_nota, 0) / l.length : null; },
        dica: 'Releia os feedbacks: os ajustes que as marcas pedem costumam se repetir.' },
      { grupo: 'Constância', id: 'postados', nome: 'Conteúdos postados', fmt: 'n', calc: (k) => doMes(ct.filter(c => c.etapa === 'postado'), 'data_publicacao', k).length,
        dica: 'Planeje a semana na aba Conteúdo e grave em lote.' },
      { grupo: 'Constância', id: 'tarefas', nome: 'Tarefas concluídas', fmt: 'n', calc: (k) => doMes(tf.filter(t => t.concluida), 'concluida_em', k).length },
      { grupo: 'Nicho', id: 'nicho', nome: 'Nicho que mais fechou', fmt: 'txt', calc: (k) => {
          const g = {}; doMes(fechadas, fechouEm, k).forEach(m => { const n = String(m.nicho || '').trim(); if (n) g[n] = (g[n] || 0) + Number(m.valor || 0) + 0.001; });
          const top = Object.entries(g).sort((a, b) => b[1] - a[1])[0]; return top ? top[0] : null; } }
    ];
  }

  function fmt(l, v) {
    if (v === null || v === undefined) return '-';
    if (l.fmt === 'R$') return moeda(v);
    if (l.fmt === '%') return Math.round(v * 100) + '%';
    if (l.fmt === 'nota') return v.toFixed(1).replace('.', ',');
    if (l.fmt === 'txt') return esc(v.charAt(0).toUpperCase() + v.slice(1));
    return String(Math.round(v));
  }

  function desenhar() {
    if (!raiz) return;
    const ks = chavesMeses(), atual = ks[ks.length - 1], ls = linhas();
    const tab = ls.map(l => ({ ...l, vals: ks.map(k => l.calc(k)) }));
    const temDados = tab.some(l => l.fmt !== 'txt' && l.vals.some(v => v));
    const prox = (() => { const [a, m] = atual.split('-').map(Number); const d = new Date(a, m, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })();

    // Meses completos (o atual ainda está em andamento)
    const completos = ks.slice(0, -1);
    const valsCompletos = (l) => l.vals.slice(0, -1);

    // Pontos a melhorar: último mês completo abaixo da média dos anteriores
    const melhorar = tab.filter(l => l.dica && !l.menosMelhor && l.fmt !== 'txt').map(l => {
      const v = valsCompletos(l), ult = v[v.length - 1], ant = v.slice(0, -1).filter(x => x !== null && x !== undefined && x > 0);
      if (ult === null || ult === undefined || ant.length < 1) return null;
      const media = ant.reduce((a, b) => a + b, 0) / ant.length;
      return media > 0 && ult < media * 0.9 ? { l, ult, media } : null;
    }).filter(Boolean).slice(0, 4);

    // Metas palpáveis: 10% acima do seu melhor ritmo recente (maior entre o último mês e a média dos 3 últimos)
    const metas = tab.filter(l => l.meta).map(l => {
      const v = valsCompletos(l).slice(-3).filter(x => x !== null && x !== undefined);
      const atualV = l.vals[l.vals.length - 1] || 0;
      const base = Math.max(v.length ? v[v.length - 1] : 0, v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0, atualV);
      if (!base) return null;
      let alvo = base * 1.1;
      alvo = l.fmt === 'R$' ? Math.ceil(alvo / 50) * 50 : Math.max(Math.ceil(alvo), Math.round(base) + 1);
      return { l, base, alvo };
    }).filter(Boolean);

    const celula = (l, v, i) => {
      const ant = i > 0 ? l.vals[i - 1] : null;
      let seta = '';
      if (l.fmt !== 'txt' && v !== null && v !== undefined && ant !== null && ant !== undefined && (v || ant)) {
        const sobe = v > ant, desce = v < ant;
        const bom = l.menosMelhor ? desce : sobe, ruim = l.menosMelhor ? sobe : desce;
        seta = bom ? '<i class="sobe">▲</i>' : ruim ? '<i class="desce">▼</i>' : '<i>=</i>';
      }
      const nums = l.vals.filter(x => typeof x === 'number');
      const melhor = l.fmt !== 'txt' && nums.length > 1 && typeof v === 'number' && v > 0 && v === (l.menosMelhor ? Math.min(...nums.filter(x => x > 0)) : Math.max(...nums));
      return `<td class="${melhor ? 'melhor' : ''} ${ks[i] === atual ? 'atual' : ''}">${fmt(l, v)}${seta}</td>`;
    };

    const grupos = [...new Set(tab.map(l => l.grupo))];
    raiz.innerHTML = `
      <div class="marcas-barra"><p class="saudacao">Mês a mês, para você ver o que melhorar e definir metas de verdade.</p>
        <div class="visoes"><button class="vis-btn ${meses === 3 ? 'ativo' : ''}" data-cm="3">3 meses</button><button class="vis-btn ${meses === 6 ? 'ativo' : ''}" data-cm="6">6 meses</button><button class="vis-btn ${meses === 12 ? 'ativo' : ''}" data-cm="12">12 meses</button></div>
      </div>
      ${!temDados ? '<div class="cartao"><p class="vazio">Ainda não tenho meses para comparar. Conforme você registrar abordagens, marcas, entregas e conteúdos, o comparativo vai se montando sozinho.</p></div>' : `
      <div class="grade comp-topo">
        <div class="cartao comp-metas">
          <h2>Metas palpáveis para ${nomeMes(prox)} ✦</h2>
          <p class="desc">10% acima do seu melhor ritmo recente. Desafiador, mas dá para chegar.</p>
          ${metas.length ? `<div class="comp-metas-lista">${metas.map(x => `<div class="comp-meta">
            <span>${x.l.nome}</span><b>${fmt(x.l, x.alvo)}</b><small>seu ritmo: ${fmt(x.l, x.base)}</small>
            ${x.l.id === 'fechado' ? `<button class="mini-btn" data-meta-fat="${x.alvo}">Usar como meta do mês</button>` : ''}
          </div>`).join('')}</div>` : '<p class="vazio">Preciso de pelo menos um mês com dados para sugerir metas.</p>'}
        </div>
        <div class="cartao comp-melhorar">
          <h2>Pontos a melhorar</h2>
          <p class="desc">O que ficou abaixo da sua média em ${completos.length ? nomeMes(completos[completos.length - 1]) : 'mês passado'}.</p>
          ${melhorar.length ? `<ul>${melhorar.map(x => `<li><b>${x.l.nome}</b>: ${fmt(x.l, x.ult)} (sua média é ${fmt(x.l, x.media)})<small>${esc(x.l.dica)}</small></li>`).join('')}</ul>`
            : `<p class="vazio">Nada abaixo da média, ${esc(nome())}. Continua assim! ✦</p>`}
        </div>
      </div>
      <div class="cartao comp-tabela-wrap">
        <h2>Mês a mês</h2>
        <p class="desc">▲ subiu e ▼ caiu em relação ao mês anterior. O destaque verde é o seu melhor mês em cada linha. ${nomeMes(atual)} ainda está em andamento.</p>
        <div class="comp-rolagem"><table class="comp-tabela">
          <thead><tr><th></th>${ks.map(k => `<th class="${k === atual ? 'atual' : ''}">${nomeMes(k, true)}${k === atual ? '<small>em andamento</small>' : ''}</th>`).join('')}</tr></thead>
          <tbody>${grupos.map(g => `<tr class="comp-grupo"><td colspan="${ks.length + 1}">${g}</td></tr>${tab.filter(l => l.grupo === g).map(l => `<tr><th>${l.nome}</th>${l.vals.map((v, i) => celula(l, v, i)).join('')}</tr>`).join('')}`).join('')}</tbody>
        </table></div>
      </div>`}`;
  }

  window.Comparativo = {
    iniciar(el) {
      raiz = el;
      raiz.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cm], [data-meta-fat]'); if (!b) return;
        if (b.dataset.cm) { meses = Number(b.dataset.cm); return desenhar(); }
        Tarefas.salvarPrefsParcial({ meta_faturamento: Number(b.dataset.metaFat) }).then(() => {
          desenhar(); if (window.Financeiro) Financeiro.aoAbrir();
          const t = document.getElementById('toast-marcas'); if (t) { t.textContent = 'Meta do mês atualizada no Financeiro ✦'; t.className = 'toast-m ativo'; setTimeout(() => t.classList.remove('ativo'), 2600); }
        }, () => {});
      });
    },
    aoAbrir: () => desenhar()
  };
})();
