/* =========================================================
   prospeccao.js · Área "Prospecção" do UGC Organized
   Controle diário das abordagens a marcas: quem foi abordada,
   por onde, com qual texto, se respondeu e se aprovou.
   Tabelas: prospeccoes e abordagens (ver prospeccao.sql).
   ========================================================= */
(function () {
  const CANAIS = {
    instagram:  { nome: 'DM Instagram', emoji: '📸' },
    email:      { nome: 'E-mail',       emoji: '💌' },
    whatsapp:   { nome: 'WhatsApp',     emoji: '💬' },
    plataforma: { nome: 'Plataforma',   emoji: '🧩' },
    linkedin:   { nome: 'LinkedIn',     emoji: '💼' },
    outro:      { nome: 'Outro',        emoji: '✦' }
  };
  const STATUS = {
    enviada:   { nome: 'Sem resposta', cor: 'neutro' },
    respondeu: { nome: 'Respondeu',    cor: 'alerta' },
    aprovada:  { nome: 'Aprovada',     cor: 'ok' },
    recusada:  { nome: 'Recusada',     cor: 'atraso' }
  };
  const DIAS_FOLLOWUP = 3;
  const META_PADRAO = 10;

  let sb, raiz, lista = [], textos = [], visao = 'lista', filtro = 'todas', busca = '', carregado = false;

  // ===== Utilidades =====
  const $ = (s, el) => (el || raiz).querySelector(s);
  const $$ = (s, el) => [...(el || raiz).querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paraISO = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const deISO = (s) => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
  const hoje = () => paraISO(new Date());
  const somaDias = (iso, n) => { const d = deISO(iso); d.setDate(d.getDate() + n); return paraISO(d); };
  const diasEntre = (a, b) => Math.round((deISO(b) - deISO(a)) / 864e5);
  const fmtCurta = (iso) => iso ? deISO(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '-';
  const usuario = (ig) => String(ig || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
  const digitos = (t) => { let d = String(t || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return d; };
  const meta = () => (window.Tarefas && Tarefas.prefs().meta_abordagens) || META_PADRAO;
  const nomeDela = () => (window.Tarefas ? Tarefas.nome() : 'Deusa');
  const respondida = (p) => p.status !== 'enviada';

  function toast(msg, erro) {
    let t = document.getElementById('toast-marcas');
    if (!t) { t = document.createElement('div'); t.id = 'toast-marcas'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast-m ativo' + (erro ? ' erro' : '');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('ativo'), 2800);
  }

  // Troca {marca} e {contato} no texto salvo
  function preencherTexto(texto, p) {
    return String(texto || '').replace(/\{marca\}/gi, p.marca || 'sua marca').replace(/\{contato\}/gi, (p.contato_nome || '').split(' ')[0] || 'tudo bem');
  }

  // ===== Banco =====
  async function buscarTudo(tabela, ordem) {
    let tudo = [], ini = 0;
    while (true) {
      const { data, error } = await sb.from(tabela).select('*').order(ordem, { ascending: false }).range(ini, ini + 999);
      if (error) throw error;
      tudo = tudo.concat(data || []);
      if (!data || data.length < 1000) break;
      ini += 1000;
    }
    return tudo;
  }
  async function salvar(tabela, id, dados) {
    const q = id ? sb.from(tabela).update(dados).eq('id', id) : sb.from(tabela).insert(dados);
    const { data, error } = await q.select().single();
    if (error) throw error;
    const arr = tabela === 'prospeccoes' ? lista : textos;
    const i = arr.findIndex(x => x.id === data.id);
    if (i >= 0) arr[i] = data; else arr.unshift(data);
    return data;
  }

  // ===== Números =====
  function sequencia() {
    // Dias seguidos batendo a meta (pula os dias de folga da sua rotina)
    const porDia = {}; lista.forEach(p => { porDia[p.data_abordagem] = (porDia[p.data_abordagem] || 0) + 1; });
    const folgas = window.Tarefas ? Tarefas.prefs().dias : [1, 2, 3, 4, 5];
    let dia = (porDia[hoje()] || 0) >= meta() ? hoje() : somaDias(hoje(), -1), n = 0;
    for (let i = 0; i < 365; i++) {
      if (!folgas.includes(deISO(dia).getDay())) { dia = somaDias(dia, -1); continue; }
      if ((porDia[dia] || 0) >= meta()) { n++; dia = somaDias(dia, -1); } else break;
    }
    return n;
  }

  function desempenho(grupoFn) {
    const g = {};
    lista.forEach(p => {
      const k = grupoFn(p); if (!k) return;
      g[k] = g[k] || { env: 0, resp: 0, apr: 0 };
      g[k].env++; if (respondida(p)) g[k].resp++; if (p.status === 'aprovada') g[k].apr++;
    });
    return g;
  }

  function paraHoje() {
    const h = hoje();
    return lista.filter(p => p.status === 'enviada' && p.proximo_followup && p.proximo_followup <= h)
      .sort((a, b) => a.proximo_followup.localeCompare(b.proximo_followup));
  }

  function atualizarSelo() {
    const n = paraHoje().length;
    const selo = document.querySelector('[data-tab="aba-prospeccao"] .selo-aba');
    if (selo) { selo.textContent = n; selo.hidden = !n; }
  }

  // ===== Desenho =====
  function desenhar() {
    if (!carregado) return;
    atualizarSelo();
    const h = hoje(), feitasHoje = lista.filter(p => p.data_abordagem === h).length, m = meta(), seq = sequencia();
    const mes = h.slice(0, 7), doMes = lista.filter(p => p.data_abordagem.slice(0, 7) === mes);
    const resp = lista.filter(respondida).length, apr = lista.filter(p => p.status === 'aprovada').length;
    const porTexto = desempenho(p => p.abordagem_id), porCanal = desempenho(p => p.canal);
    const melhor = (g, min) => Object.entries(g).filter(([, v]) => v.env >= min).sort((a, b) => (b[1].apr / b[1].env) - (a[1].apr / a[1].env) || (b[1].resp / b[1].env) - (a[1].resp / a[1].env))[0];
    const mt = melhor(porTexto, 5), mc = melhor(porCanal, 5);
    const nomeTexto = mt && (textos.find(t => t.id === mt[0]) || {}).nome;

    $('#p-meta').innerHTML = `
      <div class="meta-topo">
        <div class="meta-num">${feitasHoje}<small>/${m}</small></div>
        <div class="meta-info">
          <strong>${feitasHoje >= m ? `Meta batida, ${esc(nomeDela())}! ✦` : `Abordagens de hoje`}</strong>
          <div class="carga ${feitasHoje >= m ? 'ok' : ''}"><div style="width:${Math.min(100, feitasHoje / m * 100)}%"></div></div>
          <small>${feitasHoje >= m ? 'Cada marca a mais hoje é bônus.' : `Faltam ${m - feitasHoje} para bater a meta.`} ${seq ? `🔥 ${seq} ${seq === 1 ? 'dia' : 'dias'} seguidos batendo a meta` : ''}</small>
        </div>
        <button class="mini-btn" data-meta>Meta: ${m}/dia</button>
      </div>`;

    $('#p-numeros').innerHTML = `
      <div class="cartao numero destaque"><div class="rotulo">Abordagens no mês</div><div class="valor">${doMes.length}</div><div class="extra">${lista.length} no total</div></div>
      <div class="cartao numero"><div class="rotulo">Taxa de resposta</div><div class="valor">${pct(resp, lista.length)}</div><div class="extra">${resp} responderam</div></div>
      <div class="cartao numero"><div class="rotulo">Aprovadas</div><div class="valor">${apr}</div><div class="extra">${pct(apr, lista.length)} das abordagens</div></div>
      <div class="cartao numero"><div class="rotulo">Texto que mais aprova</div><div class="valor menor">${nomeTexto ? esc(nomeTexto) : '-'}</div><div class="extra">${mt ? `${pct(mt[1].apr, mt[1].env)} de aprovação` : 'Use um texto em 5+ abordagens'}</div></div>
      <div class="cartao numero"><div class="rotulo">Melhor canal</div><div class="valor menor">${mc ? CANAIS[mc[0]].emoji + ' ' + CANAIS[mc[0]].nome : '-'}</div><div class="extra">${mc ? `${pct(mc[1].resp, mc[1].env)} respondem` : 'Ainda aprendendo'}</div></div>`;

    const fu = paraHoje();
    $('#p-hoje').hidden = !fu.length;
    $('#p-hoje').innerHTML = fu.length ? `<div class="hoje-cab"><h2>Follow-up para hoje</h2><span class="hoje-qtd">${fu.length} sem resposta há ${DIAS_FOLLOWUP}+ dias</span></div>
      <div class="hoje-lista">${fu.map(p => `<div class="hoje-item alerta">
        <button class="hoje-abrir" data-abrir="${p.id}"><span class="ponto"></span><span><strong>${esc(p.marca)}</strong> · ${p.followups ? `${p.followups + 1}º follow-up` : 'Primeiro follow-up'}<small>Abordada em ${fmtCurta(p.data_abordagem)} por ${CANAIS[p.canal]?.nome || p.canal}</small></span></button>
        <div class="hoje-acoes">${linksContato(p)}<button class="mini-btn" data-fiz-followup="${p.id}">✓ Fiz</button></div>
      </div>`).join('')}</div>` : '';

    $$('.vis-btn', raiz).forEach(b => b.classList.toggle('ativo', b.dataset.pvis === visao));
    $('#p-filtros').hidden = visao !== 'lista';
    if (visao === 'lista') desenharLista(); else desenharTextos(porTexto);
  }

  function linksContato(p) {
    const u = usuario(p.instagram);
    return [
      u ? `<a class="mini-btn" href="https://ig.me/m/${encodeURIComponent(u)}" target="_blank" rel="noopener" title="Abrir a DM">📸 DM</a>` : '',
      p.whatsapp ? `<a class="mini-btn zap" href="https://wa.me/${digitos(p.whatsapp)}" target="_blank" rel="noopener">💬 Whats</a>` : '',
      p.email ? `<a class="mini-btn" href="mailto:${encodeURIComponent(p.email)}">💌 E-mail</a>` : ''
    ].join('');
  }

  function desenharLista() {
    const b = busca.toLowerCase();
    const contagem = { todas: lista.length }; Object.keys(STATUS).forEach(s => { contagem[s] = lista.filter(p => p.status === s).length; });
    $$('[data-filtro]').forEach(x => { x.classList.toggle('ativo', x.dataset.filtro === filtro); x.querySelector('i').textContent = contagem[x.dataset.filtro]; });
    const itens = lista.filter(p => (filtro === 'todas' || p.status === filtro) &&
      (!b || [p.marca, p.instagram, p.nicho, p.contato_nome, p.email].some(v => String(v || '').toLowerCase().includes(b))))
      .sort((x, y) => y.data_abordagem.localeCompare(x.data_abordagem) || (y.created_at || '').localeCompare(x.created_at || ''));
    if (!lista.length) {
      $('#p-conteudo').innerHTML = `<div class="cartao vazio-grande"><h2>Bora prospectar, ${esc(nomeDela())}?</h2>
        <p>Registre cada marca que você abordar. Eu te lembro dos follow-ups e mostro qual texto e qual canal trazem mais respostas.</p>
        <button class="btn-primario" data-nova>+ Registrar a primeira abordagem</button></div>`;
      return;
    }
    if (!itens.length) { $('#p-conteudo').innerHTML = '<div class="cartao"><p class="vazio">Nenhuma abordagem com esse filtro.</p></div>'; return; }
    // Agrupa por dia
    const grupos = {}; itens.forEach(p => { (grupos[p.data_abordagem] = grupos[p.data_abordagem] || []).push(p); });
    $('#p-conteudo').innerHTML = Object.entries(grupos).map(([dia, ps]) => `
      <div class="p-dia"><h3>${dia === hoje() ? 'Hoje' : dia === somaDias(hoje(), -1) ? 'Ontem' : deISO(dia).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', '')} <span>${ps.length}</span></h3>
      <div class="p-lista">${ps.map(p => {
        const t = textos.find(x => x.id === p.abordagem_id), c = CANAIS[p.canal] || CANAIS.outro, u = usuario(p.instagram);
        return `<div class="p-item ${p.status}">
          <div class="p-corpo" data-abrir="${p.id}">
            <div class="p-nome">${esc(p.marca)} ${u ? `<span class="p-ig">@${esc(u)}</span>` : ''}</div>
            <div class="t-meta"><span class="chip">${c.emoji} ${c.nome}</span>${t ? `<span class="chip texto">📝 ${esc(t.nome)}</span>` : ''}${p.nicho ? `<span>${esc(p.nicho)}</span>` : ''}${p.followups ? `<span>${p.followups} follow-up${p.followups > 1 ? 's' : ''}</span>` : ''}${p.marca_id ? '<span class="chip ok">💼 No funil</span>' : ''}</div>
          </div>
          <div class="p-acoes">
            <select class="p-status ${STATUS[p.status].cor}" data-status="${p.id}" aria-label="Status de ${esc(p.marca)}">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${v.nome}</option>`).join('')}</select>
            <div class="p-links">${linksContato(p)}</div>
          </div>
        </div>`;
      }).join('')}</div></div>`).join('');
  }

  function desenharTextos(porTexto) {
    $('#p-conteudo').innerHTML = `
      <div class="semana-acoes"><p class="desc">Salve seus textos de abordagem. Use {marca} e {contato} que eu troco pelo nome na hora de copiar.</p><button class="btn-primario" data-novo-texto>+ Novo texto</button></div>
      ${textos.length ? `<div class="textos">${textos.map(t => { const g = porTexto[t.id] || { env: 0, resp: 0, apr: 0 };
        return `<div class="cartao texto-card">
          <div class="fb-topo"><strong>${esc(t.nome)}</strong>${t.canal ? `<span class="chip">${CANAIS[t.canal]?.emoji || ''} ${CANAIS[t.canal]?.nome || ''}</span>` : ''}</div>
          <p class="texto-previa">${esc(t.texto || '')}</p>
          <div class="texto-stats"><div><b>${g.env}</b><small>enviadas</small></div><div><b>${pct(g.resp, g.env)}</b><small>respostas</small></div><div><b>${pct(g.apr, g.env)}</b><small>aprovação</small></div></div>
          <div class="atalhos"><button class="mini-btn" data-copiar-texto="${t.id}">Copiar</button><button class="mini-btn" data-editar-texto="${t.id}">Editar</button></div>
        </div>`; }).join('')}</div>`
        : '<div class="cartao"><p class="vazio">Nenhum texto salvo ainda. Salve as abordagens que você usa para descobrir qual funciona melhor.</p></div>'}`;
  }

  // ===== Ficha da abordagem =====
  function abrirFicha(p) {
    const nova = !p || !!p._nova;
    const ultima = lista[0] || {};
    if (nova) p = { canal: ultima.canal || 'instagram', abordagem_id: ultima.abordagem_id || '', data_abordagem: hoje(), status: 'enviada', ...(p || {}) };
    const dlg = document.getElementById('ficha-marca');
    const campo = (n, r, v, a) => `<label class="campo"><span>${r}</span><input name="${n}" value="${esc(v ?? '')}" ${a || ''}></label>`;
    dlg.innerHTML = `<form class="ficha" novalidate>
      <header class="ficha-cab"><div><small>${nova ? 'Nova abordagem' : STATUS[p.status].nome}</small><h2>${nova ? 'Registrar abordagem' : esc(p.marca)}</h2></div><button type="button" class="fechar" data-fechar aria-label="Fechar">×</button></header>
      <div class="ficha-corpo">
        <div class="faixa-erro" id="pf-erro" hidden></div>
        <fieldset><legend>Marca</legend><div class="grade-campos">
          ${campo('marca', 'Nome da marca *', p.marca, 'maxlength="120" placeholder="Ex.: Nature Face"')}
          ${campo('instagram', 'Instagram', p.instagram, 'placeholder="@marca" autocapitalize="off"')}
          ${campo('nicho', 'Nicho', p.nicho, 'placeholder="Skincare, moda fitness..."')}
          ${campo('site', 'Site', p.site, 'placeholder="marca.com.br" autocapitalize="off"')}
        </div></fieldset>
        <fieldset><legend>Contato</legend><div class="grade-campos">
          ${campo('contato_nome', 'Pessoa', p.contato_nome, 'placeholder="Quem cuida de influência/marketing"')}
          ${campo('email', 'E-mail', p.email, 'type="email" placeholder="marketing@marca.com"')}
          ${campo('whatsapp', 'WhatsApp', p.whatsapp, 'inputmode="tel" placeholder="(11) 90000-0000"')}
        </div></fieldset>
        <fieldset><legend>Abordagem</legend>
          <div class="cat-escolha">${Object.entries(CANAIS).map(([k, c]) => `<label><input type="radio" name="canal" value="${k}" ${p.canal === k ? 'checked' : ''}><span>${c.emoji} ${c.nome}</span></label>`).join('')}</div>
          <div class="grade-campos">
            <label class="campo"><span>Qual texto você usou?</span><select name="abordagem_id"><option value="">Nenhum / personalizado</option>${textos.map(t => `<option value="${t.id}" ${p.abordagem_id === t.id ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></label>
            ${campo('data_abordagem', 'Data da abordagem', p.data_abordagem, 'type="date"')}
          </div>
          <div class="texto-usado" id="texto-usado"></div>
        </fieldset>
        <fieldset><legend>Resposta</legend>
          <div class="cat-escolha status-escolha">${Object.entries(STATUS).map(([k, v]) => `<label><input type="radio" name="status" value="${k}" ${p.status === k ? 'checked' : ''}><span class="${v.cor}">${v.nome}</span></label>`).join('')}</div>
          <div class="grade-campos">
            ${campo('proximo_followup', 'Próximo follow-up', p.proximo_followup, 'type="date"')}
            ${campo('data_resposta', 'Respondeu em', p.data_resposta, 'type="date"')}
          </div>
        </fieldset>
        <fieldset><legend>Anotações</legend><label class="campo largo"><textarea name="notas" rows="2" placeholder="O que responderam, valores, próximos passos...">${esc(p.notas || '')}</textarea></label></fieldset>
        ${!nova && p.status === 'aprovada' && !p.marca_id ? `<div class="levar-funil"><span>🎉 Aprovou! Quer acompanhar prazos e entrega no funil?</span><button type="button" class="btn-primario" data-levar>Levar para Marcas</button></div>` : ''}
      </div>
      <footer class="ficha-rodape">
        ${!nova ? '<button type="button" class="btn-perigo" data-excluir>Excluir</button>' : '<span></span>'}
        <div><button type="button" class="btn-secundario" data-fechar>Cancelar</button>
        ${nova ? '<button type="submit" class="btn-secundario" data-e-proxima>Salvar e próxima</button>' : ''}
        <button type="submit" class="btn-primario" id="pf-salvar">${nova ? 'Registrar ✦' : 'Salvar'}</button></div>
      </footer>
    </form>`;
    const f = dlg.querySelector('form');
    let proxima = false;

    function mostrarTexto() {
      const t = textos.find(x => x.id === f.abordagem_id.value), el = dlg.querySelector('#texto-usado');
      if (!t || !t.texto) { el.innerHTML = ''; return; }
      const txt = preencherTexto(t.texto, { marca: f.marca.value.trim(), contato_nome: f.contato_nome.value.trim() });
      el.innerHTML = `<p>${esc(txt)}</p><button type="button" class="mini-btn" data-copiar>Copiar texto</button>`;
      el.querySelector('[data-copiar]').onclick = () => navigator.clipboard.writeText(txt).then(() => toast('Texto copiado ✦'), () => toast('Não consegui copiar.', true));
    }
    ['abordagem_id', 'marca', 'contato_nome'].forEach(n => f[n].addEventListener('input', mostrarTexto));
    mostrarTexto();
    // Marcou que respondeu? Preenche a data de hoje.
    $$('input[name="status"]', dlg).forEach(i => i.addEventListener('change', () => { if (i.value !== 'enviada' && !f.data_resposta.value) f.data_resposta.value = hoje(); }));

    dlg.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.oncancel = null;
    const pe = dlg.querySelector('[data-e-proxima]'); if (pe) pe.addEventListener('click', () => { proxima = true; });
    const lv = dlg.querySelector('[data-levar]'); if (lv) lv.addEventListener('click', () => { dlg.close(); levarParaMarcas(p); });
    const exc = dlg.querySelector('[data-excluir]');
    if (exc) exc.addEventListener('click', async () => {
      if (!confirm(`Excluir a abordagem para ${p.marca}?`)) return;
      const { error } = await sb.from('prospeccoes').delete().eq('id', p.id);
      if (error) return toast('Não consegui excluir agora.', true);
      lista = lista.filter(x => x.id !== p.id); dlg.close(); desenhar(); toast('Abordagem excluída.');
    });

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const erro = (m) => { const el = dlg.querySelector('#pf-erro'); el.textContent = m; el.hidden = false; el.scrollIntoView({ block: 'center' }); };
      const marca = f.marca.value.trim();
      if (!marca) { proxima = false; f.marca.focus(); return erro('Coloque o nome da marca.'); }
      const t = (n) => f[n].value.trim() || null;
      const status = f.status.value || 'enviada', data = f.data_abordagem.value || hoje();
      const dados = { marca, instagram: t('instagram'), nicho: t('nicho'), site: t('site'), contato_nome: t('contato_nome'), email: t('email'), whatsapp: t('whatsapp'),
        canal: f.canal.value || 'instagram', abordagem_id: f.abordagem_id.value || null, data_abordagem: data, status,
        proximo_followup: status === 'enviada' ? (t('proximo_followup') || somaDias(data, DIAS_FOLLOWUP)) : t('proximo_followup'),
        data_resposta: status === 'enviada' ? null : (t('data_resposta') || hoje()), notas: t('notas') };
      // Já abordou essa marca antes? Avisa para não repetir sem querer.
      if (nova) {
        const u = usuario(dados.instagram).toLowerCase();
        const repetida = lista.find(x => x.marca.toLowerCase() === marca.toLowerCase() || (u && usuario(x.instagram).toLowerCase() === u));
        if (repetida && !confirm(`Você já abordou ${repetida.marca} em ${fmtCurta(repetida.data_abordagem)} (${STATUS[repetida.status].nome}). Registrar de novo?`)) { proxima = false; return; }
      }
      const btn = dlg.querySelector('#pf-salvar'); btn.disabled = true;
      try {
        const salvo = await salvar('prospeccoes', nova ? null : p.id, dados);
        desenhar();
        const n = lista.filter(x => x.data_abordagem === hoje()).length;
        if (nova && n === meta()) toast(`Meta do dia batida, Deusa! ${n} abordagens ✦`);
        else toast(nova ? `${marca} registrada! ${n}/${meta()} hoje ✦` : 'Alterações salvas.');
        if (proxima) return abrirFicha(null);
        dlg.close();
        if (!nova && status === 'aprovada' && p.status !== 'aprovada' && !salvo.marca_id) setTimeout(() => perguntarFunil(salvo), 300);
      } catch (err) { console.error(err); erro('Não consegui salvar agora. Tente de novo.'); btn.disabled = false; proxima = false; }
    });
    dlg.showModal();
    if (nova) setTimeout(() => f.marca.focus(), 50);
  }

  function perguntarFunil(p) {
    if (confirm(`🎉 ${p.marca} aprovou! Levar para o funil de Marcas para acompanhar prazo e entrega?`)) levarParaMarcas(p);
  }

  async function levarParaMarcas(p) {
    if (!window.Marcas) return;
    try {
      const m = await Marcas.adicionar({ nome: p.marca, nicho: p.nicho, contato_nome: p.contato_nome, contato_email: p.email, contato_whatsapp: p.whatsapp,
        contato_instagram: p.instagram, canal: ['instagram', 'email', 'whatsapp', 'plataforma'].includes(p.canal) ? p.canal : 'outro', notas: p.notas, etapa: 'negociando' });
      await salvar('prospeccoes', p.id, { marca_id: m.id });
      desenhar(); toast(`${p.marca} está no funil, em "Negociando" ✦`);
    } catch (e) { console.error(e); toast('Não consegui levar para Marcas agora.', true); }
  }

  function abrirTexto(t) {
    const nova = !t; t = t || { canal: 'instagram' };
    const dlg = document.getElementById('ficha-marca');
    dlg.innerHTML = `<form class="ficha" novalidate>
      <header class="ficha-cab"><div><small>Texto de abordagem</small><h2>${nova ? 'Novo texto' : esc(t.nome)}</h2></div><button type="button" class="fechar" data-fechar aria-label="Fechar">×</button></header>
      <div class="ficha-corpo">
        <div class="faixa-erro" id="tx-erro" hidden></div>
        <fieldset><div class="grade-campos">
          <label class="campo"><span>Nome do texto *</span><input name="nome" maxlength="60" value="${esc(t.nome || '')}" placeholder="Ex.: DM curta com portfólio"></label>
          <label class="campo"><span>Canal</span><select name="canal">${Object.entries(CANAIS).map(([k, c]) => `<option value="${k}" ${t.canal === k ? 'selected' : ''}>${c.emoji} ${c.nome}</option>`).join('')}</select></label>
          <label class="campo largo"><span>Texto (use {marca} e {contato})</span><textarea name="texto" rows="9" placeholder="Oi, {contato}! ...">${esc(t.texto || '')}</textarea></label>
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
      if (!confirm('Excluir este texto? As abordagens que usaram ele continuam registradas.')) return;
      const { error } = await sb.from('abordagens').delete().eq('id', t.id);
      if (error) return toast('Não consegui excluir agora.', true);
      textos = textos.filter(x => x.id !== t.id); lista.forEach(p => { if (p.abordagem_id === t.id) p.abordagem_id = null; });
      dlg.close(); desenhar();
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!f.nome.value.trim()) { const el = dlg.querySelector('#tx-erro'); el.textContent = 'Dê um nome para o texto.'; el.hidden = false; return; }
      try { await salvar('abordagens', nova ? null : t.id, { nome: f.nome.value.trim(), canal: f.canal.value, texto: f.texto.value.trim() || null }); dlg.close(); desenhar(); toast('Texto salvo ✦'); }
      catch (err) { console.error(err); toast('Não consegui salvar agora.', true); }
    });
    dlg.showModal();
  }

  async function mudarStatus(id, status) {
    const p = lista.find(x => x.id === id); if (!p) return;
    const anterior = p.status;
    const dados = { status, data_resposta: status === 'enviada' ? null : (p.data_resposta || hoje()) };
    if (status === 'enviada' && !p.proximo_followup) dados.proximo_followup = somaDias(hoje(), DIAS_FOLLOWUP);
    try {
      const salvo = await salvar('prospeccoes', id, dados); desenhar();
      toast(`${p.marca}: ${STATUS[status].nome}`);
      if (status === 'aprovada' && anterior !== 'aprovada' && !salvo.marca_id) setTimeout(() => perguntarFunil(salvo), 250);
    } catch (e) { console.error(e); toast('Não consegui mudar agora.', true); desenhar(); }
  }

  async function fizFollowup(id) {
    const p = lista.find(x => x.id === id); if (!p) return;
    const n = (p.followups || 0) + 1;
    try {
      // Depois do 2º follow-up sem resposta, para de lembrar (não vale insistir demais)
      await salvar('prospeccoes', id, { followups: n, ultimo_followup: hoje(), proximo_followup: n >= 2 ? null : somaDias(hoje(), 5) });
      desenhar(); toast(n >= 2 ? `Follow-up feito. Se ${p.marca} não responder, deixo quietinho ✦` : `Follow-up feito! Te lembro de novo em 5 dias ✦`);
    } catch (e) { console.error(e); toast('Não consegui salvar agora.', true); }
  }

  async function mudarMeta() {
    const v = prompt('Quantas marcas você quer abordar por dia?', meta());
    if (v === null) return;
    const n = parseInt(v, 10);
    if (!(n >= 1 && n <= 200)) return toast('Coloque um número de 1 a 200.', true);
    try { await Tarefas.salvarPrefsParcial({ meta_abordagens: n }); desenhar(); toast(`Meta: ${n} abordagens por dia ✦`); }
    catch (e) { console.error(e); toast('Não consegui salvar a meta.', true); }
  }

  async function usarPlano() {
    const pl = window.Financeiro && Financeiro.plano(); if (!pl || !pl.porDia) return;
    try { await Tarefas.salvarPrefsParcial({ meta_abordagens: pl.porDia }); desenhar(); toast(`Meta: ${pl.porDia} abordagens por dia. Bora, Deusa! ✦`); }
    catch (e) { console.error(e); toast('Não consegui salvar a meta.', true); }
  }

  function montarEsqueleto() {
    raiz.innerHTML = `
      <div class="marcas-barra"><p class="saudacao">Prospectar todo dia é o que enche a agenda.</p>
        <button class="btn-primario" data-nova>+ Registrar abordagem</button></div>
      <div class="cartao meta-dia" id="p-meta"></div>
      <div class="numeros" id="p-numeros"></div>
      <div class="cartao hoje" id="p-hoje" hidden></div>
      <div class="marcas-ferramentas">
        <div class="visoes"><button class="vis-btn ativo" data-pvis="lista">Abordagens</button><button class="vis-btn" data-pvis="textos">Meus textos</button></div>
        <input type="search" class="busca" id="p-busca" placeholder="Buscar marca ou @..." aria-label="Buscar abordagem">
      </div>
      <div class="filtros" id="p-filtros">
        <button data-filtro="todas" class="ativo">Todas <i>0</i></button>
        ${Object.entries(STATUS).map(([k, v]) => `<button data-filtro="${k}" class="${v.cor}">${v.nome} <i>0</i></button>`).join('')}
      </div>
      <div id="p-conteudo"><p class="carregando">Carregando suas abordagens...</p></div>`;
    raiz.addEventListener('click', (e) => {
      const a = e.target.closest('[data-nova], [data-abrir], [data-pvis], [data-filtro], [data-fiz-followup], [data-meta], [data-usar-plano], [data-novo-texto], [data-editar-texto], [data-copiar-texto]');
      if (!a) return;
      if (a.matches('[data-nova]')) return abrirFicha(null);
      if (a.matches('[data-pvis]')) { visao = a.dataset.pvis; return desenhar(); }
      if (a.matches('[data-filtro]')) { filtro = a.dataset.filtro; return desenharLista(); }
      if (a.matches('[data-fiz-followup]')) return fizFollowup(a.dataset.fizFollowup);
      if (a.matches('[data-meta]')) return mudarMeta();
      if (a.matches('[data-usar-plano]')) return usarPlano();
      if (a.matches('[data-novo-texto]')) return abrirTexto(null);
      if (a.matches('[data-editar-texto]')) return abrirTexto(textos.find(t => t.id === a.dataset.editarTexto));
      if (a.matches('[data-copiar-texto]')) { const t = textos.find(x => x.id === a.dataset.copiarTexto); return navigator.clipboard.writeText(t.texto || '').then(() => toast('Texto copiado ✦')); }
      const p = lista.find(x => x.id === a.dataset.abrir); if (p) abrirFicha(p);
    });
    raiz.addEventListener('change', (e) => { if (e.target.matches('[data-status]')) mudarStatus(e.target.dataset.status, e.target.value); });
    $('#p-busca').addEventListener('input', (e) => { busca = e.target.value.trim(); if (visao === 'lista') desenharLista(); });
  }

  window.Prospeccao = {
    async iniciar(cliente, secao) {
      sb = cliente; raiz = secao;
      montarEsqueleto();
      try {
        [lista, textos] = await Promise.all([buscarTudo('prospeccoes', 'data_abordagem'), buscarTudo('abordagens', 'created_at')]);
        carregado = true; desenhar();
      } catch (e) {
        console.error(e);
        $('#p-conteudo').innerHTML = `<div class="cartao"><p class="vazio">${/prospeccoes|abordagens|relation|schema cache|PGRST205|42P01/i.test((e && (e.message + ' ' + e.code)) || '')
          ? 'A área de Prospecção ainda não foi ativada no banco. Rode o arquivo prospeccao.sql no Supabase e recarregue a página.'
          : 'Não consegui carregar suas abordagens agora. Confira sua conexão e recarregue a página.'}</p></div>`;
      }
    },
    aoAbrir() { desenhar(); },
    lista: () => (carregado ? lista : []),
    // Usada pelo Assistente: abre "registrar abordagem" já preenchida
    novaCom(dados) { document.querySelector('[data-tab="aba-prospeccao"]').click(); abrirFicha({ ...dados, _nova: true }); },
    // Usada pelo Financeiro para estimar quantas abordagens bater a meta exige (últimos 90 dias)
    estatisticas() {
      const lim = somaDias(hoje(), -90), r = lista.filter(p => p.data_abordagem >= lim);
      return { total: r.length, aprovadas: r.filter(p => p.status === 'aprovada').length };
    }
  };
})();
