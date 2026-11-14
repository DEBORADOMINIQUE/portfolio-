/* =========================================================
   financeiro.js · Área "Financeiro" do Organized UGC
   Faturado, recebido, a receber, despesas e lucro do mês.
   Os valores das parcerias vêm da área Marcas; despesas
   ficam na tabela "despesas" (ver financeiro.sql).
   ========================================================= */
(function () {
  const CATEGORIAS = {
    equipamento: '📷 Equipamento', apps: '📱 Apps e internet', impostos: '🧾 Impostos e MEI', produtos: '🛍️ Produtos e cenário',
    transporte: '🚗 Transporte', cursos: '📚 Cursos', marketing: '📣 Divulgação', outros: '✦ Outros'
  };
  let sb, raiz, despesas = [], mes = new Date(), carregado = false;
  mes.setDate(1);

  const $ = (s, el) => (el || raiz).querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const moeda = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const paraISO = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const deISO = (s) => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
  const hoje = () => paraISO(new Date());
  const chaveMes = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const fmtCurta = (iso) => iso ? deISO(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
  const nomeMes = (d, curto) => { const t = d.toLocaleDateString('pt-BR', curto ? { month: 'short' } : { month: 'long', year: 'numeric' }).replace('.', ''); return t.charAt(0).toUpperCase() + t.slice(1); };
  const lerValor = (v) => { const b = String(v || '').trim().replace(/[R$\s]/g, ''); if (!b) return null; const n = Number(b.includes(',') ? b.replace(/\./g, '').replace(',', '.') : b); return isFinite(n) ? n : NaN; };
  const marcas = () => (window.Marcas ? Marcas.lista() : []);
  const fechadas = () => marcas().filter(m => ['aguardando', 'producao', 'entregue', 'concluida'].includes(m.etapa) && Number(m.valor) > 0);
  const nomeDela = () => (window.Tarefas ? Tarefas.nome() : 'Deusa');

  function toast(msg, erro) {
    let t = document.getElementById('toast-marcas');
    if (!t) { t = document.createElement('div'); t.id = 'toast-marcas'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast-m ativo' + (erro ? ' erro' : '');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('ativo'), 2800);
  }

  // Quando a parceria fechou (primeira vez que entrou numa etapa "fechada")
  function dataFechamento(m) {
    const h = (m.historico || []).find(x => ['aguardando', 'producao', 'entregue', 'concluida'].includes(x.etapa));
    return (h && h.em ? h.em : m.created_at).slice(0, 10);
  }

  // Despesas que contam num mês (as recorrentes contam todo mês, desde a data até "ate")
  function despesasDoMes(k) {
    return despesas.filter(d => {
      const ini = d.data.slice(0, 7);
      if (!d.recorrente) return ini === k;
      return ini <= k && (!d.ate || d.ate.slice(0, 7) >= k);
    });
  }

  function resumo(k) {
    const recebido = fechadas().filter(m => m.pago && m.data_pagamento && m.data_pagamento.slice(0, 7) === k).reduce((s, m) => s + Number(m.valor), 0);
    const faturado = fechadas().filter(m => dataFechamento(m).slice(0, 7) === k).reduce((s, m) => s + Number(m.valor), 0);
    const gastos = despesasDoMes(k).reduce((s, d) => s + Number(d.valor), 0);
    return { recebido, faturado, gastos, lucro: recebido - gastos };
  }

  // ===== Plano para bater a meta do mês =====
  // Valor médio por parceria + taxa de aprovação da Prospecção + dias de trabalho que faltam
  function plano() {
    if (!carregado || !window.Tarefas) return null;
    const prefs = Tarefas.prefs(), meta = Number(prefs.meta_faturamento) || 0;
    if (!meta) return null;
    const agora = new Date(), k = chaveMes(agora), faltam = meta - resumo(k).faturado;
    if (faltam <= 0) return { batida: true, meta };
    // Valor médio: parcerias fechadas nos últimos 6 meses; se não tiver, o preço do vídeo no Simulador
    const lim = paraISO(new Date(agora.getFullYear(), agora.getMonth() - 6, 1));
    const recentes = fechadas().filter(m => dataFechamento(m) >= lim);
    let ticket = recentes.length ? recentes.reduce((s, m) => s + Number(m.valor), 0) / recentes.length : null, origemTicket = 'media';
    if (!ticket) { const v = (prefs.precos || []).find(p => p.tipo === 'unidade' && p.conteudo && Number(p.ref) > 0); if (v) { ticket = Number(v.ref); origemTicket = 'simulador'; } }
    if (!ticket) return { semTicket: true, meta, faltam };
    ticket = Math.round(ticket);
    const marcasFechar = Math.ceil(faltam / ticket);
    // Taxa de aprovação: a sua, com pelo menos 10 abordagens; senão, 5% como ponto de partida
    const est = window.Prospeccao ? Prospeccao.estatisticas() : { total: 0, aprovadas: 0 };
    const taxaReal = est.total >= 10 && est.aprovadas > 0;
    const taxa = taxaReal ? est.aprovadas / est.total : 0.05;
    const abordagens = Math.ceil(marcasFechar / taxa);
    // Dias de trabalho que ainda restam no mês (inclui hoje)
    const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
    let dias = 0; for (let d = agora.getDate(); d <= fim; d++) if ((prefs.dias || [1, 2, 3, 4, 5]).includes(new Date(agora.getFullYear(), agora.getMonth(), d).getDay())) dias++;
    return { meta, faltam, ticket, origemTicket, marcasFechar, taxa, taxaReal, amostra: est.total, abordagens, dias, porDia: dias ? Math.ceil(abordagens / dias) : null };
  }

  function desenharPlano() {
    const el = $('#f-plano'), atual = chaveMes(mes) === chaveMes(new Date()), p = atual ? plano() : null;
    el.hidden = !p || p.batida;
    if (el.hidden) return;
    if (p.semTicket) { el.innerHTML = `<h2>Como chegar na sua meta ✦</h2><p class="desc">Faltam ${moeda(p.faltam)}. Para eu calcular quantas marcas você precisa, cadastre seus preços no Simulador ou coloque o valor nas parcerias fechadas.</p>`; return; }
    el.innerHTML = `<h2>Como chegar na sua meta ✦</h2>
      <p class="plano-frase">Deusa, faltam <b>${moeda(p.faltam)}</b> para os seus ${moeda(p.meta)}. Se você fechar <b>${p.marcasFechar} ${p.marcasFechar === 1 ? 'marca' : 'marcas'}</b> de ${moeda(p.ticket)}, você chega lá.
      Vamos, você consegue! 💪</p>
      <div class="plano-passos">
        <div><b>${p.marcasFechar}</b><small>${p.marcasFechar === 1 ? 'marca fecha' : 'marcas fecham'}</small></div><span>→</span>
        <div><b>${moeda(p.marcasFechar * p.ticket)}</b><small>na conta</small></div>
      </div>
      <p class="desc plano-base">Conta feita com ${p.origemTicket === 'media' ? 'o seu valor médio por parceria' : 'o preço do seu vídeo no Simulador'}.</p>`;
  }

  async function usarPlano() {
    const p = plano(); if (!p || !p.porDia) return;
    try { await Tarefas.salvarPrefsParcial({ meta_abordagens: p.porDia }); desenhar(); if (window.Prospeccao) Prospeccao.aoAbrir(); toast(`Meta: ${p.porDia} abordagens por dia. Bora, Deusa! ✦`); }
    catch (e) { console.error(e); toast('Não consegui salvar a meta.', true); }
  }

  // ===== Desenho =====
  function desenhar() {
    if (!carregado) return;
    const k = chaveMes(mes), r = resumo(k);
    const aReceber = fechadas().filter(m => !m.pago);
    const totalReceber = aReceber.reduce((s, m) => s + Number(m.valor), 0);
    const meta = window.Tarefas ? Number(Tarefas.prefs().meta_faturamento) || 0 : 0;
    const semNF = fechadas().filter(m => m.pago && !m.nf_emitida);

    $('#f-mes').innerHTML = `<button class="cal-nav" data-fmes="-1" aria-label="Mês anterior">‹</button><h2>${nomeMes(mes)}</h2><button class="cal-nav" data-fmes="1" aria-label="Próximo mês">›</button>`;

    $('#f-meta').innerHTML = meta
      ? `<div class="meta-topo"><div class="meta-num menor">${moeda(r.faturado)}</div>
          <div class="meta-info"><strong>${r.faturado >= meta ? `Meta do mês batida, ${esc(nomeDela())}! ✦` : 'Fechado neste mês'}</strong>
          <div class="carga ${r.faturado >= meta ? 'ok' : ''}"><div style="width:${Math.min(100, r.faturado / meta * 100)}%"></div></div>
          <small>${r.faturado >= meta ? 'Tudo que vier agora é bônus.' : `Faltam ${moeda(meta - r.faturado)} para a meta de ${moeda(meta)}.`}</small></div>
          <button class="mini-btn" data-fmeta>Meta: ${moeda(meta)}</button></div>`
      : `<div class="meta-topo"><div class="meta-info"><strong>Qual é a sua meta de faturamento por mês?</strong><small>Com uma meta, eu te mostro quanto falta e comemoro com você quando bater.</small></div><button class="btn-primario" data-fmeta>Definir meta</button></div>`;

    $('#f-numeros').innerHTML = `
      <div class="cartao numero destaque"><div class="rotulo">Recebido no mês</div><div class="valor menor">${moeda(r.recebido)}</div><div class="extra">dinheiro que entrou</div></div>
      <div class="cartao numero"><div class="rotulo">Fechado no mês</div><div class="valor menor">${moeda(r.faturado)}</div><div class="extra">parcerias fechadas</div></div>
      <div class="cartao numero"><div class="rotulo">A receber</div><div class="valor menor">${moeda(totalReceber)}</div><div class="extra">${aReceber.length} ${aReceber.length === 1 ? 'parceria' : 'parcerias'}</div></div>
      <div class="cartao numero"><div class="rotulo">Despesas do mês</div><div class="valor menor">${moeda(r.gastos)}</div><div class="extra">${despesasDoMes(k).length} lançamentos</div></div>
      <div class="cartao numero"><div class="rotulo">Lucro do mês</div><div class="valor menor ${r.lucro < 0 ? 'negativo' : ''}">${moeda(r.lucro)}</div><div class="extra">recebido menos despesas</div></div>`;

    // Gráfico dos últimos 6 meses
    const meses = Array.from({ length: 6 }, (_, i) => { const d = new Date(mes); d.setMonth(d.getMonth() - 5 + i); return d; });
    const dados = meses.map(d => ({ d, ...resumo(chaveMes(d)) }));
    const max = Math.max(1, ...dados.map(x => Math.max(x.recebido, x.gastos)));
    $('#f-grafico').innerHTML = `<h2>Últimos 6 meses</h2>
      <div class="legenda"><span class="recebido">Recebido</span><span class="gasto">Despesas</span></div>
      <div class="f-barras">${dados.map(x => `<div class="f-mes-col" tabindex="0">
        <span class="dica">${nomeMes(x.d, true)}: recebido ${moeda(x.recebido)} · despesas ${moeda(x.gastos)} · lucro ${moeda(x.lucro)}</span>
        <div class="f-par"><div class="f-b recebido" style="height:${Math.max(2, x.recebido / max * 100)}%"></div><div class="f-b gasto" style="height:${Math.max(2, x.gastos / max * 100)}%"></div></div>
        <small>${nomeMes(x.d, true)}</small></div>`).join('')}</div>`;

    desenharPlano();

    // A receber
    $('#f-receber').innerHTML = `<h2>A receber</h2><p class="desc">Parcerias fechadas que ainda não pagaram. A data é a previsão de pagamento que você colocou na marca.</p>
      ${aReceber.length ? `<div class="f-lista">${aReceber.sort((a, b) => (a.data_pagamento || '9999').localeCompare(b.data_pagamento || '9999')).map(m => {
        const atrasado = m.data_pagamento && m.data_pagamento < hoje();
        return `<div class="f-item ${atrasado ? 'atrasado' : ''}">
          <div class="f-corpo" data-marca="${m.id}"><strong>${esc(m.nome)}</strong><small>${[esc(m.entregaveis || ''), m.data_pagamento ? `${atrasado ? 'era para' : 'previsto'} ${fmtCurta(m.data_pagamento)}` : 'sem previsão'].filter(Boolean).join(' · ')}</small></div>
          <span class="f-valor">${moeda(m.valor)}</span>
          <button class="mini-btn zap" data-recebi="${m.id}">✓ Recebi</button>
        </div>`; }).join('')}</div>` : '<p class="vazio">Nada pendente. Tudo recebido ✦</p>'}`;

    // Recebido no mês
    const recebidos = fechadas().filter(m => m.pago && m.data_pagamento && m.data_pagamento.slice(0, 7) === k).sort((a, b) => b.data_pagamento.localeCompare(a.data_pagamento));
    $('#f-recebidos').innerHTML = `<h2>Recebido em ${nomeMes(mes).split(' ')[0].toLowerCase()}</h2>
      ${semNF.length ? `<div class="aviso-nf">🧾 ${semNF.length} ${semNF.length === 1 ? 'pagamento recebido sem nota fiscal marcada' : 'pagamentos recebidos sem nota fiscal marcada'}. Toque em "NF" quando emitir.</div>` : ''}
      ${recebidos.length ? `<div class="f-lista">${recebidos.map(m => `<div class="f-item">
          <div class="f-corpo" data-marca="${m.id}"><strong>${esc(m.nome)}</strong><small>recebido em ${fmtCurta(m.data_pagamento)}${m.nf_numero ? ` · NF ${esc(m.nf_numero)}` : ''}</small></div>
          <span class="f-valor ok">${moeda(m.valor)}</span>
          <button class="mini-btn nf ${m.nf_emitida ? 'emitida' : ''}" data-nf="${m.id}" title="${m.nf_emitida ? 'Nota emitida' : 'Marcar nota fiscal emitida'}">${m.nf_emitida ? '✓ NF' : 'NF'}</button>
        </div>`).join('')}</div>` : '<p class="vazio">Nenhum pagamento recebido neste mês ainda.</p>'}`;

    // Despesas
    const ds = despesasDoMes(k).sort((a, b) => a.data.localeCompare(b.data));
    $('#f-despesas').innerHTML = `<div class="f-cab"><h2>Despesas</h2><button class="btn-secundario" data-nova-despesa>+ Despesa</button></div>
      ${ds.length ? `<div class="f-lista">${ds.map(d => `<div class="f-item" data-despesa="${d.id}">
          <div class="f-corpo"><strong>${esc(d.descricao)}</strong><small>${CATEGORIAS[d.categoria] || CATEGORIAS.outros} · ${d.recorrente ? 'todo mês' : fmtCurta(d.data)}</small></div>
          <span class="f-valor gasto">${moeda(d.valor)}</span></div>`).join('')}</div>` : '<p class="vazio">Nenhuma despesa neste mês. Anote equipamento, apps, impostos e o que mais você gastar para trabalhar.</p>'}`;
  }

  // ===== Ações =====
  async function recebi(id) {
    const m = marcas().find(x => x.id === id); if (!m) return;
    try { await Marcas.atualizar(id, { pago: true, data_pagamento: hoje() }); desenhar(); toast(`${moeda(m.valor)} da ${m.nome} na conta! ✦`); }
    catch (e) { console.error(e); toast('Não consegui salvar agora.', true); }
  }

  async function alternarNF(id) {
    const m = marcas().find(x => x.id === id); if (!m) return;
    let dados = { nf_emitida: !m.nf_emitida };
    if (!m.nf_emitida) { const n = prompt(`Número da nota fiscal da ${m.nome} (opcional):`, m.nf_numero || ''); if (n === null) return; dados.nf_numero = n.trim() || null; }
    try { await Marcas.atualizar(id, dados); desenhar(); toast(dados.nf_emitida ? 'Nota fiscal marcada ✦' : 'Nota desmarcada.'); }
    catch (e) { console.error(e); toast('Não consegui salvar agora.', true); }
  }

  async function definirMeta() {
    const atual = window.Tarefas ? Tarefas.prefs().meta_faturamento : '';
    const v = prompt('Quanto você quer faturar por mês? (ex.: 3000)', atual || '');
    if (v === null) return;
    const n = lerValor(v);
    if (!(n > 0)) return toast('Coloque um valor maior que zero.', true);
    try { await Tarefas.salvarPrefsParcial({ meta_faturamento: n }); desenhar(); toast(`Meta: ${moeda(n)} por mês ✦`); }
    catch (e) { console.error(e); toast('Não consegui salvar a meta.', true); }
  }

  function abrirDespesa(d) {
    const nova = !d || !!d._nova; if (nova) d = { categoria: 'outros', data: paraISO(new Date(mes.getFullYear(), mes.getMonth(), Math.min(new Date().getDate(), 28))), recorrente: false, ...(d || {}) };
    if (chaveMes(new Date()) === chaveMes(mes) && nova && !d._data) d.data = d.data && d._nova ? d.data : hoje();
    const dlg = document.getElementById('ficha-marca');
    dlg.innerHTML = `<form class="ficha" novalidate>
      <header class="ficha-cab"><div><small>Despesa</small><h2>${nova ? 'Nova despesa' : esc(d.descricao)}</h2></div><button type="button" class="fechar" data-fechar aria-label="Fechar">×</button></header>
      <div class="ficha-corpo"><div class="faixa-erro" id="d-erro" hidden></div>
        <fieldset><div class="grade-campos">
          <label class="campo largo"><span>O que foi? *</span><input name="descricao" maxlength="120" value="${esc(d.descricao || '')}" placeholder="Ex.: Ring light, CapCut Pro, DAS do MEI"></label>
          <label class="campo"><span>Valor (R$) *</span><input name="valor" inputmode="decimal" value="${d.valor != null ? String(d.valor).replace('.', ',') : ''}" placeholder="0,00"></label>
          <label class="campo"><span>Data</span><input type="date" name="data" value="${d.data}"></label>
          <label class="campo largo"><span>Categoria</span><select name="categoria">${Object.entries(CATEGORIAS).map(([k, v]) => `<option value="${k}" ${d.categoria === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="check grande"><input type="checkbox" name="recorrente" ${d.recorrente ? 'checked' : ''}><span>Repete todo mês (assinatura, MEI...)</span></label>
          <label class="campo"><span>Até (se parar)</span><input type="date" name="ate" value="${d.ate || ''}"></label>
        </div></fieldset>
      </div>
      <footer class="ficha-rodape">${!nova ? '<button type="button" class="btn-perigo" data-excluir>Excluir</button>' : '<span></span>'}
        <div><button type="button" class="btn-secundario" data-fechar>Cancelar</button><button type="submit" class="btn-primario">Salvar</button></div></footer>
    </form>`;
    const f = dlg.querySelector('form');
    dlg.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.oncancel = null;
    const exc = dlg.querySelector('[data-excluir]');
    if (exc) exc.addEventListener('click', async () => {
      if (!confirm(d.recorrente ? 'Excluir esta despesa de TODOS os meses? (Para parar a partir de agora, use o campo "Até".)' : 'Excluir esta despesa?')) return;
      const { error } = await sb.from('despesas').delete().eq('id', d.id);
      if (error) return toast('Não consegui excluir agora.', true);
      despesas = despesas.filter(x => x.id !== d.id); dlg.close(); desenhar();
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const erro = (m) => { const el = dlg.querySelector('#d-erro'); el.textContent = m; el.hidden = false; };
      const valor = lerValor(f.valor.value);
      if (!f.descricao.value.trim()) return erro('Escreva o que foi a despesa.');
      if (!(valor >= 0) || valor === null) return erro('Confira o valor. Ex.: 89,90');
      const dados = { descricao: f.descricao.value.trim(), valor, data: f.data.value || hoje(), categoria: f.categoria.value, recorrente: f.recorrente.checked, ate: f.recorrente.checked ? (f.ate.value || null) : null };
      try {
        const q = nova ? sb.from('despesas').insert(dados) : sb.from('despesas').update(dados).eq('id', d.id);
        const { data, error } = await q.select().single(); if (error) throw error;
        const i = despesas.findIndex(x => x.id === data.id); if (i >= 0) despesas[i] = data; else despesas.unshift(data);
        dlg.close(); desenhar(); toast('Despesa salva.');
      } catch (err) { console.error(err); erro('Não consegui salvar agora.'); }
    });
    dlg.showModal();
    if (nova) setTimeout(() => f.descricao.focus(), 50);
  }

  // Planilha do mês para o contador
  function exportarCSV() {
    const k = chaveMes(mes), linhas = [['Tipo', 'Data', 'Descrição', 'Categoria', 'Valor', 'Nota fiscal']];
    fechadas().filter(m => m.pago && m.data_pagamento && m.data_pagamento.slice(0, 7) === k)
      .forEach(m => linhas.push(['Recebimento', fmtCurta(m.data_pagamento), m.nome + (m.entregaveis ? ' · ' + m.entregaveis : ''), 'Parceria', String(m.valor).replace('.', ','), m.nf_emitida ? (m.nf_numero || 'Emitida') : 'Não']));
    despesasDoMes(k).forEach(d => linhas.push(['Despesa', d.recorrente ? 'Mensal' : fmtCurta(d.data), d.descricao, (CATEGORIAS[d.categoria] || '').replace(/^\S+\s/, ''), String(d.valor).replace('.', ','), '']));
    const csv = '﻿' + linhas.map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `financeiro-${k}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function montarEsqueleto() {
    raiz.innerHTML = `
      <div class="marcas-barra"><p class="saudacao">Seu dinheiro, claro como cristal.</p>
        <div class="tarefas-botoes"><button class="btn-secundario" data-csv>⬇ Planilha do mês</button><button class="btn-primario" data-nova-despesa>+ Despesa</button></div></div>
      <div class="f-mes" id="f-mes"></div>
      <div class="cartao meta-dia" id="f-meta"></div>
      <div class="cartao plano-meta" id="f-plano" hidden></div>
      <div class="numeros" id="f-numeros"></div>
      <div class="grade">
        <div class="cartao" id="f-receber"></div>
        <div class="cartao" id="f-recebidos"></div>
        <div class="cartao" id="f-grafico"></div>
        <div class="cartao" id="f-despesas"></div>
      </div>`;
    raiz.addEventListener('click', (e) => {
      const a = e.target.closest('[data-usar-plano], [data-fmes], [data-fmeta], [data-recebi], [data-nf], [data-nova-despesa], [data-despesa], [data-csv], [data-marca]');
      if (!a) return;
      if (a.matches('[data-fmes]')) { mes.setMonth(mes.getMonth() + Number(a.dataset.fmes)); return desenhar(); }
      if (a.matches('[data-fmeta]')) return definirMeta();
      if (a.matches('[data-usar-plano]')) return usarPlano();
      if (a.matches('[data-recebi]')) return recebi(a.dataset.recebi);
      if (a.matches('[data-nf]')) return alternarNF(a.dataset.nf);
      if (a.matches('[data-nova-despesa]')) return abrirDespesa(null);
      if (a.matches('[data-csv]')) return exportarCSV();
      if (a.matches('[data-despesa]')) return abrirDespesa(despesas.find(d => d.id === a.dataset.despesa));
      if (a.matches('[data-marca]')) { document.querySelector('[data-tab="aba-marcas"]').click(); }
    });
  }

  window.Financeiro = {
    async iniciar(cliente, secao) {
      sb = cliente; raiz = secao; montarEsqueleto();
      try {
        let tudo = [], ini = 0;
        while (true) {
          const { data, error } = await sb.from('despesas').select('*').order('data', { ascending: false }).range(ini, ini + 999);
          if (error) throw error; tudo = tudo.concat(data || []); if (!data || data.length < 1000) break; ini += 1000;
        }
        despesas = tudo; carregado = true; desenhar();
      } catch (e) {
        console.error(e);
        raiz.querySelector('.grade').innerHTML = `<div class="cartao largo"><p class="vazio">${/despesas|relation|schema cache|PGRST205|42P01/i.test((e && (e.message + ' ' + e.code)) || '')
          ? 'O Financeiro ainda não foi ativado no banco. Rode o arquivo financeiro.sql no Supabase e recarregue a página.'
          : 'Não consegui carregar o financeiro agora. Confira sua conexão e recarregue a página.'}</p></div>`;
      }
    },
    aoAbrir() { desenhar(); },
    // Usada pelo Assistente: abre "nova despesa" já preenchida
    novaCom(dados) { document.querySelector('[data-tab="aba-financeiro"]').click(); abrirDespesa({ ...dados, _nova: true }); },
    plano
  };
})();
