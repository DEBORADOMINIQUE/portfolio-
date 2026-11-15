/* tema.js · modo escuro, gênero e estilo (guardados neste aparelho para abrir já certo) */
(function () {
  const raiz = document.documentElement;
  const ler = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  if (ler('oug_tema') === 'dark') raiz.setAttribute('data-theme', 'dark');
  // Gênero e estilo: aplica antes de desenhar a tela, para não piscar
  const genero = ler('oug_genero');
  if (genero) raiz.dataset.genero = genero;
  if (ler('oug_brilho') === 'nao') raiz.dataset.semBrilho = '1';

  window.Tema = {
    alternar() {
      const escuro = raiz.getAttribute('data-theme') !== 'dark';
      if (escuro) raiz.setAttribute('data-theme', 'dark'); else raiz.removeAttribute('data-theme');
      gravar('oug_tema', escuro ? 'dark' : 'light');
      return escuro;
    },
    escuro: () => raiz.getAttribute('data-theme') === 'dark',
    // Aplica gênero e brilho vindos do perfil (banco) e guarda no aparelho
    aplicarPerfil(g, brilho) {
      if (g) { raiz.dataset.genero = g; gravar('oug_genero', g); }
      if (brilho === false) { raiz.dataset.semBrilho = '1'; gravar('oug_brilho', 'nao'); }
      else { delete raiz.dataset.semBrilho; gravar('oug_brilho', 'sim'); }
    }
  };

  // G: palavras que mudam com o gênero. Feminino é o padrão.
  window.G = {
    masc: () => raiz.dataset.genero === 'masculino',
    t: (fem, masc) => (raiz.dataset.genero === 'masculino' ? masc : fem),
    apelido: () => (raiz.dataset.genero === 'masculino' ? 'Craque' : 'Deusa'),
    brilho: () => !raiz.dataset.semBrilho
  };
})();
