/* =========================================================
   perfil.js · "Meu perfil" do UGC Organized
   Foto, nome, gênero (muda o jeito de falar e o estilo) e
   brilho/glitter. A foto fica pequena (256px) nas preferências.
   ========================================================= */
(function () {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iniciais = (n) => String(n || '').trim().split(/\s+/).slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('') || '✦';

  function toast(msg, erro) {
    let t = document.getElementById('toast-marcas');
    if (!t) { t = document.createElement('div'); t.id = 'toast-marcas'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast-m ativo' + (erro ? ' erro' : '');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('ativo'), 2600);
  }

  // Recorta o centro da foto em quadrado e diminui para 256px (leve e nítida)
  function prepararFoto(arquivo) {
    return new Promise((ok, falha) => {
      const img = new Image(), url = URL.createObjectURL(arquivo);
      img.onload = () => {
        const lado = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = 256;
        c.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 256, 256);
        URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('foto')); };
      img.src = url;
    });
  }

  function avatar(p, classe) {
    return p.foto ? `<img class="${classe}" src="${p.foto}" alt="Foto de perfil">` : `<span class="${classe} sem-foto">${esc(iniciais(p.nome))}</span>`;
  }

  // Bloco do rodapé da barra lateral
  function desenhar() {
    if (!window.Tarefas || !Tarefas.pronto()) return;
    const p = Tarefas.prefs(), el = document.getElementById('perfil-btn'); if (!el) return;
    el.querySelector('.avatar-lugar').innerHTML = avatar(p, 'avatar');
    document.getElementById('perfil-nome').textContent = (p.nome || '').trim() || G.t('Meu perfil', 'Meu perfil');
  }

  function abrir() {
    const p = Tarefas.prefs();
    let foto = p.foto || null;
    const dlg = document.getElementById('ficha-marca');
    dlg.innerHTML = `<form class="ficha" novalidate>
      <header class="ficha-cab"><div><small>Meu perfil</small><h2>Deixe o app com a sua cara</h2></div><button type="button" class="fechar" data-fechar aria-label="Fechar">×</button></header>
      <div class="ficha-corpo">
        <fieldset><legend>Sua foto</legend>
          <div class="perfil-foto">
            <div id="perfil-previa">${avatar({ ...p, foto }, 'avatar grande')}</div>
            <div class="perfil-foto-acoes">
              <label class="btn-secundario"><input type="file" accept="image/*" id="perfil-arquivo" hidden>📷 ${foto ? 'Trocar foto' : 'Colocar foto'}</label>
              <button type="button" class="link-precos" id="perfil-tirar" ${foto ? '' : 'hidden'}>Tirar foto</button>
            </div>
          </div>
        </fieldset>
        <fieldset><legend>Como você quer ser ${G.t('chamada', 'chamado')}?</legend>
          <label class="campo largo"><input name="nome" maxlength="40" value="${esc(p.nome || '')}" placeholder="Seu nome"></label>
        </fieldset>
        <fieldset><legend>Como você se identifica?</legend>
          <div class="dias-escolha genero-escolha">
            <label><input type="radio" name="genero" value="feminino" ${p.genero !== 'masculino' ? 'checked' : ''}><span>Feminino</span></label>
            <label><input type="radio" name="genero" value="masculino" ${p.genero === 'masculino' ? 'checked' : ''}><span>Masculino</span></label>
          </div>
          <small class="desc">Feminino: rosa em destaque, brilhos e "Deusa" nas comemorações. Masculino: o mesmo verde e rosa num visual mais sóbrio, sem glitter, e "Craque" nas comemorações.</small>
        </fieldset>
        <fieldset><legend>Brilhos e glitter</legend>
          <label class="check grande"><input type="checkbox" name="brilho" ${G.brilho() ? 'checked' : ''}><span>Glitter no mouse e chuva de brilho ao concluir tarefas</span></label>
        </fieldset>
      </div>
      <footer class="ficha-rodape"><span></span><div><button type="button" class="btn-secundario" data-fechar>Cancelar</button><button type="submit" class="btn-primario">Salvar perfil</button></div></footer>
    </form>`;
    const f = dlg.querySelector('form');
    dlg.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.oncancel = null;
    const previa = () => { dlg.querySelector('#perfil-previa').innerHTML = avatar({ nome: f.nome.value, foto }, 'avatar grande'); dlg.querySelector('#perfil-tirar').hidden = !foto; };
    dlg.querySelector('#perfil-arquivo').addEventListener('change', async (e) => {
      const arq = e.target.files[0]; if (!arq) return;
      try { foto = await prepararFoto(arq); previa(); } catch (x) { toast('Não consegui abrir essa foto.', true); }
    });
    dlg.querySelector('#perfil-tirar').addEventListener('click', () => { foto = null; previa(); });
    f.nome.addEventListener('input', previa);
    // Trocou o gênero? Sugere o brilho padrão de cada estilo (ela pode mudar)
    f.querySelectorAll('input[name="genero"]').forEach(r => r.addEventListener('change', () => { f.brilho.checked = r.value !== 'masculino'; }));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const genero = f.querySelector('input[name="genero"]:checked').value, brilho = f.brilho.checked;
      try {
        await Tarefas.salvarPrefsParcial({ foto, nome: f.nome.value.trim(), genero, brilho });
        Tema.aplicarPerfil(genero, brilho);
        dlg.close(); desenhar();
        document.dispatchEvent(new CustomEvent('oug:nome'));
        toast('Perfil salvo ✦');
      } catch (x) { console.error(x); toast('Não consegui salvar agora. A foto pode estar grande demais: tente outra.', true); }
    });
    dlg.showModal();
  }

  window.Perfil = {
    iniciar() {
      const b = document.getElementById('perfil-btn'); if (b) b.addEventListener('click', abrir);
      // Quando as preferências chegam do banco, aplica gênero e brilho salvos na conta
      const esperar = (n = 0) => {
        if (window.Tarefas && Tarefas.pronto()) {
          const p = Tarefas.prefs();
          if (p.genero) Tema.aplicarPerfil(p.genero, p.brilho !== undefined ? p.brilho !== false : p.genero !== 'masculino');
          desenhar(); return;
        }
        if (n < 40) setTimeout(() => esperar(n + 1), 300);
      };
      esperar();
    },
    desenhar,
    abrir
  };
})();
