/* =========================================================
   agenda.js · Aba "Agenda" do UGC Organized
   O calendário único do app: trabalho, vida, marcas, posts e
   feriados. Visões Mês / Semana / Dia / Lista, clicar no horário
   para criar, arrastar para mudar, busca, filtros e "escreva do
   seu jeito" (ex.: "dentista amanhã 15h").
   ========================================================= */
(function () {
  const H0 = 5, H1 = 24, PX = 68;           // grade de horários: 05h às 24h, 56px por hora
  let raiz, sel = null, busca = '', arrastando = null;
  const ler = (k, p) => { try { return localStorage.getItem(k) || p; } catch (e) { return p; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  let visao = ler('oug_ag_visao', window.matchMedia('(max-width: 700px)').matches ? 'dia' : 'semana');
  let filtro = 'tudo';

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paraISO = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const deISO = (s) => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
  const hoje = () => paraISO(new Date());
  const somaDias = (iso, n) => { const d = deISO(iso); d.setDate(d.getDate() + n); return paraISO(d); };
  const hora5 = (h) => h ? String(h).slice(0, 5) : '';
  const minutos = (h) => { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); };
  const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const moeda = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const nomeDiaLongo = (iso) => maiuscula(deISO(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));

  function toast(msg) {
    let t = document.getElementById('toast-marcas');
    if (!t) { t = document.createElement('div'); t.id = 'toast-marcas'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast-m ativo'; clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('ativo'), 2800);
  }

  // ===== Tudo o que acontece num dia =====
  function eventos(iso) {
    const lista = [];
    const f = window.Feriados && Feriados.de(iso);
    if (f) lista.push({ tipo: 'feriado', titulo: f.nome + (f.facultativo ? ' (ponto facultativo)' : ''), emoji: '🎉' });

    if (window.Tarefas) Tarefas.doDia(iso).forEach(t => {
      const c = Tarefas.categorias[t.categoria] || Tarefas.categorias.outro;
      lista.push({ tipo: Tarefas.LIVRES.includes(t.categoria) ? 'vida' : 'trabalho', hora: hora5(t.hora), dur: t.duracao_min || 30, titulo: t.titulo, emoji: c.emoji,
        sub: (t._rep ? '🔁 se repete · ' : '') + c.nome, feito: t.concluida, id: t.id, movel: !t._rep, abrir: () => Tarefas.abrir(t.id) });
    });

    if (window.Marcas) Marcas.lista().forEach(m => {
      const ab = () => Marcas.abrir(m.id);
      if (m.data_entrega === iso && !m.data_entregue && m.etapa !== 'perdida') lista.push({ tipo: 'marca', titulo: `Entrega: ${m.nome}`, emoji: '📦', sub: m.entregaveis || '', abrir: ab });
      if (m.proximo_followup === iso && ['contato', 'negociando'].includes(m.etapa)) lista.push({ tipo: 'marca', titulo: `Follow-up: ${m.nome}`, emoji: '💬', abrir: ab });
      if (!m.pago && Number(m.valor) > 0 && m.lembrar_cobranca === iso) lista.push({ tipo: 'marca', titulo: `Cobrar ${m.nome}`, emoji: '💸', sub: moeda(m.valor), abrir: ab });
      else if (!m.pago && Number(m.valor) > 0 && m.data_pagamento === iso) lista.push({ tipo: 'marca', titulo: `Pagamento previsto: ${m.nome}`, emoji: '💸', sub: moeda(m.valor), abrir: ab });
      if (m.repescagem_em === iso && m.etapa === 'concluida') lista.push({ tipo: 'marca', titulo: `Repescagem: ${m.nome}`, emoji: '🔁', abrir: ab });
      if (m.uso_imagem_ate === iso) lista.push({ tipo: 'marca', titulo: `Licença de uso vence: ${m.nome}`, emoji: '📄', abrir: ab });
      if (m.exclusividade_ate === iso) lista.push({ tipo: 'marca', titulo: `Fim da exclusividade: ${m.nome}`, emoji: '🔓', abrir: ab });
    });

    if (window.Conteudo) Conteudo.lista().forEach(c => {
      if (c.data_publicacao === iso) lista.push({ tipo: 'post', titulo: (c.etapa === 'postado' ? 'Postado: ' : 'Postar: ') + c.titulo, emoji: '🎬', sub: c.marca_id ? 'Para marca' : 'Seu conteúdo', feito: c.etapa === 'postado', abrir: () => Conteudo.abrir(c.id) });
    });

    if (window.Prospeccao) Prospeccao.lista().forEach(p => {
      if (p.status === 'enviada' && p.proximo_followup === iso) lista.push({ tipo: 'marca', titulo: `Follow-up da abordagem: ${p.marca}`, emoji: '📸', abrir: () => document.querySelector('[data-tab="aba-prospeccao"]').click() });
    });

    const b = busca.toLowerCase();
    return lista
      .filter(e => e.tipo === 'feriado' || filtro === 'tudo' || e.tipo === filtro)
      .filter(e => !b || e.tipo === 'feriado' || (e.titulo + ' ' + (e.sub || '')).toLowerCase().includes(b))
      .sort((a, c) => (a.tipo === 'feriado' ? -1 : c.tipo === 'feriado' ? 1 : 0) || (a.hora || '').localeCompare(c.hora || ''));
  }

  // ===== "Escreva do seu jeito": entende dia, hora, repetição e tipo =====
  const DIAS = [['domingo', 0], ['segunda', 1], ['terça', 2], ['terca', 2], ['quarta', 3], ['quinta', 4], ['sexta', 5], ['sábado', 6], ['sabado', 6]];
  function entender(texto) {
    // t = minúsculas para entender; o = original (mesmo tamanho) para o título manter as maiúsculas
    let o = ' ' + texto.replace(/[,.;!]/g, ' ') + ' ', t = o.toLowerCase();
    if (t.length !== o.length) o = t;
    const tira = (re) => {
      let i, n;
      if (typeof re === 'string') { i = t.indexOf(re); n = re.length; } else { const m = t.match(re); if (!m) return; i = m.index; n = m[0].length; }
      if (i < 0) return;
      t = t.slice(0, i) + ' '.repeat(n) + t.slice(i + n); o = o.slice(0, i) + ' '.repeat(n) + o.slice(i + n);
    };
    const r = { titulo: '', data: null, hora: null, repetir: null, repetir_dias: null, duracao_min: null, categoria: 'compromisso' };
    const proximo = (dow, incluiHoje) => { let d = hoje(); for (let i = 0; i < 8; i++) { if (deISO(d).getDay() === dow && (i || incluiHoje)) return d; d = somaDias(d, 1); } return hoje(); };

    // Repetição
    if (/\btodo(s)? (os )?dias?\b|\bdiariamente\b/.test(t)) { r.repetir = 'diario'; tira(/\btodo(s)? (os )?dias?\b|\bdiariamente\b/); }
    else if (/\bdias? [úu]teis\b|\bde segunda a sexta\b/.test(t)) { r.repetir = 'dias_uteis'; tira(/\b(nos |em )?dias? [úu]teis\b|\bde segunda a sexta\b/); }
    else if (/\btodo (o )?m[êe]s(?=\s)|\bmensalmente\b/.test(t)) { r.repetir = 'mensal'; tira(/\btodo (o )?m[êe]s(?=\s)|\bmensalmente\b/); }
    else if (/\btodo (o )?ano\b|\banualmente\b/.test(t)) { r.repetir = 'anual'; tira(/\btodo (o )?ano\b|\banualmente\b/); }
    else {
      const m = t.match(/\btod[ao]s? (as |os )?((segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(-feira)?s?((,| e) *)?)+/);
      if (m) {
        const dias = DIAS.filter(([n]) => m[0].includes(n)).map(([, i]) => i).filter((v, i, a) => a.indexOf(v) === i).sort();
        r.repetir = dias.length === 1 ? 'semanal' : 'personalizado';
        r.repetir_dias = dias.join(',');
        r.data = proximo(dias[0], true);
        tira(m[0]);
      }
    }
    // Dia
    if (/\bdepois de amanh[ãa](?=\s)/.test(t)) { r.data = somaDias(hoje(), 2); tira(/\bdepois de amanh[ãa](?=\s)/); }
    else if (/\bamanh[ãa](?=\s)/.test(t)) { r.data = somaDias(hoje(), 1); tira(/\bamanh[ãa](?=\s)/); }
    else if (/\bhoje\b/.test(t)) { r.data = hoje(); tira(/\bhoje\b/); }
    let m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (m) {
      const ano = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : new Date().getFullYear();
      let d = paraISO(new Date(ano, Number(m[2]) - 1, Number(m[1])));
      if (!m[3] && d < hoje()) d = paraISO(new Date(ano + 1, Number(m[2]) - 1, Number(m[1])));
      r.data = d; tira(m[0]);
    }
    m = t.match(/\bdia (\d{1,2})\b/);
    if (m && !r.data) {
      const n = new Date(); let d = paraISO(new Date(n.getFullYear(), n.getMonth(), Number(m[1])));
      if (d < hoje()) d = paraISO(new Date(n.getFullYear(), n.getMonth() + 1, Number(m[1])));
      r.data = d; tira(m[0]);
    }
    if (!r.data) for (const [n, i] of DIAS) {
      const re = new RegExp(`\\b(na |no |pr[óo]xim[ao] |nesta |neste )?${n}(-feira)?\\b`);
      if (re.test(t)) { r.data = proximo(i, true); tira(re); break; }
    }
    // Hora
    if (/\bmeio[- ]dia\b/.test(t)) { r.hora = '12:00'; tira(/\b(ao |às |as )?meio[- ]dia\b/); }
    m = t.match(/\b(?:às|as|a partir das|das)?\s*(\d{1,2})\s*(?:h|:|horas?)\s*(\d{2})?\b/);
    if (m && Number(m[1]) < 24) { r.hora = hhmm(Number(m[1]) * 60 + Number(m[2] || 0)); tira(m[0]); }
    // Duração
    m = t.match(/\bpor (\d+)\s*(min|minutos|h|horas?)\b/);
    if (m) { r.duracao_min = /h/.test(m[2]) ? Number(m[1]) * 60 : Number(m[1]); tira(m[0]); }
    // Tipo
    if (/\bligar|liga[çc][ãa]o|reuni[ãa]o com|marca\b/.test(texto.toLowerCase())) r.categoria = 'marca';
    if (/\bgravar|grava[çc][ãa]o\b/.test(texto.toLowerCase())) r.categoria = 'gravar';
    if (/\beditar|edi[çc][ãa]o\b/.test(texto.toLowerCase())) r.categoria = 'editar';
    if (/\bpostar|publicar\b/.test(texto.toLowerCase())) r.categoria = 'postar';
    if (/\broteiro\b/.test(texto.toLowerCase())) r.categoria = 'roteiro';
    if (/\bacademia|m[ée]dico|dentista|escola|filh[oa]|almo[çc]o|jantar|mercado|pessoal\b/.test(texto.toLowerCase())) r.categoria = r.categoria === 'compromisso' ? 'pessoal' : r.categoria;
    // O que sobra vira o título
    r.titulo = maiuscula(o.replace(/\s+/g, ' ').trim().replace(/\s+(e|no|na|às|as|em|de|para|pra)$/i, '').trim()) || texto.trim();
    if (!r.duracao_min) delete r.duracao_min;
    return r;
  }

  function novo(dados) {
    if (!window.Tarefas) return;
    const base = { categoria: 'compromisso', ...dados };
    if (Tarefas.LIVRES.includes(base.categoria) && !base.duracao_min) base.duracao_min = 30;
    Tarefas.novaAqui(base);
  }

  // ===== Visões =====
  function cabecalho(titulo) {
    return `<div class="ag-barra">
      <div class="ag-nav"><button class="cal-nav" data-ag-passo="-1" aria-label="Anterior">‹</button><button class="mini-btn" data-ag-hoje>Hoje</button><button class="cal-nav" data-ag-passo="1" aria-label="Próximo">›</button><h2>${titulo}</h2></div>
      <div class="visoes ag-visoes">${[['mes', 'Mês'], ['semana', 'Semana'], ['dia', 'Dia'], ['lista', 'Lista']].map(([v, n]) => `<button class="vis-btn ${visao === v ? 'ativo' : ''}" data-ag-visao="${v}">${n}</button>`).join('')}</div>
    </div>
    <div class="ag-filtros">${[['tudo', 'Tudo'], ['trabalho', '💼 Trabalho'], ['vida', '🌸 Vida pessoal'], ['marca', '🤝 Marcas'], ['post', '🎬 Conteúdo']].map(([v, n]) => `<button class="${filtro === v ? 'ativo' : ''} ${v}" data-ag-filtro="${v}">${n}</button>`).join('')}</div>`;
  }

  function visaoMes() {
    const d0 = deISO(sel), ano = d0.getFullYear(), m = d0.getMonth(), primeiro = new Date(ano, m, 1), dias = new Date(ano, m + 1, 0).getDate(), h = hoje();
    let cel = '';
    for (let i = 0; i < primeiro.getDay(); i++) cel += '<div class="ag-dia fora"></div>';
    for (let d = 1; d <= dias; d++) {
      const iso = paraISO(new Date(ano, m, d)), evs = eventos(iso), fer = evs.find(e => e.tipo === 'feriado'), resto = evs.filter(e => e.tipo !== 'feriado');
      cel += `<div class="ag-dia ${iso === h ? 'hoje' : ''} ${iso === sel ? 'sel' : ''} ${iso < h ? 'passado' : ''} ${fer ? 'feriado' : ''}" data-ag-dia="${iso}" data-ag-solta="${iso}" role="button" tabindex="0" aria-label="${d}${fer ? ', ' + esc(fer.titulo) : ''}, ${resto.length} itens">
        <span class="num">${d}</span>
        ${fer ? `<span class="ag-fer">🎉 ${esc(fer.titulo.replace(' (ponto facultativo)', ''))}</span>` : ''}
        ${resto.slice(0, 3).map(e => `<span class="ag-ev ${e.tipo} ${e.feito ? 'feito' : ''}" ${e.movel ? `draggable="true" data-ag-arrasta="${e.id}" data-ag-hora="${e.hora || ''}"` : ''}>${e.hora ? `<b>${e.hora}</b> ` : ''}${esc(e.titulo)}</span>`).join('')}
        ${resto.length > 3 ? `<span class="ag-mais">+${resto.length - 3}</span>` : ''}
        ${resto.length ? `<span class="ag-pontos">${resto.slice(0, 4).map(e => `<i class="${e.tipo}"></i>`).join('')}</span>` : ''}
      </div>`;
    }
    return `<div class="cartao ag-mes">${cabecalho(maiuscula(primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })))}
      <div class="ag-grade">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(s => `<div class="sem">${s}</div>`).join('')}${cel}</div></div>`;
  }

  // Coloca os eventos com horário em colunas quando um bate no outro
  function arrumar(evs) {
    const lista = evs.filter(e => e.hora).map(e => ({ ...e, ini: minutos(e.hora), fim: minutos(e.hora) + Math.max(e.dur || 30, 20) })).sort((a, b) => a.ini - b.ini);
    let grupo = [], fimGrupo = -1;
    const fechar = () => { const n = Math.max(...grupo.map(x => x.lane)) + 1; grupo.forEach(x => { x.lanes = n; }); grupo = []; };
    lista.forEach(e => {
      if (e.ini >= fimGrupo && grupo.length) fechar();
      const usadas = grupo.filter(x => x.fim > e.ini).map(x => x.lane);
      let lane = 0; while (usadas.includes(lane)) lane++;
      e.lane = lane; grupo.push(e); fimGrupo = Math.max(fimGrupo, e.fim);
    });
    if (grupo.length) fechar();
    return lista;
  }

  function grade(dias) {
    const h = hoje(), agora = new Date(), minAgora = agora.getHours() * 60 + agora.getMinutes();
    const cab = dias.map(iso => { const d = deISO(iso), f = window.Feriados && Feriados.de(iso);
      return `<button class="ag-col-cab ${iso === h ? 'hoje' : ''} ${iso === sel ? 'sel' : ''}" data-ag-ir-dia="${iso}"><small>${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()]}</small><b>${d.getDate()}</b>${f ? '<i title="' + esc(f.nome) + '">🎉</i>' : ''}</button>`; }).join('');
    const diaTodo = dias.map(iso => `<div class="ag-diatodo-cel" data-ag-solta="${iso}">${eventos(iso).filter(e => !e.hora).map(e => `<button class="ag-chip ${e.tipo} ${e.feito ? 'feito' : ''}" data-ag-abrir-ev="${iso}|${esc(e.titulo)}" ${e.movel ? `draggable="true" data-ag-arrasta="${e.id}" data-ag-hora=""` : ''}>${e.emoji} ${esc(e.titulo)}</button>`).join('')}</div>`).join('');
    const horas = Array.from({ length: H1 - H0 }, (_, i) => `<div class="ag-hora-lbl" style="top:${i * PX}px">${String(H0 + i).padStart(2, '0')}:00</div>`).join('');
    const cols = dias.map(iso => {
      const evs = arrumar(eventos(iso));
      return `<div class="ag-col ${iso === h ? 'hoje' : ''}" data-ag-col="${iso}" style="height:${(H1 - H0) * PX}px">
        ${evs.map(e => { const top = Math.max(0, (e.ini - H0 * 60) / 60 * PX), alt = Math.max(22, (e.fim - e.ini) / 60 * PX - 2);
          return `<button class="ag-bloco ${e.tipo} ${e.feito ? 'feito' : ''} ${alt < 50 ? 'curto' : ''}" style="top:${top}px;height:${alt}px;left:calc(${e.lane / e.lanes * 100}% + 2px);width:calc(${100 / e.lanes}% - 4px)"
            data-ag-abrir-ev="${iso}|${esc(e.titulo)}" ${e.movel ? `draggable="true" data-ag-arrasta="${e.id}" data-ag-dur="${e.dur}"` : ''}>
            <b>${e.hora}</b> ${e.emoji} ${esc(e.titulo)}${alt >= 80 && e.sub ? `<small>${esc(e.sub)}</small>` : ''}</button>`; }).join('')}
        ${iso === h && minAgora >= H0 * 60 ? `<div class="ag-agora" style="top:${(minAgora - H0 * 60) / 60 * PX}px"></div>` : ''}
      </div>`;
    }).join('');
    return `<div class="ag-grade-horas" style="--cols:${dias.length}">
      <div class="ag-linha-cab"><div></div>${cab}</div>
      <div class="ag-linha-diatodo"><div class="ag-diatodo-lbl">dia todo</div>${diaTodo}</div>
      <div class="ag-rolagem" id="ag-rolagem"><div class="ag-corpo"><div class="ag-horas" style="height:${(H1 - H0) * PX}px">${horas}</div>${cols}</div></div>
    </div>`;
  }

  function visaoSemana() {
    const d = deISO(sel), ini = somaDias(sel, -d.getDay()), dias = Array.from({ length: 7 }, (_, i) => somaDias(ini, i));
    const a = deISO(dias[0]), b = deISO(dias[6]);
    const titulo = a.getMonth() === b.getMonth() ? `${a.getDate()} a ${b.getDate()} de ${b.toLocaleDateString('pt-BR', { month: 'long' })}` : `${a.getDate()}/${a.getMonth() + 1} a ${b.getDate()}/${b.getMonth() + 1}`;
    return `<div class="cartao ag-sem">${cabecalho(maiuscula(titulo))}${grade(dias)}</div>`;
  }

  function visaoDia() { return `<div class="cartao ag-sem ag-umdia">${cabecalho(nomeDiaLongo(sel))}${grade([sel])}</div>`; }

  function visaoLista() {
    const ini = busca ? somaDias(hoje(), -60) : sel, fim = busca ? somaDias(hoje(), 365) : somaDias(sel, 45);
    let html = '', d = ini, n = 0;
    while (d <= fim && n < 400) {
      const evs = eventos(d).filter(e => busca ? e.tipo !== 'feriado' : true);
      if (evs.length) html += `<div class="ag-lista-dia ${d === hoje() ? 'hoje' : ''}"><h3>${d === hoje() ? 'Hoje · ' : ''}${nomeDiaLongo(d)}</h3>${evs.map(e => item(e, d)).join('')}</div>`;
      d = somaDias(d, 1); n++;
    }
    return `<div class="cartao ag-lista-cartao">${cabecalho(busca ? `Resultados para "${esc(busca)}"` : 'Próximos 45 dias')}${html || '<p class="vazio">Nada encontrado.</p>'}</div>`;
  }

  function item(e, iso) {
    return `<button class="ag-item ${e.tipo} ${e.feito ? 'feito' : ''}" data-ag-abrir-ev="${iso}|${esc(e.titulo)}" ${e.abrir ? '' : 'disabled'}>
      <span class="ag-hora">${e.hora || (e.tipo === 'feriado' ? '' : 'dia')}</span>
      <span class="ag-txt"><b>${e.emoji} ${esc(e.titulo)}</b>${e.sub ? `<small>${esc(e.sub)}</small>` : ''}</span></button>`;
  }

  function lado() {
    const evs = eventos(sel);
    return `<div class="cartao ag-lado">
      <div class="ag-lado-cab"><h2>${nomeDiaLongo(sel)}</h2></div>
      ${evs.length ? `<div class="ag-lista">${evs.map(e => item(e, sel)).join('')}</div>` : '<p class="vazio">Nada marcado. Que tal aproveitar o dia livre?</p>'}
      <div class="ag-rapido">
        ${[['📌', 'Compromisso', 'compromisso', ''], ['🌸', 'Pessoal', 'pessoal', ''], ['📞', 'Ligar para marca', 'marca', 'Ligar para '], ['🎥', 'Gravar', 'gravar', 'Gravar ']].map(([e, n, c, tit]) => `<button class="mini-btn" data-ag-novo="${sel}" data-ag-cat="${c}" data-ag-tit="${tit}">${e} ${n}</button>`).join('')}
      </div>
    </div>`;
  }

  function desenhar() {
    if (!raiz) return;
    if (!sel) sel = hoje();
    const scroll = raiz.querySelector('#ag-rolagem'), topo = scroll ? scroll.scrollTop : null;
    const corpo = visao === 'mes' ? visaoMes() : visao === 'semana' ? visaoSemana() : visao === 'dia' ? visaoDia() : visaoLista();
    raiz.innerHTML = `
      <div class="ag-topo">
        <form class="ag-rapida" id="ag-rapida" autocomplete="off">
          <input name="q" placeholder='Escreva do seu jeito: "dentista amanhã 15h", "buscar filho dias úteis 17h30"...' aria-label="Adicionar escrevendo">
          <button class="btn-primario" type="submit">+ Adicionar</button>
        </form>
        <div class="ag-ferr">
          <input type="search" class="busca" id="ag-busca" placeholder="Buscar na agenda..." value="${esc(busca)}" aria-label="Buscar na agenda">
          <button class="btn-secundario" data-ag-exportar title="Leva seus compromissos para o Google Agenda ou o calendário do iPhone">📅 Levar para Google/iPhone</button>
        </div>
      </div>
      <div class="agenda ${visao === 'mes' ? 'com-lado' : ''}">${corpo}${visao === 'mes' ? lado() : ''}</div>`;
    raiz._ev = {};
    const r = raiz.querySelector('#ag-rolagem');
    if (r) r.scrollTop = topo != null ? topo : (7 - H0) * PX - 14; // abre mostrando a partir das 7h
    if (busca) { const b = raiz.querySelector('#ag-busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
  }

  function passo(n) {
    if (visao === 'mes') { const d = deISO(sel); d.setDate(1); d.setMonth(d.getMonth() + n); sel = paraISO(d); }
    else sel = somaDias(sel, visao === 'semana' ? 7 * n : visao === 'lista' ? 30 * n : n);
    desenhar();
  }

  function abrirEvento(chave) {
    const [iso, ...resto] = chave.split('|'), titulo = resto.join('|');
    const ev = eventos(iso).find(e => esc(e.titulo) === titulo);
    if (ev && ev.abrir) ev.abrir();
  }

  function exportar() {
    const lista = (window.Tarefas ? Tarefas.lista() : []).filter(t => t.data && t.hora && !t.concluida && (t.repetir || t.data >= hoje()));
    if (!lista.length) return toast('Ainda não tem nada com dia e horário para levar.');
    Tarefas.exportar(lista);
  }

  // Horário pelo ponto clicado/solto na coluna (de 15 em 15 min)
  function horaDoPonto(col, y) {
    const r = col.getBoundingClientRect(), m = H0 * 60 + Math.round(((y - r.top) / PX * 60) / 15) * 15;
    return hhmm(Math.min(23 * 60 + 45, Math.max(H0 * 60, m)));
  }

  window.Agenda = {
    iniciar(el) {
      raiz = el;
      raiz.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ag-passo], [data-ag-hoje], [data-ag-visao], [data-ag-filtro], [data-ag-dia], [data-ag-ir-dia], [data-ag-novo], [data-ag-abrir-ev], [data-ag-exportar], .ag-col');
        if (!b) return;
        if (b.dataset.agPasso) return passo(Number(b.dataset.agPasso));
        if (b.matches('[data-ag-hoje]')) { sel = hoje(); return desenhar(); }
        if (b.dataset.agVisao) { visao = b.dataset.agVisao; gravar('oug_ag_visao', visao); return desenhar(); }
        if (b.dataset.agFiltro) { filtro = b.dataset.agFiltro; return desenhar(); }
        if (b.matches('[data-ag-exportar]')) return exportar();
        if (b.matches('[data-ag-novo]')) return novo({ data: b.dataset.agNovo, categoria: b.dataset.agCat, titulo: b.dataset.agTit || '' });
        if (b.dataset.agAbrirEv) { e.stopPropagation(); return abrirEvento(b.dataset.agAbrirEv); }
        if (b.dataset.agIrDia) { sel = b.dataset.agIrDia; visao = 'dia'; gravar('oug_ag_visao', visao); return desenhar(); }
        if (b.dataset.agDia) { if (e.target.closest('.ag-ev')) return; sel = b.dataset.agDia; return desenhar(); }
        // Clique num horário vazio: cria naquele horário
        if (b.matches('.ag-col') && e.target === b) return novo({ data: b.dataset.agCol, hora: horaDoPonto(b, e.clientY) });
      });
      raiz.addEventListener('dblclick', (e) => { const d = e.target.closest('[data-ag-dia]'); if (d) novo({ data: d.dataset.agDia }); });
      raiz.addEventListener('keydown', (e) => { const d = e.target.closest('[data-ag-dia]'); if (d && e.key === 'Enter') { sel = d.dataset.agDia; desenhar(); } });
      raiz.addEventListener('input', (e) => {
        if (e.target.id === 'ag-busca') {
          busca = e.target.value.trim();
          if (busca && visao !== 'lista') { raiz._visaoAntes = visao; visao = 'lista'; }
          if (!busca && raiz._visaoAntes) { visao = raiz._visaoAntes; raiz._visaoAntes = null; }
          desenhar();
        }
      });
      raiz.addEventListener('submit', (e) => {
        if (e.target.id !== 'ag-rapida') return;
        e.preventDefault();
        const txt = e.target.q.value.trim();
        if (!txt) return novo({ data: sel });
        const r = entender(txt);
        novo({ ...r, data: r.data || sel });
        e.target.q.value = '';
      });
      // Arrastar para mudar dia/horário (computador)
      raiz.addEventListener('dragstart', (e) => {
        const a = e.target.closest('[data-ag-arrasta]'); if (!a) return;
        const r = a.getBoundingClientRect();
        arrastando = { id: a.dataset.agArrasta, hora: a.dataset.agHora || null, deslocY: e.clientY - r.top };
        e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', arrastando.id);
        a.classList.add('arrastando');
      });
      raiz.addEventListener('dragend', (e) => { const a = e.target.closest('[data-ag-arrasta]'); if (a) a.classList.remove('arrastando'); raiz.querySelectorAll('.sobre').forEach(x => x.classList.remove('sobre')); });
      raiz.addEventListener('dragover', (e) => {
        const alvo = e.target.closest('.ag-col, [data-ag-solta]'); if (!alvo || !arrastando) return;
        e.preventDefault(); raiz.querySelectorAll('.sobre').forEach(x => x !== alvo && x.classList.remove('sobre')); alvo.classList.add('sobre');
      });
      raiz.addEventListener('drop', (e) => {
        const alvo = e.target.closest('.ag-col, [data-ag-solta]'); if (!alvo || !arrastando) return;
        e.preventDefault();
        const a = arrastando; arrastando = null;
        if (alvo.matches('.ag-col')) Tarefas.mover(a.id, alvo.dataset.agCol, horaDoPonto(alvo, e.clientY - a.deslocY));
        else Tarefas.mover(a.id, alvo.dataset.agSolta, alvo.classList.contains('ag-diatodo-cel') ? null : (a.hora || null));
      });
      document.addEventListener('click', (e) => { const b = e.target.closest('[data-ver-agenda]'); if (b) Agenda.abrirCom(b.dataset.verAgenda); });
      document.addEventListener('oug:tarefas', () => { if (raiz.classList.contains('ativo')) desenhar(); });
      // A linha do "agora" anda sozinha
      setInterval(() => { if (raiz.classList.contains('ativo') && ['semana', 'dia'].includes(visao) && !document.querySelector('dialog[open]')) desenhar(); }, 120000);
    },
    aoAbrir: () => desenhar(),
    // Outras áreas abrem a Agenda já filtrada (ex.: Conteúdo, Marcas)
    // Abre a Agenda numa visão (Semana das Tarefas, Calendário de Marcas e Conteúdo)
    abrirEm(v) { visao = v || 'mes'; gravar('oug_ag_visao', visao); document.querySelector('[data-tab="aba-agenda"]').click(); },
    abrirCom(f) { filtro = f || 'tudo'; if (visao === 'dia') visao = 'mes'; document.querySelector('[data-tab="aba-agenda"]').click(); },
    entender
  };
})();
