/* tema.js · liga e desliga o modo escuro (guardado neste aparelho) */
(function () {
  let salvo = null;
  try { salvo = localStorage.getItem('oug_tema'); } catch (e) {}
  if (salvo === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  window.Tema = {
    alternar() {
      const escuro = document.documentElement.getAttribute('data-theme') !== 'dark';
      if (escuro) document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme');
      try { localStorage.setItem('oug_tema', escuro ? 'dark' : 'light'); } catch (e) {}
      return escuro;
    },
    escuro: () => document.documentElement.getAttribute('data-theme') === 'dark'
  };
})();
