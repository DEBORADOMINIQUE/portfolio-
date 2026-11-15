/* =========================================================
   feriados.js · feriados nacionais do Brasil, para qualquer ano
   Fixos + os que dependem da Páscoa (Carnaval, Sexta-feira Santa,
   Corpus Christi). Carnaval e Corpus Christi são ponto facultativo.
   ========================================================= */
(function () {
  const cache = {};
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const mais = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  // Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher)
  function pascoa(a) {
    const b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((c + 8) / 25);
    const h = Math.floor((c - g + 1) / 3), i = (19 * b + c - e - h + 15) % 30, k = Math.floor(d / 4), l = d % 4;
    const m = (32 + 2 * f + 2 * k - i - l) % 7, n = Math.floor((b + 11 * i + 22 * m) / 451);
    const mes = Math.floor((i + m - 7 * n + 114) / 31), dia = ((i + m - 7 * n + 114) % 31) + 1;
    return new Date(a, mes - 1, dia);
  }

  function doAno(a) {
    if (cache[a]) return cache[a];
    const p = pascoa(a), lista = {};
    const add = (d, nome, facultativo) => { lista[iso(d)] = { nome, facultativo: !!facultativo }; };
    add(new Date(a, 0, 1), 'Confraternização Universal');
    add(mais(p, -48), 'Carnaval', true);
    add(mais(p, -47), 'Carnaval', true);
    add(mais(p, -2), 'Sexta-feira Santa');
    add(new Date(a, 3, 21), 'Tiradentes');
    add(new Date(a, 4, 1), 'Dia do Trabalho');
    add(mais(p, 60), 'Corpus Christi', true);
    add(new Date(a, 8, 7), 'Independência do Brasil');
    add(new Date(a, 9, 12), 'Nossa Senhora Aparecida');
    add(new Date(a, 10, 2), 'Finados');
    add(new Date(a, 10, 15), 'Proclamação da República');
    if (a >= 2024) add(new Date(a, 10, 20), 'Dia da Consciência Negra');
    add(new Date(a, 11, 25), 'Natal');
    return (cache[a] = lista);
  }

  window.Feriados = {
    // { nome, facultativo } ou null
    de(dataIso) { if (!dataIso) return null; return doAno(Number(dataIso.slice(0, 4)))[dataIso.slice(0, 10)] || null; },
    // Feriado "de folga" (os facultativos não bloqueiam sugestão de trabalho)
    folga(dataIso) { const f = this.de(dataIso); return !!(f && !f.facultativo); }
  };
})();
