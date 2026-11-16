/* =========================================================
   financeiro.js · Área "Financeiro" do UGC Organized
   Vida financeira pessoal e do trabalho: entradas e saídas,
   repetição (mensal, semanal, dias da semana), parcelamento,
   categorias próprias, meta, a receber das marcas e lucro.
   Os lançamentos ficam na tabela "despesas" (campo tipo:
   entrada ou saida; escopo: trabalho ou pessoal).
   ========================================================= */
(function () {
  const CAT_PADRAO = {
    saida: {
      equipamento: '📷 Equipamento', apps: '📱 Apps e internet', impostos: '🧾 Impostos e MEI', produtos: '🛍️ Produtos e cenário',
      transporte: '🚗 Transporte', cursos: '📚 Cursos', marketing: '📣 Divulgação', moradia: '🏠 Moradia', mercado: '🛒 Mercado',
      saude: '💊 Saúde', contas: '💡 Contas da casa', lazer: '🎉 Lazer', cartao: '💳 Cartão de crédito', outros: '✦ Outros'
    },
    entrada: {
      parceria: '🤝 Parceria / publi', freela: '💻 Freela', salario: '💼 Salário', vendas: '🛍️ Vendas', afiliados: '🔗 Afiliados',
      reembolso: '↩️ Reembolso', presente: '🎁 Presente', outros_e: '✦ Outros'
    }
  };
  const FREQ = { unica: 'Não repete', mensal: 'Todo mês', semanal: 'Toda semana', personalizado: 'Dias da semana' };
  let sb, raiz, lanc = [], mes = new Date(), carregado = false, escopo = 'tudo';
  mes.setDate(1);

  const $ = (s, el) => (el || raiz).querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const moeda = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const paraISO = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const deISO = (s) => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
  const somaDias = (iso, n) => { const d = deISO(iso); d.setDate(d.getDate() + n); return paraISO(d); };
  const hoje = () => paraISO(new Date());
  const chaveMes = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const fimDoMes = (k) => { const [a, m] = k.split('-').map(Number); return paraISO(new Date(a, m, 0)); };
  const fmtCurta = (iso) => iso ? deISO(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
  const nomeMes = (d, curto) => { const t = d.toLocaleDateString('pt-BR', curto ? { month: 'short' } : { month: 'long', year: 'numeric' }).replace('.', ''); return t.charAt(0).toUpperCase() + t.slice(1); };
  const lerValor = (v) => { const b = String(v || '').trim().replace(/[R$\s]/g, ''); if (!b) return null; const n = Number(b.includes(',') ? b.replace(/\./g, '').replace(',', '.') : b); return isFinite(n) ? n : NaN; };
  const valorTxt = (n) => n == null ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const marcas = () => (window.Marcas ? Marcas.lista() : []);
  const fechadas = () => marcas().filter(m => ['aguardando', 'producao', 'entregue', 'concluida'].includes(m.etapa) && Number(m.valor) > 0);
  const nomeDela = () => (window.Tarefas ? Tarefas.nome() : G.apelido());
  const freqDe = (d) => d.frequencia || (d.recorrente ? 'mensal' : 'unica');
  const tipoDe = (d) => d.tipo || 'saida';
  const noEscopo = (es) => escopo === 'tudo' || es === escopo;

  // Categorias: as padrão + as que a pessoa criou (guardadas nas preferências)
  function categorias(tipo) {
    const minhas = ((window.Tarefas && Tarefas.prefs().categorias_fin) || {})[tipo] || [];
    const base = { ...CAT_PADRAO[tipo] };
    minhas.forEach(c => { base[c.id] = c.nome; });
    return base;
  }
  const nomeCat = (d) => categorias(tipoDe(d))[d.categoria] || CAT_PADRAO[tipoDe(d)][tipoDe(d) === 'entrada' ? 'outros_e' : 'outros'];

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

  // ===== Em que dias um lançamento acontece (repetição + parcelas + "até") =====
  function datasDe(d, limite) {
    const out = [], freq = freqDe(d), fimReg = d.ate && d.ate < limite ? d.ate : limite, max = d.parcelas || Infinity;
    if (freq === 'unica') { if (d.data <= fimReg) out.push(d.data); return out; }
    if (freq === 'mensal') {
      const d0 = deISO(d.data);
      for (let i = 0; i < max && i < 600; i++) {
        const x = new Date(d0.getFullYear(), d0.getMonth() + i, 1), ult = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
        x.setDate(Math.min(d0.getDate(), ult));
        const iso = paraISO(x); if (iso > fimReg) break; out.push(iso);
      }
      return out;
    }
    const dias = freq === 'semanal' ? [deISO(d.data).getDay()] : String(d.dias || '').split(',').filter(Boolean).map(Number);
    let x = d.data;
    while (x <= fimReg && out.length < max && out.length < 3000) { if (dias.includes(deISO(x).getDay())) out.push(x); x = somaDias(x, 1); }
    return out;
  }
  // Ocorrências dentro de um período, com o número da parcela
  function noPeriodo(d, ini, fim) {
    const todas = datasDe(d, fim), lista = [];
    todas.forEach((data, i) => { if (data >= ini) lista.push({ ...d, _data: data, _n: i + 1 }); });
    return lista;
  }
  const doMes = (k, filtroTipo) => lanc.filter(d => !filtroTipo || tipoDe(d) === filtroTipo).filter(d => noEscopo(d.escopo || 'trabalho'))
    .flatMap(d => noPeriodo(d, k + '-01', fimDoMes(k)));

  function resumo(k) {
    const daMarca = noEscopo('trabalho') ? fechadas().filter(m => m.pago && m.data_pagamento && m.data_pagamento.slice(0, 7) === k).reduce((s, m) => s + Number(m.valor), 0) : 0;
    const outrasEntradas = doMes(k, 'entrada').reduce((s, d) => s + Number(d.valor), 0);
    const faturado = fechadas().filter(m => dataFechamento(m).slice(0, 7) === k).reduce((s, m) => s + Number(m.valor), 0);
    const saidas = doMes(k, 'saida').reduce((s, d) => s + Number(d.valor), 0);
    const entradas = daMarca + outrasEntradas;
    return { recebido: entradas, daMarca, outrasEntradas, faturado, gastos: saidas, lucro: entradas - saidas };
  }

  // ===== Plano para bater a meta do mês =====
  function plano() {
    if (!carregado || !window.Tarefas) return null;
    const prefs = Tarefas.prefs(), meta = Number(prefs.meta_faturamento) || 0;
    if (!meta) return null;
    const agora = new Date(), k = chaveMes(agora);
    const faturadoMes = fechadas().filter(m => dataFechamento(m).slice(0, 7) === k).reduce((s, m) => s + Number(m.valor), 0);
    const faltam = meta - faturadoMes;
    if (faltam <= 0) return { batida: true, meta };
    const lim = paraISO(new Date(agora.getFullYear(), agora.getMonth() - 6, 1));
    const recentes = fechadas().filter(m => dataFechamento(m) >= lim);
    let ticket = recentes.length ? recentes.reduce((s, m) => s + Number(m.valor), 0) / recentes.length : null, origemTicket = 'media';
    if (!ticket) { const v = (prefs.precos || []).find(p => p.tipo === 'unidade' && p.conteudo && Number(p.ref) > 0); if (v) { ticket = Number(v.ref); origemTicket = 'simulador'; } }
    if (!ticket) return { semTicket: true, meta, faltam };
    ticket = Math.round(ticket);
    const marcasFechar = Math.ceil(faltam / ticket);
    return { meta, faltam, ticket, origemTicket, marcasFechar };
  }

  function desenharPlano() {
    const el = $('#f-plano'), atual = chaveMes(mes) === chaveMes(new Date()), p = atual ? plano() : null;
    el.hidden = !p || p.batida;
    if (el.hidden) return;
    if (p.semTicket) { el.innerHTML = `<h2>Como chegar na sua meta ✦</h2><p class="desc">Faltam ${moeda(p.faltam)}. Para eu calcular quantas marcas você precisa, cadastre seus preços no Simulador ou coloque o valor nas parcerias fechadas.</p>`; return; }
    el.innerHTML = `<h2>Como chegar na sua meta ✦</h2>
      <p class="plano-frase">${G.apelido()}, faltam <b>${moeda(p.faltam)}</b> para os seus ${moeda(p.meta)}. Se você fechar <b>${p.marcasFechar} ${p.marcasFechar === 1 ? 'marca' : 'marcas'}</b> de ${moeda(p.ticket)}, você chega lá. Vamos, você consegue! 💪</p>
      <div class="plano-passos">
        <div><b>${p.marcasFechar}</b><small>${p.marcasFechar === 1 ? 'marca fecha' : 'marcas fecham'}</small></div><span>→</span>
        <div><b>${moeda(p.marcasFechar * p.ticket)}</b><small>na conta</small></div>
      </div>
      <p class="desc plano-base">Conta feita com ${p.origemTicket === 'media' ? 'o seu valor médio por parceria' : 'o preço do seu vídeo no Simulador'}.</p>`;
  }

  // ===== Desenho =====
  function rotuloRepete(d) {
    const f = freqDe(d);
    if (f === 'unica') return fmtCurta(d._data || d.data);
    const parc = d.parcelas ? ` · ${d._n || 1}/${d.parcelas}` : '';
    if (f === 'mensal') return (d.parcelas ? 'parcela' : 'todo mês') + parc;
    if (f === 'semanal') return `toda semana${parc}`;
    const nomes = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    return String(d.dias || '').split(',').filter(Boolean).map(n => nomes[Number(n)]).join(', ') + parc;
  }

  function desenhar() {
    if (!carregado) return;
    const k = chaveMes(mes), r = resumo(k);
    const aReceber = noEscopo('trabalho') ? fechadas().filter(m => !m.pago) : [];
    const totalReceber = aReceber.reduce((s, m) => s + Number(m.valor), 0);
    const meta = window.Tarefas ? Number(Tarefas.prefs().meta_faturamento) || 0 : 0;
    const semNF = fechadas().filter(m => m.pago && !m.nf_emitida);

    $('#f-escopo').innerHTML = [['tudo', 'Tudo'], ['trabalho', '💼 Trabalho'], ['pessoal', '🏠 Pessoal']].map(([v, n]) => `<button class="vis-btn ${escopo === v ? 'ativo' : ''}" data-escopo="${v}">${n}</button>`).join('');
    $('#f-mes').innerHTML = `<button class="cal-nav" data-fmes="-1" aria-label="Mês anterior">‹</button><h2>${nomeMes(mes)}</h2><button class="cal-nav" data-fmes="1" aria-label="Próximo mês">›</button>`;

    const fat = r.faturado;
    $('#f-meta').hidden = escopo === 'pessoal';
    $('#f-meta').innerHTML = meta
      ? `<div class="meta-topo"><div class="meta-num menor">${moeda(fat)}</div>
          <div class="meta-info"><strong>${fat >= meta ? `Meta do mês batida, ${esc(nomeDela())}! ✦` : 'Fechado com marcas neste mês'}</strong>
          <div class="carga ${fat >= meta ? 'ok' : ''}"><div style="width:${Math.min(100, fat / meta * 100)}%"></div></div>
          <small>${fat >= meta ? 'Tudo que vier agora é bônus.' : `Faltam ${moeda(meta - fat)} para a meta de ${moeda(meta)}.`}</small></div>
          <button class="mini-btn" data-fmeta>Meta: ${moeda(meta)}</button></div>`
      : `<div class="meta-topo"><div class="meta-info"><strong>Qual é a sua meta de faturamento por mês?</strong><small>Com uma meta, eu te mostro quanto falta e comemoro com você quando bater.</small></div><button class="btn-primario" data-fmeta>Definir meta</button></div>`;

    $('#f-numeros').innerHTML = `
      <div class="cartao numero destaque"><div class="rotulo">Entradas do mês</div><div class="valor menor">${moeda(r.recebido)}</div><div class="extra">${r.daMarca && r.outrasEntradas ? `${moeda(r.daMarca)} de marcas` : 'dinheiro que entrou'}</div></div>
      <div class="cartao numero"><div class="rotulo">Saídas do mês</div><div class="valor menor">${moeda(r.gastos)}</div><div class="extra">${doMes(k, 'saida').length} lançamentos</div></div>
      <div class="cartao numero"><div class="rotulo">Saldo do mês</div><div class="valor menor ${r.lucro < 0 ? 'negativo' : ''}">${moeda(r.lucro)}</div><div class="extra">entradas menos saídas</div></div>
      ${escopo !== 'pessoal' ? `<div class="cartao numero"><div class="rotulo">Fechado com marcas</div><div class="valor menor">${moeda(r.faturado)}</div><div class="extra">parcerias do mês</div></div>
      <div class="cartao numero"><div class="rotulo">A receber</div><div class="valor menor">${moeda(totalReceber)}</div><div class="extra">${aReceber.length} ${aReceber.length === 1 ? 'parceria' : 'parcerias'}</div></div>` : ''}`;

    const meses = Array.from({ length: 6 }, (_, i) => { const d = new Date(mes); d.setMonth(d.getMonth() - 5 + i); return d; });
    const dados = meses.map(d => ({ d, ...resumo(chaveMes(d)) }));
    const max = Math.max(1, ...dados.map(x => Math.max(x.recebido, x.gastos)));
    $('#f-grafico').innerHTML = `<h2>Últimos 6 meses</h2>
      <div class="legenda"><span class="recebido">Entradas</span><span class="gasto">Saídas</span></div>
      <div class="f-barras">${dados.map(x => `<div class="f-mes-col" tabindex="0">
        <span class="dica">${nomeMes(x.d, true)}: entradas ${moeda(x.recebido)} · saídas ${moeda(x.gastos)} · saldo ${moeda(x.lucro)}</span>
        <div class="f-par"><div class="f-b recebido" style="height:${Math.max(2, x.recebido / max * 100)}%"></div><div class="f-b gasto" style="height:${Math.max(2, x.gastos / max * 100)}%"></div></div>
        <small>${nomeMes(x.d, true)}</small></div>`).join('')}</div>`;

    desenharPlano();

    $('#f-receber').hidden = escopo === 'pessoal';
    $('#f-receber').innerHTML = `<h2>A receber das marcas</h2><p class="desc">Parcerias fechadas que ainda não pagaram.</p>
      ${aReceber.length ? `<div class="f-lista">${aReceber.sort((a, b) => (a.data_pagamento || '9999').localeCompare(b.data_pagamento || '9999')).map(m => {
        const atrasado = m.data_pagamento && m.data_pagamento < hoje();
        return `<div class="f-item ${atrasado ? 'atrasado' : ''}">
          <div class="f-corpo" data-marca="${m.id}"><strong>${esc(m.nome)}</strong><small>${[esc(m.entregaveis || ''), m.data_pagamento ? `${atrasado ? 'era para' : 'previsto'} ${fmtCurta(m.data_pagamento)}` : 'sem previsão'].filter(Boolean).join(' · ')}</small></div>
          <span class="f-valor">${moeda(m.valor)}</span>
          <button class="mini-btn zap" data-recebi="${m.id}">✓ Recebi</button>
        </div>`; }).join('')}</div>` : '<p class="vazio">Nada pendente. Tudo recebido ✦</p>'}`;

    // Entradas e saídas do mês (marcas pagas + lançamentos), da mais recente para a mais antiga
    const daMarcaLista = noEscopo('trabalho') ? fechadas().filter(m => m.pago && m.data_pagamento && m.data_pagamento.slice(0, 7) === k)
      .map(m => ({ marca: m, data: m.data_pagamento, valor: Number(m.valor), entrada: true })) : [];
    // Um lançamento que acontece várias vezes no mês (ex.: toda terça e quinta) vira uma linha só, com o total
    const porId = {};
    doMes(k).forEach(d => { const x = porId[d.id] || (porId[d.id] = { lanc: d, data: d._data, valor: 0, vezes: 0, entrada: tipoDe(d) === 'entrada' }); x.valor += Number(d.valor); x.vezes++; if (d._data > x.data) x.data = d._data; });
    const lancLista = Object.values(porId);
    const todos = daMarcaLista.concat(lancLista).sort((a, b) => b.data.localeCompare(a.data));
    $('#f-lancamentos').innerHTML = `<div class="f-cab"><h2>Entradas e saídas de ${nomeMes(mes).split(' ')[0].toLowerCase()}</h2>
        <div class="tarefas-botoes"><button class="mini-btn zap" data-novo-lanc="entrada">+ Entrada</button><button class="mini-btn" data-novo-lanc="saida">+ Saída</button></div></div>
      ${semNF.length && escopo !== 'pessoal' ? `<div class="aviso-nf">🧾 ${semNF.length} ${semNF.length === 1 ? 'pagamento de marca recebido sem nota fiscal marcada' : 'pagamentos de marcas recebidos sem nota fiscal marcada'}. Toque em "NF" quando emitir.</div>` : ''}
      ${todos.length ? `<div class="f-lista">${todos.map(x => x.marca
        ? `<div class="f-item"><div class="f-corpo" data-marca="${x.marca.id}"><strong>🤝 ${esc(x.marca.nome)}</strong><small>Parceria · recebido em ${fmtCurta(x.data)}${x.marca.nf_numero ? ` · NF ${esc(x.marca.nf_numero)}` : ''}</small></div>
            <span class="f-valor ok">+ ${moeda(x.valor)}</span>
            <button class="mini-btn nf ${x.marca.nf_emitida ? 'emitida' : ''}" data-nf="${x.marca.id}" title="${x.marca.nf_emitida ? 'Nota emitida' : 'Marcar nota fiscal emitida'}">${x.marca.nf_emitida ? '✓ NF' : 'NF'}</button></div>`
        : `<div class="f-item" data-lanc="${x.lanc.id}"><div class="f-corpo"><strong>${esc(x.lanc.descricao)}</strong><small>${esc(nomeCat(x.lanc))} · ${(x.lanc.escopo || 'trabalho') === 'pessoal' ? 'pessoal' : 'trabalho'} · ${rotuloRepete(x.lanc)}</small></div>
            <span class="f-valor ${x.entrada ? 'ok' : 'gasto'}">${x.entrada ? '+' : '−'} ${moeda(x.valor)}${x.vezes > 1 ? `<small class="f-vezes">${x.vezes}x de ${moeda(x.lanc.valor)}</small>` : ''}</span></div>`).join('')}</div>`
        : '<p class="vazio">Nada lançado neste mês. Toque em "+ Entrada" ou "+ Saída" para começar: salário, freela, aluguel, mercado, equipamento...</p>'}`;
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
    const v = prompt('Quanto você quer faturar com marcas por mês? (ex.: 3.000,00)', atual ? valorTxt(atual) : '');
    if (v === null) return;
    const n = lerValor(v);
    if (!(n > 0)) return toast('Coloque um valor maior que zero.', true);
    try { await Tarefas.salvarPrefsParcial({ meta_faturamento: n }); desenhar(); toast(`Meta: ${moeda(n)} por mês ✦`); }
    catch (e) { console.error(e); toast('Não consegui salvar a meta.', true); }
  }

  async function novaCategoria(tipo) {
    const nome = (prompt(`Nome da nova categoria de ${tipo === 'entrada' ? 'entrada' : 'saída'} (pode colocar um emoji no começo, ex.: 🐶 Pet):`) || '').trim();
    if (!nome) return null;
    const p = Tarefas.prefs(), todas = { entrada: [], saida: [], ...(p.categorias_fin || {}) };
    const id = 'c_' + Date.now().toString(36);
    todas[tipo] = [...(todas[tipo] || []), { id, nome: /^\p{Extended_Pictographic}/u.test(nome) ? nome : '✦ ' + nome }];
    await Tarefas.salvarPrefsParcial({ categorias_fin: todas });
    return id;
  }

  function abrirLancamento(tipoInicial, d) {
    const nova = !d || !!d._nova;
    const k = chaveMes(mes);
    if (nova) d = { tipo: tipoInicial || 'saida', escopo: escopo === 'pessoal' ? 'pessoal' : 'trabalho', frequencia: 'unica', data: chaveMes(new Date()) === k ? hoje() : k + '-01', ...(d || {}) };
    let tipo = tipoDe(d);
    const freq = freqDe(d), dlg = document.getElementById('ficha-marca');
    const fim = d.parcelas ? 'parcelas' : d.ate ? 'data' : 'sempre';
    dlg.innerHTML = `<form class="ficha" novalidate>
      <header class="ficha-cab"><div><small>Financeiro</small><h2 id="l-titulo">${nova ? (tipo === 'entrada' ? 'Nova entrada' : 'Nova saída') : esc(d.descricao)}</h2></div><button type="button" class="fechar" data-fechar aria-label="Fechar">×</button></header>
      <div class="ficha-corpo"><div class="faixa-erro" id="d-erro" hidden></div>
        <fieldset>
          <div class="l-toggle">
            <div class="dias-escolha"><label><input type="radio" name="tipo" value="entrada" ${tipo === 'entrada' ? 'checked' : ''}><span>⬆ Entrada</span></label><label><input type="radio" name="tipo" value="saida" ${tipo === 'saida' ? 'checked' : ''}><span>⬇ Saída</span></label></div>
            <div class="dias-escolha"><label><input type="radio" name="escopo" value="trabalho" ${(d.escopo || 'trabalho') === 'trabalho' ? 'checked' : ''}><span>💼 Trabalho</span></label><label><input type="radio" name="escopo" value="pessoal" ${d.escopo === 'pessoal' ? 'checked' : ''}><span>🏠 Pessoal</span></label></div>
          </div>
          <div class="grade-campos">
            <label class="campo largo"><span>O que é? *</span><input name="descricao" maxlength="120" value="${esc(d.descricao || '')}" placeholder="Ex.: Salário, Freela de edição, Aluguel, Mercado, Ring light"></label>
            <label class="campo"><span>Valor (R$) *</span><input name="valor" inputmode="decimal" data-moeda value="${valorTxt(d.valor)}" placeholder="0,00"></label>
            <label class="campo"><span>Data</span><input type="date" name="data" value="${d.data}"></label>
            <label class="campo largo"><span>Categoria</span><select name="categoria" id="l-cat"></select></label>
          </div>
        </fieldset>
        <fieldset><legend>Repete?</legend>
          <div class="grade-campos"><label class="campo largo"><select name="frequencia">${Object.entries(FREQ).map(([v, n]) => `<option value="${v}" ${freq === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
          <div class="rep-dias" id="l-dias" ${freq === 'personalizado' ? '' : 'hidden'}>
            ${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((l, i) => `<label title="${['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][i]}"><input type="checkbox" name="l_dia" value="${i}" ${String(d.dias || '').split(',').includes(String(i)) ? 'checked' : ''}><span>${l}</span></label>`).join('')}
          </div>
          <div id="l-quanto" ${freq === 'unica' ? 'hidden' : ''}>
            <p class="l-pergunta">Por quanto tempo?</p>
            <div class="l-fim">
              <label class="check-mini"><input type="radio" name="fim" value="sempre" ${fim === 'sempre' ? 'checked' : ''}> Sem data para acabar (ex.: assinatura, salário)</label>
              <label class="check-mini"><input type="radio" name="fim" value="parcelas" ${fim === 'parcelas' ? 'checked' : ''}> Um número de vezes (parcelado):
                <input type="number" name="parcelas" min="1" max="600" value="${d.parcelas || ''}" placeholder="10" class="l-num"> vezes</label>
              <label class="check-mini"><input type="radio" name="fim" value="data" ${fim === 'data' ? 'checked' : ''}> Até uma data: <input type="date" name="ate" value="${d.ate || ''}" class="l-data"></label>
            </div>
            <div class="previa-prazo" id="l-previa"></div>
          </div>
        </fieldset>
      </div>
      <footer class="ficha-rodape">${!nova ? '<button type="button" class="btn-perigo" data-excluir>Excluir</button>' : '<span></span>'}
        <div><button type="button" class="btn-secundario" data-fechar>Cancelar</button><button type="submit" class="btn-primario">Salvar</button></div></footer>
    </form>`;
    const f = dlg.querySelector('form');
    const montarCats = (sel) => {
      const cats = categorias(tipo);
      f.categoria.innerHTML = Object.entries(cats).map(([k2, v]) => `<option value="${k2}" ${sel === k2 ? 'selected' : ''}>${esc(v)}</option>`).join('') + '<option value="__nova">➕ Adicionar categoria...</option>';
      if (!cats[sel]) f.categoria.value = tipo === 'entrada' ? 'outros_e' : 'outros';
    };
    montarCats(d.categoria);
    const previa = () => {
      const fr = f.frequencia.value, el = dlg.querySelector('#l-previa');
      dlg.querySelector('#l-dias').hidden = fr !== 'personalizado';
      dlg.querySelector('#l-quanto').hidden = fr === 'unica';
      const v = lerValor(f.valor.value), n = parseInt(f.parcelas.value, 10), fm = f.fim.value;
      if (fr === 'unica' || !(v > 0)) { el.textContent = ''; el.className = 'previa-prazo'; return; }
      el.className = 'previa-prazo ok';
      if (fm === 'parcelas' && n > 0) el.innerHTML = `${n}x de <b>${moeda(v)}</b> = ${moeda(v * n)} no total`;
      else if (fm === 'data' && f.ate.value) el.innerHTML = `${moeda(v)} ${fr === 'mensal' ? 'por mês' : 'por vez'}, até ${fmtCurta(f.ate.value)}`;
      else el.innerHTML = `${moeda(v)} ${fr === 'mensal' ? 'todo mês' : 'a cada vez'}, sem data para acabar`;
    };
    f.addEventListener('input', previa); f.addEventListener('change', previa);
    f.querySelectorAll('input[name="tipo"]').forEach(r => r.addEventListener('change', () => {
      tipo = r.value; montarCats(f.categoria.value);
      if (nova) dlg.querySelector('#l-titulo').textContent = tipo === 'entrada' ? 'Nova entrada' : 'Nova saída';
    }));
    f.parcelas.addEventListener('focus', () => { f.querySelector('input[name="fim"][value="parcelas"]').checked = true; previa(); });
    f.ate.addEventListener('focus', () => { f.querySelector('input[name="fim"][value="data"]').checked = true; previa(); });
    f.categoria.addEventListener('change', async () => {
      if (f.categoria.value !== '__nova') return;
      try { const id = await novaCategoria(tipo); montarCats(id || null); if (id) toast('Categoria criada ✦'); }
      catch (e) { console.error(e); montarCats(null); toast('Não consegui criar a categoria agora.', true); }
    });
    previa();
    dlg.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.oncancel = null;
    const exc = dlg.querySelector('[data-excluir]');
    if (exc) exc.addEventListener('click', async () => {
      if (!confirm(freqDe(d) !== 'unica' ? 'Excluir este lançamento de TODOS os meses? (Para parar a partir de agora, escolha "Até uma data".)' : 'Excluir este lançamento?')) return;
      const { error } = await sb.from('despesas').delete().eq('id', d.id);
      if (error) return toast('Não consegui excluir agora.', true);
      lanc = lanc.filter(x => x.id !== d.id); dlg.close(); desenhar();
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const erro = (m) => { const el = dlg.querySelector('#d-erro'); el.textContent = m; el.hidden = false; el.scrollIntoView({ block: 'center' }); };
      const valor = lerValor(f.valor.value), fr = f.frequencia.value, fm = f.fim.value;
      if (!f.descricao.value.trim()) return erro('Escreva o que é esse lançamento.');
      if (valor === null || !(valor >= 0)) return erro('Confira o valor. Ex.: 89,90');
      const dias = [...f.querySelectorAll('input[name="l_dia"]:checked')].map(c => c.value);
      if (fr === 'personalizado' && !dias.length) return erro('Marque pelo menos um dia da semana.');
      const parcelas = fr !== 'unica' && fm === 'parcelas' ? parseInt(f.parcelas.value, 10) : null;
      if (fr !== 'unica' && fm === 'parcelas' && !(parcelas >= 1 && parcelas <= 600)) return erro('Coloque em quantas vezes (de 1 a 600).');
      if (fr !== 'unica' && fm === 'data' && !f.ate.value) return erro('Escolha até quando, ou marque "Sem data para acabar".');
      if (f.categoria.value === '__nova') return erro('Escolha uma categoria.');
      const dados = { tipo: f.tipo.value, escopo: f.escopo.value, descricao: f.descricao.value.trim(), valor, data: f.data.value || hoje(), categoria: f.categoria.value,
        frequencia: fr, recorrente: fr !== 'unica', dias: fr === 'personalizado' ? dias.join(',') : null, parcelas, ate: fr !== 'unica' && fm === 'data' ? f.ate.value : null };
      try {
        const q = nova ? sb.from('despesas').insert(dados) : sb.from('despesas').update(dados).eq('id', d.id);
        const { data, error } = await q.select().single(); if (error) throw error;
        const i = lanc.findIndex(x => x.id === data.id); if (i >= 0) lanc[i] = data; else lanc.unshift(data);
        dlg.close(); desenhar(); toast(dados.tipo === 'entrada' ? 'Entrada salva ✦' : 'Saída salva.');
      } catch (err) { console.error(err); erro('Não consegui salvar agora.'); }
    });
    dlg.showModal();
    if (nova) setTimeout(() => f.descricao.focus(), 50);
  }

  // Planilha do mês para o contador
  function exportarCSV() {
    const k = chaveMes(mes), linhas = [['Tipo', 'Data', 'Descrição', 'Categoria', 'Pessoal ou trabalho', 'Valor', 'Nota fiscal']];
    if (noEscopo('trabalho')) fechadas().filter(m => m.pago && m.data_pagamento && m.data_pagamento.slice(0, 7) === k)
      .forEach(m => linhas.push(['Entrada', fmtCurta(m.data_pagamento), m.nome + (m.entregaveis ? ' · ' + m.entregaveis : ''), 'Parceria', 'Trabalho', valorTxt(m.valor), m.nf_emitida ? (m.nf_numero || 'Emitida') : 'Não']));
    doMes(k).forEach(d => linhas.push([tipoDe(d) === 'entrada' ? 'Entrada' : 'Saída', fmtCurta(d._data), d.descricao + (d.parcelas ? ` (${d._n}/${d.parcelas})` : ''), nomeCat(d).replace(/^\S+\s/, ''), (d.escopo || 'trabalho') === 'pessoal' ? 'Pessoal' : 'Trabalho', valorTxt(d.valor), '']));
    const csv = '﻿' + linhas.map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `financeiro-${k}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function montarEsqueleto() {
    raiz.innerHTML = `
      <div class="marcas-barra"><p class="saudacao">Seu dinheiro, claro como cristal: pessoal e trabalho.</p>
        <div class="tarefas-botoes"><button class="btn-secundario" data-csv>⬇ Planilha do mês</button><button class="btn-lima" data-novo-lanc="entrada">+ Entrada</button><button class="btn-primario" data-novo-lanc="saida">+ Saída</button></div></div>
      <div class="f-topo"><div class="visoes" id="f-escopo"></div><div class="f-mes" id="f-mes"></div></div>
      <div class="cartao meta-dia" id="f-meta"></div>
      <div class="cartao plano-meta" id="f-plano" hidden></div>
      <div class="numeros" id="f-numeros"></div>
      <div class="cartao largo" id="f-lancamentos"></div>
      <div class="grade">
        <div class="cartao" id="f-receber"></div>
        <div class="cartao" id="f-grafico"></div>
      </div>`;
    raiz.addEventListener('click', (e) => {
      const a = e.target.closest('[data-escopo], [data-fmes], [data-fmeta], [data-recebi], [data-nf], [data-novo-lanc], [data-lanc], [data-csv], [data-marca]');
      if (!a) return;
      if (a.matches('[data-escopo]')) { escopo = a.dataset.escopo; return desenhar(); }
      if (a.matches('[data-fmes]')) { mes.setMonth(mes.getMonth() + Number(a.dataset.fmes)); return desenhar(); }
      if (a.matches('[data-fmeta]')) return definirMeta();
      if (a.matches('[data-recebi]')) return recebi(a.dataset.recebi);
      if (a.matches('[data-nf]')) return alternarNF(a.dataset.nf);
      if (a.matches('[data-novo-lanc]')) return abrirLancamento(a.dataset.novoLanc, null);
      if (a.matches('[data-csv]')) return exportarCSV();
      if (a.matches('[data-lanc]')) return abrirLancamento(null, lanc.find(d => d.id === a.dataset.lanc));
      if (a.matches('[data-marca]')) { const m = marcas().find(x => x.id === a.dataset.marca); if (m && Marcas.abrir) Marcas.abrir(m.id); else document.querySelector('[data-tab="aba-marcas"]').click(); }
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
        lanc = tudo; carregado = true; desenhar();
      } catch (e) {
        console.error(e);
        raiz.querySelector('.grade').innerHTML = `<div class="cartao largo"><p class="vazio">Não consegui carregar o financeiro agora. Confira sua conexão e recarregue a página.</p></div>`;
      }
    },
    aoAbrir() { desenhar(); },
    // Usada pelo Crescimento e pelo Comparativo: saídas do TRABALHO entre duas datas
    gastosEntre(ini, fim) {
      return lanc.filter(d => tipoDe(d) === 'saida' && (d.escopo || 'trabalho') === 'trabalho').reduce((s, d) => s + noPeriodo(d, ini, fim).length * Number(d.valor), 0);
    },
    // Usada pelo Assistente: abre um lançamento já preenchido
    novaCom(dados) { document.querySelector('[data-tab="aba-financeiro"]').click(); abrirLancamento((dados && dados.tipo) || 'saida', { ...dados, _nova: true }); },
    plano
  };
})();
