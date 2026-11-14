/* =========================================================
   marcas.js · Área "Marcas" do meu.painel
   Funil de marcas, prazos de entrega, calendário e feedbacks.
   Lê e grava na tabela "marcas" do Supabase (ver marcas.sql).
   ========================================================= */
(function () {
  // ===== Etapas do funil (a ordem importa) =====
  const ETAPAS = [
    { id: 'contato',    nome: 'Em contato',  dica: 'Abordei ou mandei proposta' },
    { id: 'negociando', nome: 'Negociando',  dica: 'Conversando valor e escopo' },
    { id: 'aguardando', nome: 'Fechada',     dica: 'Esperando produto ou briefing' },
    { id: 'producao',   nome: 'Em produção', dica: 'Recebi tudo, prazo correndo' },
    { id: 'entregue',   nome: 'Entregue',    dica: 'Esperando aprovação' },
    { id: 'concluida',  nome: 'Concluída',   dica: 'Aprovado e finalizado' },
    { id: 'perdida',    nome: 'Não rolou',   dica: 'Fica de aprendizado' }
  ];
  const NOME_ETAPA = Object.fromEntries(ETAPAS.map(e => [e.id, e.nome]));
  const FECHADAS = ['aguardando', 'producao', 'entregue', 'concluida'];
  const CANAIS = { instagram: 'Instagram', email: 'E-mail', whatsapp: 'WhatsApp', plataforma: 'Plataforma de UGC', indicacao: 'Indicação', site: 'Meu portfólio', outro: 'Outro' };

  let sb = null;          // cliente Supabase
  let raiz = null;        // <section> da aba
  let marcas = [];        // cache em memória
  let visao = 'funil';    // funil | calendario | feedbacks
  let busca = '';
  let mesCal = new Date(); mesCal.setDate(1);
  let arrastando = null;

  // ===== Utilidades =====
  const $ = (sel, el) => (el || raiz).querySelector(sel);
  const $$ = (sel, el) => [...(el || raiz).querySelectorAll(sel)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const moeda = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: Number(n) % 1 ? 2 : 0 });

  // Datas sempre como "AAAA-MM-DD" no fuso do navegador
  function paraISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function deISO(s) { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); }
  const hoje = () => paraISO(new Date());
  function diasEntre(deIso, ateIso) { return Math.round((deISO(ateIso) - deISO(deIso)) / 864e5); }
  function fmtCurta(iso) { return iso ? deISO(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''; }
  function fmtLonga(iso) { return iso ? deISO(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '') : ''; }

  // Soma o prazo: dias corridos ou só dias úteis (pula sábado e domingo)
  function somarPrazo(inicioIso, dias, tipo) {
    const d = deISO(inicioIso);
    if (tipo !== 'uteis') { d.setDate(d.getDate() + dias); return paraISO(d); }
    let faltam = dias;
    while (faltam > 0) { d.setDate(d.getDate() + 1); const s = d.getDay(); if (s !== 0 && s !== 6) faltam--; }
    return paraISO(d);
  }

  // Quando a marca entrou na etapa atual (pelo histórico)
  function desdeQuando(m) {
    const h = (m.historico || []).filter(x => x.etapa === m.etapa).pop();
    return (h && h.em ? h.em : m.created_at).slice(0, 10);
  }

  // Situação do prazo: texto + cor
  function situacaoPrazo(m) {
    if (!m.data_entrega) return null;
    if (m.data_entregue) {
      const atraso = diasEntre(m.data_entrega, m.data_entregue);
      return atraso > 0 ? { txt: `Entregue com ${atraso} ${atraso === 1 ? 'dia' : 'dias'} de atraso`, cor: 'neutro' } : { txt: 'Entregue no prazo', cor: 'ok' };
    }
    const d = diasEntre(hoje(), m.data_entrega);
    if (d < 0) return { txt: `Atrasada há ${-d} ${d === -1 ? 'dia' : 'dias'}`, cor: 'atraso', dias: d };
    if (d === 0) return { txt: 'Entregar hoje', cor: 'atraso', dias: d };
    if (d === 1) return { txt: 'Entregar amanhã', cor: 'alerta', dias: d };
    if (d <= 3) return { txt: `Faltam ${d} dias`, cor: 'alerta', dias: d };
    return { txt: `Faltam ${d} dias`, cor: 'ok', dias: d };
  }

  function soDigitos(t) { let d = String(t || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return d; }
  function primeiroNome(m) { return (m.contato_nome || '').trim().split(' ')[0] || 'tudo bem'; }

  function toast(msg, erro) {
    let t = document.getElementById('toast-marcas');
    if (!t) { t = document.createElement('div'); t.id = 'toast-marcas'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast-m ativo' + (erro ? ' erro' : '');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('ativo'), 2600);
  }

  // ===== Mensagens prontas (abrem no WhatsApp ou e-mail para você revisar antes de enviar) =====
  const MODELOS = {
    followup: (m) => `Oi, ${primeiroNome(m)}! Passando para saber se vocês conseguiram ver a minha proposta para a ${m.nome}. Fico à disposição para ajustar o que precisar.`,
    cobrar:   (m) => `Oi, ${primeiroNome(m)}! Tudo certo por aí? Queria saber se o produto e o briefing da ${m.nome} já foram enviados. Assim que chegarem, começo a produção.`,
    entrega:  (m) => `Oi, ${primeiroNome(m)}! O conteúdo da ${m.nome} está pronto. Posso te enviar por aqui?`,
    feedback: (m) => `Oi, ${primeiroNome(m)}! Foi um prazer criar para a ${m.nome}. Você me conta o que achou do conteúdo? Seu feedback me ajuda muito.`,
    pagamento:(m) => `Oi, ${primeiroNome(m)}! Tudo bem? Passando para confirmar a previsão de pagamento do conteúdo da ${m.nome}.`
  };
  const NOMES_MODELO = { followup: 'Follow-up da proposta', cobrar: 'Cobrar produto/briefing', entrega: 'Avisar entrega', feedback: 'Pedir feedback', pagamento: 'Lembrar pagamento' };
  function linkWhats(m, modelo) { return `https://wa.me/${soDigitos(m.contato_whatsapp)}?text=${encodeURIComponent(MODELOS[modelo](m))}`; }
  function linkEmail(m, modelo) { return `mailto:${encodeURIComponent(m.contato_email || '')}?subject=${encodeURIComponent(m.nome + ' · UGC')}&body=${encodeURIComponent(MODELOS[modelo](m))}`; }
  function modeloSugerido(m) {
    if (['contato', 'negociando'].includes(m.etapa)) return 'followup';
    if (m.etapa === 'aguardando') return 'cobrar';
    if (m.etapa === 'producao') return 'entrega';
    if (m.etapa === 'concluida' && m.valor && !m.pago) return 'pagamento';
    return 'feedback';
  }
  function linkAgenda(m) {
    const d = deISO(m.data_entrega), fim = new Date(d); fim.setDate(d.getDate() + 1);
    const f = (x) => paraISO(x).replace(/-/g, '');
    const det = [m.entregaveis && 'Entregas: ' + m.entregaveis, m.contato_nome && 'Contato: ' + m.contato_nome].filter(Boolean).join('\n');
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Entrega UGC: ' + m.nome)}&dates=${f(d)}/${f(fim)}&details=${encodeURIComponent(det)}`;
  }

  // ===== Banco =====
  async function carregar() {
    let tudo = [], inicio = 0;
    while (true) {
      const { data, error } = await sb.from('marcas').select('*').order('created_at', { ascending: false }).range(inicio, inicio + 999);
      if (error) throw error;
      tudo = tudo.concat(data || []);
      if (!data || data.length < 1000) break;
      inicio += 1000;
    }
    marcas = tudo;
  }

  async function salvar(id, dados) {
    const q = id ? sb.from('marcas').update(dados).eq('id', id) : sb.from('marcas').insert(dados);
    const { data, error } = await q.select().single();
    if (error) throw error;
    const i = marcas.findIndex(m => m.id === data.id);
    if (i >= 0) marcas[i] = data; else marcas.unshift(data);
    return data;
  }

  async function apagar(id) {
    const { error } = await sb.from('marcas').delete().eq('id', id);
    if (error) throw error;
    marcas = marcas.filter(m => m.id !== id);
  }

  // Muda a etapa e já ajusta as datas que fazem sentido
  function mudancasDeEtapa(m, nova) {
    const mud = { etapa: nova, historico: [...(m.historico || []), { etapa: nova, em: new Date().toISOString() }] };
    if (nova === 'producao') {
      mud.produto_recebido = true; mud.briefing_recebido = true;
      if (!m.data_recebimento) mud.data_recebimento = hoje();
      if (!m.data_entrega && m.prazo_dias != null) mud.data_entrega = somarPrazo(mud.data_recebimento || m.data_recebimento, m.prazo_dias, m.prazo_tipo);
    }
    if ((nova === 'entregue' || nova === 'concluida') && !m.data_entregue && m.data_entrega) mud.data_entregue = hoje();
    return mud;
  }

  async function moverPara(id, nova) {
    const m = marcas.find(x => x.id === id);
    if (!m || m.etapa === nova) return;
    try {
      const salvo = await salvar(id, mudancasDeEtapa(m, nova));
      desenhar();
      toast(`${m.nome} foi para "${NOME_ETAPA[nova]}"`);
      if (nova === 'concluida' && !salvo.feedback_nota) setTimeout(() => abrirFicha(salvo, 'feedback'), 350);
      if (nova === 'producao' && !salvo.data_entrega) setTimeout(() => abrirFicha(salvo, 'prazo'), 350);
    } catch (e) { console.error(e); toast('Não consegui mover agora. Tente de novo.', true); }
  }

  // ===== O que precisa de atenção hoje =====
  function pendencias() {
    const h = hoje(), itens = [];
    marcas.forEach(m => {
      if (['aguardando', 'producao'].includes(m.etapa) && m.data_entrega && !m.data_entregue) {
        const d = diasEntre(h, m.data_entrega);
        if (d < 0) itens.push({ m, peso: 0, cor: 'atraso', txt: `Entrega atrasada há ${-d} ${d === -1 ? 'dia' : 'dias'}`, sub: m.entregaveis, modelo: 'entrega' });
        else if (d <= 7) itens.push({ m, peso: 1 + d / 10, cor: d <= 1 ? 'atraso' : 'alerta', txt: d === 0 ? 'Entregar hoje' : d === 1 ? 'Entregar amanhã' : `Entregar até ${fmtLonga(m.data_entrega)}`, sub: `Faltam ${d} ${d === 1 ? 'dia' : 'dias'}`, modelo: 'entrega' });
      }
      if (['contato', 'negociando'].includes(m.etapa) && m.proximo_followup && m.proximo_followup <= h) {
        const d = diasEntre(m.proximo_followup, h);
        itens.push({ m, peso: 2, cor: 'alerta', txt: 'Fazer follow-up', sub: d ? `Era para ${fmtLonga(m.proximo_followup)}` : 'Marcado para hoje', modelo: 'followup' });
      }
      if (m.etapa === 'aguardando' && !(m.produto_recebido && m.briefing_recebido)) {
        const d = diasEntre(desdeQuando(m), h);
        const falta = [!m.produto_recebido && 'produto', !m.briefing_recebido && 'briefing'].filter(Boolean).join(' e ');
        if (d >= 5) itens.push({ m, peso: 3, cor: 'alerta', txt: `Cobrar ${falta}`, sub: `Fechou há ${d} dias e ainda não chegou`, modelo: 'cobrar' });
      }
      if (['entregue', 'concluida'].includes(m.etapa) && m.valor && !m.pago) {
        itens.push({ m, peso: 4, cor: 'neutro', txt: `Receber ${moeda(m.valor)}`, sub: 'Pagamento ainda não marcado como recebido', modelo: 'pagamento' });
      }
      if (m.etapa === 'concluida' && !m.feedback_nota && !m.feedback_texto && diasEntre(desdeQuando(m), h) <= 45) {
        itens.push({ m, peso: 5, cor: 'neutro', txt: 'Pedir feedback', sub: 'Guarde o que a marca achou', modelo: 'feedback' });
      }
    });
    return itens.sort((a, b) => a.peso - b.peso);
  }

  function atualizarSelo() {
    const urgentes = pendencias().filter(p => p.cor !== 'neutro').length;
    const selo = document.querySelector('[data-tab="aba-marcas"] .selo-aba');
    if (selo) { selo.textContent = urgentes; selo.hidden = !urgentes; }
  }

  // ===== Desenho =====
  function filtradas() {
    if (!busca) return marcas;
    const b = busca.toLowerCase();
    return marcas.filter(m => [m.nome, m.nicho, m.contato_nome, m.entregaveis].some(v => String(v || '').toLowerCase().includes(b)));
  }

  function desenhar() {
    atualizarSelo();
    desenharNumeros();
    desenharHoje();
    $$('.vis-btn').forEach(b => b.classList.toggle('ativo', b.dataset.vis === visao));
    if (visao === 'funil') desenharFunil();
    else if (visao === 'calendario') desenharCalendario();
    else desenharFeedbacks();
  }

  function desenharNumeros() {
    const fechadas = marcas.filter(m => FECHADAS.includes(m.etapa));
    const decididas = marcas.filter(m => FECHADAS.includes(m.etapa) || m.etapa === 'perdida');
    const taxa = marcas.length ? Math.round((fechadas.length / marcas.length) * 100) : 0;
    const valorFechado = fechadas.reduce((s, m) => s + Number(m.valor || 0), 0);
    const aReceber = fechadas.filter(m => !m.pago).reduce((s, m) => s + Number(m.valor || 0), 0);
    const comPrazo = marcas.filter(m => m.data_entregue && m.data_entrega);
    const noPrazo = comPrazo.filter(m => m.data_entregue <= m.data_entrega).length;
    const notas = marcas.filter(m => m.feedback_nota);
    const media = notas.length ? (notas.reduce((s, m) => s + m.feedback_nota, 0) / notas.length) : 0;
    const ativas = marcas.filter(m => !['concluida', 'perdida'].includes(m.etapa)).length;

    $('#m-numeros').innerHTML = `
      <div class="cartao numero destaque"><div class="rotulo">Marcas em andamento</div><div class="valor">${ativas}</div><div class="extra">${marcas.length} no total</div></div>
      <div class="cartao numero"><div class="rotulo">Taxa de fechamento</div><div class="valor">${taxa}%</div><div class="extra">${fechadas.length} de ${marcas.length} fecharam${decididas.length ? '' : ''}</div></div>
      <div class="cartao numero"><div class="rotulo">Valor fechado</div><div class="valor menor">${moeda(valorFechado)}</div><div class="extra">${aReceber ? moeda(aReceber) + ' a receber' : 'Tudo recebido'}</div></div>
      <div class="cartao numero"><div class="rotulo">Entregas no prazo</div><div class="valor">${comPrazo.length ? Math.round(noPrazo / comPrazo.length * 100) + '%' : '-'}</div><div class="extra">${comPrazo.length ? `${noPrazo} de ${comPrazo.length} entregas` : 'Sem entregas ainda'}</div></div>
      <div class="cartao numero"><div class="rotulo">Nota das marcas</div><div class="valor">${notas.length ? media.toFixed(1).replace('.', ',') : '-'}</div><div class="extra">${notas.length ? estrelas(Math.round(media)) : 'Sem feedback ainda'}</div></div>`;
  }

  function estrelas(n) { return '<span class="estrelas">' + '★'.repeat(n) + '<span class="apagada">' + '★'.repeat(5 - n) + '</span></span>'; }

  function desenharHoje() {
    const itens = pendencias();
    const el = $('#m-hoje');
    if (!marcas.length) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    if (!itens.length) {
      el.innerHTML = `<div class="hoje-cab"><h2>Hoje</h2></div><p class="vazio">Tudo em dia! Nenhuma entrega apertada nem follow-up pendente.</p>`;
      return;
    }
    el.innerHTML = `<div class="hoje-cab"><h2>Hoje</h2><span class="hoje-qtd">${itens.length} ${itens.length === 1 ? 'coisa' : 'coisas'} para olhar</span></div>
      <div class="hoje-lista">${itens.map(p => {
        const temZap = !!p.m.contato_whatsapp, temEmail = !!p.m.contato_email;
        return `<div class="hoje-item ${p.cor}">
          <button class="hoje-abrir" data-abrir="${p.m.id}">
            <span class="ponto"></span>
            <span><strong>${esc(p.m.nome)}</strong> · ${esc(p.txt)}<small>${esc(p.sub || '')}</small></span>
          </button>
          <div class="hoje-acoes">
            ${temZap ? `<a class="mini-btn zap" href="${linkWhats(p.m, p.modelo)}" target="_blank" rel="noopener" title="${NOMES_MODELO[p.modelo]} no WhatsApp">WhatsApp</a>` : ''}
            ${temEmail ? `<a class="mini-btn" href="${linkEmail(p.m, p.modelo)}" title="${NOMES_MODELO[p.modelo]} por e-mail">E-mail</a>` : ''}
          </div>
        </div>`;
      }).join('')}</div>`;
  }

  function cartaoMarca(m) {
    const st = situacaoPrazo(m);
    const i = ETAPAS.findIndex(e => e.id === m.etapa);
    const proxima = ['concluida', 'perdida'].includes(m.etapa) ? null : ETAPAS[i + 1];
    let linhaExtra = '';
    if (m.etapa === 'aguardando') {
      linhaExtra = `<div class="checks"><span class="${m.produto_recebido ? 'sim' : ''}">${m.produto_recebido ? '✓' : '○'} Produto</span><span class="${m.briefing_recebido ? 'sim' : ''}">${m.briefing_recebido ? '✓' : '○'} Briefing</span></div>`;
    } else if (['contato', 'negociando'].includes(m.etapa) && m.proximo_followup) {
      const atrasado = m.proximo_followup <= hoje();
      linhaExtra = `<div class="tag-data ${atrasado ? 'alerta' : ''}">Follow-up ${m.proximo_followup === hoje() ? 'hoje' : fmtCurta(m.proximo_followup)}</div>`;
    } else if (m.etapa === 'concluida' && m.feedback_nota) {
      linhaExtra = estrelas(m.feedback_nota);
    }
    return `<article class="card-marca" draggable="true" data-id="${m.id}" tabindex="0">
      <div class="card-topo">
        <strong>${esc(m.nome)}</strong>
        ${m.valor ? `<span class="valor-tag ${m.pago ? 'pago' : ''}" title="${m.pago ? 'Recebido' : 'A receber'}">${moeda(m.valor)}</span>` : ''}
      </div>
      ${m.entregaveis ? `<p class="entregaveis">${esc(m.entregaveis)}</p>` : ''}
      ${st && !['concluida', 'perdida'].includes(m.etapa) ? `<div class="prazo ${st.cor}">${esc(st.txt)}${!m.data_entregue ? ` <span>· ${fmtCurta(m.data_entrega)}</span>` : ''}</div>` : ''}
      ${linhaExtra}
      ${proxima ? `<button class="avancar" data-avancar="${m.id}" data-para="${proxima.id}" title="Mover para ${proxima.nome}" aria-label="Mover ${esc(m.nome)} para ${proxima.nome}">${proxima.id === 'perdida' ? '' : '→'}</button>` : ''}
    </article>`;
  }

  function desenharFunil() {
    const lista = filtradas();
    const area = $('#m-visao');
    if (!marcas.length) {
      area.innerHTML = `<div class="cartao vazio-grande">
        <h2>Comece seu funil de marcas</h2>
        <p>Cadastre as marcas que você abordou, as que estão negociando e as que já fecharam. O painel avisa os prazos e o que fazer a cada dia.</p>
        <button class="btn-primario" data-nova>+ Adicionar a primeira marca</button>
      </div>`;
      return;
    }
    area.innerHTML = `<div class="funil">${ETAPAS.map(e => {
      const daqui = lista.filter(m => m.etapa === e.id);
      // Em produção: quem entrega antes aparece primeiro
      if (['aguardando', 'producao'].includes(e.id)) daqui.sort((a, b) => (a.data_entrega || '9999').localeCompare(b.data_entrega || '9999'));
      const soma = daqui.reduce((s, m) => s + Number(m.valor || 0), 0);
      return `<section class="coluna ${e.id}" data-etapa="${e.id}">
        <header><div><h3>${e.nome} <span class="qtd">${daqui.length}</span></h3><small>${e.dica}</small></div>${soma ? `<span class="soma">${moeda(soma)}</span>` : ''}</header>
        <div class="cards">${daqui.map(cartaoMarca).join('') || '<p class="coluna-vazia">Arraste uma marca para cá</p>'}</div>
        ${e.id === 'contato' ? '<button class="add-coluna" data-nova>+ Nova marca</button>' : ''}
      </section>`;
    }).join('')}</div>`;
    ligarArrastar();
  }

  function ligarArrastar() {
    $$('.card-marca').forEach(c => {
      c.addEventListener('dragstart', (e) => { arrastando = c.dataset.id; c.classList.add('arrastando'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.dataset.id); });
      c.addEventListener('dragend', () => { c.classList.remove('arrastando'); $$('.coluna').forEach(k => k.classList.remove('sobre')); });
    });
    $$('.coluna').forEach(col => {
      col.addEventListener('dragover', (e) => { if (!arrastando) return; e.preventDefault(); col.classList.add('sobre'); });
      col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('sobre'); });
      col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('sobre'); const id = arrastando; arrastando = null; if (id) moverPara(id, col.dataset.etapa); });
    });
  }

  function desenharCalendario() {
    const ano = mesCal.getFullYear(), mes = mesCal.getMonth();
    const primeiro = new Date(ano, mes, 1), dias = new Date(ano, mes + 1, 0).getDate();
    const eventos = {};
    const add = (iso, ev) => { if (!iso) return; (eventos[iso] = eventos[iso] || []).push(ev); };
    filtradas().forEach(m => {
      if (m.data_entrega && !['perdida'].includes(m.etapa)) add(m.data_entrega, { m, tipo: m.data_entregue ? 'feito' : 'entrega', txt: m.nome });
      if (m.proximo_followup && ['contato', 'negociando'].includes(m.etapa)) add(m.proximo_followup, { m, tipo: 'followup', txt: m.nome });
      if (m.data_pagamento) add(m.data_pagamento, { m, tipo: 'pagamento', txt: m.nome });
    });
    const h = hoje();
    let celulas = '';
    for (let i = 0; i < primeiro.getDay(); i++) celulas += '<div class="dia fora"></div>';
    for (let d = 1; d <= dias; d++) {
      const iso = paraISO(new Date(ano, mes, d));
      const evs = eventos[iso] || [];
      celulas += `<div class="dia ${iso === h ? 'hoje' : ''} ${iso < h ? 'passado' : ''}">
        <span class="num">${d}</span>
        ${evs.map(ev => `<button class="ev ${ev.tipo}" data-abrir="${ev.m.id}" title="${esc(({ entrega: 'Entrega', feito: 'Entregue', followup: 'Follow-up', pagamento: 'Pagamento' })[ev.tipo] + ': ' + ev.txt)}">${esc(ev.txt)}</button>`).join('')}
      </div>`;
    }
    const titulo = primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    $('#m-visao').innerHTML = `<div class="cartao calendario">
      <div class="cal-cab">
        <button class="cal-nav" data-mes="-1" aria-label="Mês anterior">‹</button>
        <h2>${titulo.charAt(0).toUpperCase() + titulo.slice(1)}</h2>
        <button class="cal-nav" data-mes="1" aria-label="Próximo mês">›</button>
      </div>
      <div class="legenda"><span class="entrega">Entrega</span><span class="feito">Entregue</span><span class="followup">Follow-up</span><span class="pagamento">Pagamento</span></div>
      <div class="cal-grade">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(s => `<div class="sem">${s}</div>`).join('')}${celulas}</div>
    </div>`;
  }

  function desenharFeedbacks() {
    const com = filtradas().filter(m => m.feedback_nota || m.feedback_texto).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    const area = $('#m-visao');
    if (!com.length) {
      area.innerHTML = `<div class="cartao"><p class="vazio">Nenhum feedback guardado ainda. Quando uma marca for para "Concluída", o painel pede a nota e o que ela achou.</p></div>`;
      return;
    }
    const voltaria = com.filter(m => m.trabalharia_de_novo === true).length;
    area.innerHTML = `<div class="feedback-resumo cartao">
        <div><div class="rotulo">Feedbacks guardados</div><div class="valor">${com.length}</div></div>
        <div><div class="rotulo">Você trabalharia de novo com</div><div class="valor">${voltaria} ${voltaria === 1 ? 'marca' : 'marcas'}</div></div>
      </div>
      <div class="feedbacks">${com.map(m => `
        <button class="cartao feedback" data-abrir="${m.id}">
          <div class="fb-topo"><strong>${esc(m.nome)}</strong>${m.feedback_nota ? estrelas(m.feedback_nota) : ''}</div>
          ${m.feedback_texto ? `<blockquote>“${esc(m.feedback_texto)}”</blockquote>` : ''}
          <div class="fb-rodape">
            ${m.contato_nome ? `<span>${esc(m.contato_nome)}</span>` : '<span></span>'}
            ${m.trabalharia_de_novo === true ? '<span class="selo-fb sim">Faria de novo</span>' : m.trabalharia_de_novo === false ? '<span class="selo-fb nao">Não faria de novo</span>' : ''}
          </div>
        </button>`).join('')}</div>`;
  }

  // ===== Ficha da marca (criar e editar) =====
  function campo(nome, rotulo, valor, extra) {
    return `<label class="campo ${extra && extra.largo ? 'largo' : ''}"><span>${rotulo}</span>
      <input name="${nome}" value="${esc(valor ?? '')}" ${extra && extra.attrs || ''}></label>`;
  }

  function abrirFicha(m, focoSecao) {
    const nova = !m;
    m = m || { etapa: 'contato', prazo_tipo: 'corridos', historico: [] };
    const dlg = document.getElementById('ficha-marca');
    const valorTxt = m.valor != null ? String(m.valor).replace('.', ',') : '';
    dlg.innerHTML = `<form method="dialog" class="ficha" novalidate>
      <header class="ficha-cab">
        <div><small>${nova ? 'Nova marca' : esc(NOME_ETAPA[m.etapa])}</small><h2>${nova ? 'Adicionar marca' : esc(m.nome)}</h2></div>
        <button type="button" class="fechar" data-fechar aria-label="Fechar">×</button>
      </header>
      <div class="ficha-corpo">
        <div class="faixa-erro" id="ficha-erro" hidden></div>

        <fieldset><legend>Marca e contato</legend>
          <div class="grade-campos">
            ${campo('nome', 'Nome da marca *', m.nome, { attrs: 'required maxlength="120" placeholder="Ex.: Minimal Club"' })}
            ${campo('nicho', 'Nicho', m.nicho, { attrs: 'placeholder="Beleza, moda, casa..."' })}
            ${campo('contato_nome', 'Pessoa de contato', m.contato_nome, { attrs: 'placeholder="Nome de quem fala com você"' })}
            ${campo('contato_whatsapp', 'WhatsApp', m.contato_whatsapp, { attrs: 'inputmode="tel" placeholder="(11) 90000-0000"' })}
            ${campo('contato_email', 'E-mail', m.contato_email, { attrs: 'type="email" placeholder="marca@email.com"' })}
            ${campo('contato_instagram', 'Instagram', m.contato_instagram, { attrs: 'placeholder="@marca"' })}
          </div>
        </fieldset>

        <fieldset><legend>Negociação</legend>
          <div class="grade-campos">
            <label class="campo"><span>Etapa</span><select name="etapa">${ETAPAS.map(e => `<option value="${e.id}" ${e.id === m.etapa ? 'selected' : ''}>${e.nome}</option>`).join('')}</select></label>
            <label class="campo"><span>Por onde chegou</span><select name="canal"><option value="">Escolha</option>${Object.entries(CANAIS).map(([k, v]) => `<option value="${k}" ${m.canal === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            ${campo('entregaveis', 'O que vou entregar', m.entregaveis, { largo: true, attrs: 'placeholder="Ex.: 2 vídeos UGC de 30s + 5 fotos"' })}
            ${campo('valor', 'Valor fechado (R$)', valorTxt, { attrs: 'inputmode="decimal" placeholder="0,00"' })}
            ${campo('proximo_followup', 'Próximo follow-up', m.proximo_followup, { attrs: 'type="date"' })}
          </div>
        </fieldset>

        <fieldset id="sec-prazo"><legend>O que preciso para criar</legend>
          <div class="checklist">
            ${[['produto_recebido', 'Produto recebido'], ['briefing_recebido', 'Briefing recebido'], ['contrato_assinado', 'Contrato assinado'], ['roteiro_aprovado', 'Roteiro aprovado']].map(([k, r]) =>
              `<label class="check"><input type="checkbox" name="${k}" ${m[k] ? 'checked' : ''}><span>${r}</span></label>`).join('')}
          </div>
          <div class="grade-campos">
            ${campo('data_recebimento', 'Recebi tudo em', m.data_recebimento, { attrs: 'type="date"' })}
            ${campo('prazo_dias', 'Prazo (dias)', m.prazo_dias, { attrs: 'type="number" min="0" max="365" placeholder="Ex.: 7"' })}
            <label class="campo"><span>Contar</span><select name="prazo_tipo"><option value="corridos" ${m.prazo_tipo !== 'uteis' ? 'selected' : ''}>Dias corridos</option><option value="uteis" ${m.prazo_tipo === 'uteis' ? 'selected' : ''}>Dias úteis</option></select></label>
            ${campo('data_entrega', 'Entregar até', m.data_entrega, { attrs: 'type="date"' })}
          </div>
          <div class="previa-prazo" id="previa-prazo"></div>
        </fieldset>

        <fieldset><legend>Entrega e pagamento</legend>
          <div class="grade-campos">
            ${campo('data_entregue', 'Entreguei em', m.data_entregue, { attrs: 'type="date"' })}
            ${campo('data_pagamento', 'Pagamento (data)', m.data_pagamento, { attrs: 'type="date"' })}
            <label class="check grande"><input type="checkbox" name="pago" ${m.pago ? 'checked' : ''}><span>Já recebi o pagamento</span></label>
          </div>
        </fieldset>

        <fieldset id="sec-feedback"><legend>Feedback da marca</legend>
          <div class="nota-estrelas" role="radiogroup" aria-label="Nota da marca">
            ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="estrela ${m.feedback_nota >= n ? 'on' : ''}" data-nota="${n}" aria-label="${n} de 5">★</button>`).join('')}
            <input type="hidden" name="feedback_nota" value="${m.feedback_nota || ''}">
            <button type="button" class="limpar-nota" data-limpar-nota>limpar</button>
          </div>
          <label class="campo largo"><span>O que a marca disse</span><textarea name="feedback_texto" rows="3" placeholder="Cole aqui o elogio ou os ajustes que pediram">${esc(m.feedback_texto || '')}</textarea></label>
          <div class="escolha">
            <span>Você trabalharia com ela de novo?</span>
            <label><input type="radio" name="trabalharia_de_novo" value="sim" ${m.trabalharia_de_novo === true ? 'checked' : ''}> Sim</label>
            <label><input type="radio" name="trabalharia_de_novo" value="nao" ${m.trabalharia_de_novo === false ? 'checked' : ''}> Não</label>
          </div>
        </fieldset>

        <fieldset><legend>Anotações</legend>
          <label class="campo largo"><textarea name="notas" rows="3" placeholder="Endereço de envio, cupom, referências, combinados...">${esc(m.notas || '')}</textarea></label>
        </fieldset>

        ${!nova ? `<fieldset><legend>Atalhos</legend>
          <div class="atalhos">
            <select id="modelo-msg">${Object.entries(NOMES_MODELO).map(([k, v]) => `<option value="${k}" ${modeloSugerido(m) === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
            ${m.contato_whatsapp ? `<a class="mini-btn zap" id="at-zap" target="_blank" rel="noopener" href="${linkWhats(m, modeloSugerido(m))}">Abrir no WhatsApp</a>` : ''}
            ${m.contato_email ? `<a class="mini-btn" id="at-email" href="${linkEmail(m, modeloSugerido(m))}">Abrir no e-mail</a>` : ''}
            ${!m.contato_whatsapp && !m.contato_email ? '<small>Coloque o WhatsApp ou o e-mail do contato para usar as mensagens prontas.</small>' : ''}
          </div>
          ${m.data_entrega ? `<a class="mini-btn agenda" target="_blank" rel="noopener" href="${linkAgenda(m)}">Colocar a entrega no Google Agenda</a>` : ''}
        </fieldset>` : ''}

        ${!nova && (m.historico || []).length ? `<fieldset><legend>Histórico</legend><ol class="historico">${[...m.historico].reverse().map(h =>
          `<li><span>${esc(NOME_ETAPA[h.etapa] || h.etapa)}</span><time>${new Date(h.em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</time></li>`).join('')}</ol></fieldset>` : ''}
      </div>
      <footer class="ficha-rodape">
        ${!nova ? '<button type="button" class="btn-perigo" data-excluir>Excluir</button>' : '<span></span>'}
        <div><button type="button" class="btn-secundario" data-fechar>Cancelar</button>
        <button type="submit" class="btn-primario" id="btn-salvar-marca">${nova ? 'Adicionar' : 'Salvar'}</button></div>
      </footer>
    </form>`;

    const form = dlg.querySelector('form');
    let entregaManual = !!m.data_entrega && m.data_recebimento && m.prazo_dias != null && m.data_entrega !== somarPrazo(m.data_recebimento, m.prazo_dias, m.prazo_tipo);

    // Calcula "entregar até" sozinho a partir do recebimento + prazo
    function recalcular(origem) {
      const rec = form.data_recebimento.value, dias = form.prazo_dias.value, tipo = form.prazo_tipo.value;
      if (origem !== 'entrega' && !entregaManual && rec && dias !== '') form.data_entrega.value = somarPrazo(rec, Number(dias), tipo);
      const ent = form.data_entrega.value, prev = dlg.querySelector('#previa-prazo');
      if (!ent) { prev.innerHTML = rec ? 'Coloque quantos dias de prazo a marca deu e eu calculo a data de entrega.' : 'Quando o produto e o briefing chegarem, marque acima e coloque o prazo.'; prev.className = 'previa-prazo'; return; }
      const st = situacaoPrazo({ data_entrega: ent, data_entregue: form.data_entregue.value || null });
      prev.innerHTML = `Entregar até <strong>${fmtLonga(ent)}</strong> · ${esc(st.txt)}`;
      prev.className = 'previa-prazo ' + st.cor;
    }
    ['data_recebimento', 'prazo_dias', 'prazo_tipo', 'data_entregue'].forEach(n => form[n].addEventListener('input', () => recalcular()));
    form.data_entrega.addEventListener('input', () => { entregaManual = !!form.data_entrega.value; recalcular('entrega'); });
    // Chegou produto e briefing? Já preenche a data de recebimento com hoje.
    ['produto_recebido', 'briefing_recebido'].forEach(n => form[n].addEventListener('change', () => {
      if (form.produto_recebido.checked && form.briefing_recebido.checked && !form.data_recebimento.value) {
        form.data_recebimento.value = hoje(); recalcular();
        if (form.etapa.value === 'aguardando') { form.etapa.value = 'producao'; toast('Recebeu tudo: movi para "Em produção". O prazo começa hoje.'); }
      }
    }));
    form.pago.addEventListener('change', () => { if (form.pago.checked && !form.data_pagamento.value) form.data_pagamento.value = hoje(); });
    recalcular();

    // Estrelas
    dlg.querySelectorAll('.estrela').forEach(b => b.addEventListener('click', () => {
      form.feedback_nota.value = b.dataset.nota;
      dlg.querySelectorAll('.estrela').forEach(x => x.classList.toggle('on', Number(x.dataset.nota) <= Number(b.dataset.nota)));
    }));
    dlg.querySelector('[data-limpar-nota]').addEventListener('click', () => { form.feedback_nota.value = ''; dlg.querySelectorAll('.estrela').forEach(x => x.classList.remove('on')); });

    // Mensagens prontas
    const sel = dlg.querySelector('#modelo-msg');
    if (sel) sel.addEventListener('change', () => {
      const zap = dlg.querySelector('#at-zap'), em = dlg.querySelector('#at-email');
      if (zap) zap.href = linkWhats(m, sel.value);
      if (em) em.href = linkEmail(m, sel.value);
    });

    dlg.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }, { once: true });

    const exc = dlg.querySelector('[data-excluir]');
    if (exc) exc.addEventListener('click', async () => {
      if (!confirm(`Excluir ${m.nome}? Isso não pode ser desfeito.`)) return;
      try { await apagar(m.id); dlg.close(); desenhar(); toast('Marca excluída.'); }
      catch (e) { console.error(e); erroFicha('Não consegui excluir agora. Tente de novo.'); }
    });

    function erroFicha(msg) { const el = dlg.querySelector('#ficha-erro'); el.textContent = msg; el.hidden = false; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = form;
      const nome = f.nome.value.trim();
      if (!nome) { erroFicha('Coloque o nome da marca.'); f.nome.focus(); return; }
      const txt = (n) => { const v = f[n].value.trim(); return v || null; };
      const valorBruto = f.valor.value.trim().replace(/[R$\s]/g, '');
      const valor = valorBruto ? Number(valorBruto.includes(',') ? valorBruto.replace(/\./g, '').replace(',', '.') : valorBruto) : null;
      if (valorBruto && !isFinite(valor)) { erroFicha('Confira o valor. Use só números, por exemplo 1.500,00.'); f.valor.focus(); return; }
      const tdn = f.querySelector('input[name="trabalharia_de_novo"]:checked');
      const dados = {
        nome, nicho: txt('nicho'), contato_nome: txt('contato_nome'), contato_whatsapp: txt('contato_whatsapp'),
        contato_email: txt('contato_email'), contato_instagram: txt('contato_instagram'),
        canal: f.canal.value || null, etapa: f.etapa.value, entregaveis: txt('entregaveis'), valor,
        proximo_followup: txt('proximo_followup'),
        produto_recebido: f.produto_recebido.checked, briefing_recebido: f.briefing_recebido.checked,
        contrato_assinado: f.contrato_assinado.checked, roteiro_aprovado: f.roteiro_aprovado.checked,
        data_recebimento: txt('data_recebimento'), prazo_dias: f.prazo_dias.value === '' ? null : Math.max(0, Math.min(365, parseInt(f.prazo_dias.value, 10))),
        prazo_tipo: f.prazo_tipo.value, data_entrega: txt('data_entrega'), data_entregue: txt('data_entregue'),
        pago: f.pago.checked, data_pagamento: txt('data_pagamento'),
        feedback_nota: f.feedback_nota.value ? Number(f.feedback_nota.value) : null, feedback_texto: txt('feedback_texto'),
        trabalharia_de_novo: tdn ? tdn.value === 'sim' : null, notas: txt('notas')
      };
      // Se a etapa mudou, registra no histórico e ajusta as datas
      if (nova || dados.etapa !== m.etapa) {
        const extra = mudancasDeEtapa({ ...m, ...dados }, dados.etapa);
        Object.keys(extra).forEach(k => { if (k === 'historico' || k === 'etapa' || dados[k] == null || dados[k] === false) dados[k] = extra[k]; });
      }
      const btn = dlg.querySelector('#btn-salvar-marca');
      btn.disabled = true; btn.textContent = 'Salvando...';
      try {
        await salvar(nova ? null : m.id, dados);
        dlg.close(); desenhar(); toast(nova ? `${nome} adicionada!` : 'Alterações salvas.');
      } catch (err) {
        console.error(err);
        erroFicha('Não consegui salvar agora. Confira sua conexão e tente de novo.');
        btn.disabled = false; btn.textContent = nova ? 'Adicionar' : 'Salvar';
      }
    });

    dlg.showModal();
    const alvo = focoSecao && dlg.querySelector(focoSecao === 'feedback' ? '#sec-feedback' : '#sec-prazo');
    if (alvo) { alvo.classList.add('destacar'); setTimeout(() => alvo.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60); }
    else if (nova) setTimeout(() => form.nome.focus(), 50);
  }

  // ===== Montagem da aba =====
  function montarEsqueleto() {
    raiz.innerHTML = `
      <div class="marcas-barra">
        <p class="saudacao">Suas parcerias, prazos e feedbacks num lugar só.</p>
        <button class="btn-primario" data-nova>+ Nova marca</button>
      </div>
      <div class="numeros" id="m-numeros"></div>
      <div class="cartao hoje" id="m-hoje" hidden></div>
      <div class="marcas-ferramentas">
        <div class="visoes" role="tablist">
          <button class="vis-btn ativo" data-vis="funil">Funil</button>
          <button class="vis-btn" data-vis="calendario">Calendário</button>
          <button class="vis-btn" data-vis="feedbacks">Feedbacks</button>
        </div>
        <input type="search" class="busca" id="m-busca" placeholder="Buscar marca..." aria-label="Buscar marca">
      </div>
      <div id="m-visao"><p class="carregando">Carregando suas marcas...</p></div>`;
    if (!document.getElementById('ficha-marca')) {
      const d = document.createElement('dialog'); d.id = 'ficha-marca'; d.className = 'dialogo-ficha'; document.body.appendChild(d);
    }

    // Um ouvinte só para os cliques da aba
    raiz.addEventListener('click', (e) => {
      const alvo = e.target.closest('[data-nova], [data-avancar], [data-abrir], .card-marca, .vis-btn, .cal-nav');
      if (!alvo) return;
      if (alvo.matches('[data-nova]')) return abrirFicha(null);
      if (alvo.matches('[data-avancar]')) { e.stopPropagation(); return moverPara(alvo.dataset.avancar, alvo.dataset.para); }
      if (alvo.matches('.vis-btn')) { visao = alvo.dataset.vis; return desenhar(); }
      if (alvo.matches('.cal-nav')) { mesCal.setMonth(mesCal.getMonth() + Number(alvo.dataset.mes)); return desenharCalendario(); }
      const id = alvo.dataset.abrir || alvo.dataset.id;
      const m = marcas.find(x => x.id === id);
      if (m) abrirFicha(m);
    });
    raiz.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('.card-marca')) { const m = marcas.find(x => x.id === e.target.dataset.id); if (m) abrirFicha(m); }
    });
    $('#m-busca').addEventListener('input', (e) => { busca = e.target.value.trim(); desenhar(); });
  }

  window.Marcas = {
    lista: () => marcas, // usada pelas Tarefas (ligar tarefa a uma marca)
    async iniciar(cliente, secao) {
      sb = cliente; raiz = secao;
      montarEsqueleto();
      try {
        await carregar();
        desenhar();
      } catch (e) {
        console.error(e);
        const faltaTabela = /marcas|relation|schema cache|PGRST205|42P01/i.test((e && (e.message + ' ' + e.code)) || '');
        $('#m-visao').innerHTML = `<div class="cartao"><p class="vazio">${faltaTabela
          ? 'A área de Marcas ainda não foi ativada no banco. Rode o arquivo marcas.sql no Supabase (SQL Editor) e recarregue a página.'
          : 'Não consegui carregar suas marcas agora. Confira sua conexão e recarregue a página.'}</p></div>`;
      }
    }
  };
})();
