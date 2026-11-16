/* =========================================================
   auth.js · Login compartilhado do meu.painel
   Carregue DEPOIS do Supabase (CDN). Cria o cliente uma vez
   só e expõe window.Auth para login.html e painel.html.
   ========================================================= */

// Dados do projeto Supabase (a chave anon é pública, pode ficar aqui)
const SUPABASE_URL = 'https://bquukmknxikfbkgqyxxh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxdXVrbWtueGlrZmJrZ3F5eHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NjM3MTcsImV4cCI6MjEwNzMzOTcxN30.1TJ0aFr7ednSGJ886ZUcNGdjA69-tVhWOFoOxObQN-k';

// Cliente único, usado por todas as páginas
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Monta o endereço de outra página na mesma pasta (funciona no GitHub Pages, na Vercel e no localhost)
function urlDaPagina(nome) {
  return new URL(nome, window.location.href).href;
}

// Endereço limpo, sem ".html" no final (ex.: deboradominique.com/painel).
// No computador (localhost ou arquivo aberto direto) mantém o ".html", porque lá o endereço limpo não abre.
function paginaLimpa(nome) {
  const local = location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  return urlDaPagina(local ? nome + '.html' : nome);
}

window.Auth = {
  client: sb,
  pagina: paginaLimpa,

  // Entra com e-mail e senha. Devolve o usuário ou lança um erro em português.
  async login(email, senha) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) {
      if (/invalid login credentials/i.test(error.message)) throw new Error('E-mail ou senha incorretos.');
      if (/email not confirmed/i.test(error.message)) throw new Error('Este e-mail ainda não foi confirmado.');
      throw new Error('Não foi possível entrar agora. Tente de novo em instantes.');
    }
    return data.user;
  },

  // Guarda do painel: sem sessão, manda para o login e devolve null.
  async checkAuth() {
    const { data, error } = await sb.auth.getSession();
    const sessao = data && data.session;
    if (error || !sessao) {
      window.location.replace(paginaLimpa('login'));
      return null;
    }
    if (await this.precisaCodigo()) { window.location.replace(paginaLimpa('login')); return null; }
    return sessao.user;
  },

  // ===== Cadastro =====
  async cadastrar(email, senha) {
    const { data, error } = await sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: urlDaPagina('login.html') } });
    if (error) {
      if (/already registered|already exists/i.test(error.message)) throw new Error('Este e-mail já tem cadastro. Tente entrar ou use "Esqueci minha senha".');
      if (/signups? not allowed|disabled/i.test(error.message)) throw new Error('Os cadastros estão fechados no momento.');
      if (/password/i.test(error.message)) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
      throw new Error('Não foi possível cadastrar agora. Tente de novo em instantes.');
    }
    // Sem sessão = precisa confirmar o e-mail primeiro
    return { precisaConfirmar: !data.session, user: data.user };
  },

  // ===== Autenticador (Google Authenticator) =====
  // true quando a conta tem autenticador e a sessão ainda não passou pelo código
  async precisaCodigo() {
    try {
      const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      return !!data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
    } catch (e) { return false; }
  },
  async confirmarCodigo(codigo) {
    const { data: f, error: e1 } = await sb.auth.mfa.listFactors();
    if (e1) throw new Error('Não consegui verificar agora. Tente de novo.');
    const fator = (f.totp || [])[0];
    if (!fator) return true;
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: fator.id, code: String(codigo).replace(/\D/g, '') });
    if (error) throw new Error('Código inválido. Confira no aplicativo e digite o código que aparece agora.');
    return true;
  },
  async fatores() {
    const { data, error } = await sb.auth.mfa.listFactors();
    if (error) throw error;
    return data;
  },
  // Começa a ativação: devolve o QR code para escanear no Google Authenticator
  async iniciarAutenticador() {
    const atual = await this.fatores();
    // Apaga tentativas antigas que não foram concluídas
    for (const f of (atual.all || []).filter(x => x.factor_type === 'totp' && x.status !== 'verified')) { await sb.auth.mfa.unenroll({ factorId: f.id }); }
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'UGC Organized ' + Date.now().toString(36), issuer: 'UGC Organized' });
    if (error) throw new Error('Não consegui ativar agora. Tente de novo em instantes.');
    return { id: data.id, qr: data.totp.qr_code, segredo: data.totp.secret };
  },
  async concluirAutenticador(factorId, codigo) {
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: String(codigo).replace(/\D/g, '') });
    if (error) throw new Error('Código inválido. Digite o código de 6 números que aparece agora no aplicativo.');
    return true;
  },
  async desligarAutenticador() {
    const atual = await this.fatores();
    for (const f of (atual.totp || [])) { const { error } = await sb.auth.mfa.unenroll({ factorId: f.id }); if (error) throw new Error('Não consegui desligar agora. Saia e entre de novo, e tente outra vez.'); }
    return true;
  },

  // ===== Dados da conta =====
  async trocarEmail(novo) {
    const { error } = await sb.auth.updateUser({ email: novo }, { emailRedirectTo: urlDaPagina('login.html') });
    if (error) throw new Error(/already/i.test(error.message) ? 'Esse e-mail já é usado por outra conta.' : 'Não consegui trocar o e-mail agora. Confira o endereço e tente de novo.');
    return true;
  },
  async trocarSenha(nova) {
    const { error } = await sb.auth.updateUser({ password: nova });
    if (error) throw new Error(/should be different/i.test(error.message) ? 'A nova senha precisa ser diferente da atual.' : 'Não consegui trocar a senha. Use pelo menos 6 caracteres.');
    return true;
  },

  // Só consulta a sessão, sem redirecionar (usado na tela de login)
  async sessaoAtual() {
    const { data } = await sb.auth.getSession();
    return data && data.session ? data.session.user : null;
  },

  // Sai e volta para o login
  async logout() {
    try { await sb.auth.signOut(); } finally {
      window.location.replace(paginaLimpa('login'));
    }
  },

  // Envia o e-mail de "esqueci minha senha". O link do e-mail volta para o login.
  async recuperarSenha(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: urlDaPagina('login.html') });
    if (error) throw new Error('Não conseguimos enviar o e-mail. Confira o endereço e tente de novo.');
    return true;
  },

  // Grava a nova senha (depois de abrir o link de recuperação)
  async definirNovaSenha(senha) {
    const { error } = await sb.auth.updateUser({ password: senha });
    if (error) throw new Error('Não foi possível salvar a nova senha. Use pelo menos 6 caracteres.');
    return true;
  }
};
