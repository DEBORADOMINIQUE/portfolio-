/* =========================================================
   conta.js · "Dados da conta e segurança" (abre pelo Meu perfil)
   E-mail, trocar e-mail, trocar senha, telefone e o
   Google Authenticator (verificação em duas etapas).
   ========================================================= */
(function () {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function toast(msg, erro) {
    let t = document.getElementById('toast-marcas');
    if (!t) { t = document.createElement('div'); t.id = 'toast-marcas'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast-m ativo' + (erro ? ' erro' : '');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('ativo'), 3200);
  }

  async function abrir() {
    const dlg = document.getElementById('ficha-marca');
    const { data } = await Auth.client.auth.getUser();
    const u = data && data.user, p = window.Tarefas ? Tarefas.prefs() : {};
    let temAut = false;
    try { const f = await Auth.fatores(); temAut = (f.totp || []).length > 0; } catch (e) {}
    const emailPendente = u && u.new_email;
    dlg.innerHTML = `<div class="ficha">
      <header class="ficha-cab"><div><small>Meu perfil</small><h2>Dados da conta e segurança</h2></div><button type="button" class="fechar" data-fechar aria-label="Fechar">×</button></header>
      <div class="ficha-corpo">
        <div class="faixa-erro" id="c-erro" hidden></div>

        <fieldset><legend>Dados cadastrados</legend>
          <dl class="conta-dados">
            <dt>E-mail</dt><dd>${esc(u ? u.email : '')}${emailPendente ? `<small>Aguardando confirmação do novo e-mail: ${esc(emailPendente)}</small>` : ''}</dd>
            <dt>Senha</dt><dd>••••••••</dd>
            <dt>Telefone</dt><dd>${esc(p.telefone || 'não informado')}</dd>
            <dt>Conta criada em</dt><dd>${u ? new Date(u.created_at).toLocaleDateString('pt-BR') : ''}</dd>
          </dl>
        </fieldset>

        <fieldset><legend>Telefone</legend>
          <div class="conta-linha"><input id="c-tel" inputmode="tel" value="${esc(p.telefone || '')}" placeholder="(11) 90000-0000"><button class="btn-secundario" data-c="tel">Salvar</button></div>
        </fieldset>

        <fieldset><legend>Trocar e-mail</legend>
          <p class="desc">Vamos mandar um link de confirmação para o e-mail novo. A troca só vale depois que você clicar nele.</p>
          <div class="conta-linha"><input id="c-email" type="email" placeholder="novo@email.com"><button class="btn-secundario" data-c="email">Trocar</button></div>
        </fieldset>

        <fieldset><legend>Trocar senha</legend>
          <div class="grade-campos">
            <label class="campo"><span>Nova senha</span><input id="c-s1" type="password" autocomplete="new-password" placeholder="Pelo menos 6 caracteres"></label>
            <label class="campo"><span>Repita a nova senha</span><input id="c-s2" type="password" autocomplete="new-password" placeholder="A mesma senha"></label>
          </div>
          <button class="btn-secundario" data-c="senha" style="margin-top:10px">Trocar senha</button>
        </fieldset>

        <fieldset><legend>Verificação em duas etapas</legend>
          <div id="c-aut">${temAut
            ? `<div class="aut-ok">🔒 <b>Ativada.</b> Ao entrar, o app pede o código do seu aplicativo autenticador.</div><button class="btn-perigo" data-c="aut-off">Desligar verificação em duas etapas</button>`
            : `<p class="desc">Mais segurança: além da senha, o app pede um código de 6 números do <b>Google Authenticator</b> (ou outro app autenticador) toda vez que alguém tentar entrar na sua conta.</p><button class="btn-primario" data-c="aut-on">🔐 Ativar Google Authenticator</button>`}</div>
        </fieldset>
      </div>
    </div>`;
    const erro = (m) => { const el = dlg.querySelector('#c-erro'); el.textContent = m; el.hidden = !m; if (m) el.scrollIntoView({ block: 'center' }); };
    dlg.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.oncancel = null;
    dlg.querySelector('.ficha').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-c]'); if (!b || !dlg.contains(b)) return;
      erro('');
      const acao = b.dataset.c;
      try {
        if (acao === 'tel') { await Tarefas.salvarPrefsParcial({ telefone: dlg.querySelector('#c-tel').value.trim() || null }); toast('Telefone salvo ✦'); }
        if (acao === 'email') {
          const novo = dlg.querySelector('#c-email').value.trim();
          if (!/^\S+@\S+\.\S+$/.test(novo)) return erro('Digite um e-mail válido.');
          await Auth.trocarEmail(novo); toast('Pronto! Confirme pelo link que enviamos para ' + novo);
        }
        if (acao === 'senha') {
          const s1 = dlg.querySelector('#c-s1').value, s2 = dlg.querySelector('#c-s2').value;
          if (s1.length < 6) return erro('A senha precisa ter pelo menos 6 caracteres.');
          if (s1 !== s2) return erro('As duas senhas não estão iguais.');
          await Auth.trocarSenha(s1); dlg.querySelector('#c-s1').value = dlg.querySelector('#c-s2').value = ''; toast('Senha trocada ✦');
        }
        if (acao === 'aut-on') return ativar(dlg, erro);
        if (acao === 'aut-off') {
          if (!confirm('Desligar a verificação em duas etapas? Sua conta fica protegida só pela senha.')) return;
          await Auth.desligarAutenticador(); toast('Verificação em duas etapas desligada.'); dlg.close(); abrir();
        }
      } catch (x) { console.error(x); erro(x.message || 'Não consegui agora. Tente de novo.'); }
    });
    if (!dlg.open) dlg.showModal();
  }

  async function ativar(dlg, erro) {
    const caixa = dlg.querySelector('#c-aut');
    caixa.innerHTML = '<p class="carregando">Preparando...</p>';
    let ini;
    try { ini = await Auth.iniciarAutenticador(); }
    catch (x) { caixa.innerHTML = ''; return erro(x.message); }
    caixa.innerHTML = `<ol class="aut-passos">
        <li>Baixe o <b>Google Authenticator</b> no celular (App Store ou Google Play), se ainda não tiver.</li>
        <li>No app, toque em <b>+</b> e em <b>Ler código QR</b>, e aponte para o código abaixo.</li>
        <li>Digite aqui o código de 6 números que aparecer no app.</li>
      </ol>
      <div class="aut-qr"><img src="${ini.qr}" alt="Código QR para o autenticador"></div>
      <p class="desc">Não consegue ler o QR? No app, escolha "Inserir chave de configuração" e use: <code>${esc(ini.segredo)}</code></p>
      <div class="conta-linha"><input id="c-cod" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000000" class="campo-codigo"><button class="btn-primario" id="c-confirma">Confirmar e ativar</button></div>`;
    const inp = caixa.querySelector('#c-cod'); inp.focus();
    caixa.querySelector('#c-confirma').addEventListener('click', async () => {
      erro('');
      const c = inp.value.replace(/\D/g, '');
      if (c.length !== 6) return erro('Digite os 6 números do código.');
      try { await Auth.concluirAutenticador(ini.id, c); toast('🔒 Verificação em duas etapas ativada!'); dlg.close(); abrir(); }
      catch (x) { erro(x.message); inp.select(); }
    });
  }

  window.Conta = { abrir };
})();
