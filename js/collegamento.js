/* Client della web app di Apps Script (contratto in apps-script/Code.gs).
   GET  ?pg=<id>                      → { ok, pg, versione, campi }
   POST testo JSON { pg, passcode, changes, baseVersion } → { ok, versione } oppure { ok: false, errore, … }
   Il POST usa Content-Type text/plain: è una "richiesta semplice", quindi niente preflight CORS
   (Apps Script non risponde alle OPTIONS). fetch segue da solo il redirect 302 di Apps Script.
   Un errore di rete lancia un'eccezione; un errore del foglio torna come { ok: false }. */
'use strict';
(function () {
  const indirizzo = () => String((window.FENUS_CONFIG && window.FENUS_CONFIG.webAppUrl) || '').trim();

  async function chiama(url, opzioni, attesaMassima) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), attesaMassima);
    try {
      const r = await fetch(url, { ...opzioni, redirect: 'follow', cache: 'no-store', credentials: 'omit', signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  window.Collegamento = {
    configurato: () => indirizzo() !== '',
    leggi(pg) {
      const u = new URL(indirizzo()); u.searchParams.set('pg', pg);
      return chiama(u.href, { method: 'GET' }, 20000);
    },
    scrivi(richiesta) {
      return chiama(indirizzo(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(richiesta),
      }, 20000);
    },
  };
})();
