'use strict';
(async function () {
  const box = document.getElementById('carte');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Modifiche fatte offline e non ancora arrivate al foglio.
  const haModifiche = (id) => { try { const c = JSON.parse(localStorage.getItem('fenus-copia-' + id) || 'null'); return !!(c && c.inAttesa); } catch (e) { return false; } };
  try {
    const ids = await (await fetch('data/personaggi.json', { cache: 'no-cache' })).json();
    const schede = await Promise.all(ids.map((id) =>
      fetch(`data/${id}.json`, { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({ id, nome: id }))));
    box.innerHTML = schede.map((s) => `
      <a class="carta" href="sheet.html?pg=${encodeURIComponent(s.id)}">
        <span class="carta-nome">${esc(s.nome)}</span>
        <span class="carta-desc">${esc(s.descrizione || '')}</span>
        ${haModifiche(s.id) ? '<span class="carta-nota">modifiche in attesa di invio al foglio</span>' : ''}
      </a>`).join('');
  } catch (e) {
    box.innerHTML = '<p class="errore-pagina">Impossibile leggere l\'elenco dei personaggi.</p>';
  }
})();
