/* =========================================================
   simulador.js · Área "Simulador" do UGC Organized
   Monta o orçamento com a SUA tabela de preços (referência e
   mínimo), soma licenças e extras e mostra o que cabe na verba.
   Os preços ficam nas preferências da usuária (banco), nunca no código.
   ========================================================= */
(function () {
  const TIPOS = { unidade: 'Por unidade', por_conteudo: 'Por conteúdo', percentual: '% sobre o total' };
  // Itens iniciais SEM valor: cada criadora coloca os próprios preços
  const PADRAO = [
    { id: 'video', nome: 'Vídeo UGC', tipo: 'unidade', conteudo: true, ref: null, min: null },
    { id: 'foto', nome: 'Foto UGC', tipo: 'unidade', conteudo: true, ref: null, min: null },
    { id: 'collab', nome: 'Collab', tipo: 'unidade', conteudo: true, ref: null, min: null },
    { id: 'uso', nome: 'Direito de uso estendido', tipo: 'por_conteudo', ref: null, min: null },
    { id: 'anuncio30', nome: 'Licença de anúncio 30 dias', tipo: 'por_conteudo', ref: null, min: null },
    { id: 'exclusividade', nome: 'Exclusividade', tipo: 'percentual', ref: null, min: null },
    { id: 'ganchos', nome: 'Gancho extra', tipo: 'unidade', conteudo: false, ref: null, min: null },
    { id: 'brutos', nome: 'Arquivos brutos', tipo: 'unidade', conteudo: false, ref: null, min: null }
  ];
  // ===== Níveis de UGC: vídeo "a partir de" (definido pela Débora): 250 / 350 / 450 / 550 =====
  // Base = preço do vídeo UGC por nível; os outros itens são proporções do vídeo.
  const NIVEIS = {
    iniciante:     { nome: 'Iniciante',     desc: 'Até 5 trabalhos pagos, portfólio ainda em construção.', video: 250, pisoVideo: 250 },
    intermediaria: { nome: 'Intermediária', desc: 'De 6 a 20 trabalhos, já tem marcas no portfólio.', video: 350, pisoVideo: 350 },
    avancada:      { nome: 'Avançada',      desc: 'Mais de 20 trabalhos, marcas que voltam, vídeos rodando em anúncio.', video: 450, pisoVideo: 450 },
    referencia:    { nome: 'Referência',    desc: 'Trabalha com marcas grandes e tem resultados comprovados.', video: 550, pisoVideo: 550 }
  };
  const PROPORCOES = [
    { id: 'video', nome: 'Vídeo UGC', tipo: 'unidade', conteudo: true, x: 1 },
    { id: 'foto', nome: 'Foto UGC', tipo: 'unidade', conteudo: true, x: 0.2 },
    { id: 'collab', nome: 'Collab', tipo: 'unidade', conteudo: true, x: 2 },
    { id: 'casal', nome: 'Vídeo em casal', tipo: 'unidade', conteudo: true, x: 1.7 },   // vídeo + ~70% pela segunda pessoa
    { id: 'ganchos', nome: 'Gancho extra', tipo: 'unidade', conteudo: false, x: 0.15 },
    { id: 'brutos', nome: 'Arquivos brutos', tipo: 'unidade', conteudo: false, x: 0.3 },
    { id: 'uso', nome: 'Direito de uso estendido', tipo: 'por_conteudo', x: 0.5 },
    { id: 'anuncio30', nome: 'Licença de anúncio 30 dias', tipo: 'por_conteudo', x: 0.6 },
    { id: 'anuncio60', nome: 'Licença de anúncio 60 dias', tipo: 'por_conteudo', x: 0.85 },
    { id: 'anuncio90', nome: 'Licença de anúncio 90 dias', tipo: 'por_conteudo', x: 1 },
    { id: 'exclusividade', nome: 'Exclusividade', tipo: 'percentual', pct: 30 }
  ];
  const arred = (v) => v >= 100 ? Math.round(v / 10) * 10 : Math.max(5, Math.round(v / 5) * 5);
  const nivel = () => (window.Tarefas && Tarefas.prefs().nivel_ugc) || null;
  function sugerido(id) {
    const n = NIVEIS[nivel()], p = PROPORCOES.find(x => x.id === id);
    if (!n || !p) return null;
    if (p.tipo === 'percentual') return { ref: p.pct, min: p.pct };
    const ref = arred(n.video * p.x);
    // Piso do nível: o vídeo nunca é sugerido abaixo do "a partir de"
    const min = id === 'video' && n.pisoVideo ? Math.max(arred(ref * 0.75), n.pisoVideo) : arred(ref * 0.75);
    return { ref, min };
  }
  // Preço que entra na conta: o seu; se você não tem, o sugerido do seu nível
  function efetivo(i) {
    if (temPreco(i)) return i;
    const sg = sugerido(i.id);
    return sg ? { ...i, ref: sg.ref, min: sg.min, sugerido: true } : i;
  }
  // Lista completa: seus itens + os itens sugeridos que você ainda não tem
  function itensComSugestoes() {
    const meus = precos(), ids = new Set(meus.map(i => i.id));
    const extras = nivel() ? PROPORCOES.filter(p => !ids.has(p.id)).map(p => ({ id: p.id, nome: p.nome, tipo: p.tipo, conteudo: p.conteudo, ref: null, min: null })) : [];
    return meus.concat(extras).map(efetivo);
  }

  let raiz, qtd = {}, proposta = '', verba = '';

  const $ = (s, el) => (el || raiz).querySelector(s);
  const $$ = (s, el) => [...(el || raiz).querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const moeda = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: Number(n) % 1 ? 2 : 0 });
  const lerValor = (v) => { const b = String(v ?? '').trim().replace(/[R$\s%]/g, ''); if (!b) return null; const n = Number(b.includes(',') ? b.replace(/\./g, '').replace(',', '.') : b); return isFinite(n) ? n : NaN; };
  const precos = () => { const p = window.Tarefas && Tarefas.prefs().precos; return Array.isArray(p) && p.length ? p : PADRAO; };
  const temPreco = (i) => i.ref != null && i.ref !== '';

  function toast(msg, erro) {
    let t = document.getElementById('toast-marcas');
    if (!t) { t = document.createElement('div'); t.id = 'toast-marcas'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast-m ativo' + (erro ? ' erro' : '');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('ativo'), 2800);
  }

  // Soma o orçamento: unidades, depois "por conteúdo", depois os percentuais
  function calcular(q) {
    const itens = itensComSugestoes();
    let ref = 0, min = 0, conteudos = 0, linhas = [], faltaPreco = [];
    itens.filter(i => i.tipo === 'unidade').forEach(i => {
      const n = q[i.id] || 0; if (!n) return;
      if (!temPreco(i)) { faltaPreco.push(i.nome); return; }
      ref += n * i.ref; min += n * (i.min ?? i.ref); if (i.conteudo) conteudos += n;
      linhas.push({ nome: i.nome, n, ref: n * i.ref });
    });
    itens.filter(i => i.tipo === 'por_conteudo').forEach(i => {
      if (!q[i.id]) return;
      if (!temPreco(i)) { faltaPreco.push(i.nome); return; }
      ref += conteudos * i.ref; min += conteudos * (i.min ?? i.ref);
      linhas.push({ nome: `${i.nome} (${conteudos} ${conteudos === 1 ? 'conteúdo' : 'conteúdos'})`, n: conteudos, ref: conteudos * i.ref });
    });
    const baseRef = ref, baseMin = min;
    itens.filter(i => i.tipo === 'percentual').forEach(i => {
      if (!q[i.id]) return;
      if (!temPreco(i)) { faltaPreco.push(i.nome); return; }
      ref += baseRef * i.ref / 100; min += baseMin * (i.min ?? i.ref) / 100;
      linhas.push({ nome: `${i.nome} (+${i.ref}%)`, n: 1, ref: baseRef * i.ref / 100 });
    });
    return { ref, min, conteudos, linhas, faltaPreco };
  }

  // O que cabe na verba (pelo preço de referência): testa combinações dos conteúdos
  function cabeNaVerba(v) {
    const base = itensComSugestoes().filter(i => i.tipo === 'unidade' && i.conteudo && temPreco(i) && Number(i.ref) > 0).slice(0, 4);
    if (!base.length) return [];
    const opcoes = [];
    const tentar = (idx, atual) => {
      if (idx === base.length) {
        const total = base.reduce((s, it, k) => s + atual[k] * it.ref, 0);
        if (total > 0 && total <= v) opcoes.push({ q: atual.slice(), total });
        return;
      }
      for (let n = 0; n <= 6; n++) { atual[idx] = n; tentar(idx + 1, atual); }
    };
    tentar(0, []);
    // Mais perto da verba primeiro; empate: prefere os serviços do topo da sua lista (os principais)
    const peso = (o) => o.q.reduce((s, x, k) => s + x * Math.pow(10, k), 0);
    opcoes.sort((a, b) => b.total - a.total || peso(a) - peso(b));
    // Até 3 opções diferentes, com valor mais próximo da verba
    const vistos = new Set(), saida = [];
    for (const o of opcoes) {
      const txt = base.map((it, k) => o.q[k] ? `${o.q[k]} ${it.nome}` : '').filter(Boolean).join(' + ');
      if (vistos.has(txt)) continue; vistos.add(txt); saida.push({ txt, total: o.total, q: Object.fromEntries(base.map((it, k) => [it.id, o.q[k]])) });
      if (saida.length === 3) break;
    }
    return saida;
  }

  function resumoTexto(c) {
    const entregas = c.linhas.map(l => `• ${l.n > 1 && !/\(/.test(l.nome) ? l.n + 'x ' : ''}${l.nome}`).join('\n');
    return `Proposta de conteúdo UGC\n\n${entregas}\n\nInvestimento: ${moeda(lerValor(proposta) || c.ref)}`;
  }

  // ===== Desenho =====
  function cartaoNivel() {
    const n = nivel(), sv = sugerido('video');
    return `<div class="cartao nivel-card">
      <div class="nivel-topo"><div><h2>Seu nível de UGC</h2><p class="desc">Os valores sugeridos mudam conforme o nível que você se considera. Seus preços cadastrados sempre vêm primeiro.</p></div>
      ${n ? '<button class="mini-btn" data-usar-sugeridos>Usar os sugeridos como meus preços</button>' : ''}</div>
      <div class="nivel-chips">${Object.entries(NIVEIS).map(([k, v]) => `<button class="${n === k ? 'ativo' : ''}" data-nivel="${k}">${v.nome}</button>`).join('')}</div>
      ${n ? `<p class="nivel-desc">${NIVEIS[n].desc} Vídeo UGC sugerido: <b>${moeda(sv.ref)}</b> (mínimo ${moeda(sv.min)}). Vídeo em casal: vídeo + <b>${moeda(sugerido('casal').ref - sv.ref)}</b>.</p>` : '<p class="nivel-desc">Escolha o nível que mais combina com você agora. Dá para mudar quando quiser.</p>'}
      <small class="desc">São sugestões para você ter um ponto de partida, não regra: seu nicho, sua entrega e seus resultados também contam.</small>
    </div>`;
  }

  function desenhar() {
    const itens = itensComSugestoes(), semPreco = itens.every(i => !temPreco(i));
    if (semPreco) {
      raiz.querySelector('#s-conteudo').innerHTML = cartaoNivel() + `<div class="cartao vazio-grande"><h2>Escolha seu nível ou cadastre seus preços ✦</h2>
        <p>Com o nível, eu já sugiro valores de mercado. Se preferir, coloque os seus. Eles ficam guardados só para você, protegidos pelo seu login.</p>
        <button class="btn-secundario" data-editar-precos>Cadastrar meus preços</button></div>`;
      return;
    }
    const c = calcular(qtd), p = lerValor(proposta), v = lerValor(verba);
    let situacao = '';
    if (p > 0 && c.ref > 0) {
      if (p < c.min) situacao = `<div class="previa-prazo atraso">⚠ Abaixo do seu mínimo (${moeda(c.min)}). Em vez de baixar o preço, que tal tirar uma entrega? Veja "Cabe na verba" ao lado.</div>`;
      else if (p < c.ref) situacao = `<div class="previa-prazo alerta">Dentro da sua margem: ${moeda(c.ref - p)} abaixo da referência, mas acima do mínimo.</div>`;
      else situacao = `<div class="previa-prazo ok">Arrasou: no valor de referência ou acima ✦</div>`;
    }
    const grupos = [['unidade', 'Conteúdos e serviços'], ['por_conteudo', 'Licenças e uso de imagem'], ['percentual', 'Adicionais']];
    raiz.querySelector('#s-conteudo').innerHTML = cartaoNivel() + `
      <div class="simulador">
        <div class="cartao s-itens">
          ${grupos.map(([tipo, titulo]) => { const lista = itens.filter(i => i.tipo === tipo); if (!lista.length) return '';
            return `<h2>${titulo}</h2><div class="s-lista">${lista.map(i => {
              const ativo = qtd[i.id] > 0, sg = sugerido(i.id);
              let preco = temPreco(i) ? (tipo === 'percentual' ? `+${i.ref}%` : moeda(i.ref) + (tipo === 'por_conteudo' ? ' / conteúdo' : '')) : 'sem preço';
              if (i.sugerido) preco += ' · sugestão';
              else if (sg && temPreco(i) && tipo !== 'percentual' && Math.abs(sg.ref - i.ref) >= 10) preco += ` · sugestão: ${moeda(sg.ref)}`;
              return `<div class="s-item ${ativo ? 'ativo' : ''} ${temPreco(i) ? '' : 'sem-preco'}">
                <div><strong>${esc(i.nome)}</strong><small>${preco}${temPreco(i) && i.min != null && i.min !== i.ref && tipo !== 'percentual' && !i.sugerido ? ` · mín. ${moeda(i.min)}` : ''}</small></div>
                ${tipo === 'unidade'
                  ? `<div class="stepper"><button data-menos="${i.id}" aria-label="Menos ${esc(i.nome)}">−</button><span>${qtd[i.id] || 0}</span><button data-mais="${i.id}" aria-label="Mais ${esc(i.nome)}">+</button></div>`
                  : `<label class="switch"><input type="checkbox" data-liga="${i.id}" ${ativo ? 'checked' : ''}><span></span></label>`}
              </div>`; }).join('')}</div>`; }).join('')}
          <button class="link-precos" data-editar-precos>✎ Editar meus preços</button>
        </div>
        <div class="s-lado">
          <div class="cartao s-total">
            <div class="rotulo">Valor de referência</div>
            <div class="s-ref">${moeda(c.ref)}</div>
            <div class="s-min">Seu mínimo: <b>${moeda(c.min)}</b></div>
            ${c.linhas.length ? `<ul class="s-resumo">${c.linhas.map(l => `<li><span>${l.n > 1 && !/\(/.test(l.nome) ? l.n + 'x ' : ''}${esc(l.nome)}</span><b>${moeda(l.ref)}</b></li>`).join('')}</ul>` : '<p class="desc">Toque no + dos itens para montar a proposta.</p>'}
            ${c.faltaPreco.length ? `<p class="aviso-nf">Sem preço cadastrado: ${c.faltaPreco.map(esc).join(', ')}. Não entrou na conta.</p>` : ''}
            <label class="campo"><span>Valor que você vai propor</span><input id="s-proposta" inputmode="decimal" value="${esc(proposta)}" placeholder="${c.ref ? String(c.ref).replace('.', ',') : '0,00'}"></label>
            ${situacao}
            <div class="atalhos s-acoes">
              <button class="mini-btn" data-copiar ${c.linhas.length ? '' : 'disabled'}>Copiar proposta</button>
              <button class="mini-btn zap" data-criar-marca ${c.linhas.length ? '' : 'disabled'}>Criar marca com esse valor</button>
              <button class="mini-btn" data-limpar>Limpar</button>
            </div>
          </div>
          <div class="cartao s-verba">
            <h2>Cabe na verba</h2>
            <p class="desc">A marca disse quanto tem? Eu mostro o que entregar sem baixar o seu preço.</p>
            <label class="campo"><span>Verba da marca (R$)</span><input id="s-verba" inputmode="decimal" value="${esc(verba)}" placeholder="Ex.: 800"></label>
            <div id="s-opcoes">${v > 0 ? (() => { const ops = cabeNaVerba(v);
              return ops.length ? ops.map(o => `<button class="s-opcao" data-usar='${esc(JSON.stringify(o.q))}'><span>${esc(o.txt)}</span><b>${moeda(o.total)}</b></button>`).join('') + '<small class="desc">Toque numa opção para montar a proposta com ela.</small>'
                : '<p class="desc">Essa verba não cobre nem uma entrega no seu preço de referência. Vale apresentar seu menor pacote.</p>'; })() : ''}</div>
          </div>
        </div>
      </div>`;
  }

  // ===== Editar preços =====
  function abrirPrecos() {
    let lista = JSON.parse(JSON.stringify(precos()));
    const dlg = document.getElementById('ficha-marca');
    const linha = (i, k) => `<div class="p-linha" data-k="${k}">
      <input class="p-nome-in" value="${esc(i.nome)}" placeholder="Nome do serviço" aria-label="Nome">
      <select aria-label="Como cobra">${Object.entries(TIPOS).map(([t, n]) => `<option value="${t}" ${i.tipo === t ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <input class="p-val" data-c="ref" inputmode="decimal" value="${i.ref ?? ''}" placeholder="Referência" aria-label="Referência">
      <input class="p-val" data-c="min" inputmode="decimal" value="${i.min ?? ''}" placeholder="Mínimo" aria-label="Mínimo">
      <label class="p-conteudo" title="Conta como conteúdo (para licenças por conteúdo)"><input type="checkbox" ${i.conteudo ? 'checked' : ''}> conteúdo</label>
      <button type="button" class="p-remover" aria-label="Remover">×</button>
    </div>`;
    dlg.innerHTML = `<form class="ficha" novalidate>
      <header class="ficha-cab"><div><small>Simulador</small><h2>Meus preços</h2></div><button type="button" class="fechar" data-fechar aria-label="Fechar">×</button></header>
      <div class="ficha-corpo">
        <p class="desc" style="margin-top:12px">Referência é o preço que você apresenta. Mínimo é até onde você aceita negociar. "Conteúdo" marca o que conta para as licenças cobradas por conteúdo. Em "% sobre o total", coloque só o número (ex.: 30).</p>
        <div class="p-tabela" id="p-tabela">${lista.map(linha).join('')}</div>
        <button type="button" class="add-coluna" data-add>+ Adicionar serviço</button>
      </div>
      <footer class="ficha-rodape"><span></span><div><button type="button" class="btn-secundario" data-fechar>Cancelar</button><button type="submit" class="btn-primario">Salvar preços</button></div></footer>
    </form>`;
    const f = dlg.querySelector('form'), tab = dlg.querySelector('#p-tabela');
    dlg.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.oncancel = null;
    dlg.querySelector('[data-add]').addEventListener('click', () => { tab.insertAdjacentHTML('beforeend', linha({ nome: '', tipo: 'unidade', conteudo: true }, Date.now())); tab.lastElementChild.querySelector('input').focus(); });
    tab.addEventListener('click', (e) => { if (e.target.matches('.p-remover')) e.target.closest('.p-linha').remove(); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const novos = [];
      for (const el of tab.querySelectorAll('.p-linha')) {
        const nome = el.querySelector('.p-nome-in').value.trim(); if (!nome) continue;
        const ref = lerValor(el.querySelector('[data-c="ref"]').value), min = lerValor(el.querySelector('[data-c="min"]').value);
        if (Number.isNaN(ref) || Number.isNaN(min)) return toast(`Confira os valores de "${nome}".`, true);
        const antigo = lista.find(x => x.nome === nome);
        novos.push({ id: (antigo && antigo.id) || nome.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_'), nome, tipo: el.querySelector('select').value,
          conteudo: el.querySelector('.p-conteudo input').checked, ref, min: min ?? ref });
      }
      try { await Tarefas.salvarPrefsParcial({ precos: novos }); dlg.close(); qtd = {}; desenhar(); toast('Preços salvos ✦'); }
      catch (err) { console.error(err); toast('Não consegui salvar agora.', true); }
    });
    dlg.showModal();
  }

  // Troca os seus preços pelos sugeridos do nível (pacotes e itens só seus continuam)
  async function usarSugeridos() {
    if (!confirm(`Trocar os seus preços pelos sugeridos do nível ${NIVEIS[nivel()].nome}? Pacotes e serviços que só você tem continuam como estão.`)) return;
    // Sem preços salvos ainda (lista padrão): começa do zero; senão, parte dos seus
    const meus = precos() === PADRAO ? [] : precos().map(i => ({ ...i }));
    PROPORCOES.forEach(p => {
      const sg = sugerido(p.id), j = meus.findIndex(i => i.id === p.id);
      const item = { id: p.id, nome: p.nome, tipo: p.tipo, conteudo: p.conteudo, ref: sg.ref, min: sg.min };
      if (j >= 0) meus[j] = { ...meus[j], ref: sg.ref, min: sg.min }; else meus.push(item);
    });
    try { await Tarefas.salvarPrefsParcial({ precos: meus }); qtd = {}; desenhar(); toast('Preços atualizados com os sugeridos ✦'); }
    catch (e) { console.error(e); toast('Não consegui salvar agora.', true); }
  }

  function montar() {
    raiz.innerHTML = `<div class="marcas-barra"><p class="saudacao">Preço certo, sem medo de cobrar.</p></div><div id="s-conteudo"><p class="carregando">Carregando seus preços...</p></div>`;
    raiz.addEventListener('click', (e) => {
      const a = e.target.closest('[data-mais], [data-menos], [data-editar-precos], [data-copiar], [data-criar-marca], [data-limpar], [data-usar], [data-nivel], [data-usar-sugeridos]');
      if (!a) return;
      if (a.matches('[data-nivel]')) return Tarefas.salvarPrefsParcial({ nivel_ugc: a.dataset.nivel }).then(() => { desenhar(); toast(`Nível: ${NIVEIS[a.dataset.nivel].nome} ✦`); }, () => toast('Não consegui salvar agora.', true));
      if (a.matches('[data-usar-sugeridos]')) return usarSugeridos();
      if (a.matches('[data-mais]')) { qtd[a.dataset.mais] = (qtd[a.dataset.mais] || 0) + 1; return desenhar(); }
      if (a.matches('[data-menos]')) { qtd[a.dataset.menos] = Math.max(0, (qtd[a.dataset.menos] || 0) - 1); return desenhar(); }
      if (a.matches('[data-editar-precos]')) return abrirPrecos();
      if (a.matches('[data-limpar]')) { qtd = {}; proposta = ''; verba = ''; return desenhar(); }
      if (a.matches('[data-usar]')) { const extras = Object.fromEntries(Object.entries(qtd).filter(([k]) => precos().find(i => i.id === k && i.tipo !== 'unidade'))); qtd = { ...JSON.parse(a.dataset.usar), ...extras }; proposta = ''; return desenhar(); }
      const c = calcular(qtd);
      if (a.matches('[data-copiar]')) return navigator.clipboard.writeText(resumoTexto(c)).then(() => toast('Proposta copiada (sem o seu mínimo) ✦'), () => toast('Não consegui copiar.', true));
      if (a.matches('[data-criar-marca]') && window.Marcas) Marcas.novaCom({ entregaveis: c.linhas.map(l => `${l.n > 1 && !/\(/.test(l.nome) ? l.n + 'x ' : ''}${l.nome}`).join(' + '), valor: lerValor(proposta) || c.ref });
    });
    raiz.addEventListener('change', (e) => { if (e.target.matches('[data-liga]')) { qtd[e.target.dataset.liga] = e.target.checked ? 1 : 0; desenhar(); } });
    // Campos de texto: guarda o valor e redesenha sem perder o cursor
    raiz.addEventListener('input', (e) => {
      if (e.target.id !== 's-proposta' && e.target.id !== 's-verba') return;
      if (e.target.id === 's-proposta') proposta = e.target.value; else verba = e.target.value;
      const id = e.target.id, pos = e.target.selectionStart; desenhar();
      const el = document.getElementById(id); el.focus(); try { el.setSelectionRange(pos, pos); } catch (x) {}
    });
  }

  window.Simulador = {
    iniciar(secao) { raiz = secao; montar(); },
    // Usada pelas Marcas (acordo): seus serviços por unidade, com o preço que vale (o seu ou a sugestão)
    itens: () => itensComSugestoes().filter(i => i.tipo === 'unidade'),
    aoAbrir(tentativa = 0) { if ((window.Tarefas && Tarefas.pronto()) || tentativa > 20) desenhar(); else setTimeout(() => this.aoAbrir(tentativa + 1), 300); }
  };
})();
