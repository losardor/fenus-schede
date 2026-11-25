/* Pagina QR: mostra il link giusto per i giocatori, calcolato dall'indirizzo di questa pagina.
   Funziona sia in rete locale (http://<ip>:<porta>/) sia su GitHub Pages. Non usa servizi esterni. */
'use strict';
(function () {
  const $ = (s) => document.getElementById(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LOCALI = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'];

  // Cartella del sito: l'indirizzo di questa pagina senza "qr.html", query e ancora.
  const cartella = (u) => { const x = new URL(u); x.search = ''; x.hash = ''; x.pathname = x.pathname.replace(/[^/]*$/, ''); return x.href; };
  const soloQui = (u) => { try { const x = new URL(u); return x.protocol === 'file:' || LOCALI.includes(x.hostname); } catch (e) { return true; } };
  const reteLocale = (u) => { try { return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(new URL(u).hostname) || new URL(u).hostname.endsWith('.local'); } catch (e) { return false; } };

  function svgQR(testo) {
    const qr = qrcode(0, 'M'); qr.addData(testo); qr.make();
    const n = qr.getModuleCount(), m = 2; let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" shape-rendering="crispEdges" role="img" aria-label="Codice QR per ${esc(testo)}"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  let personaggi = [];
  function disegna(base) {
    const nascondi = soloQui(base); // un QR per localhost fallirebbe su ogni telefono: meglio non mostrarlo
    document.querySelectorAll('.qr-grande, .qr-titolo, .qr-pg').forEach((el) => { el.hidden = nascondi; });
    $('qr-sito').innerHTML = svgQR(base);
    $('qr-url').textContent = base;
    $('qr-input').value = base;
    $('qr-pg').innerHTML = personaggi.map((p) => {
      const url = `${base}sheet.html?pg=${encodeURIComponent(p.id)}`;
      return `<a class="qr-carta" href="${esc(url)}"><span class="qr-codice">${svgQR(url)}</span><span class="carta-nome">${esc(p.nome)}</span></a>`;
    }).join('');
    const av = $('qr-avviso');
    if (soloQui(base)) {
      av.hidden = false;
      av.innerHTML = '<p><strong>Questo indirizzo funziona solo su questo computer.</strong> I telefoni dei giocatori non lo raggiungono.</p>'
        + '<p>Apri questa pagina con l\'indirizzo del computer in rete (per esempio <code>http://192.168.1.10:8765/qr.html</code>; su Mac lo trovi con <code>ipconfig getifaddr en0</code>), oppure scrivilo qui sotto.</p>';
    } else av.hidden = true;
    $('istruzioni').textContent = reteLocale(base)
      ? 'Inquadra il codice con la fotocamera. Il telefono deve essere sulla stessa rete wifi di questo computer.'
      : 'Inquadra il codice con la fotocamera del telefono.';
  }

  function normalizzaIndirizzo(testo) {
    let t = testo.trim(); if (!t) return null;
    if (!/^[a-z]+:\/\//i.test(t)) t = 'http://' + t;
    try { const u = new URL(t); if (!/^https?:$/.test(u.protocol)) return null; if (!u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/[^/]*$/, ''); u.search = ''; u.hash = ''; return u.href; } catch (e) { return null; }
  }

  $('qr-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const base = normalizzaIndirizzo($('qr-input').value);
    if (!base) { $('qr-stato').textContent = 'Indirizzo non valido'; $('qr-stato').classList.add('male'); return; }
    $('qr-stato').textContent = ''; $('qr-stato').classList.remove('male');
    const qui = new URL(location.href); qui.searchParams.set('url', base); history.replaceState(null, '', qui);
    disegna(base);
  });
  $('qr-copia').addEventListener('click', async () => {
    const t = $('qr-url').textContent;
    try { await navigator.clipboard.writeText(t); $('qr-stato').textContent = 'Link copiato'; }
    catch (e) { $('qr-input').select(); $('qr-stato').textContent = 'Seleziona e copia il link a mano'; }
  });

  (async function () {
    const dalParametro = normalizzaIndirizzo(new URLSearchParams(location.search).get('url') || '');
    const base = dalParametro || cartella(location.href);
    try {
      const ids = await (await fetch('data/personaggi.json', { cache: 'no-cache' })).json();
      personaggi = await Promise.all(ids.map((id) => fetch(`data/${id}.json`, { cache: 'no-cache' })
        .then((r) => r.json()).then((s) => ({ id, nome: s.nome || id })).catch(() => ({ id, nome: id }))));
    } catch (e) { personaggi = []; }
    disegna(base);
  })();
})();
