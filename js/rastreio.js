/* =========================================================
   rastreio.js · Envia os números do portfólio para o meu.painel
   Grava visitas, cliques, vídeos e mensagens no Supabase.
   Usa só fetch (sem biblioteca), então não pesa no site.
   ========================================================= */
(function () {
  const URL_BASE = 'https://bquukmknxikfbkgqyxxh.supabase.co/rest/v1/';
  const CHAVE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxdXVrbWtueGlrZmJrZ3F5eHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NjM3MTcsImV4cCI6MjEwNzMzOTcxN30.1TJ0aFr7ednSGJ886ZUcNGdjA69-tVhWOFoOxObQN-k';

  // Não conta as suas próprias visitas: se este navegador está logado no painel, nada é enviado.
  // Também não conta testes no computador.
  let ignorar = ['localhost', '127.0.0.1', ''].includes(location.hostname);
  try { if (localStorage.getItem('sb-bquukmknxikfbkgqyxxh-auth-token')) ignorar = true; } catch (e) {}

  // Um código por visita (some quando a pessoa fecha a aba). Serve para contar visitantes únicos.
  let sessao = '';
  try {
    sessao = sessionStorage.getItem('dd_sessao') || '';
    if (!sessao) { sessao = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('dd_sessao', sessao); }
  } catch (e) { sessao = Math.random().toString(36).slice(2); }

  function gravar(tabela, linha) {
    if (ignorar) return Promise.resolve();
    return fetch(URL_BASE + tabela, {
      method: 'POST',
      keepalive: true, // continua enviando mesmo se a pessoa sair da página (ex.: abriu o WhatsApp)
      headers: { apikey: CHAVE, Authorization: 'Bearer ' + CHAVE, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(linha)
    }).catch(() => {}); // se falhar, o site segue normal
  }

  function evento(tipo, nome, metadata) {
    return gravar('portfolio_events', {
      event_type: tipo,
      event_name: String(nome || '').slice(0, 120),
      session_id: sessao,
      page_path: location.pathname,
      metadata: metadata || {}
    });
  }

  // "Pedir uma proposta ↓" vira "pedir_uma_proposta"
  function nomeDoBotao(el) {
    const base = el.id || el.getAttribute('aria-label') || el.textContent || 'botao';
    return base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/([a-z])([A-Z])/g, '$1_$2')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'botao';
  }

  // Cliques: um ouvinte só para a página inteira
  document.addEventListener('click', function (e) {
    const el = e.target.closest('a, button');
    if (!el || el.dataset.video !== undefined || el.id === 'casalVideo') return; // vídeos são contados à parte
    if (el.type === 'submit') return; // o envio do formulário é contado no envio
    const href = (el.getAttribute('href') || '').toLowerCase();
    let nome;
    if (href.includes('wa.me') || href.includes('whatsapp')) nome = 'contact_whatsapp';
    else if (href.startsWith('mailto:')) nome = 'contact_email';
    else if (href.includes('instagram.com')) nome = 'contact_instagram';
    else nome = (el.closest('#menu') ? 'menu_' : '') + nomeDoBotao(el);
    const sec = el.closest('section[id], header[id], footer[id], nav[id], [data-secao]');
    evento('button_click', nome, { label: (el.getAttribute('aria-label') || el.textContent || '').replace(/[↗↓→]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80), href: href.slice(0, 200), secao: el.id || (sec && (sec.dataset.secao || sec.id)) || '' });
  }, true);

  window.Rastreio = {
    // Chamado quando um vídeo abre
    video(id, titulo, card) {
      const meta = { title: titulo || '' };
      if (card && card.dataset && card.dataset.categoria) meta.category = card.dataset.categoria;
      evento('video_view', id, meta);
    },
    // Chamado quando o formulário de contato é enviado
    mensagem(dados) {
      evento('button_click', 'contact_form_submit');
      return gravar('portfolio_leads', {
        name: (dados.nome || '').slice(0, 200),
        email: (dados.email || '').slice(0, 200),
        phone: (dados.telefone || '').slice(0, 40),
        brand: (dados.marca || '').slice(0, 200) || null,
        budget: (dados.verba || '').slice(0, 100) || null,
        message: (dados.mensagem || '').slice(0, 5000),
        source: dados.origem || 'contact'
      });
    }
  };

  // Visita
  evento('page_view', 'page_view', { title: document.title.slice(0, 120), ref: document.referrer.slice(0, 200) });
})();
