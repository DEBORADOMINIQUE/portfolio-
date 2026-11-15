/* =========================================================
   assistente.js · "✦ Assistente" do UGC Organized
   Cole uma conversa, e-mail ou briefing (ou mande um print):
   a IA entende e abre a ficha certa já preenchida para você
   só conferir e salvar. Chama a Edge Function "assistente".
   ========================================================= */
(function () {
  let sb, imagem = null, ultimo = null;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const ROTULOS = { prospeccao: '📸 Abordagem (Prospecção)', marca: '💼 Parceria (Marcas)', tarefa: '🗓️ Tarefa', conteudo: '🎬 Conteúdo', despesa: '🧾 Despesa', nada: '✦ Nada para registrar' };
  const NOMES_CAMPOS = { marca: 'Marca', instagram: 'Instagram', site: 'Site', nicho: 'Nicho', contato_nome: 'Contato', email: 'E-mail', whatsapp: 'WhatsApp', canal: 'Canal',
    entregaveis: 'Entregas', valor: 'Valor', prazo_dias: 'Prazo (dias)', data_entrega: 'Entregar até', data_publicacao: 'Publicar em', titulo: 'Título', categoria: 'Categoria',
    data: 'Dia', hora: 'Horário', duracao_min: 'Duração (min)', gancho: 'Gancho', desenvolvimento: 'Desenvolvimento', cta: 'Chamada', formato: 'Formato', descricao: 'Descrição', status: 'Status', notas: 'Anotações' };
  const valido = (v, lista) => lista.includes(v) ? v : undefined;
  const numero = (v) => { const n = Number(String(v || '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return isFinite(n) && n > 0 ? n : undefined; };
  const data = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : undefined;
  // Tira campos vazios para não apagar os valores padrão das fichas
  const limpo = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

  function toast(msg, erro) {
    let t = document.getElementById('toast-marcas');
    if (!t) { t = document.createElement('div'); t.id = 'toast-marcas'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast-m ativo' + (erro ? ' erro' : '');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('ativo'), 3000);
  }

  // Diminui o print antes de enviar (mais rápido e mais barato)
  function lerImagem(arquivo) {
    return new Promise((ok, falha) => {
      const img = new Image(), url = URL.createObjectURL(arquivo);
      img.onload = () => {
        const max = 1568, esc2 = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * esc2); c.height = Math.round(img.height * esc2);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        const dataUrl = c.toDataURL('image/jpeg', 0.85);
        ok({ media_type: 'image/jpeg', data: dataUrl.split(',')[1], previa: dataUrl });
      };
      img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('imagem')); };
      img.src = url;
    });
  }

  // Leva o que a IA entendeu para a ficha certa
  function abrirFicha(r) {
    const d = r.dados || {};
    document.getElementById('assistente-dlg').close();
    const canal = valido(d.canal, ['instagram', 'email', 'whatsapp', 'plataforma', 'linkedin', 'outro']);
    if (r.tipo === 'prospeccao' && window.Prospeccao) return Prospeccao.novaCom(limpo({ marca: d.marca, instagram: d.instagram, site: d.site, nicho: d.nicho, contato_nome: d.contato_nome, email: d.email, whatsapp: d.whatsapp, canal, status: valido(d.status, ['enviada', 'respondeu', 'aprovada', 'recusada']), data_abordagem: data(d.data), notas: d.notas }));
    if (r.tipo === 'marca' && window.Marcas) return Marcas.novaCom(limpo({ nome: d.marca, nicho: d.nicho, contato_nome: d.contato_nome, contato_email: d.email, contato_whatsapp: d.whatsapp, contato_instagram: d.instagram,
      canal: valido(d.canal, ['instagram', 'email', 'whatsapp', 'plataforma']), entregaveis: d.entregaveis, valor: numero(d.valor), prazo_dias: numero(d.prazo_dias) ? Math.round(numero(d.prazo_dias)) : undefined, data_entrega: data(d.data_entrega), notas: d.notas }));
    if (r.tipo === 'tarefa' && window.Tarefas) return Tarefas.novaCom(limpo({ titulo: d.titulo, categoria: valido(d.categoria, ['roteiro', 'gravar', 'editar', 'postar', 'marca', 'prospectar', 'admin', 'pessoal', 'outro']), data: data(d.data), hora: /^\d{2}:\d{2}$/.test(d.hora || '') ? d.hora : undefined, duracao_min: numero(d.duracao_min) ? Math.round(numero(d.duracao_min)) : undefined, notas: d.notas }));
    if (r.tipo === 'conteudo' && window.Conteudo) {
      const m = d.marca && window.Marcas ? Marcas.lista().find(x => x.nome.toLowerCase() === d.marca.toLowerCase()) : null;
      return Conteudo.novaCom(limpo({ titulo: d.titulo || d.marca, formato: valido(d.formato, ['reels', 'carrossel', 'story', 'foto', 'video_ugc', 'live', 'video_longo']), gancho: d.gancho, desenvolvimento: d.desenvolvimento, cta: d.cta, data_publicacao: data(d.data_publicacao) || data(d.data), notas: d.notas, marca_id: m ? m.id : undefined, plataforma: m ? 'marca' : undefined }));
    }
    if (r.tipo === 'despesa' && window.Financeiro) return Financeiro.novaCom(limpo({ descricao: d.descricao || d.titulo, valor: numero(d.valor), data: data(d.data) }));
    toast('Não encontrei onde registrar isso.', true);
  }

  async function processar() {
    const dlg = document.getElementById('assistente-dlg');
    const texto = dlg.querySelector('#as-texto').value.trim();
    if (!texto && !imagem) return toast('Cole um texto ou envie um print.', true);
    const btn = dlg.querySelector('#as-ir'), res = dlg.querySelector('#as-resultado');
    btn.disabled = true; btn.textContent = 'Lendo... ✦';
    res.innerHTML = '<div class="as-pensando"><span></span><span></span><span></span></div>';
    try {
      const { data: r, error } = await sb.functions.invoke('bright-endpoint', { body: { texto, imagem: imagem && { media_type: imagem.media_type, data: imagem.data }, hoje: hoje() } });
      if (error) {
        let msg = 'O assistente ainda não está ativado. Siga os passos de configuração.';
        try { const corpo = await error.context.json(); if (corpo && corpo.erro) msg = corpo.erro; } catch (e) {}
        throw new Error(msg);
      }
      ultimo = r;
      const campos = Object.entries(r.dados || {}).filter(([, v]) => v);
      res.innerHTML = `<div class="as-card">
        <div class="as-tipo">${ROTULOS[r.tipo] || r.tipo}</div>
        <p class="as-resumo">${esc(r.resumo)}</p>
        ${campos.length ? `<dl class="as-campos">${campos.map(([k, v]) => `<dt>${NOMES_CAMPOS[k] || k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
        ${r.tipo !== 'nada' ? '<button class="btn-primario" id="as-abrir">Abrir a ficha preenchida ✦</button><small class="desc">Você confere e salva. Nada é salvo sem você.</small>' : ''}
      </div>`;
      const ab = res.querySelector('#as-abrir'); if (ab) ab.addEventListener('click', () => abrirFicha(ultimo));
    } catch (e) {
      res.innerHTML = `<div class="faixa-erro">${esc(e.message || 'Não consegui agora. Tente de novo.')}</div>`;
    } finally { btn.disabled = false; btn.textContent = 'Preencher ✦'; }
  }

  function abrir() {
    const dlg = document.getElementById('assistente-dlg');
    imagem = null;
    dlg.innerHTML = `<div class="ficha">
      <header class="ficha-cab"><div><small>Raquel · sua assistente ✦</small><h2>Oi, ${window.Tarefas ? Tarefas.nome() : G.apelido()}! Sou a Raquel. O que aconteceu?</h2></div><button type="button" class="fechar" data-fechar aria-label="Fechar">×</button></header>
      <div class="ficha-corpo">
        <p class="desc" style="margin-top:12px">Cole a conversa com a marca, o e-mail, o briefing, ou só escreva do seu jeito ("abordei a Sallve pelo direct", "gravar o reels da Kaisan sexta às 14h", "comprei um microfone de 189"). Eu entendo e preencho a ficha certa.</p>
        <label class="campo largo"><textarea id="as-texto" rows="7" placeholder="Cole ou escreva aqui..."></textarea></label>
        <div class="as-print">
          <label class="mini-btn"><input type="file" id="as-arquivo" accept="image/*" hidden>📷 Enviar print</label>
          <div id="as-previa"></div>
        </div>
        <div id="as-resultado"></div>
      </div>
      <footer class="ficha-rodape"><span></span><div><button type="button" class="btn-secundario" data-fechar>Fechar</button><button type="button" class="btn-primario" id="as-ir">Preencher ✦</button></div></footer>
    </div>`;
    dlg.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.querySelector('#as-ir').addEventListener('click', processar);
    dlg.querySelector('#as-texto').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) processar(); });
    dlg.querySelector('#as-arquivo').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        imagem = await lerImagem(f);
        dlg.querySelector('#as-previa').innerHTML = `<div class="as-mini"><img src="${imagem.previa}" alt="Print enviado"><button type="button" aria-label="Tirar print">×</button></div>`;
        dlg.querySelector('.as-mini button').onclick = () => { imagem = null; dlg.querySelector('#as-previa').innerHTML = ''; };
      } catch (x) { toast('Não consegui abrir essa imagem.', true); }
    });
    // Colar um print direto (Cmd+V) também funciona
    dlg.addEventListener('paste', async (e) => {
      const item = [...(e.clipboardData || {}).items || []].find(i => i.type.startsWith('image/'));
      if (!item) return;
      e.preventDefault();
      imagem = await lerImagem(item.getAsFile());
      dlg.querySelector('#as-previa').innerHTML = `<div class="as-mini"><img src="${imagem.previa}" alt="Print colado"><button type="button" aria-label="Tirar print">×</button></div>`;
      dlg.querySelector('.as-mini button').onclick = () => { imagem = null; dlg.querySelector('#as-previa').innerHTML = ''; };
    });
    dlg.showModal();
    setTimeout(() => dlg.querySelector('#as-texto').focus(), 50);
  }

  window.Assistente = {
    iniciar(cliente) {
      sb = cliente;
      // O assistente NÃO faz parte do plano vendido: só aparece para contas liberadas
      // no banco (preferencias.dados.assistente_ia = true). O servidor confere de novo.
      const esperar = (n = 0) => {
        if (window.Tarefas && Tarefas.pronto()) { if (Tarefas.prefs().assistente_ia === true) montar(); return; }
        if (n < 40) setTimeout(() => esperar(n + 1), 300);
      };
      esperar();
    }
  };
  function montar() {
      const d = document.createElement('dialog'); d.id = 'assistente-dlg'; d.className = 'dialogo-ficha'; document.body.appendChild(d);
      const b = document.createElement('button'); b.className = 'assistente-fab'; b.innerHTML = '<span>✦</span> Raquel'; b.setAttribute('aria-label', 'Falar com a Raquel, sua assistente');
      b.addEventListener('click', abrir); document.body.appendChild(b);
  }
})();
