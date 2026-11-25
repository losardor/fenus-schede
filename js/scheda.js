/* Scheda personaggio: carica /data/<id>.json, applica le modifiche salvate, rende e ricalcola. */
'use strict';
(function () {
  const { CARATT, CARATT_BREVE, CARATT_NOME, TAGLIE, TIRI_SALVEZZA, calcola, conSegno } = window.Regole;

  const id = (new URLSearchParams(location.search).get('pg') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const CHIAVE = 'fenus-scheda-' + id;
  const app = document.getElementById('app');
  let scheda = null;        // stato corrente
  let predefinita = null;   // copia intatta di /data/<id>.json
  let firmaPredefinita = '';

  /* ---------- archivio locale, sempre protetto ---------- */
  const archivio = {
    leggi() { try { const t = localStorage.getItem(CHIAVE); return t ? JSON.parse(t) : null; } catch (e) { return null; } },
    scrivi(v) { try { localStorage.setItem(CHIAVE, JSON.stringify(v)); return true; } catch (e) { return false; } },
    cancella() { try { localStorage.removeItem(CHIAVE); } catch (e) { /* niente */ } },
  };

  /* ---------- utilità ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clona = (o) => JSON.parse(JSON.stringify(o));
  const leggiPercorso = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function scriviPercorso(o, p, v) {
    const k = p.split('.'); const ultimo = k.pop();
    const dest = k.reduce((a, x) => (a[x] ??= {}), o); dest[ultimo] = v;
  }
  function firma(testo) { let h = 0; for (let i = 0; i < testo.length; i++) h = (h * 31 + testo.charCodeAt(i)) | 0; return String(h); }
  const EDITABILE = (() => { try { const d = document.createElement('div'); d.contentEditable = 'plaintext-only'; return d.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true'; } catch (e) { return 'true'; } })();

  /* ---------- mattoni di markup ---------- */
  const num = (p, cls = '', extra = '') =>
    `<input class="num ${cls}" type="number" inputmode="numeric" data-p="${p}" value="${esc(leggiPercorso(scheda, p) ?? 0)}" ${extra}>`;
  const txt = (p, cls = '', segnaposto = '', multi = false) =>
    `<span class="ed ${cls}" contenteditable="${EDITABILE}" spellcheck="false" data-p="${p}"${multi ? ' data-multi' : ''} data-ph="${esc(segnaposto)}">${esc(leggiPercorso(scheda, p) ?? '')}</span>`;
  const sel = (p, opzioni) => `<select data-p="${p}">${opzioni.map(([v, l]) =>
    `<option value="${esc(v)}"${leggiPercorso(scheda, p) === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const selCaratt = (p) => sel(p, CARATT.map((c) => [c, CARATT_BREVE[c]]));
  const calc = (k, cls = '') => `<span class="calc ${cls}"><output data-c="${k}"></output><button type="button" class="perche" data-azione="perche" data-k="${k}" aria-expanded="false" aria-label="Da dove viene questo numero?">?</button></span>`;
  const perche = (k) => `<div class="spiega" data-s="${k}" hidden></div>`;
  const verifica = (o) => (o && o.verifica ? '<span class="verifica" title="Regola ancora da verificare">VERIFICA</span>' : '');
  const togli = (p) => `<button type="button" class="togli" data-azione="togli" data-p="${p}" aria-label="Rimuovi">×</button>`;
  const aggiungi = (lista, etichetta) => `<button type="button" class="aggiungi" data-azione="aggiungi" data-lista="${lista}">+ ${etichetta}</button>`;

  const MODELLI = {
    attacchi: () => ({ nome: 'Nuovo attacco', caratt: 'for', vari: 0, nota: '', tipo: '', danni: '', critico: '', dettagli: '' }),
    abilita: () => ({ nome: 'Nuova abilità', caratt: 'int', gradi: 0, vari: 0, nota: '' }),
    tratti: () => ({ testo: '' }),
    capacita: () => ({ nome: 'Nuova capacità', testo: '' }),
    talenti: () => ({ testo: '' }),
    equipaggiamento: () => ({ testo: '' }),
    risorse: () => ({ nome: 'Nuova risorsa', max: 1, attuale: 1 }),
  };

  /* ---------- sezioni ---------- */
  function intestazione() {
    return `
<header class="testa">
  <div class="nomi">
    <h1>${txt('nome', 'nome', 'Nome')}</h1>
    <p class="sotto">${txt('descrizione', '', 'razza classe livello')}</p>
  </div>
  <dl class="dati">
    <div><dt>Livello</dt><dd>${num('livello', 'w2', 'min="1"')}</dd></div>
    <div><dt>Taglia</dt><dd>${sel('taglia', Object.keys(TAGLIE).map((t) => [t, t]))} ${calc('ca.taglia', 'mini')}</dd></div>
    <div><dt>Velocità</dt><dd>${txt('velocita')}</dd></div>
    <div><dt>Razza</dt><dd>${txt('razza')} ${verifica({ verifica: scheda.razzaVerifica })}</dd></div>
  </dl>
  ${perche('ca.taglia')}
</header>`;
  }

  function strumenti() {
    return `
<nav class="strumenti" aria-label="Azioni sulla scheda">
  <a href="index.html" class="btn leggero">← Personaggi</a>
  <button type="button" class="btn" data-azione="esporta">Esporta JSON</button>
  <button type="button" class="btn" data-azione="importa">Importa JSON</button>
  <button type="button" class="btn" data-azione="ripristina">Ripristina</button>
  <button type="button" class="btn leggero" data-azione="stampa">Stampa</button>
  <span class="stato" id="stato" role="status"></span>
  <input type="file" id="file-import" accept="application/json,.json" hidden>
</nav>
<div class="conferma" id="conferma" hidden>
  <p>Tornare alla scheda predefinita? Tutte le modifiche fatte su questo dispositivo andranno perse.</p>
  <button type="button" class="btn pericolo" data-azione="ripristina-si">Sì, ripristina</button>
  <button type="button" class="btn leggero" data-azione="ripristina-no">Annulla</button>
</div>
<div class="avviso" id="avviso" hidden></div>`;
  }

  function contatore(p, etichetta, max, conMax = true) {
    return `
<div class="contatore">
  <span class="cont-nome">${etichetta}</span>
  <span class="cont-ctrl">
    <button type="button" class="pm" data-azione="meno" data-p="${p}" aria-label="Meno">−</button>
    ${num(p, 'w3 cont-val')}
    ${conMax ? `<span class="su">/ ${max}</span>` : ''}
    <button type="button" class="pm" data-azione="piu" data-p="${p}" aria-label="Più">+</button>
  </span>
  <span class="caselle" data-caselle="${p}"></span>
</div>`;
  }

  function sessione() {
    const risorse = (scheda.risorse || []).map((r, i) => contatore(
      `risorse.${i}.attuale`,
      `${txt(`risorse.${i}.nome`)} ${verifica(r)}`,
      num(`risorse.${i}.max`, 'w2 max'),
    ).replace('<div class="contatore">', `<div class="contatore">${togli(`risorse.${i}`)}`)).join('');
    return `
<section class="blocco sessione">
  <h2>Sessione</h2>
  <div class="contatore pf">
    <span class="cont-nome">PF attuali</span>
    <span class="cont-ctrl">
      <button type="button" class="pm" data-azione="meno" data-p="pf.attuali" aria-label="Meno">−</button>
      ${num('pf.attuali', 'w3 cont-val grande')}
      <span class="su">/ <output data-c="pf.max"></output></span>
      <button type="button" class="pm" data-azione="piu" data-p="pf.attuali" aria-label="Più">+</button>
    </span>
    <span class="caselle vuota"></span>
  </div>
  ${contatore('pf.nonLetali', 'Danni non letali', '', false)}
  ${risorse}
  <div class="riga-agg">${aggiungi('risorse', 'risorsa')}</div>
</section>`;
  }

  function caratteristiche() {
    return `
<section class="blocco caratt">
  <h2>Caratteristiche</h2>
  <div class="griglia6">
    ${CARATT.map((c) => `
    <div class="car">
      <abbr title="${CARATT_NOME[c]}">${CARATT_BREVE[c]}</abbr>
      ${num('caratteristiche.' + c, 'punteggio')}
      ${calc('mod.' + c, 'modc')}
    </div>`).join('')}
  </div>
  ${CARATT.map((c) => perche('mod.' + c)).join('')}
</section>`;
  }

  function difesa() {
    return `
<section class="blocco difesa">
  <h2>Difesa</h2>
  <div class="totali">
    <div class="tot"><span class="et">PF max</span>${calc('pf.max', 'grande')}</div>
    <div class="tot"><span class="et">CA</span>${calc('ca', 'grande')}</div>
    <div class="tot"><span class="et">Contatto</span>${calc('ca.contatto')}</div>
    <div class="tot"><span class="et">Impreparato</span>${calc('ca.impreparato')}</div>
  </div>
  ${perche('pf.max')}${perche('ca')}${perche('ca.contatto')}${perche('ca.impreparato')}
  <div class="componenti">
    <label>Dado vita d${num('dadoVita', 'w2')}</label>
    <label>PF vari ${num('pfVari', 'w2')}</label>
    <label>Armatura ${num('ca.armatura', 'w2')}</label>
    <label>Naturale ${num('ca.naturale', 'w2')}</label>
    <label>CA vari ${num('ca.vari', 'w2')}</label>
  </div>
  <h3>Tiri salvezza</h3>
  <div class="ts">
    ${TIRI_SALVEZZA.map((t) => `
    <div class="riga-ts">
      <span class="et">${t.nome}</span>${calc('ts.' + t.chiave, 'medio')}
      <span class="comp">classe ${num(`ts.${t.chiave}.base`, 'w2')} + ${CARATT_BREVE[t.caratt]} <output data-c="mod.${t.caratt}"></output> + vari ${num(`ts.${t.chiave}.vari`, 'w2')}</span>
      ${perche('ts.' + t.chiave)}
    </div>`).join('')}
  </div>
</section>`;
  }

  function attacco() {
    const righe = (scheda.attacchi || []).map((a, i) => `
    <div class="attacco">
      <div class="att-testa">${togli(`attacchi.${i}`)}<strong>${txt(`attacchi.${i}.nome`)}</strong> ${verifica(a)} ${calc(`att.${i}`, 'medio')}</div>
      <div class="comp">BAB <output data-c="bab-val"></output> + ${selCaratt(`attacchi.${i}.caratt`)} <output data-c="att-mod.${i}"></output>
        + taglia <output data-c="att-taglia"></output> + vari ${num(`attacchi.${i}.vari`, 'w2')} ${txt(`attacchi.${i}.nota`, 'nota', 'motivo del bonus')}</div>
      ${perche(`att.${i}`)}
      <div class="att-dati">
        <span><em>Danni</em> ${txt(`attacchi.${i}.danni`, '', '—')}</span>
        <span><em>Critico</em> ${txt(`attacchi.${i}.critico`, '', '—')}</span>
        <span><em>Tipo</em> ${txt(`attacchi.${i}.tipo`, '', '—')}</span>
      </div>
      <div class="att-det">${txt(`attacchi.${i}.dettagli`, '', 'dettagli')}</div>
    </div>`).join('');
    return `
<section class="blocco attacco-b">
  <h2>Attacco</h2>
  <div class="totali">
    <div class="tot"><span class="et">BAB</span>${num('bab', 'w2 grande')}</div>
    <div class="tot"><span class="et">Iniziativa</span>${calc('iniziativa', 'medio')}</div>
    <div class="tot"><span class="et">BMC (CMB)</span>${calc('bmc', 'medio')}</div>
    <div class="tot"><span class="et">DMC (CMD)</span>${calc('dmc', 'medio')}</div>
  </div>
  ${perche('iniziativa')}${perche('bmc')}${perche('dmc')}
  ${righe}
  <div class="riga-agg">${aggiungi('attacchi', 'attacco')}</div>
</section>`;
  }

  function abilita() {
    const righe = (scheda.abilita || []).map((a, i) => `
    <div class="abil">
      ${togli(`abilita.${i}`)}
      <span class="ab-nome">${txt(`abilita.${i}.nome`)}</span>
      ${calc(`ab.${i}`)}
      <span class="ab-comp">${num(`abilita.${i}.gradi`, 'w2 gradi', 'min="0"')} + ${selCaratt(`abilita.${i}.caratt`)} <output data-c="ab-mod.${i}"></output> + ${num(`abilita.${i}.vari`, 'w2')}</span>
      ${perche(`ab.${i}`)}
    </div>`).join('');
    return `
<section class="blocco abilita-b">
  <h2>Abilità <small>gradi max <output data-c="gradi.max"></output></small></h2>
  <div class="abil intest" aria-hidden="true"><span></span><span>Abilità</span><span>Tot.</span><span class="ab-comp">gradi + car. + vari</span></div>
  ${righe}
  <div class="riga-agg">${aggiungi('abilita', 'abilità')}</div>
</section>`;
  }

  function lista(chiave, titolo, conNome, etichettaAgg) {
    const voci = (scheda[chiave] || []).map((v, i) => `
    <li>${togli(`${chiave}.${i}`)}${conNome ? `<strong>${txt(`${chiave}.${i}.nome`)}</strong> ` : ''}${txt(`${chiave}.${i}.testo`, '', '…', true)} ${verifica(v)}</li>`).join('');
    return `
<section class="blocco lista-b ${chiave}">
  <h2>${titolo}</h2>
  <ul class="lista">${voci}</ul>
  <div class="riga-agg">${aggiungi(chiave, etichettaAgg)}</div>
</section>`;
  }

  function incantesimi() {
    const inc = scheda.incantesimi;
    if (!inc) return '';
    const gruppi = (inc.gruppi || []).map((g, i) => `
    <div class="gruppo">
      <h3>${txt(`incantesimi.gruppi.${i}.nome`)} ${inc.mostraCD === false ? '' : `<span class="cd">CD ${calc(`cd.${i}`)}</span>`}</h3>
      ${inc.mostraCD === false ? '' : perche(`cd.${i}`)}
      <p>${txt(`incantesimi.gruppi.${i}.voci`, '', 'elenco', true)}</p>
    </div>`).join('');
    return `
<section class="blocco incantesimi">
  <h2>${txt('incantesimi.titolo')}</h2>
  <p class="piccolo">Caratteristica: ${selCaratt('incantesimi.caratt')}</p>
  ${gruppi}
</section>`;
  }

  function protesi() {
    return `
<section class="blocco protesi">
  <h2>Protesi</h2>
  <p>${txt('protesi', '', '—', true)}</p>
  <h3>Note</h3>
  <p class="note">${txt('note', '', 'appunti di gioco', true)}</p>
</section>`;
  }

  function regoleComuni(comune) {
    if (!comune) return '';
    return `
<details class="blocco regole" id="regole">
  <summary>${esc(comune.titolo)}</summary>
  <ul>${comune.regole.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
</details>`;
  }

  let comune = null;
  function rendi() {
    document.title = `${scheda.nome || id} · Fenus, The First Instance`;
    app.innerHTML = `
${strumenti()}
<main class="scheda">
  ${intestazione()}
  ${sessione()}
  ${caratteristiche()}
  ${difesa()}
  ${attacco()}
  ${abilita()}
  ${incantesimi()}
  ${lista('tratti', 'Tratti razziali', false, 'tratto')}
  ${lista('capacita', 'Capacità di classe', true, 'capacità')}
  ${lista('talenti', 'Talenti', false, 'talento')}
  ${protesi()}
  ${lista('equipaggiamento', 'Equipaggiamento', false, 'oggetto')}
  ${regoleComuni(comune)}
</main>`;
    ricalcola();
    controllaPredefinita();
  }

  /* ---------- ricalcolo senza ridisegnare (non perde il cursore) ---------- */
  function ricalcola() {
    const r = calcola(scheda);
    const mod = (c) => r['mod.' + c]?.v ?? 0;
    r['bab-val'] = { v: Number(scheda.bab) || 0, segnato: true };
    r['att-taglia'] = { v: (TAGLIE[scheda.taglia] || TAGLIE.Media).ca, segnato: true };
    (scheda.attacchi || []).forEach((a, i) => { r[`att-mod.${i}`] = { v: mod(a.caratt), segnato: true }; });
    (scheda.abilita || []).forEach((a, i) => { r[`ab-mod.${i}`] = { v: mod(a.caratt), segnato: true }; });

    app.querySelectorAll('[data-c]').forEach((el) => {
      const x = r[el.dataset.c]; if (!x) return;
      el.textContent = x.segnato ? conSegno(x.v) : x.v;
      el.closest('.calc')?.classList.toggle('errore', !!x.errore);
    });
    app.querySelectorAll('[data-s]').forEach((el) => { const x = r[el.dataset.s]; if (x) el.textContent = x.testo; });
    // valori correnti nei contatori: PF predefiniti al massimo
    if (scheda.pf.attuali == null) {
      const campo = app.querySelector('input[data-p="pf.attuali"]');
      if (campo && document.activeElement !== campo) campo.value = r['pf.max'].v;
    }
    app.querySelectorAll('[data-caselle]').forEach((el) => {
      const p = el.dataset.caselle;
      const max = p.startsWith('risorse.') ? Number(leggiPercorso(scheda, p.replace(/attuale$/, 'max'))) || 0 : 0;
      el.textContent = max > 0 ? '☐'.repeat(Math.min(max, 30)) : '';
      el.classList.toggle('vuota', max === 0);
    });
    app.querySelectorAll('.abil [data-p$=".gradi"]').forEach((el) => {
      el.classList.toggle('troppi', (Number(el.value) || 0) > Math.max(1, Number(scheda.livello) || 1));
    });
  }

  /* ---------- salvataggio ---------- */
  let timer = null;
  function salva() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      scheda._firmaPredefinita = firmaPredefinita;
      const ok = archivio.scrivi(scheda);
      stato(ok ? 'Salvato su questo dispositivo' : 'Salvataggio non disponibile: usa Esporta JSON', !ok);
    }, 250);
  }
  function stato(testo, male = false) {
    const el = document.getElementById('stato'); if (!el) return;
    el.textContent = testo; el.classList.toggle('male', male);
  }
  function controllaPredefinita() {
    const av = document.getElementById('avviso');
    if (scheda._firmaPredefinita && scheda._firmaPredefinita !== firmaPredefinita) {
      av.hidden = false;
      av.textContent = 'La scheda predefinita è stata aggiornata dal master. Usa «Ripristina» per caricarla (perderai le modifiche locali: esportale prima, se servono).';
    } else av.hidden = true;
  }

  /* ---------- eventi ---------- */
  app.addEventListener('input', (e) => {
    const el = e.target; const p = el.dataset.p; if (!p) return;
    let v;
    if (el.tagName === 'INPUT' && el.type === 'number') {
      if (el.value === '' || el.value === '-') return; // in digitazione
      v = Math.trunc(Number(el.value)); if (!Number.isFinite(v)) return;
    } else if (el.tagName === 'SELECT') v = el.value;
    else v = el.innerText.replace(/\n$/, '');
    scriviPercorso(scheda, p, v);
    if (p === 'taglia') return rendi(), salva();
    ricalcola(); salva();
  });
  app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.tagName === 'INPUT' && el.type === 'number' && el.dataset.p && el.value === '') {
      el.value = 0; scriviPercorso(scheda, el.dataset.p, 0); ricalcola(); salva();
    }
    if (el.id === 'file-import' && el.files[0]) importa(el.files[0]);
  });
  app.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList?.contains('ed') && !e.target.hasAttribute('data-multi')) { e.preventDefault(); e.target.blur(); }
  });
  app.addEventListener('paste', (e) => {
    if (!e.target.classList?.contains('ed') || EDITABILE === 'plaintext-only') return;
    e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });

  app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-azione]'); if (!b) return;
    const a = b.dataset.azione;
    if (a === 'perche') {
      const s = app.querySelector(`[data-s="${b.dataset.k}"]`);
      if (s) { s.hidden = !s.hidden; b.setAttribute('aria-expanded', String(!s.hidden)); b.classList.toggle('attivo', !s.hidden); }
    } else if (a === 'piu' || a === 'meno') {
      const p = b.dataset.p;
      let v = leggiPercorso(scheda, p);
      if (v == null && p === 'pf.attuali') v = calcola(scheda)['pf.max'].v;
      v = (Number(v) || 0) + (a === 'piu' ? 1 : -1);
      if (p.startsWith('risorse.')) v = Math.max(0, Math.min(v, Number(leggiPercorso(scheda, p.replace(/attuale$/, 'max'))) || 0));
      if (p === 'pf.nonLetali') v = Math.max(0, v);
      if (p === 'pf.attuali') v = Math.min(v, calcola(scheda)['pf.max'].v);
      scriviPercorso(scheda, p, v);
      const campo = app.querySelector(`input[data-p="${p}"]`); if (campo) campo.value = v;
      ricalcola(); salva();
    } else if (a === 'aggiungi') {
      (scheda[b.dataset.lista] ??= []).push(MODELLI[b.dataset.lista]());
      rendi(); salva();
    } else if (a === 'togli') {
      const parti = b.dataset.p.split('.'); const i = Number(parti.pop());
      leggiPercorso(scheda, parti.join('.')).splice(i, 1);
      rendi(); salva();
    } else if (a === 'esporta') esporta();
    else if (a === 'importa') document.getElementById('file-import').click();
    else if (a === 'ripristina') { document.getElementById('conferma').hidden = false; }
    else if (a === 'ripristina-no') { document.getElementById('conferma').hidden = true; }
    else if (a === 'ripristina-si') {
      archivio.cancella(); scheda = clona(predefinita); rendi(); stato('Scheda predefinita ripristinata');
    } else if (a === 'stampa') window.print();
  });

  function esporta() {
    const copia = clona(scheda); delete copia._firmaPredefinita;
    const blob = new Blob([JSON.stringify(copia, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${id}-fenus.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    stato('File esportato');
  }
  function importa(file) {
    const lettore = new FileReader();
    lettore.onload = () => {
      let dati;
      try { dati = JSON.parse(lettore.result); } catch (e) { return stato('File non valido: non è JSON', true); }
      if (!dati || typeof dati !== 'object' || !dati.caratteristiche) return stato('File non valido: non è una scheda', true);
      if (dati.id !== id) return stato(`Questo file è la scheda di «${dati.id || '?'}», non di «${id}»`, true);
      scheda = normalizza(dati); rendi(); salva(); stato('Scheda importata');
    };
    lettore.readAsText(file);
    document.getElementById('file-import').value = '';
  }
  function normalizza(s) {
    s.pf ??= { attuali: null, nonLetali: 0 };
    for (const k of ['attacchi', 'abilita', 'tratti', 'capacita', 'talenti', 'equipaggiamento', 'risorse']) s[k] ??= [];
    return s;
  }

  // Stampa: apri le regole, chiudi le spiegazioni
  window.addEventListener('beforeprint', () => { const r = document.getElementById('regole'); if (r) { r.dataset.eraAperto = r.open; r.open = true; } });
  window.addEventListener('afterprint', () => { const r = document.getElementById('regole'); if (r) r.open = r.dataset.eraAperto === 'true'; });

  /* ---------- avvio ---------- */
  async function avvia() {
    if (!id) { app.innerHTML = '<p class="errore-pagina">Nessun personaggio indicato. <a href="index.html">Torna all\'elenco</a>.</p>'; return; }
    try {
      const [risp, rispComune] = await Promise.all([
        fetch(`data/${id}.json`, { cache: 'no-cache' }),
        fetch('data/comune.json', { cache: 'no-cache' }).catch(() => null),
      ]);
      if (!risp.ok) throw new Error(risp.status);
      const testo = await risp.text();
      predefinita = normalizza(JSON.parse(testo));
      firmaPredefinita = firma(testo);
      if (rispComune && rispComune.ok) comune = await rispComune.json();
    } catch (e) {
      app.innerHTML = `<p class="errore-pagina">Scheda «${esc(id)}» non trovata. <a href="index.html">Torna all'elenco</a>.</p>`;
      return;
    }
    const salvata = archivio.leggi();
    scheda = salvata && salvata.id === id ? normalizza(salvata) : clona(predefinita);
    rendi();
    stato(salvata ? 'Modifiche locali caricate' : 'Scheda predefinita');
  }
  avvia();
})();
