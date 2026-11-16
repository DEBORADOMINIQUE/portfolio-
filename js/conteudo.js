/* =========================================================
   conteudo.js · Área "Conteúdo" do UGC Organized
   Planner (da ideia ao post), calendário de publicação e
   biblioteca de roteiros (gancho, desenvolvimento, chamada).
   Tabela: conteudos (ver conteudo.sql).
   ========================================================= */
(function () {
  const ETAPAS = [
    { id: 'ideia', nome: 'Ideias', emoji: '💡' },
    { id: 'roteiro', nome: 'Roteiro', emoji: '✍️' },
    { id: 'gravar', nome: 'Gravar', emoji: '🎥' },
    { id: 'editar', nome: 'Editar', emoji: '✂️' },
    { id: 'agendado', nome: 'Pronto / agendado', emoji: '📅' },
    { id: 'postado', nome: 'Postado / entregue', emoji: '✓' }
  ];
  const NOME_ETAPA = Object.fromEntries(ETAPAS.map(e => [e.id, e.nome]));
  const PLATAFORMAS = { instagram: '📸 Instagram', tiktok: '🎵 TikTok', youtube: '▶️ YouTube', marca: '💼 Para a marca', outro: '✦ Outro' };
  const FORMATOS = { reels: 'Reels', carrossel: 'Carrossel', story: 'Story', foto: 'Foto', video_ugc: 'Vídeo UGC', live: 'Live', video_longo: 'Vídeo longo' };
  const STATUS_ROTEIRO = { rascunho: { nome: 'Rascunho', cor: 'neutro' }, enviado: { nome: 'Enviado à marca', cor: 'alerta' }, ajustes: { nome: 'Pediram ajustes', cor: 'atraso' }, aprovado: { nome: 'Aprovado', cor: 'ok' } };

  let sb, raiz, itens = [], visao = 'planner', mesCal = new Date(), carregado = false, arrastando = null;
  mesCal.setDate(1);

  const $ = (s, el) => (el || raiz).querySelector(s);
  const $$ = (s, el) => [...(el || raiz).querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paraISO = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const deISO = (s) => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
  const hoje = () => paraISO(new Date());
  const somaDias = (iso, n) => { const d = deISO(iso); d.setDate(d.getDate() + n); return paraISO(d); };
  const fmtCurta = (iso) => iso ? deISO(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
  const marcas = () => (window.Marcas ? Marcas.lista() : []);
  const nomeMarca = (id) => (marcas().find(m => m.id === id) || {}).nome;
  const temRoteiro = (c) => !!(c.gancho || c.desenvolvimento || c.cta);
  const digitos = (t) => { let d = String(t || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return d; };

  function toast(msg, erro) {
    let t = document.getElementById('toast-marcas');
    if (!t) { t = document.createElement('div'); t.id = 'toast-marcas'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast-m ativo' + (erro ? ' erro' : '');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('ativo'), 2800);
  }

  function textoRoteiro(c) {
    const partes = [`ROTEIRO: ${c.titulo}${c.marca_id ? ' · ' + (nomeMarca(c.marca_id) || '') : ''}`];
    if (c.formato) partes.push(`Formato: ${FORMATOS[c.formato] || c.formato}`);
    if (c.gancho) partes.push(`\nGANCHO (primeiros segundos)\n${c.gancho}`);
    if (c.desenvolvimento) partes.push(`\nDESENVOLVIMENTO\n${c.desenvolvimento}`);
    if (c.cta) partes.push(`\nCHAMADA PARA AÇÃO\n${c.cta}`);
    if (c.legenda) partes.push(`\nLEGENDA\n${c.legenda}`);
    return partes.join('\n');
  }

  // ===== Banco =====
  async function salvar(id, dados) {
    const q = id ? sb.from('conteudos').update(dados).eq('id', id) : sb.from('conteudos').insert(dados);
    const { data, error } = await q.select().single();
    if (error) throw error;
    const i = itens.findIndex(x => x.id === data.id);
    if (i >= 0) itens[i] = data; else itens.unshift(data);
    return data;
  }

  async function mover(id, etapa) {
    const c = itens.find(x => x.id === id); if (!c || c.etapa === etapa) return;
    try {
      await salvar(id, { etapa }); desenhar();
      toast(etapa === 'postado' ? `${c.titulo}: no ar! ${G.t('Arrasou', 'Mandou bem')}, ${G.apelido()} ✦` : `${c.titulo} foi para "${NOME_ETAPA[etapa]}"`);
      if (etapa === 'gravar' && window.Tarefas && confirm('Quer reservar um horário para gravar?')) Tarefas.novaCom({ titulo: `Gravar: ${c.titulo}`, categoria: 'gravar', marca_id: c.marca_id });
    } catch (e) { console.error(e); toast('Não consegui mover agora.', true); }
  }

  // ===== Desenho =====
  function desenhar() {
    if (!carregado) return;
    const h = hoje(), semana = somaDias(h, 6);
    const daSemana = itens.filter(c => c.data_publicacao && c.data_publicacao >= h && c.data_publicacao <= semana);
    const aguardando = itens.filter(c => c.roteiro_status === 'enviado');
    const atrasados = itens.filter(c => c.data_publicacao && c.data_publicacao < h && c.etapa !== 'postado');
    const postadosMes = itens.filter(c => c.etapa === 'postado' && c.data_publicacao && c.data_publicacao.slice(0, 7) === h.slice(0, 7));
    $('#c-numeros').innerHTML = `
      <div class="cartao numero destaque"><div class="rotulo">Para os próximos 7 dias</div><div class="valor">${daSemana.length}</div><div class="extra">${daSemana.filter(c => c.etapa === 'agendado' || c.etapa === 'postado').length} já prontos</div></div>
      <div class="cartao numero"><div class="rotulo">Postados no mês</div><div class="valor">${postadosMes.length}</div><div class="extra">conteúdos no ar</div></div>
      <div class="cartao numero"><div class="rotulo">Roteiros com a marca</div><div class="valor">${aguardando.length}</div><div class="extra">esperando aprovação</div></div>
      <div class="cartao numero"><div class="rotulo">Banco de ideias</div><div class="valor">${itens.filter(c => c.etapa === 'ideia').length}</div><div class="extra">${atrasados.length ? `⚠ ${atrasados.length} com data passada` : 'nada atrasado ✦'}</div></div>`;
    $$('.vis-btn', raiz).forEach(b => b.classList.toggle('ativo', b.dataset.cvis === visao));
    if (visao === 'planner') desenharPlanner(); else if (visao === 'calendario') desenharCalendario(); else desenharRoteiros();
  }

  function cartao(c) {
    const i = ETAPAS.findIndex(e => e.id === c.etapa), prox = ETAPAS[i + 1];
    const marca = c.marca_id && nomeMarca(c.marca_id), atrasado = c.data_publicacao && c.data_publicacao < hoje() && c.etapa !== 'postado';
    return `<article class="card-marca" draggable="true" data-cid="${c.id}" tabindex="0">
      <div class="card-topo"><strong>${esc(c.titulo)}</strong></div>
      <div class="t-meta"><span class="chip">${esc(FORMATOS[c.formato] || c.formato)}</span>${marca ? `<span class="chip marca">💼 ${esc(marca)}</span>` : ''}</div>
      ${c.data_publicacao ? `<div class="tag-data ${atrasado ? 'alerta' : ''}">${c.etapa === 'postado' ? 'Postado' : 'Postar'} ${c.data_publicacao === hoje() ? 'hoje' : fmtCurta(c.data_publicacao)}</div>` : ''}
      ${c.roteiro_status ? `<div class="prazo ${STATUS_ROTEIRO[c.roteiro_status].cor}">✍️ ${STATUS_ROTEIRO[c.roteiro_status].nome}</div>` : ''}
      ${prox ? `<button class="avancar" data-cavancar="${c.id}" data-para="${prox.id}" title="Mover para ${prox.nome}">→</button>` : ''}
    </article>`;
  }

  function desenharPlanner() {
    if (!itens.length) {
      $('#c-visao').innerHTML = `<div class="cartao vazio-grande"><h2>Seu banco de ideias começa aqui ✦</h2>
        <p>Anote ideias de conteúdo, escreva roteiros (seus e das marcas) e acompanhe cada um até ir ao ar.</p>
        <button class="btn-primario" data-cnovo>+ Primeira ideia</button></div>`;
      return;
    }
    $('#c-visao').innerHTML = `<div class="funil">${ETAPAS.map(e => {
      const lista = itens.filter(c => c.etapa === e.id).sort((a, b) => (a.data_publicacao || '9999').localeCompare(b.data_publicacao || '9999'));
      return `<section class="coluna" data-cetapa="${e.id}"><header><div><h3>${e.emoji} ${e.nome} <span class="qtd">${lista.length}</span></h3></div></header>
        <div class="cards">${lista.slice(0, e.id === 'postado' ? 12 : 99).map(cartao).join('') || '<p class="coluna-vazia">Arraste para cá</p>'}</div>
        ${e.id === 'ideia' ? '<button class="add-coluna" data-cnovo>+ Nova ideia</button>' : ''}</section>`;
    }).join('')}</div>`;
    $$('.card-marca[data-cid]').forEach(el => {
      el.addEventListener('dragstart', (ev) => { arrastando = el.dataset.cid; el.classList.add('arrastando'); ev.dataTransfer.setData('text/plain', arrastando); });
      el.addEventListener('dragend', () => { el.classList.remove('arrastando'); $$('.coluna').forEach(k => k.classList.remove('sobre')); });
    });
    $$('.coluna[data-cetapa]').forEach(col => {
      col.addEventListener('dragover', (ev) => { if (!arrastando) return; ev.preventDefault(); col.classList.add('sobre'); });
      col.addEventListener('dragleave', (ev) => { if (!col.contains(ev.relatedTarget)) col.classList.remove('sobre'); });
      col.addEventListener('drop', (ev) => { ev.preventDefault(); col.classList.remove('sobre'); const id = arrastando; arrastando = null; if (id) mover(id, col.dataset.cetapa); });
    });
  }

  function desenharCalendario() {
    const ano = mesCal.getFullYear(), mes = mesCal.getMonth(), primeiro = new Date(ano, mes, 1), dias = new Date(ano, mes + 1, 0).getDate(), h = hoje();
    let cel = '';
    for (let i = 0; i < primeiro.getDay(); i++) cel += '<div class="dia fora"></div>';
    for (let d = 1; d <= dias; d++) {
      const iso = paraISO(new Date(ano, mes, d)), doDia = itens.filter(c => c.data_publicacao === iso);
      cel += `<div class="dia ${iso === h ? 'hoje' : ''} ${iso < h ? 'passado' : ''}" data-cdia="${iso}"><span class="num">${d}</span>
        ${doDia.map(c => `<button class="ev ${c.etapa === 'postado' ? 'feito' : c.marca_id ? 'entrega' : 'followup'}" data-cabrir="${c.id}" title="${esc(c.titulo)}">${esc(c.titulo)}</button>`).join('')}</div>`;
    }
    const t = primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    $('#c-visao').innerHTML = `<div class="cartao calendario">
      <div class="cal-cab"><button class="cal-nav" data-cmes="-1" aria-label="Mês anterior">‹</button><h2>${t.charAt(0).toUpperCase() + t.slice(1)}</h2><button class="cal-nav" data-cmes="1" aria-label="Próximo mês">›</button></div>
      <div class="legenda"><span class="followup">Seu conteúdo</span><span class="entrega">Para marca</span><span class="feito">Postado</span></div>
      <p class="desc" style="text-align:center">Toque num dia vazio para planejar um conteúdo nele.</p>
      <div class="cal-grade">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(s => `<div class="sem">${s}</div>`).join('')}${cel}</div></div>`;
  }

  function desenharRoteiros() {
    const lista = itens.filter(temRoteiro).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    $('#c-visao').innerHTML = lista.length ? `<div class="textos">${lista.map(c => `
      <div class="cartao texto-card roteiro-card">
        <div class="fb-topo"><strong>${esc(c.titulo)}</strong>${c.roteiro_status ? `<span class="p-status ${STATUS_ROTEIRO[c.roteiro_status].cor}">${STATUS_ROTEIRO[c.roteiro_status].nome}</span>` : ''}</div>
        <div class="t-meta"><span class="chip">${esc(FORMATOS[c.formato] || c.formato)}</span>${c.marca_id ? `<span class="chip marca">💼 ${esc(nomeMarca(c.marca_id) || 'marca')}</span>` : '<span class="chip">🌸 Meu conteúdo</span>'}</div>
        ${c.gancho ? `<p class="gancho">“${esc(c.gancho)}”</p>` : ''}
        ${c.desenvolvimento ? `<p class="texto-previa">${esc(c.desenvolvimento)}</p>` : ''}
        <div class="atalhos"><button class="mini-btn" data-ccopiar="${c.id}">Copiar roteiro</button><button class="mini-btn" data-cabrir="${c.id}">Abrir</button></div>
      </div>`).join('')}</div>`
      : `<div class="cartao"><p class="vazio">Nenhum roteiro escrito ainda. Abra uma ideia e preencha gancho, desenvolvimento e chamada.</p></div>`;
  }

  // ===== Ficha =====
  function abrirFicha(c, dados) {
    const nova = !c;
    c = c || { etapa: 'ideia', plataforma: 'instagram', formato: 'reels', ...(dados || {}) };
    const ativas = marcas().filter(m => !['perdida'].includes(m.etapa));
    const m = c.marca_id && marcas().find(x => x.id === c.marca_id);
    const dlg = document.getElementById('ficha-marca');
    dlg.innerHTML = `<form class="ficha" novalidate>
      <header class="ficha-cab"><div><small>${nova ? 'Novo conteúdo' : esc(NOME_ETAPA[c.etapa])}</small><h2>${nova ? 'Qual é a ideia?' : esc(c.titulo)}</h2></div><button type="button" class="fechar" data-fechar aria-label="Fechar">×</button></header>
      <div class="ficha-corpo">
        <div class="faixa-erro" id="c-erro" hidden></div>
        <fieldset><legend>Conteúdo</legend>
          <label class="campo largo"><span>Título / ideia *</span><input name="titulo" maxlength="140" value="${esc(c.titulo || '')}" placeholder="Ex.: 3 erros que eu cometia no skincare"></label>
          <div class="cat-escolha">${Object.entries(FORMATOS).map(([k, v]) => `<label><input type="radio" name="formato" value="${k}" ${c.formato === k ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>
          <div class="grade-campos">
            <label class="campo"><span>Para quem?</span><select name="marca_id"><option value="">🌸 Meu conteúdo</option>${ativas.map(x => `<option value="${x.id}" ${c.marca_id === x.id ? 'selected' : ''}>💼 ${esc(x.nome)}</option>`).join('')}</select></label>
            <label class="campo"><span>Onde vai sair</span><select name="plataforma">${Object.entries(PLATAFORMAS).map(([k, v]) => `<option value="${k}" ${c.plataforma === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            <label class="campo"><span>Etapa</span><select name="etapa">${ETAPAS.map(e => `<option value="${e.id}" ${c.etapa === e.id ? 'selected' : ''}>${e.emoji} ${e.nome}</option>`).join('')}</select></label>
            <label class="campo"><span>Data de publicação / entrega</span><input type="date" name="data_publicacao" value="${c.data_publicacao || ''}"></label>
          </div>
        </fieldset>
        <fieldset><legend>Roteiro</legend>
          <label class="campo largo"><span>Gancho (os primeiros 3 segundos)</span><textarea name="gancho" rows="2" placeholder="A frase ou cena que faz a pessoa parar de rolar">${esc(c.gancho || '')}</textarea></label>
          <label class="campo largo"><span>Desenvolvimento</span><textarea name="desenvolvimento" rows="5" placeholder="Cenas, falas, mostra do produto, benefícios...">${esc(c.desenvolvimento || '')}</textarea></label>
          <label class="campo largo"><span>Chamada para ação</span><textarea name="cta" rows="2" placeholder="Ex.: Corre no link da bio / Comenta EU QUERO">${esc(c.cta || '')}</textarea></label>
          <div class="grade-campos" style="margin-top:12px">
            <label class="campo"><span>Status do roteiro</span><select name="roteiro_status"><option value="">Sem roteiro / só ideia</option>${Object.entries(STATUS_ROTEIRO).map(([k, v]) => `<option value="${k}" ${c.roteiro_status === k ? 'selected' : ''}>${v.nome}</option>`).join('')}</select></label>
            <label class="campo"><span>Referência (link)</span><input name="referencia" type="url" value="${esc(c.referencia || '')}" placeholder="Vídeo que te inspirou"></label>
          </div>
        </fieldset>
        <fieldset><legend>Legenda e anotações</legend>
          <label class="campo largo"><span>Legenda</span><textarea name="legenda" rows="3">${esc(c.legenda || '')}</textarea></label>
          <label class="campo largo"><span>Anotações</span><textarea name="notas" rows="2" placeholder="Look, cenário, props, música...">${esc(c.notas || '')}</textarea></label>
        </fieldset>
        ${!nova ? `<fieldset><legend>Atalhos</legend><div class="atalhos">
          <button type="button" class="mini-btn" data-copiar-este>Copiar roteiro</button>
          ${m && m.contato_whatsapp ? `<a class="mini-btn zap" target="_blank" rel="noopener" href="https://wa.me/${digitos(m.contato_whatsapp)}?text=${encodeURIComponent(`Oi! Segue o roteiro para aprovação:\n\n${textoRoteiro(c)}`)}">Enviar para a marca</a>` : ''}
          ${window.Tarefas ? '<button type="button" class="mini-btn" data-reservar>Reservar horário para gravar</button>' : ''}
          ${c.referencia ? `<a class="mini-btn" href="${esc(c.referencia)}" target="_blank" rel="noopener">Ver referência</a>` : ''}
        </div></fieldset>` : ''}
      </div>
      <footer class="ficha-rodape">${!nova ? '<button type="button" class="btn-perigo" data-excluir>Excluir</button>' : '<span></span>'}
        <div><button type="button" class="btn-secundario" data-fechar>Cancelar</button><button type="submit" class="btn-primario">${nova ? 'Guardar ✦' : 'Salvar'}</button></div></footer>
    </form>`;
    const f = dlg.querySelector('form');
    dlg.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.oncancel = null;
    // Escolheu uma marca? Já sugere "vídeo UGC" e "para a marca"
    f.marca_id.addEventListener('change', () => { if (f.marca_id.value && nova) { f.plataforma.value = 'marca'; const r = f.querySelector('input[value="video_ugc"]'); if (r) r.checked = true; } });
    // Escreveu o roteiro? Marca como rascunho e sobe a etapa
    ['gancho', 'desenvolvimento', 'cta'].forEach(n => f[n].addEventListener('input', () => {
      if (!f.roteiro_status.value && f[n].value.trim()) f.roteiro_status.value = 'rascunho';
      if (f.etapa.value === 'ideia' && f[n].value.trim()) f.etapa.value = 'roteiro';
    }));
    const cp = dlg.querySelector('[data-copiar-este]'); if (cp) cp.addEventListener('click', () => navigator.clipboard.writeText(textoRoteiro(c)).then(() => toast('Roteiro copiado ✦')));
    const rs = dlg.querySelector('[data-reservar]'); if (rs) rs.addEventListener('click', () => { dlg.close(); Tarefas.novaCom({ titulo: `Gravar: ${c.titulo}`, categoria: 'gravar', marca_id: c.marca_id }); });
    const exc = dlg.querySelector('[data-excluir]');
    if (exc) exc.addEventListener('click', async () => {
      if (!confirm('Excluir este conteúdo?')) return;
      const { error } = await sb.from('conteudos').delete().eq('id', c.id);
      if (error) return toast('Não consegui excluir agora.', true);
      itens = itens.filter(x => x.id !== c.id); dlg.close(); desenhar();
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titulo = f.titulo.value.trim();
      if (!titulo) { const el = dlg.querySelector('#c-erro'); el.textContent = 'Dê um título para a ideia.'; el.hidden = false; return f.titulo.focus(); }
      const t = (n) => f[n].value.trim() || null;
      const dados = { titulo, formato: f.formato.value || 'reels', marca_id: f.marca_id.value || null, plataforma: f.plataforma.value, etapa: f.etapa.value,
        data_publicacao: t('data_publicacao'), gancho: t('gancho'), desenvolvimento: t('desenvolvimento'), cta: t('cta'),
        roteiro_status: f.roteiro_status.value || null, referencia: t('referencia'), legenda: t('legenda'), notas: t('notas') };
      try { await salvar(nova ? null : c.id, dados); dlg.close(); desenhar(); toast(nova ? 'Ideia guardada ✦' : 'Salvo.'); }
      catch (err) { console.error(err); const el = dlg.querySelector('#c-erro'); el.textContent = 'Não consegui salvar agora.'; el.hidden = false; }
    });
    dlg.showModal();
    if (nova) setTimeout(() => f.titulo.focus(), 50);
  }

  function montar() {
    raiz.innerHTML = `
      <div class="marcas-barra"><p class="saudacao">Da ideia ao post, sem perder nada.</p><button class="btn-primario" data-cnovo>+ Nova ideia</button></div>
      <div class="numeros quatro" id="c-numeros"></div>
      <div class="marcas-ferramentas"><div class="visoes"><button class="vis-btn ativo" data-cvis="planner">Planner</button><button class="vis-btn" data-cvis="roteiros">Roteiros</button></div><button class="btn-secundario ver-agenda" data-ver-agenda="post">📅 Ver na Agenda</button></div>
      <div id="c-visao"><p class="carregando">Carregando seus conteúdos...</p></div>`;
    raiz.addEventListener('click', (e) => {
      const a = e.target.closest('[data-cnovo], [data-cvis], [data-cavancar], [data-cabrir], [data-ccopiar], [data-cmes], [data-cdia], .card-marca[data-cid]');
      if (!a) return;
      if (a.matches('[data-cnovo]')) return abrirFicha(null);
      if (a.matches('[data-cvis]')) { if (a.dataset.cvis === 'calendario' && window.Agenda) return Agenda.abrirEm('mes'); visao = a.dataset.cvis; return desenhar(); }
      if (a.matches('[data-cavancar]')) { e.stopPropagation(); return mover(a.dataset.cavancar, a.dataset.para); }
      if (a.matches('[data-cmes]')) { mesCal.setMonth(mesCal.getMonth() + Number(a.dataset.cmes)); return desenharCalendario(); }
      if (a.matches('[data-ccopiar]')) { const c = itens.find(x => x.id === a.dataset.ccopiar); return navigator.clipboard.writeText(textoRoteiro(c)).then(() => toast('Roteiro copiado ✦')); }
      if (a.matches('[data-cdia]') && !e.target.closest('.ev')) return abrirFicha(null, { data_publicacao: a.dataset.cdia });
      const c = itens.find(x => x.id === (a.dataset.cabrir || a.dataset.cid)); if (c) abrirFicha(c);
    });
  }

  window.Conteudo = {
    async iniciar(cliente, secao) {
      sb = cliente; raiz = secao; montar();
      try {
        let tudo = [], ini = 0;
        while (true) {
          const { data, error } = await sb.from('conteudos').select('*').order('created_at', { ascending: false }).range(ini, ini + 999);
          if (error) throw error; tudo = tudo.concat(data || []); if (!data || data.length < 1000) break; ini += 1000;
        }
        itens = tudo; carregado = true; desenhar();
      } catch (e) {
        console.error(e);
        $('#c-visao').innerHTML = `<div class="cartao"><p class="vazio">${/conteudos|relation|schema cache|PGRST205|42P01/i.test((e && (e.message + ' ' + e.code)) || '')
          ? 'A área de Conteúdo ainda não foi ativada no banco. Rode o arquivo conteudo.sql no Supabase e recarregue a página.'
          : 'Não consegui carregar seus conteúdos agora. Confira sua conexão e recarregue a página.'}</p></div>`;
      }
    },
    aoAbrir() { desenhar(); },
    lista: () => itens,
    // Usada pelo Assistente: abre "nova ideia" já preenchida
    abrir(id) { const c = itens.find(x => x.id === id); if (c) abrirFicha(c); },
    novaCom(dados) { document.querySelector('[data-tab="aba-conteudo"]').click(); abrirFicha(null, dados); }
  };
})();
