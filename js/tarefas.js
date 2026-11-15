/* =========================================================
   tarefas.js · Área "Tarefas" do Organized UGC
   Agenda com horário reservado, lembretes, e um "ritmo" que
   aprende quanto você realmente consegue fazer por dia.
   Tabelas: tarefas e preferencias (ver organizacao.sql).
   ========================================================= */
(function () {
  const CATEGORIAS = {
    roteiro:    { nome: 'Roteiro',     emoji: '✍️', min: 45 },
    gravar:     { nome: 'Gravar',      emoji: '🎥', min: 90 },
    editar:     { nome: 'Editar',      emoji: '✂️', min: 90 },
    postar:     { nome: 'Postar',      emoji: '📲', min: 20 },
    marca:      { nome: 'Marca',       emoji: '💼', min: 30 },
    prospectar: { nome: 'Prospectar',  emoji: '💌', min: 45 },
    admin:      { nome: 'Burocracia',  emoji: '🧾', min: 30 },
    pessoal:    { nome: 'Pessoal',     emoji: '🌸', min: 60 },
    outro:      { nome: 'Outro',       emoji: '✦',  min: 30 }
  };
  const PREFS_PADRAO = { nome: '', dias: [1, 2, 3, 4, 5], inicio: '09:00', fim: '18:00', horas: 4, lembrete: 30 };
  // Como chamar a usuária: o nome nas saudações; "Deusa" nas comemorações (e quando não há nome)
  const nomeDela = () => ((prefs && prefs.nome) || '').trim() || 'Deusa';
  const saudacaoHora = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
  const DIAS_MIN_APRENDER = 5; // dias com tarefas concluídas para o ritmo começar a valer

  let sb, raiz, uid, tarefas = [], prefs = null, visao = 'hoje', relogio = null, carregado = false, dadosBrutos = {};

  // ===== Utilidades =====
  const $ = (s, el) => (el || raiz).querySelector(s);
  const $$ = (s, el) => [...(el || raiz).querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paraISO = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const deISO = (s) => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
  const hoje = () => paraISO(new Date());
  const somaDias = (iso, n) => { const d = deISO(iso); d.setDate(d.getDate() + n); return paraISO(d); };
  const minutos = (h) => { if (!h) return null; const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };
  const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const hora5 = (h) => h ? String(h).slice(0, 5) : '';
  const durTxt = (m) => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`) : `${r} min`; };
  const arred15 = (m) => Math.max(15, Math.round(m / 15) * 15);
  const diaSemana = (iso) => deISO(iso).getDay();
  const fmtDia = (iso) => deISO(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const nomeDia = (iso) => iso === hoje() ? 'Hoje' : iso === somaDias(hoje(), 1) ? 'Amanhã' : maiuscula(fmtDia(iso));
  const cat = (t) => CATEGORIAS[t.categoria] || CATEGORIAS.outro;

  function toast(msg, erro) {
    let t = document.getElementById('toast-marcas');
    if (!t) { t = document.createElement('div'); t.id = 'toast-marcas'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast-m ativo' + (erro ? ' erro' : '');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('ativo'), 2800);
  }

  // Explosão de glitter quando conclui uma tarefa
  function comemorar(el) {
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const cores = ['#ff1493', '#ff4fa3', '#ff8fc7', '#fff3a8', '#c77dff', '#ffffff'];
    for (let i = 0; i < 26; i++) {
      const g = document.createElement('span'); g.className = 'glitter';
      const ang = Math.random() * Math.PI * 2, dist = 30 + Math.random() * 60;
      g.textContent = ['✦', '✧', '•', '⋆'][i % 4];
      g.style.cssText = `left:${cx}px;top:${cy}px;font-size:${8 + Math.random() * 10}px;color:${cores[i % cores.length]};--dx:${Math.cos(ang) * dist}px;--dy:${Math.sin(ang) * dist}px;--giro:${Math.random() * 300}deg;animation-duration:.8s`;
      document.body.appendChild(g); g.addEventListener('animationend', () => g.remove());
    }
  }

  // ===== Banco =====
  async function carregar() {
    let tudo = [], ini = 0;
    while (true) {
      const { data, error } = await sb.from('tarefas').select('*').order('created_at', { ascending: false }).range(ini, ini + 999);
      if (error) throw error;
      tudo = tudo.concat(data || []);
      if (!data || data.length < 1000) break;
      ini += 1000;
    }
    tarefas = tudo;
    const { data: p, error: e2 } = await sb.from('preferencias').select('dados').eq('user_id', uid).maybeSingle();
    if (e2) throw e2;
    dadosBrutos = (p && p.dados) || {};
    prefs = dadosBrutos.dias ? { ...PREFS_PADRAO, ...dadosBrutos } : null;
  }

  async function salvarTarefa(id, dados) {
    const q = id ? sb.from('tarefas').update(dados).eq('id', id) : sb.from('tarefas').insert(dados);
    const { data, error } = await q.select().single();
    if (error) throw error;
    const i = tarefas.findIndex(t => t.id === data.id);
    if (i >= 0) tarefas[i] = data; else tarefas.push(data);
    return data;
  }

  async function salvarPrefs(novas) {
    const { error } = await sb.from('preferencias').upsert({ user_id: uid, dados: novas, updated_at: new Date().toISOString() });
    if (error) throw error;
    dadosBrutos = novas;
    prefs = novas.dias ? { ...PREFS_PADRAO, ...novas } : null;
  }

  // ===== O "ritmo": aprende com o que você realmente conclui =====
  function ritmo() {
    const p = prefs || PREFS_PADRAO;
    const limite = somaDias(hoje(), -42);
    const feitas = tarefas.filter(t => t.concluida && t.concluida_em && paraISO(new Date(t.concluida_em)) >= limite);
    const porDia = {};
    feitas.forEach(t => {
      const d = paraISO(new Date(t.concluida_em));
      porDia[d] = porDia[d] || { min: 0, qtd: 0 };
      porDia[d].min += t.duracao_real_min ?? t.duracao_min; porDia[d].qtd++;
    });
    const dias = Object.keys(porDia);
    const base = Math.round(p.horas * 60);
    let capacidade = base, aprendido = false;
    if (dias.length >= DIAS_MIN_APRENDER) {
      const ord = dias.map(d => porDia[d].min).sort((a, b) => a - b);
      const p70 = ord[Math.floor(0.7 * (ord.length - 1))];
      capacidade = Math.min(720, Math.max(30, arred15(p70)));
      aprendido = true;
    }
    const tarefasDia = dias.length ? feitas.length / dias.length : 0;

    // Quanto você realmente leva em cada tipo de tarefa, comparado ao que estimou
    const fatores = {}, tempoReal = {};
    Object.keys(CATEGORIAS).forEach(c => {
      const amostra = feitas.filter(t => t.categoria === c && t.duracao_real_min && t.duracao_min);
      if (amostra.length >= 3) {
        fatores[c] = amostra.reduce((s, t) => s + t.duracao_real_min / t.duracao_min, 0) / amostra.length;
        const reais = amostra.map(t => t.duracao_real_min).sort((a, b) => a - b);
        tempoReal[c] = arred15(reais[Math.floor(reais.length / 2)]);
      }
    });

    // Quantas das tarefas marcadas para dias que já passaram você concluiu
    const passadas = tarefas.filter(t => t.data && t.data < hoje() && t.data >= limite);
    const taxa = passadas.length ? passadas.filter(t => t.concluida).length / passadas.length : null;

    // Dia da semana em que você mais produz
    const porSemana = {};
    dias.forEach(d => { const s = diaSemana(d); porSemana[s] = porSemana[s] || []; porSemana[s].push(porDia[d].min); });
    let melhorDia = null, melhorMedia = 0;
    Object.entries(porSemana).forEach(([s, l]) => { const m = l.reduce((a, b) => a + b, 0) / l.length; if (l.length >= 2 && m > melhorMedia) { melhorMedia = m; melhorDia = Number(s); } });

    return { capacidade, aprendido, diasAprendidos: dias.length, tarefasDia, fatores, tempoReal, taxa, melhorDia, porDia };
  }

  // Duração "de verdade": a estimativa corrigida pelo seu histórico naquela categoria
  function duracaoReal(t, r) { return Math.round(t.duracao_min * ((r || ritmo()).fatores[t.categoria] || 1) / 5) * 5; }
  function cargaDia(iso, r, ignorarId) { return tarefas.filter(t => t.data === iso && t.id !== ignorarId).reduce((s, t) => s + (t.concluida && t.duracao_real_min ? t.duracao_real_min : duracaoReal(t, r)), 0); }
  const ehDiaDeTrabalho = (iso) => (prefs || PREFS_PADRAO).dias.includes(diaSemana(iso));

  // Procura horários livres que não estourem o seu ritmo do dia
  function sugerirHorarios(duracao, opcoes) {
    const o = Object.assign({ aPartirDe: hoje(), ate: null, qtd: 3, ignorarId: null, extras: [] }, opcoes);
    const p = prefs || PREFS_PADRAO, r = ritmo(), saida = [];
    const ini = minutos(p.inicio), fim = minutos(p.fim);
    for (let i = 0; i < 45 && saida.length < o.qtd; i++) {
      const iso = somaDias(o.aPartirDe, i);
      if (o.ate && iso > o.ate) break;
      if (iso < hoje() || !ehDiaDeTrabalho(iso)) continue;
      const extrasDia = o.extras.filter(x => x.data === iso);
      const carga = cargaDia(iso, r, o.ignorarId) + extrasDia.reduce((s, x) => s + x.duracao_min, 0);
      if (carga + duracao > r.capacidade) continue;
      const ocupados = tarefas.filter(t => t.data === iso && t.hora && t.id !== o.ignorarId && !t.concluida)
        .map(t => [minutos(t.hora), minutos(t.hora) + duracaoReal(t, r)])
        .concat(extrasDia.filter(x => x.hora).map(x => [minutos(x.hora), minutos(x.hora) + x.duracao_min]));
      let comeco = ini;
      if (iso === hoje()) { const agora = new Date(); comeco = Math.max(ini, Math.ceil((agora.getHours() * 60 + agora.getMinutes() + 15) / 30) * 30); }
      for (let t = comeco; t + duracao <= fim; t += 30) {
        if (!ocupados.some(([a, b]) => t < b && t + duracao > a)) { saida.push({ data: iso, hora: hhmm(t), sobra: r.capacidade - carga - duracao }); break; }
      }
    }
    return saida;
  }

  // ===== Lembretes (enquanto o painel estiver aberto) =====
  function avisados() { try { return JSON.parse(localStorage.getItem('oug_avisados') || '[]'); } catch (e) { return []; } }
  function marcarAvisado(chave) { try { const l = avisados().slice(-200); l.push(chave); localStorage.setItem('oug_avisados', JSON.stringify(l)); } catch (e) {} }

  function conferirLembretes() {
    const agora = Date.now(), ja = avisados();
    tarefas.forEach(t => {
      if (t.concluida || !t.data || !t.hora) return;
      const inicio = new Date(deISO(t.data).getTime() + minutos(t.hora) * 60000).getTime();
      const chave = `${t.id}|${t.data}|${hora5(t.hora)}`;
      if (agora >= inicio - t.lembrete_min * 60000 && agora < inicio + 15 * 60000 && !ja.includes(chave)) {
        marcarAvisado(chave);
        const faltam = Math.round((inicio - agora) / 60000);
        const msg = faltam > 0 ? `Daqui a ${durTxt(faltam)}: ${t.titulo}` : `Está na hora: ${t.titulo}`;
        toast('⏰ ' + msg);
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Organized UGC', { body: msg, tag: chave }); } catch (e) {}
      }
    });
    atualizarSelo();
    if (visao === 'hoje' && raiz.classList.contains('ativo')) $$('.cronometro').forEach(c => { c.textContent = durTxt((Date.now() - new Date(c.dataset.desde)) / 60000); });
  }

  // ===== Agenda do celular: .ics com alarme e link do Google Agenda =====
  function dataHoraICS(iso, h) { return iso.replace(/-/g, '') + 'T' + hora5(h).replace(':', '') + '00'; }
  function baixarICS(lista) {
    const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Organized UGC//PT', 'CALSCALE:GREGORIAN'];
    lista.forEach(t => {
      const fimMin = minutos(t.hora) + t.duracao_min;
      const fimData = fimMin >= 1440 ? somaDias(t.data, 1) : t.data;
      linhas.push('BEGIN:VEVENT', `UID:${t.id}@organizedugc`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
        `DTSTART:${dataHoraICS(t.data, t.hora)}`, `DTEND:${dataHoraICS(fimData, hhmm(fimMin % 1440))}`,
        `SUMMARY:${(cat(t).emoji + ' ' + t.titulo).replace(/[,;\\]/g, ' ')}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${t.titulo.replace(/[,;\\]/g, ' ')}`, `TRIGGER:-PT${t.lembrete_min || 0}M`, 'END:VALARM', 'END:VEVENT');
    });
    linhas.push('END:VCALENDAR');
    const blob = new Blob([linhas.join('\r\n')], { type: 'text/calendar' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'organized-ugc.ics'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function linkGoogle(t) {
    const fimMin = minutos(t.hora) + t.duracao_min;
    const fim = (fimMin >= 1440 ? somaDias(t.data, 1) : t.data);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(cat(t).emoji + ' ' + t.titulo)}&dates=${dataHoraICS(t.data, t.hora)}/${dataHoraICS(fim, hhmm(fimMin % 1440))}&ctz=${encodeURIComponent(tz)}&details=${encodeURIComponent(t.notas || 'Organized UGC')}`;
  }

  // ===== Desenho =====
  function atualizarSelo() {
    const n = tarefas.filter(t => !t.concluida && t.data && t.data <= hoje()).length;
    const selo = document.querySelector('[data-tab="aba-tarefas"] .selo-aba');
    if (selo) { selo.textContent = n; selo.hidden = !n; }
  }

  function barraCarga(carga, cap) {
    const pct = cap ? carga / cap : 0;
    const cor = pct > 1 ? 'cheio' : pct > .85 ? 'quase' : 'ok';
    return `<div class="carga ${cor}"><div style="width:${Math.min(100, pct * 100)}%"></div></div>`;
  }

  function desenhar() {
    if (!prefs) { raiz.querySelector('#t-conteudo').innerHTML = ''; return abrirBoasVindas(); }
    atualizarSelo();
    raiz.querySelector('.saudacao').textContent = `${saudacaoHora()}, ${nomeDela()}! Seu dia, no seu ritmo.`;
    const r = ritmo(), h = hoje(), carga = cargaDia(h, r), cap = r.capacidade;
    const feitoHoje = tarefas.filter(t => t.data === h && t.concluida).length, totalHoje = tarefas.filter(t => t.data === h).length;
    const atrasadas = tarefas.filter(t => !t.concluida && t.data && t.data < h).sort((a, b) => a.data.localeCompare(b.data));
    let frase;
    if (!ehDiaDeTrabalho(h) && !totalHoje) frase = 'Hoje é dia de folga na sua rotina. Descansar também é produtividade, Deusa ✦';
    else if (carga > cap) frase = `Hoje está acima do seu ritmo (${durTxt(carga)} de ${durTxt(cap)}). Que tal passar algo para outro dia?`;
    else if (carga > cap * .85) frase = `Dia bem cheio, mas cabe: ${durTxt(carga)} de ${durTxt(cap)}.`;
    else frase = `Cabe mais uns ${durTxt(cap - carga)} hoje sem se sobrecarregar.`;

    raiz.querySelector('#t-ritmo').innerHTML = `
      <div class="ritmo-topo">
        <div>
          <div class="ritmo-rotulo">Seu dia</div>
          <div class="ritmo-num">${feitoHoje}<small>/${totalHoje} feitas</small></div>
        </div>
        <div class="ritmo-barra">
          <div class="ritmo-legenda"><span>${durTxt(carga)} planejadas</span><span>seu ritmo: ${durTxt(cap)}</span></div>
          ${barraCarga(carga, cap)}
          <p>${esc(frase)}</p>
        </div>
      </div>
      ${!r.aprendido ? `<div class="aprendendo">✦ Aprendendo seu ritmo: ${r.diasAprendidos} de ${DIAS_MIN_APRENDER} dias. Conclua suas tarefas por aqui e eu vou descobrindo quanto você realmente consegue fazer.</div>` : ''}
      ${atrasadas.length ? `<div class="atrasadas"><div><strong>Ficou para trás (${atrasadas.length})</strong><small>${atrasadas.slice(0, 3).map(t => esc(t.titulo)).join(', ')}${atrasadas.length > 3 ? '...' : ''}</small></div><button class="mini-btn" data-reagendar-atrasadas>Reagendar sem pesar</button></div>` : ''}
      ${'Notification' in window && Notification.permission === 'default' ? '<div class="ativar-lembrete"><span>🔔 Quer que eu te avise na hora das tarefas?</span><button class="mini-btn" data-notificar>Ativar lembretes</button></div>' : ''}`;

    $$('.vis-btn', raiz).forEach(b => b.classList.toggle('ativo', b.dataset.tvis === visao));
    if (visao === 'hoje') desenharHoje(r); else if (visao === 'semana') desenharSemana(r); else desenharRitmo(r);
  }

  function itemTarefa(t, r, mostrarDia) {
    const c = cat(t), m = t.marca_id && window.Marcas ? Marcas.lista().find(x => x.id === t.marca_id) : null;
    const fator = r.fatores[t.categoria];
    return `<div class="tarefa ${t.concluida ? 'feita' : ''} ${t.iniciada_em && !t.concluida ? 'rolando' : ''}" data-tid="${t.id}">
      <div class="t-hora">${t.hora ? hora5(t.hora) : '--:--'}${mostrarDia && t.data ? `<small>${nomeDia(t.data)}</small>` : ''}</div>
      <button class="t-check" data-concluir="${t.id}" aria-label="${t.concluida ? 'Desmarcar' : 'Concluir'} ${esc(t.titulo)}">${t.concluida ? '✓' : ''}</button>
      <div class="t-corpo" data-editar="${t.id}">
        <div class="t-titulo">${esc(t.titulo)}</div>
        <div class="t-meta"><span class="chip">${c.emoji} ${c.nome}</span>${m ? `<span class="chip marca">💼 ${esc(m.nome)}</span>` : ''}
          <span>${durTxt(t.duracao_min)}${fator && Math.abs(fator - 1) > .15 && !t.concluida ? ` <em title="Pelo seu histórico">(costuma levar ${durTxt(duracaoReal(t, r))})</em>` : ''}</span>
          ${t.concluida && t.duracao_real_min ? `<span>levou ${durTxt(t.duracao_real_min)}</span>` : ''}</div>
      </div>
      ${!t.concluida && t.data === hoje() ? (t.iniciada_em
        ? `<span class="cronometro" data-desde="${t.iniciada_em}">${durTxt((Date.now() - new Date(t.iniciada_em)) / 60000)}</span>`
        : `<button class="mini-btn comecar" data-comecar="${t.id}">▶ Começar</button>`) : ''}
    </div>`;
  }

  function desenharHoje(r) {
    const h = hoje();
    const doDia = tarefas.filter(t => t.data === h).sort((a, b) => (hora5(a.hora) || '99').localeCompare(hora5(b.hora) || '99'));
    const semDia = tarefas.filter(t => !t.data && !t.concluida);
    const amanha = somaDias(h, 1), deAmanha = tarefas.filter(t => t.data === amanha);
    $('#t-conteudo').innerHTML = `
      <div class="cartao">
        <h2>${maiuscula(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))}</h2>
        <p class="desc">Toque no círculo para concluir. Use "Começar" para eu cronometrar e aprender quanto tempo você leva.</p>
        <div class="lista-tarefas">${doDia.map(t => itemTarefa(t, r)).join('') || `<p class="vazio">Nada reservado para hoje. Que tal reservar um horário para algo importante?</p>`}</div>
        <button class="add-coluna" data-nova-tarefa="${h}">+ Reservar horário hoje</button>
      </div>
      ${semDia.length ? `<div class="cartao"><h2>Sem horário ainda</h2><p class="desc">Ideias e pendências esperando um horário reservado.</p>
        <div class="lista-tarefas">${semDia.map(t => `<div class="tarefa" data-tid="${t.id}"><div class="t-hora">?</div><span></span>
          <div class="t-corpo" data-editar="${t.id}"><div class="t-titulo">${esc(t.titulo)}</div><div class="t-meta"><span class="chip">${cat(t).emoji} ${cat(t).nome}</span><span>${durTxt(t.duracao_min)}</span></div></div>
          <button class="mini-btn" data-editar="${t.id}">Reservar</button></div>`).join('')}</div></div>` : ''}
      ${deAmanha.length ? `<div class="cartao"><h2>Amanhã</h2><div class="lista-tarefas">${deAmanha.sort((a, b) => (hora5(a.hora) || '99').localeCompare(hora5(b.hora) || '99')).map(t => itemTarefa(t, r)).join('')}</div></div>` : ''}`;
  }

  function desenharSemana(r) {
    const h = hoje(), dias = Array.from({ length: 7 }, (_, i) => somaDias(h, i));
    const cheio = dias.some(d => cargaDia(d, r) > r.capacidade);
    $('#t-conteudo').innerHTML = `
      <div class="semana-acoes">
        <p class="desc">Cada barrinha mostra o quanto o dia já está cheio, comparado ao seu ritmo.</p>
        <div>${cheio ? '<button class="btn-secundario" data-equilibrar>⚖ Equilibrar semana</button>' : ''}
        <button class="btn-secundario" data-ics-semana>📅 Mandar para a agenda do celular</button></div>
      </div>
      <div class="semana">${dias.map(d => {
        const lista = tarefas.filter(t => t.data === d).sort((a, b) => (hora5(a.hora) || '99').localeCompare(hora5(b.hora) || '99'));
        const carga = cargaDia(d, r), folga = !ehDiaDeTrabalho(d);
        return `<section class="dia-sem ${d === h ? 'hoje' : ''} ${folga ? 'folga' : ''}">
          <header><strong>${nomeDia(d)}</strong><small>${folga ? 'folga' : `${durTxt(carga)} de ${durTxt(r.capacidade)}`}</small></header>
          ${folga ? '' : barraCarga(carga, r.capacidade)}
          <div class="dia-lista">${lista.map(t => `<button class="t-chip ${t.concluida ? 'feita' : ''}" data-editar="${t.id}"><b>${hora5(t.hora) || '--'}</b> ${cat(t).emoji} ${esc(t.titulo)}</button>`).join('') || `<p class="coluna-vazia">${folga ? 'Descanso ✦' : 'Livre'}</p>`}</div>
          <button class="add-dia" data-nova-tarefa="${d}" aria-label="Nova tarefa em ${nomeDia(d)}">+</button>
        </section>`;
      }).join('')}</div>`;
  }

  function desenharRitmo(r) {
    const p = prefs, h = hoje();
    const dias14 = Array.from({ length: 14 }, (_, i) => somaDias(h, i - 13));
    const max = Math.max(r.capacidade, ...dias14.map(d => (r.porDia[d] || {}).min || 0)) || 1;
    const nomesSem = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    const cats = Object.keys(r.fatores);
    $('#t-conteudo').innerHTML = `
      <div class="numeros">
        <div class="cartao numero destaque"><div class="rotulo">Seu ritmo por dia</div><div class="valor">${durTxt(r.capacidade)}</div><div class="extra">${r.aprendido ? 'Aprendido com o que você concluiu' : `Usando o que você me disse (${p.horas}h)`}</div></div>
        <div class="cartao numero"><div class="rotulo">Tarefas por dia</div><div class="valor">${r.tarefasDia ? r.tarefasDia.toFixed(1).replace('.', ',') : '-'}</div><div class="extra">nos dias em que você trabalhou</div></div>
        <div class="cartao numero"><div class="rotulo">Você conclui</div><div class="valor">${r.taxa == null ? '-' : Math.round(r.taxa * 100) + '%'}</div><div class="extra">do que planeja</div></div>
        <div class="cartao numero"><div class="rotulo">Seu dia mais produtivo</div><div class="valor menor">${r.melhorDia == null ? '-' : nomesSem[r.melhorDia]}</div><div class="extra">${r.melhorDia == null ? 'Preciso de mais dias' : 'Reserve o mais pesado para ele'}</div></div>
      </div>
      <div class="cartao">
        <h2>Últimos 14 dias</h2><p class="desc">Tempo concluído por dia. A linha tracejada é o seu ritmo.</p>
        <div class="grafico ritmo-graf" style="--linha:${(r.capacidade / max) * 100}%">${dias14.map(d => {
          const v = (r.porDia[d] || {}).min || 0;
          return `<div class="barra-col" tabindex="0"><span class="dica">${fmtDia(d)}: ${durTxt(v)}</span><div class="barra ${v ? '' : 'zero'}" style="height:${v ? Math.max(3, v / max * 100) : 2}%"></div></div>`;
        }).join('')}</div>
        <div class="eixo">${dias14.map(d => `<span>${deISO(d).getDate()}</span>`).join('')}</div>
      </div>
      <div class="cartao">
        <h2>Quanto você realmente leva</h2>
        <p class="desc">Quando você usa o "Começar", eu comparo o tempo real com o que você estimou. Com isso, ajusto o tamanho do seu dia.</p>
        ${cats.length ? `<div class="lista-barras">${cats.map(c => { const f = r.fatores[c];
          return `<div class="item-barra"><div class="cabeca"><span>${CATEGORIAS[c].emoji} ${CATEGORIAS[c].nome}</span><strong>${f > 1.05 ? `${Math.round((f - 1) * 100)}% a mais` : f < .95 ? `${Math.round((1 - f) * 100)}% a menos` : 'certinho'}</strong></div>
            <small class="desc">Costuma levar ${durTxt(r.tempoReal[c])}</small></div>`; }).join('')}</div>`
          : '<p class="vazio">Use o botão "Começar" em pelo menos 3 tarefas do mesmo tipo e eu te mostro aqui.</p>'}
      </div>
      <div class="cartao rotina">
        <div><h2>Sua rotina</h2><p class="desc">${p.dias.map(d => nomesSem[d].slice(0, 3)).join(', ')} · das ${p.inicio} às ${p.fim} · ${p.horas}h por dia · lembrete ${p.lembrete} min antes</p></div>
        <button class="btn-secundario" data-ajustar-rotina>Ajustar rotina</button>
      </div>`;
  }

  // ===== Boas-vindas: pergunta a rotina na primeira vez =====
  function abrirBoasVindas(editar) {
    const p = prefs || PREFS_PADRAO;
    const dlg = document.getElementById('ficha-marca');
    const nomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    dlg.innerHTML = `<form class="ficha" novalidate>
      <header class="ficha-cab"><div><small>${editar ? 'Sua rotina' : 'Bem-vinda, Deusa ✦'}</small><h2>${editar ? 'Ajustar rotina' : 'Vamos montar sua rotina'}</h2></div>${editar ? '<button type="button" class="fechar" data-fechar aria-label="Fechar">×</button>' : ''}</header>
      <div class="ficha-corpo">
        <p class="desc" style="margin-top:12px">Com isso eu sugiro horários, te lembro das tarefas e não deixo nenhum dia pesado demais. Depois eu vou aprendendo o seu ritmo de verdade.</p>
        <fieldset><legend>Como você quer ser chamada?</legend>
          <label class="campo largo"><input name="nome" maxlength="40" value="${esc(p.nome || '')}" placeholder="Seu nome (se deixar em branco, te chamo de Deusa)"></label>
        </fieldset>
        <fieldset><legend>Em quais dias você trabalha com UGC?</legend>
          <div class="dias-escolha">${nomes.map((n, i) => `<label><input type="checkbox" name="dia" value="${i}" ${p.dias.includes(i) ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
        </fieldset>
        <fieldset><legend>Em qual horário?</legend>
          <div class="grade-campos">
            <label class="campo"><span>Começo às</span><input type="time" name="inicio" value="${p.inicio}"></label>
            <label class="campo"><span>Termino às</span><input type="time" name="fim" value="${p.fim}"></label>
          </div>
        </fieldset>
        <fieldset><legend>Quantas horas por dia, de verdade, você consegue dedicar?</legend>
          <div class="horas-escolha"><input type="range" name="horas" min="1" max="10" step="0.5" value="${p.horas}"><output>${String(p.horas).replace('.', ',')}h</output></div>
          <small class="desc">Seja gentil com você: conte só o tempo de trabalho focado.</small>
        </fieldset>
        <fieldset><legend>Quanto tempo antes quer ser lembrada?</legend>
          <label class="campo"><select name="lembrete">${[[10, '10 minutos'], [15, '15 minutos'], [30, '30 minutos'], [60, '1 hora'], [120, '2 horas']].map(([v, n]) => `<option value="${v}" ${p.lembrete == v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </fieldset>
        <div class="faixa-erro" id="bv-erro" hidden></div>
      </div>
      <footer class="ficha-rodape"><span></span><div>${editar ? '<button type="button" class="btn-secundario" data-fechar>Cancelar</button>' : ''}<button type="submit" class="btn-primario">${editar ? 'Salvar' : 'Começar ✦'}</button></div></footer>
    </form>`;
    const f = dlg.querySelector('form');
    f.horas.addEventListener('input', () => { f.querySelector('output').textContent = String(f.horas.value).replace('.', ',') + 'h'; });
    dlg.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.oncancel = (e) => { if (!editar) e.preventDefault(); };
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dias = [...f.querySelectorAll('input[name="dia"]:checked')].map(i => Number(i.value));
      const erro = (m) => { const el = dlg.querySelector('#bv-erro'); el.textContent = m; el.hidden = false; };
      if (!dias.length) return erro('Escolha pelo menos um dia.');
      if (!f.inicio.value || !f.fim.value || minutos(f.fim.value) <= minutos(f.inicio.value)) return erro('O horário de término precisa ser depois do começo.');
      const novas = { ...dadosBrutos, nome: f.nome.value.trim(), dias, inicio: f.inicio.value, fim: f.fim.value, horas: Number(f.horas.value), lembrete: Number(f.lembrete.value) };
      try { await salvarPrefs(novas); dlg.close(); desenhar(); toast(editar ? 'Rotina atualizada.' : `Prontinho, ${nomeDela()}! Agora é só reservar seus horários ✦`);
        document.dispatchEvent(new CustomEvent('oug:nome', { detail: nomeDela() })); }
      catch (err) { console.error(err); erro('Não consegui salvar agora. Tente de novo.'); }
    });
    dlg.showModal();
  }

  // ===== Ficha da tarefa: "qual horário você quer reservar?" =====
  function abrirTarefa(t, diaSugerido, preenchido) {
    const nova = !t, p = prefs || PREFS_PADRAO, r = ritmo();
    t = t || { categoria: 'gravar', duracao_min: r.tempoReal.gravar || CATEGORIAS.gravar.min, lembrete_min: p.lembrete, data: diaSugerido || null, ...(preenchido || {}) };
    if (nova && preenchido && preenchido.categoria && !preenchido.duracao_min) t.duracao_min = r.tempoReal[preenchido.categoria] || (CATEGORIAS[preenchido.categoria] || CATEGORIAS.outro).min;
    const marcasAtivas = window.Marcas ? Marcas.lista().filter(m => !['concluida', 'perdida'].includes(m.etapa) || m.id === t.marca_id) : [];
    const dlg = document.getElementById('ficha-marca');
    dlg.innerHTML = `<form class="ficha" novalidate>
      <header class="ficha-cab"><div><small>${nova ? 'Nova tarefa' : (t.concluida ? 'Concluída ✓' : 'Tarefa')}</small><h2>${nova ? 'O que você precisa fazer?' : esc(t.titulo)}</h2></div><button type="button" class="fechar" data-fechar aria-label="Fechar">×</button></header>
      <div class="ficha-corpo">
        <div class="faixa-erro" id="tf-erro" hidden></div>
        <fieldset><legend>Tarefa</legend>
          <label class="campo largo"><span>Descrição *</span><input name="titulo" maxlength="160" value="${esc(t.titulo || '')}" placeholder="Ex.: Gravar vídeo para o Instagram pessoal"></label>
          <div class="cat-escolha">${Object.entries(CATEGORIAS).map(([k, c]) => `<label><input type="radio" name="categoria" value="${k}" ${t.categoria === k ? 'checked' : ''}><span>${c.emoji} ${c.nome}</span></label>`).join('')}</div>
          ${marcasAtivas.length ? `<label class="campo largo"><span>É para alguma marca?</span><select name="marca_id"><option value="">Não</option>${marcasAtivas.map(m => `<option value="${m.id}" ${t.marca_id === m.id ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></label>` : ''}
          <label class="campo"><span>Quanto tempo vai levar?</span>
            <div class="dur-escolha">${[15, 30, 45, 60, 90, 120, 180].map(v => `<button type="button" data-dur="${v}">${durTxt(v)}</button>`).join('')}<input type="number" name="duracao_min" min="5" max="720" step="5" value="${t.duracao_min}" aria-label="Minutos"><span>min</span></div>
          </label>
          <small class="desc" id="dica-dur"></small>
        </fieldset>
        <fieldset id="sec-horario"><legend>Qual dia e horário você quer reservar?</legend>
          <div class="grade-campos">
            <label class="campo"><span>Dia</span><input type="date" name="data" value="${t.data || ''}"></label>
            <label class="campo"><span>Horário</span><input type="time" name="hora" value="${hora5(t.hora)}"></label>
          </div>
          <div class="sugestoes" id="sugestoes"></div>
          <div class="previa-prazo" id="previa-dia"></div>
          <label class="campo"><span>Me lembrar</span><select name="lembrete_min">${[[0, 'Na hora'], [10, '10 min antes'], [15, '15 min antes'], [30, '30 min antes'], [60, '1 hora antes'], [120, '2 horas antes'], [1440, '1 dia antes']].map(([v, n]) => `<option value="${v}" ${t.lembrete_min == v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </fieldset>
        <fieldset><legend>Anotações</legend><label class="campo largo"><textarea name="notas" rows="2" placeholder="Roteiro, look, cenário, referências...">${esc(t.notas || '')}</textarea></label></fieldset>
        ${!nova && t.data && t.hora ? `<fieldset><legend>Levar para a agenda</legend><div class="atalhos">
          <a class="mini-btn agenda" target="_blank" rel="noopener" href="${linkGoogle(t)}">Google Agenda</a>
          <button type="button" class="mini-btn" data-ics-uma>Agenda do iPhone (.ics)</button></div></fieldset>` : ''}
      </div>
      <footer class="ficha-rodape">
        ${!nova ? '<button type="button" class="btn-perigo" data-excluir>Excluir</button>' : '<span></span>'}
        <div><button type="button" class="btn-secundario" data-fechar>Cancelar</button><button type="submit" class="btn-primario" id="tf-salvar">${nova ? 'Reservar ✦' : 'Salvar'}</button></div>
      </footer>
    </form>`;
    const f = dlg.querySelector('form');
    let durMexida = !nova;

    function atualizar() {
      const dur = Number(f.duracao_min.value) || 60, c = f.categoria.value;
      $$('[data-dur]', dlg).forEach(b => b.classList.toggle('ativo', Number(b.dataset.dur) === dur));
      const fator = r.fatores[c];
      dlg.querySelector('#dica-dur').textContent = fator && Math.abs(fator - 1) > .15 ? `Pelo seu histórico, ${CATEGORIAS[c].nome.toLowerCase()} costuma levar ${durTxt(r.tempoReal[c])}.` : '';
      const durR = Math.round(dur * (fator || 1));
      // Sugestões de horário que cabem no seu ritmo
      const sug = sugerirHorarios(durR, { aPartirDe: f.data.value && f.data.value >= hoje() ? f.data.value : hoje(), ignorarId: t.id, qtd: 4 });
      dlg.querySelector('#sugestoes').innerHTML = sug.length
        ? `<span>Horários que cabem sem pesar:</span>${sug.map(s => `<button type="button" class="sug" data-sd="${s.data}" data-sh="${s.hora}">${nomeDia(s.data)}, ${s.hora}</button>`).join('')}`
        : '<span>Não achei horário livre nas próximas semanas dentro do seu ritmo. Escolha manualmente ou ajuste sua rotina.</span>';
      // Como fica o dia escolhido
      const prev = dlg.querySelector('#previa-dia');
      if (!f.data.value) { prev.className = 'previa-prazo'; prev.textContent = 'Sem dia definido: a tarefa fica em "Sem horário ainda" até você reservar.'; return; }
      const carga = cargaDia(f.data.value, r, t.id) + durR, cap = r.capacidade;
      const conflito = f.hora.value && tarefas.find(x => x.id !== t.id && x.data === f.data.value && x.hora && !x.concluida && minutos(f.hora.value) < minutos(x.hora) + duracaoReal(x, r) && minutos(f.hora.value) + durR > minutos(x.hora));
      const folga = !ehDiaDeTrabalho(f.data.value);
      if (conflito) { prev.className = 'previa-prazo atraso'; prev.innerHTML = `Esse horário bate com <strong>${esc(conflito.titulo)}</strong> (${hora5(conflito.hora)}).`; }
      else if (carga > cap) { prev.className = 'previa-prazo atraso'; prev.innerHTML = `Com essa, ${nomeDia(f.data.value).toLowerCase()} fica com <strong>${durTxt(carga)}</strong>, acima do seu ritmo de ${durTxt(cap)}. Veja as sugestões acima.`; }
      else if (folga) { prev.className = 'previa-prazo alerta'; prev.textContent = 'Esse é um dia de folga na sua rotina. Tudo bem se for exceção!'; }
      else { prev.className = 'previa-prazo ok'; prev.innerHTML = `Cabe certinho: o dia fica com ${durTxt(carga)} de ${durTxt(cap)} ✦`; }
    }
    $$('[data-dur]', dlg).forEach(b => b.addEventListener('click', () => { f.duracao_min.value = b.dataset.dur; durMexida = true; atualizar(); }));
    f.duracao_min.addEventListener('input', () => { durMexida = true; atualizar(); });
    $$('input[name="categoria"]', dlg).forEach(i => i.addEventListener('change', () => {
      if (!durMexida) f.duracao_min.value = r.tempoReal[i.value] || CATEGORIAS[i.value].min;
      atualizar();
    }));
    ['data', 'hora'].forEach(n => f[n].addEventListener('input', atualizar));
    dlg.querySelector('#sugestoes').addEventListener('click', (e) => { const b = e.target.closest('.sug'); if (!b) return; f.data.value = b.dataset.sd; f.hora.value = b.dataset.sh; atualizar(); });
    atualizar();

    dlg.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.oncancel = null;
    const ics = dlg.querySelector('[data-ics-uma]'); if (ics) ics.addEventListener('click', () => baixarICS([t]));
    const exc = dlg.querySelector('[data-excluir]');
    if (exc) exc.addEventListener('click', async () => {
      if (!confirm('Excluir esta tarefa?')) return;
      const { error } = await sb.from('tarefas').delete().eq('id', t.id);
      if (error) return toast('Não consegui excluir agora.', true);
      tarefas = tarefas.filter(x => x.id !== t.id); dlg.close(); desenhar(); toast('Tarefa excluída.');
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titulo = f.titulo.value.trim();
      const erro = (m) => { const el = dlg.querySelector('#tf-erro'); el.textContent = m; el.hidden = false; el.scrollIntoView({ block: 'center' }); };
      if (!titulo) { f.titulo.focus(); return erro('Escreva o que você precisa fazer.'); }
      const dur = parseInt(f.duracao_min.value, 10);
      if (!(dur >= 5 && dur <= 720)) return erro('A duração precisa ficar entre 5 minutos e 12 horas.');
      if (f.hora.value && !f.data.value) return erro('Escolha também o dia.');
      const dados = { titulo, categoria: f.categoria.value || 'outro', marca_id: f.marca_id ? (f.marca_id.value || null) : (t.marca_id || null),
        duracao_min: dur, data: f.data.value || null, hora: f.hora.value || null, lembrete_min: Number(f.lembrete_min.value), notas: f.notas.value.trim() || null };
      const btn = dlg.querySelector('#tf-salvar'); btn.disabled = true;
      try {
        await salvarTarefa(nova ? null : t.id, dados);
        dlg.close(); desenhar();
        toast(dados.data && dados.hora ? `Reservado: ${nomeDia(dados.data)}, ${dados.hora} ✦` : 'Tarefa guardada.');
      } catch (err) { console.error(err); erro('Não consegui salvar agora. Tente de novo.'); btn.disabled = false; }
    });
    dlg.showModal();
    if (nova) setTimeout(() => f.titulo.focus(), 50);
  }

  // ===== Plano de produção: divide o trabalho de uma marca até a data de entrega =====
  function abrirPlano() {
    const opcoes = window.Marcas ? Marcas.lista().filter(m => ['aguardando', 'producao'].includes(m.etapa) && m.data_entrega && !m.data_entregue) : [];
    const dlg = document.getElementById('ficha-marca');
    const PASSOS = [['roteiro', 'Roteiro', 45], ['gravar', 'Gravar', 90], ['editar', 'Editar', 90], ['marca', 'Enviar para a marca', 15]];
    dlg.innerHTML = `<form class="ficha" novalidate>
      <header class="ficha-cab"><div><small>Plano de produção</small><h2>Dividir o trabalho até a entrega</h2></div><button type="button" class="fechar" data-fechar aria-label="Fechar">×</button></header>
      <div class="ficha-corpo">
        ${!opcoes.length ? '<p class="vazio">Nenhuma marca em produção com data de entrega. Coloque o prazo da marca na área Marcas e volte aqui.</p>' : `
        <fieldset><legend>Para qual marca?</legend><label class="campo largo"><select name="marca">${opcoes.map(m => `<option value="${m.id}">${esc(m.nome)} · entregar até ${fmtDia(m.data_entrega)}</option>`).join('')}</select></label></fieldset>
        <fieldset><legend>Etapas</legend>
          <div class="passos">${PASSOS.map(([c, n, d], i) => `<label class="passo"><input type="checkbox" name="p${i}" checked><span>${CATEGORIAS[c].emoji} ${n}</span><input type="number" name="d${i}" value="${ritmo().tempoReal[c] || d}" min="5" max="720" step="5"><small>min</small></label>`).join('')}</div>
        </fieldset>
        <div class="previa-prazo" id="plano-previa"></div>`}
      </div>
      <footer class="ficha-rodape"><span></span><div><button type="button" class="btn-secundario" data-fechar>Cancelar</button>${opcoes.length ? '<button type="submit" class="btn-primario" id="plano-ok">Reservar tudo ✦</button>' : ''}</div></footer>
    </form>`;
    dlg.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.oncancel = null;
    const f = dlg.querySelector('form');
    let plano = [];
    function montar() {
      if (!opcoes.length) return;
      const m = opcoes.find(x => x.id === f.marca.value), r = ritmo();
      plano = []; let aPartir = hoje(), avisos = 0;
      PASSOS.forEach(([c, n], i) => {
        if (!f['p' + i].checked) return;
        const dur = Number(f['d' + i].value) || 30, durR = Math.round(dur * (r.fatores[c] || 1));
        let s = sugerirHorarios(durR, { aPartirDe: aPartir, ate: m.data_entrega, qtd: 1, extras: plano })[0];
        if (!s) { // não coube sem pesar: coloca no último dia possível e avisa
          avisos++;
          const dia = plano.length ? plano[plano.length - 1].data : (m.data_entrega > hoje() ? somaDias(m.data_entrega, -1) : hoje());
          s = { data: dia < hoje() ? hoje() : dia, hora: null };
        }
        plano.push({ titulo: `${n}: ${m.nome}`, categoria: c, marca_id: m.id, duracao_min: dur, data: s.data, hora: s.hora, lembrete_min: (prefs || PREFS_PADRAO).lembrete });
        aPartir = somaDias(s.data, 1) <= m.data_entrega ? somaDias(s.data, 1) : s.data;
      });
      const prev = dlg.querySelector('#plano-previa');
      prev.className = 'previa-prazo ' + (avisos ? 'alerta' : 'ok');
      prev.innerHTML = plano.length ? `<ol class="plano-lista">${plano.map(x => `<li><b>${nomeDia(x.data)}${x.hora ? ', ' + x.hora : ''}</b> · ${esc(x.titulo)} (${durTxt(x.duracao_min)})</li>`).join('')}</ol>${avisos ? `<p>⚠ ${avisos === 1 ? 'Uma etapa não coube' : avisos + ' etapas não couberam'} no seu ritmo antes da entrega. Coloquei sem horário no último dia possível: talvez valha pedir mais prazo à marca.</p>` : '<p>Tudo cabe no seu ritmo antes da entrega ✦</p>'}` : 'Escolha pelo menos uma etapa.';
    }
    if (opcoes.length) {
      f.addEventListener('input', montar); montar();
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); if (!plano.length) return;
        const btn = dlg.querySelector('#plano-ok'); btn.disabled = true;
        try {
          const { data, error } = await sb.from('tarefas').insert(plano).select();
          if (error) throw error;
          tarefas = tarefas.concat(data); dlg.close(); visao = 'semana'; desenhar(); toast(`${data.length} etapas reservadas ✦`);
        } catch (err) { console.error(err); toast('Não consegui criar o plano agora.', true); btn.disabled = false; }
      });
    }
    dlg.showModal();
  }

  // ===== Reagendar sem sobrecarregar =====
  async function aplicarMudancas(mudancas, msgOk) {
    if (!mudancas.length) return toast('Não achei espaço livre nas próximas semanas. Talvez valha ajustar sua rotina.', true);
    try {
      for (const m of mudancas) await salvarTarefa(m.id, { data: m.data, hora: m.hora });
      desenhar(); toast(msgOk);
    } catch (e) { console.error(e); toast('Algumas tarefas não foram movidas. Tente de novo.', true); }
  }

  function planejarMudancas(lista) {
    const r = ritmo(), extras = [], mudancas = [];
    lista.forEach(t => {
      const s = sugerirHorarios(duracaoReal(t, r), { aPartirDe: t.data && t.data > hoje() ? somaDias(t.data, 1) : hoje(), ignorarId: t.id, qtd: 1, extras })[0];
      if (s) { extras.push({ data: s.data, hora: s.hora, duracao_min: duracaoReal(t, r) }); mudancas.push({ id: t.id, titulo: t.titulo, de: t.data, data: s.data, hora: s.hora }); }
    });
    return mudancas;
  }

  async function reagendarAtrasadas() {
    const lista = tarefas.filter(t => !t.concluida && t.data && t.data < hoje());
    // tira as atrasadas da conta enquanto procura espaço
    const guard = lista.map(t => [t, t.data]); guard.forEach(([t]) => { t.data = null; });
    const mud = planejarMudancas(lista);
    guard.forEach(([t, d]) => { t.data = d; });
    if (mud.length && !confirm('Vou distribuir assim:\n\n' + mud.map(m => `• ${m.titulo} → ${nomeDia(m.data)}, ${m.hora}`).join('\n') + '\n\nPode ser?')) return;
    aplicarMudancas(mud, `${mud.length} ${mud.length === 1 ? 'tarefa reagendada' : 'tarefas reagendadas'} sem pesar ✦`);
  }

  async function equilibrarSemana() {
    const r = ritmo(), mover = [];
    for (let i = 0; i < 7; i++) {
      const d = somaDias(hoje(), i);
      const lista = tarefas.filter(t => t.data === d && !t.concluida).sort((a, b) => (hora5(b.hora) || '99').localeCompare(hora5(a.hora) || '99'));
      let carga = cargaDia(d, r);
      for (const t of lista) { if (carga <= r.capacidade) break; mover.push(t); carga -= duracaoReal(t, r); }
    }
    const guard = mover.map(t => [t, t.data]); guard.forEach(([t]) => { t.data = null; });
    const mud = planejarMudancas(guard.map(([t, d]) => Object.assign(Object.create(t), { data: d })));
    guard.forEach(([t, d]) => { t.data = d; });
    if (!mud.length) return toast('Não achei dias mais leves para mover. Talvez valha ajustar sua rotina.', true);
    if (!confirm('Para nenhum dia passar do seu ritmo, posso mover:\n\n' + mud.map(m => `• ${m.titulo}: ${nomeDia(m.de)} → ${nomeDia(m.data)}, ${m.hora}`).join('\n') + '\n\nPode ser?')) return;
    aplicarMudancas(mud, 'Semana equilibrada ✦');
  }

  // ===== Ações =====
  async function concluir(id, botao) {
    const t = tarefas.find(x => x.id === id); if (!t) return;
    const feito = !t.concluida;
    const dados = feito
      ? { concluida: true, concluida_em: new Date().toISOString(), duracao_real_min: t.iniciada_em ? Math.max(1, Math.min(1440, Math.round((Date.now() - new Date(t.iniciada_em)) / 60000))) : t.duracao_real_min }
      : { concluida: false, concluida_em: null };
    if (feito && botao) comemorar(botao);
    try {
      await salvarTarefa(id, dados); desenhar();
      if (feito) {
        const pend = tarefas.filter(x => x.data === hoje() && !x.concluida).length;
        toast(pend ? `Arrasou, Deusa! Faltam ${pend} hoje ✦` : `Dia concluído! Você é incrível, Deusa ✦`);
      }
    } catch (e) { console.error(e); toast('Não consegui salvar agora.', true); }
  }

  async function comecar(id) {
    try { await salvarTarefa(id, { iniciada_em: new Date().toISOString() }); desenhar(); toast('Cronômetro ligado. Vai lá, Deusa ✦'); }
    catch (e) { console.error(e); toast('Não consegui começar agora.', true); }
  }

  function montarEsqueleto() {
    raiz.innerHTML = `
      <div class="marcas-barra">
        <p class="saudacao">Seu dia, no seu ritmo.</p>
        <div class="tarefas-botoes"><button class="btn-secundario" data-plano>💼 Plano para uma marca</button><button class="btn-primario" data-nova-tarefa="">+ Nova tarefa</button></div>
      </div>
      <div class="cartao ritmo" id="t-ritmo"></div>
      <div class="marcas-ferramentas">
        <div class="visoes"><button class="vis-btn ativo" data-tvis="hoje">Hoje</button><button class="vis-btn" data-tvis="semana">Semana</button><button class="vis-btn" data-tvis="ritmo">Meu ritmo</button></div>
      </div>
      <div id="t-conteudo"><p class="carregando">Carregando suas tarefas...</p></div>`;
    raiz.addEventListener('click', (e) => {
      const a = e.target.closest('[data-nova-tarefa], [data-concluir], [data-comecar], [data-editar], [data-tvis], [data-plano], [data-reagendar-atrasadas], [data-equilibrar], [data-ics-semana], [data-notificar], [data-ajustar-rotina]');
      if (!a) return;
      if (a.matches('[data-nova-tarefa]')) return abrirTarefa(null, a.dataset.novaTarefa || null);
      if (a.matches('[data-concluir]')) return concluir(a.dataset.concluir, a);
      if (a.matches('[data-comecar]')) return comecar(a.dataset.comecar);
      if (a.matches('[data-tvis]')) { visao = a.dataset.tvis; return desenhar(); }
      if (a.matches('[data-plano]')) return abrirPlano();
      if (a.matches('[data-reagendar-atrasadas]')) return reagendarAtrasadas();
      if (a.matches('[data-equilibrar]')) return equilibrarSemana();
      if (a.matches('[data-ajustar-rotina]')) return abrirBoasVindas(true);
      if (a.matches('[data-notificar]')) return Notification.requestPermission().then(() => { desenhar(); if (Notification.permission === 'granted') toast('Lembretes ligados neste aparelho ✦'); });
      if (a.matches('[data-ics-semana]')) {
        const lista = tarefas.filter(t => !t.concluida && t.data && t.hora && t.data >= hoje() && t.data <= somaDias(hoje(), 6));
        return lista.length ? baixarICS(lista) : toast('Nenhuma tarefa com horário nos próximos 7 dias.');
      }
      const t = tarefas.find(x => x.id === a.dataset.editar); if (t) abrirTarefa(t);
    });
  }

  window.Tarefas = {
    async iniciar(cliente, secao) {
      sb = cliente; raiz = secao;
      const { data } = await sb.auth.getSession(); uid = data && data.session && data.session.user.id;
      montarEsqueleto();
      try { await carregar(); }
      catch (e) {
        console.error(e);
        $('#t-conteudo').innerHTML = `<div class="cartao"><p class="vazio">${/tarefas|preferencias|relation|schema cache|PGRST205|42P01/i.test((e && (e.message + ' ' + e.code)) || '')
          ? 'A área de Tarefas ainda não foi ativada no banco. Rode o arquivo organizacao.sql no Supabase e recarregue a página.'
          : 'Não consegui carregar suas tarefas agora. Confira sua conexão e recarregue a página.'}</p></div>`;
        return;
      }
      carregado = true;
      atualizarSelo();
      if (prefs || raiz.classList.contains('ativo')) desenhar();
      clearInterval(relogio); relogio = setInterval(conferirLembretes, 30000); conferirLembretes();
    },
    // Chamado quando a aba é aberta: na primeira vez, pergunta a rotina
    aoAbrir() { if (carregado) desenhar(); },
    nome: nomeDela,
    prefs: () => ({ ...PREFS_PADRAO, ...dadosBrutos }),
    // Guarda só alguns campos (ex.: meta de abordagens), sem apagar o resto nem pular as boas-vindas
    async salvarPrefsParcial(parcial) { await salvarPrefs({ ...dadosBrutos, ...parcial }); },
    pronto: () => carregado,
    configurado: () => !!prefs,
    lista: () => tarefas,
    // Usada por Conteúdo: abre "nova tarefa" já preenchida (ex.: "Gravar: ...")
    novaCom(dados) { document.querySelector('[data-tab="aba-tarefas"]').click(); if (prefs) abrirTarefa(null, null, dados); },
    saudacao: saudacaoHora
  };
})();
