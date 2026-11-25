/* Scheda personaggio: legge la scheda dal foglio Google (web app di Apps Script), la rende,
   ricalcola i numeri derivati e salva sul foglio solo i campi cambiati.
   /data/<id>.json è la base: completa i campi che il foglio non ha e, se il foglio non risponde
   e non c'è una copia locale, viene mostrata in sola lettura. */
'use strict';
(function () {
  const { CARATT, CARATT_BREVE, CARATT_NOME, TAGLIE, TIRI_SALVEZZA, calcola, conSegno } = window.Regole;
  const Scambio = window.Scambio;

  const id = (new URLSearchParams(location.search).get('pg') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const { Foglio, Collegamento } = window;
  const app = document.getElementById('app');
  let scheda = null;        // stato corrente mostrato nella pagina
  let predefinita = null;   // /data/<id>.json, intatta
  let istantanea = null;    // { campo: valore } come l'ultima volta che il foglio l'ha confermato
  let versione = 0;         // versione del foglio a cui si riferisce l'istantanea
  let modo = 'carica';      // 'carica' | 'foglio' (collegato) | 'offline' (copia locale, modifiche in coda) | 'dati' (solo /data, sola lettura)

  /* ---------- archivio locale (copia della scheda e coda delle modifiche), sempre protetto ---------- */
  const CHIAVE_COPIA = 'fenus-copia-' + id;
  const CHIAVE_CODICE = 'fenus-codice-' + id;
  const locale = {
    leggi(k) { try { const t = localStorage.getItem(k); return t == null ? null : JSON.parse(t); } catch (e) { return null; } },
    scrivi(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    togli(k) { try { localStorage.removeItem(k); } catch (e) { /* niente */ } },
  };
  // Codice: null = mai chiesto, '' = il giocatore ha scelto la sola lettura.
  let codice = locale.leggi(CHIAVE_CODICE);

  /* ---------- utilità ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clona = (o) => JSON.parse(JSON.stringify(o));
  const leggiPercorso = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function scriviPercorso(o, p, v) {
    const k = p.split('.'); const ultimo = k.pop();
    const dest = k.reduce((a, x) => (a[x] ??= {}), o); dest[ultimo] = v;
  }
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
  <button type="button" class="btn" data-azione="ricarica">Ricarica dal foglio</button>
  <button type="button" class="btn leggero" data-azione="stampa">Stampa</button>
  <button type="button" class="link-codice" data-azione="cambia-codice" hidden>Cambia codice</button>
  <span class="stato" id="stato" role="status"></span>
</nav>
<div class="conferma" id="conferma" hidden>
  <p>Ricaricare la scheda dal foglio? Le modifiche non ancora salvate andranno perse.</p>
  <button type="button" class="btn pericolo" data-azione="ricarica-si">Sì, ricarica</button>
  <button type="button" class="btn leggero" data-azione="ricarica-no">Annulla</button>
</div>
<form class="conferma pannello-codice" id="pannello-codice" hidden>
  <p><label for="codice-input">Per modificare questa scheda serve il codice che ti ha dato il master.</label></p>
  <input id="codice-input" type="password" autocomplete="off" autocapitalize="off" spellcheck="false">
  <button type="submit" class="btn">Sblocca</button>
  <button type="button" class="btn leggero" data-azione="codice-no">Solo lettura</button>
  <p class="errore-codice" id="codice-errore" role="alert"></p>
</form>
<div class="avviso" id="avviso" hidden>
  <div id="avviso-testo"></div>
  <button type="button" class="btn leggero" data-azione="chiudi-avviso">Ok</button>
</div>`;
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
      r.maxDa ? `<output data-c="${esc(r.maxDa)}"></output>` : num(`risorse.${i}.max`, 'w2 max'),
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
      ${g.giornalieriBase != null ? `<p class="giorn">Al giorno ${calc(`giorn.${i}`)}</p>${perche(`giorn.${i}`)}` : ''}
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
    if (!document.getElementById('corpo')) app.innerHTML = `${strumenti()}<div id="corpo"></div>`;
    document.getElementById('corpo').innerHTML = `
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
    applicaModo();
  }

  // Massimo di una risorsa: calcolato se la risorsa indica `maxDa`, altrimenti quello scritto.
  function maxRisorsa(percorso, r) {
    const ris = leggiPercorso(scheda, percorso.replace(/\.attuale$/, ''));
    if (ris && ris.maxDa && r[ris.maxDa]) return r[ris.maxDa].v;
    return Number(ris && ris.max) || 0;
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
      const max = p.startsWith('risorse.') ? maxRisorsa(p, r) : 0;
      el.textContent = max > 0 ? '☐'.repeat(Math.min(max, 30)) : '';
      el.classList.toggle('vuota', max === 0);
    });
    app.querySelectorAll('.abil [data-p$=".gradi"]').forEach((el) => {
      el.classList.toggle('troppi', (Number(el.value) || 0) > Math.max(1, Number(scheda.livello) || 1));
    });
  }

  /* ---------- modo: chi può modificare ---------- */
  const puoModificare = () => !!codice && (modo === 'foglio' || modo === 'offline');

  function applicaModo() {
    const si = puoModificare();
    document.body.classList.toggle('sola-lettura', !si);
    document.body.classList.toggle('in-aggiornamento', modo === 'carica');
    app.querySelectorAll('#corpo input, #corpo select').forEach((el) => { el.disabled = !si; });
    app.querySelectorAll('#corpo [data-p][contenteditable]').forEach((el) => { el.contentEditable = si ? EDITABILE : 'false'; });
    const link = app.querySelector('[data-azione="cambia-codice"]');
    if (link) { link.hidden = !(modo === 'foglio' || modo === 'offline'); link.textContent = codice ? 'Cambia codice' : 'Inserisci codice'; }
  }

  /* ---------- messaggi ---------- */
  const ora = () => new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  function stato(testo, male = false) {
    const el = document.getElementById('stato'); if (!el) return;
    el.textContent = testo; el.classList.toggle('male', male);
  }
  function avviso(html) {
    const box = document.getElementById('avviso'); if (!box) return;
    document.getElementById('avviso-testo').innerHTML = html;
    box.hidden = !html;
  }
  const elencoCampi = (campi) => campi.map((c) => `<strong>${esc(Foglio.nomeCampo(c))}</strong>`).join(', ');

  /* ---------- copia locale e coda ---------- */
  function salvaCopia() {
    const inAttesa = istantanea ? Object.keys(Foglio.differenze(scheda, istantanea)).length > 0 : false;
    locale.scrivi(CHIAVE_COPIA, { scheda, istantanea, versione, inAttesa, aggiornataIl: new Date().toISOString() });
    return inAttesa;
  }

  /* ---------- salvataggio sul foglio: 1,5 s dopo l'ultima modifica, solo i campi cambiati ---------- */
  let timerSalva = null, timerRiprova = null, inVolo = false, daRifare = false, tentativi = 0;

  function modificato() {
    const inAttesa = salvaCopia();
    if (!puoModificare()) return;
    if (inAttesa) stato(modo === 'offline' ? 'Offline: modifiche in coda' : 'Modifiche da salvare…');
    clearTimeout(timerSalva);
    timerSalva = setTimeout(salvaOra, 1500);
  }

  async function salvaOra() {
    clearTimeout(timerSalva); clearTimeout(timerRiprova);
    if (inVolo) { daRifare = true; return; }
    if (!puoModificare() || !istantanea) return;
    const changes = Foglio.differenze(scheda, istantanea);
    if (!Object.keys(changes).length) return;
    inVolo = true;
    try {
      const r = await Collegamento.scrivi({ pg: id, passcode: codice, changes, baseVersion: versione });
      if (r && r.ok) {
        Object.assign(istantanea, changes);
        versione = r.versione; tentativi = 0;
        if (modo === 'offline') { modo = 'foglio'; applicaModo(); avviso(''); }
        salvaCopia();
        stato(`Salvato alle ${ora()}`);
      } else if (r && r.errore === 'codice') {
        codiceRifiutato();
      } else if (r && r.errore === 'versione') {
        uniscinDalFoglio(r.campi, r.versione, 'salvataggio');
        daRifare = true;
      } else if (r && r.errore === 'occupato') {
        throw new Error('occupato');
      } else {
        stato(`Non salvato: ${(r && r.messaggio) || 'risposta inattesa'}`, true);
      }
    } catch (e) {
      tentativi++;
      const attesa = Math.min(60, 3 * 2 ** (tentativi - 1));
      stato('Non salvato, riprovo', true);
      if (modo === 'foglio') { modo = 'offline'; applicaModo(); }
      timerRiprova = setTimeout(salvaOra, attesa * 1000);
    } finally {
      inVolo = false;
      if (daRifare) { daRifare = false; timerSalva = setTimeout(salvaOra, 50); }
    }
  }

  /* Il foglio ha una versione più nuova: prende i suoi campi, tiene le modifiche del giocatore non ancora salvate
     e dice quali campi sono cambiati. */
  function uniscinDalFoglio(campiFoglio, versioneFoglio, motivo) {
    const pendenti = istantanea ? Foglio.differenze(scheda, istantanea) : {};
    const prima = istantanea || {};
    const cambiati = Object.keys(campiFoglio).filter((k) => prima[k] !== campiFoglio[k]);
    const r = Foglio.daCampi({ ...campiFoglio, ...pendenti }, predefinita);
    scheda = Scambio.normalizza(r.scheda);
    istantanea = { ...campiFoglio };
    versione = versioneFoglio;
    rendi(); salvaCopia();
    const messaggi = [];
    const aggiornati = cambiati.filter((k) => !(k in pendenti));
    const contesi = cambiati.filter((k) => k in pendenti);
    if (aggiornati.length && (motivo === 'salvataggio' || motivo === 'apertura')) {
      messaggi.push(`<p>Il foglio era stato modificato: ho aggiornato ${elencoCampi(aggiornati)}.</p>`);
    }
    if (contesi.length) messaggi.push(`<p>Cambiati anche sul foglio, ma ho tenuto la tua versione: ${elencoCampi(contesi)}.</p>`);
    if (r.problemi.length) messaggi.push(`<p>Valori illeggibili nel foglio, uso quelli di base: ${r.problemi.map(esc).join('; ')}.</p>`);
    if (messaggi.length) avviso(messaggi.join(''));
    return pendenti;
  }

  function codiceRifiutato() {
    codice = ''; locale.scrivi(CHIAVE_CODICE, '');
    applicaModo();
    stato('Codice sbagliato: sola lettura', true);
    mostraPannelloCodice('Codice sbagliato. La scheda resta in sola lettura finché non inserisci quello giusto.');
  }

  /* ---------- codice ---------- */
  function mostraPannelloCodice(errore = '') {
    const p = document.getElementById('pannello-codice'); if (!p) return;
    p.hidden = false;
    document.getElementById('codice-errore').textContent = errore;
    const input = document.getElementById('codice-input'); input.value = ''; input.focus();
  }
  async function provaCodice(valore) {
    const errore = document.getElementById('codice-errore');
    if (!valore) { errore.textContent = 'Scrivi il codice, oppure scegli «Solo lettura».'; return; }
    errore.textContent = 'Verifico…';
    try {
      const r = await Collegamento.scrivi({ pg: id, passcode: valore, changes: {}, baseVersion: versione });
      if (r && r.ok) {
        codice = valore; locale.scrivi(CHIAVE_CODICE, valore);
        document.getElementById('pannello-codice').hidden = true;
        applicaModo(); stato('Codice accettato: puoi modificare');
        salvaOra();
      } else if (r && r.errore === 'codice') {
        errore.textContent = 'Codice sbagliato.';
      } else errore.textContent = (r && r.messaggio) || 'Risposta inattesa dal foglio.';
    } catch (e) {
      // Senza rete non si può verificare: lo teniamo, il primo salvataggio dirà se è giusto.
      codice = valore; locale.scrivi(CHIAVE_CODICE, valore);
      document.getElementById('pannello-codice').hidden = true;
      applicaModo(); stato('Codice da verificare appena torna la rete');
    }
  }

  /* ---------- eventi ---------- */
  app.addEventListener('input', (e) => {
    const el = e.target; const p = el.dataset.p; if (!p || !puoModificare()) return;
    let v;
    if (el.tagName === 'INPUT' && el.type === 'number') {
      if (el.value === '' || el.value === '-') return; // in digitazione
      v = Math.trunc(Number(el.value)); if (!Number.isFinite(v)) return;
    } else if (el.tagName === 'SELECT') v = el.value;
    else v = el.innerText.replace(/\n$/, '');
    scriviPercorso(scheda, p, v);
    if (p === 'taglia') return rendi(), modificato();
    ricalcola(); modificato();
  });
  app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.tagName === 'INPUT' && el.type === 'number' && el.dataset.p && el.value === '' && puoModificare()) {
      el.value = 0; scriviPercorso(scheda, el.dataset.p, 0); ricalcola(); modificato();
    }
  });
  app.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList?.contains('ed') && !e.target.hasAttribute('data-multi')) { e.preventDefault(); e.target.blur(); }
  });
  app.addEventListener('paste', (e) => {
    if (!e.target.classList?.contains('ed') || EDITABILE === 'plaintext-only') return;
    e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'pannello-codice') return;
    e.preventDefault(); provaCodice(document.getElementById('codice-input').value.trim());
  });

  app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-azione]'); if (!b) return;
    const a = b.dataset.azione;
    if (a === 'perche') {
      const s = app.querySelector(`[data-s="${b.dataset.k}"]`);
      if (s) { s.hidden = !s.hidden; b.setAttribute('aria-expanded', String(!s.hidden)); b.classList.toggle('attivo', !s.hidden); }
      return;
    }
    if (a === 'stampa') return window.print();
    if (a === 'chiudi-avviso') return avviso('');
    if (a === 'ricarica') { document.getElementById('conferma').hidden = false; return; }
    if (a === 'ricarica-no') { document.getElementById('conferma').hidden = true; return; }
    if (a === 'ricarica-si') { document.getElementById('conferma').hidden = true; return ricaricaDalFoglio(); }
    if (a === 'cambia-codice') return mostraPannelloCodice();
    if (a === 'codice-no') {
      codice = ''; locale.scrivi(CHIAVE_CODICE, '');
      document.getElementById('pannello-codice').hidden = true; applicaModo(); stato('Sola lettura');
      return;
    }
    if (!puoModificare()) return;
    if (a === 'piu' || a === 'meno') {
      const p = b.dataset.p;
      let v = leggiPercorso(scheda, p);
      if (v == null && p === 'pf.attuali') v = calcola(scheda)['pf.max'].v;
      v = (Number(v) || 0) + (a === 'piu' ? 1 : -1);
      if (p.startsWith('risorse.')) v = Math.max(0, Math.min(v, maxRisorsa(p, calcola(scheda))));
      if (p === 'pf.nonLetali') v = Math.max(0, v);
      if (p === 'pf.attuali') v = Math.min(v, calcola(scheda)['pf.max'].v);
      scriviPercorso(scheda, p, v);
      const campo = app.querySelector(`input[data-p="${p}"]`); if (campo) campo.value = v;
      ricalcola(); modificato();
    } else if (a === 'aggiungi') {
      (scheda[b.dataset.lista] ??= []).push(MODELLI[b.dataset.lista]());
      rendi(); modificato();
    } else if (a === 'togli') {
      const parti = b.dataset.p.split('.'); const i = Number(parti.pop());
      leggiPercorso(scheda, parti.join('.')).splice(i, 1);
      rendi(); modificato();
    }
  });

  // Torna la rete: se eravamo scollegati si rilegge il foglio (che poi invia la coda), altrimenti si salva.
  window.addEventListener('online', () => {
    if (modo === 'foglio') salvaOra(); else caricaDalFoglio();
  });

  // Stampa: apri le regole, chiudi le spiegazioni
  window.addEventListener('beforeprint', () => { const r = document.getElementById('regole'); if (r) { r.dataset.eraAperto = r.open; r.open = true; } });
  window.addEventListener('afterprint', () => { const r = document.getElementById('regole'); if (r) r.open = r.dataset.eraAperto === 'true'; });

  /* ---------- lettura dal foglio ---------- */
  let timerCarica = null;
  async function caricaDalFoglio() {
    clearTimeout(timerCarica);
    if (!Collegamento.configurato()) {
      modo = 'dati'; applicaModo();
      stato('Foglio non collegato');
      avviso('<p><strong>Foglio non collegato.</strong> Questa è la scheda di base, in sola lettura.</p>');
      return;
    }
    let r;
    try { r = await Collegamento.leggi(id); } catch (e) { r = null; }
    if (r && r.ok) {
      const primaVolta = modo === 'dati' || !istantanea;
      const pendenti = uniscinDalFoglio(r.campi, r.versione, primaVolta ? 'prima' : 'apertura');
      modo = 'foglio'; applicaModo();
      stato(Object.keys(pendenti).length ? 'Invio delle modifiche in coda…' : `Aggiornata alle ${ora()}`);
      if (codice === null) mostraPannelloCodice();
      if (Object.keys(pendenti).length) salvaOra();
      return;
    }
    if (r && r.errore === 'pg') {
      modo = 'dati'; scheda = Scambio.normalizza(clona(predefinita)); rendi();
      stato('Personaggio non trovato nel foglio', true);
      avviso('<p>Questo personaggio non è nel foglio. Questa è la scheda di base, in sola lettura.</p>');
      return;
    }
    // Foglio irraggiungibile: con una copia locale si continua offline, altrimenti /data in sola lettura.
    if (istantanea) {
      modo = 'offline'; applicaModo();
      stato('Offline: modifiche in coda');
      avviso('<p><strong>Foglio non raggiungibile.</strong> Vedi l\'ultima copia salvata su questo dispositivo; le modifiche restano qui e partono appena torna la rete.</p>');
      if (Object.keys(Foglio.differenze(scheda, istantanea)).length) timerRiprova = setTimeout(salvaOra, 5000);
    } else {
      modo = 'dati'; applicaModo();
      stato('Foglio non raggiungibile', true);
      avviso('<p><strong>Foglio non raggiungibile.</strong> Questa è la scheda di base, in sola lettura. Riprovo da solo.</p>');
    }
    timerCarica = setTimeout(() => { if ((modo === 'dati' || modo === 'offline') && !inVolo) caricaDalFoglio(); }, 30000);
  }

  async function ricaricaDalFoglio() {
    stato('Aggiornamento…');
    let r;
    try { r = await Collegamento.leggi(id); } catch (e) { r = null; }
    if (!r || !r.ok) { stato('Foglio non raggiungibile: niente da ricaricare', true); return; }
    istantanea = { ...r.campi }; versione = r.versione;
    const conv = Foglio.daCampi(r.campi, predefinita);
    scheda = Scambio.normalizza(conv.scheda);
    if (modo !== 'dati') modo = 'foglio';
    rendi(); salvaCopia(); avviso('');
    stato(`Ricaricata dal foglio alle ${ora()}`);
  }

  /* ---------- avvio ---------- */
  async function avvia() {
    if (!id) { app.innerHTML = '<p class="errore-pagina">Nessun personaggio indicato. <a href="index.html">Torna all\'elenco</a>.</p>'; return; }
    const [rispBase, rispComune] = await Promise.all([
      fetch(`data/${id}.json`, { cache: 'no-cache' }).catch(() => null),
      fetch('data/comune.json', { cache: 'no-cache' }).catch(() => null),
    ]);
    if (rispBase && rispBase.ok) predefinita = Scambio.normalizza(await rispBase.json());
    if (rispComune && rispComune.ok) comune = await rispComune.json().catch(() => null);
    const copia = locale.leggi(CHIAVE_COPIA);
    if (!predefinita && !(copia && copia.scheda)) {
      app.innerHTML = `<p class="errore-pagina">Scheda «${esc(id)}» non trovata. <a href="index.html">Torna all'elenco</a>.</p>`;
      return;
    }
    predefinita ??= Scambio.normalizza(clona(copia.scheda));
    // Subito l'ultima copia locale (o la base), marcata "Aggiornamento…", poi il foglio.
    if (copia && copia.scheda && copia.istantanea) {
      scheda = Scambio.normalizza(copia.scheda); istantanea = copia.istantanea; versione = Number(copia.versione) || 0;
    } else scheda = Scambio.normalizza(clona(predefinita));
    modo = 'carica';
    rendi();
    stato('Aggiornamento…');
    await caricaDalFoglio();
  }
  avvia();
})();
