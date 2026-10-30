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
window.sb = sb;

// Endereço da página de login, na mesma pasta desta página
function urlDaPagina(nome) {
  return new URL(nome, window.location.href).href;
}

window.Auth = {
  client: sb,

  // Entra com e-mail e senha. Devolve o usuário ou lança um erro em português.
  async login(email, senha) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) {
      if (/invalid login credentials/i.test(error.message)) {
        throw new Error('E-mail ou senha incorretos.');
      }
      if (/email not confirmed/i.test(error.message)) {
        throw new Error('Este e-mail ainda não foi confirmado.');
      }
      throw new Error('Não foi possível entrar agora. Tente de novo em instantes.');
    }
    return data.user;
  },

  // Guarda do painel: sem sessão, manda para o login.
  async checkAuth() {
    const { data, error } = await sb.auth.getSession();
    const sessao = data && data.session;
    if (error || !sessao) {
      window.location.replace(urlDaPagina('login.html'));
      return null;
    }
    return sessao.user;
  },

  // Só consulta, sem redirecionar (usado na tela de login)
  async sessaoAtual() {
    const { data } = await sb.auth.getSession();
    return data && data.session ? data.session.user : null;
  },

  async logout() {
    await sb.auth.signOut();
    window.location.replace(urlDaPagina('login.html'));
  },

  // Envia o e-mail de "esqueci minha senha". O link volta para o login.
  async recuperarSenha(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: urlDaPagina('login.html')
    });
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
