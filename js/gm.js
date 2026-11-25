/* Revisione del master: confronta i file dei giocatori con le schede di base in /data.
   Non usa localStorage né rete esterna: legge solo i file del sito e quelli trascinati. */
'use strict';
(function () {
  const { calcola, conSegno, CARATT_BREVE, TIRI_SALVEZZA } = window.Regole;
  const { META, valida, normalizza, scarica, dataOra } = window.Scambio;

  const $ = (s) => document.getElementById(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clona = (o) => JSON.parse(JSON.stringify(o));
  const ugualeJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  let ids = [];
  const base = {};            // id → scheda di base da /data
  const voci = new Map();     // chiave → risultato dell'analisi (un file per personaggio: l'ultimo vince)

  const ETICHETTE = {
    nome: 'Nome', descrizione: 'Descrizione', razza: 'Razza', livello: 'Livello', taglia: 'Taglia', velocita: 'Velocità',
    caratteristiche: 'Caratteristiche', dadoVita: 'Dado vita', pfVari: 'PF vari', pfVariNota: 'Nota PF vari', bab: 'BAB',
    puntiAbilitaClasse: 'Punti abilità di classe', puntiAbilitaRazza: 'Punti abilità razziali',
    ts: 'Tiri salvezza', ca: 'CA', iniziativaVari: 'Iniziativa vari', pf: 'PF', risorse: 'Risorse', attacchi: 'Attacchi',
    abilita: 'Abilità', incantesimi: 'Incantesimi', gruppi: 'gruppo', tratti: 'Tratti razziali', capacita: 'Capacità',
    talenti: 'Talenti', equipaggiamento: 'Equipaggiamento', protesi: 'Protesi', note: 'Note',
    attuali: 'attuali', nonLetali: 'non letali', armatura: 'armatura', naturale: 'naturale', vari: 'vari', nota: 'nota',
    base: 'base classe', gradi: 'gradi', caratt: 'caratteristica', attuale: 'attuale', max: 'massimo', testo: 'testo',
    tempra: 'Tempra', riflessi: 'Riflessi', volonta: 'Volontà', ...CARATT_BREVE,
  };

  /* ---------- confronto campo per campo ---------- */
  const nomeVoce = (x, i) => (x && typeof x === 'object' ? (x.nome || (x.testo ? (x.testo.length > 40 ? x.testo.slice(0, 40) + '…' : x.testo) : '')) : '') || `n. ${i + 1}`;
  const nomiUnici = (arr) => arr.every((x) => x && typeof x === 'object' && x.nome) && new Set(arr.map((x) => x.nome)).size === arr.length;

  function confronta(a, b, percorso, etichetta, righe) {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (nomiUnici(a) && nomiUnici(b)) {        // abbina per nome: un'aggiunta non sposta le altre righe
        const inB = new Map(b.map((x, i) => [x.nome, i]));
        a.forEach((x, i) => {
          const p = `${percorso}.${i}`, et = [...etichetta, x.nome];
          if (inB.has(x.nome)) confronta(x, b[inB.get(x.nome)], `${percorso}.${inB.get(x.nome)}`, et, righe);
          else righe.push({ tipo: 'rimosso', percorso: p, etichetta: et, prima: x, dopo: undefined });
        });
        const inA = new Set(a.map((x) => x.nome));
        b.forEach((x, i) => { if (!inA.has(x.nome)) righe.push({ tipo: 'aggiunto', percorso: `${percorso}.${i}`, etichetta: [...etichetta, x.nome], prima: undefined, dopo: x }); });
        return;
      }
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) {
        const et = [...etichetta, nomeVoce(a[i] ?? b[i], i)];
        if (i >= a.length) righe.push({ tipo: 'aggiunto', percorso: `${percorso}.${i}`, etichetta: et, prima: undefined, dopo: b[i] });
        else if (i >= b.length) righe.push({ tipo: 'rimosso', percorso: `${percorso}.${i}`, etichetta: et, prima: a[i], dopo: undefined });
        else confronta(a[i], b[i], `${percorso}.${i}`, et, righe);
      }
      return;
    }
    const ogg = (x) => x && typeof x === 'object' && !Array.isArray(x);
    if (ogg(a) && ogg(b)) {
      const chiavi = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      for (const k of chiavi) {
        if (!percorso && (META.includes(k) || k === 'versione' || k === 'id')) continue;
        const p = percorso ? `${percorso}.${k}` : k;
        const et = [...etichetta, ETICHETTE[k] || k];
        if (!(k in a)) righe.push({ tipo: 'aggiunto', percorso: p, etichetta: et, prima: undefined, dopo: b[k] });
        else if (!(k in b)) righe.push({ tipo: 'rimosso', percorso: p, etichetta: et, prima: a[k], dopo: undefined });
        else confronta(a[k], b[k], p, et, righe);
      }
      return;
    }
    if (!ugualeJSON(a, b)) righe.push({ tipo: 'modificato', percorso, etichetta, prima: a, dopo: b });
  }

  /* ---------- numeri derivati ---------- */
  function derivati(s) {
    const r = calcola(s);
    const out = new Map();
    const metti = (et, k) => { if (r[k]) out.set(et, r[k]); };
    metti('PF max', 'pf.max'); metti('CA', 'ca'); metti('CA contatto', 'ca.contatto'); metti('CA impreparato', 'ca.impreparato');
    TIRI_SALVEZZA.forEach((t) => metti(t.nome, 'ts.' + t.chiave));
    metti('Iniziativa', 'iniziativa'); metti('BMC', 'bmc'); metti('DMC', 'dmc');
    (s.attacchi || []).forEach((a, i) => metti(`Attacco: ${a.nome || i + 1}`, `att.${i}`));
    (s.abilita || []).forEach((a, i) => metti(`Abilità: ${a.nome || i + 1}`, `ab.${i}`));
    (s.incantesimi?.gruppi || []).forEach((g, i) => { metti(`CD ${g.livello}°`, `cd.${i}`); metti(`Incantesimi ${g.livello}° al giorno`, `giorn.${i}`); });
    metti('Punti abilità spesi', 'punti.abilita');
    return out;
  }
  const mostraNum = (x) => (x ? (x.segnato ? conSegno(x.v) : String(x.v)) + (x.massimo != null ? ` / ${x.massimo}` : '') : '—');

  /* ---------- analisi di un file ---------- */
  function analizza(nomeFile, testo) {
    let dati;
    try { dati = JSON.parse(testo); } catch (e) { return { nomeFile, errori: ['Il file non è JSON valido.'] }; }
    const { errori, problemi } = valida(dati, ids);
    if (errori.length) return { nomeFile, id: dati?.id, errori };
    const def = base[dati.id];
    const file = normalizza(clona(dati));
    // I campi di base che il file non porta (es. aggiunti dopo che il giocatore ha salvato) restano quelli di /data.
    const unita = {};
    for (const k of Object.keys(def)) unita[k] = k in file ? file[k] : clona(def[k]);
    for (const k of Object.keys(file)) if (!(k in unita)) unita[k] = file[k];

    const righe = [];
    confronta(def, unita, '', [], righe);

    const dPrima = derivati(def), dDopo = derivati(unita);
    const derivRighe = [...new Set([...dPrima.keys(), ...dDopo.keys()])].map((et) => ({
      etichetta: et, prima: dPrima.get(et), dopo: dDopo.get(et),
      cambiato: mostraNum(dPrima.get(et)) !== mostraNum(dDopo.get(et)),
    }));

    const rossi = [];
    for (const [c, nome] of Object.entries(CARATT_BREVE)) {
      const a = def.caratteristiche?.[c], b = unita.caratteristiche?.[c];
      if (!ugualeJSON(a, b)) rossi.push(`Caratteristica cambiata: ${nome} ${a} → ${b}`);
    }
    const liv = Math.max(1, Number(unita.livello) || 1);
    (unita.abilita || []).forEach((a) => {
      if ((Number(a.gradi) || 0) > liv) rossi.push(`Gradi oltre il massimo: ${a.nome} ha ${a.gradi} gradi, il massimo al livello ${liv} è ${liv}`);
    });
    const pa = calcola(unita)['punti.abilita'];
    if (pa && pa.errore) rossi.push(`Punti abilità oltre il limite di classe: ${pa.testo}`);
    problemi.forEach((p) => rossi.push(p.tipo === 'sconosciuto'
      ? `Campo sconosciuto allo schema: ${p.percorso}`
      : `Valore non valido in ${p.percorso}: ${p.testo}`));

    const avvisi = [];
    const vFile = Number(dati.versione) || 1, vBase = Number(def.versione) || 1;
    if (vFile < vBase) avvisi.push(`Il file parte dalla versione ${vFile}, ma la scheda di base è già alla ${vBase}: controlla di non perdere modifiche fatte da te.`);

    const percorsiRossi = new Set(problemi.map((p) => p.percorso));
    return { nomeFile, id: dati.id, dati, unita, righe, derivRighe, rossi, avvisi, vFile, vBase, percorsiRossi, errori: [] };
  }

  /* ---------- file per /data ---------- */
  function filePerData(v) {
    const def = base[v.id];
    const fuori = clona(v.unita);
    META.forEach((k) => delete fuori[k]);
    fuori.versione = Math.max(v.vFile, v.vBase) + 1;
    const ordinato = {};
    for (const k of Object.keys(def)) if (k in fuori) ordinato[k] = fuori[k];
    if (!('versione' in def)) ordinato.versione = fuori.versione;
    for (const k of Object.keys(fuori)) if (!(k in ordinato)) ordinato[k] = fuori[k];
    return { nome: `${v.id}.json`, testo: JSON.stringify(ordinato, null, 2) + '\n', versione: fuori.versione };
  }

  /* ---------- resa ---------- */
  const valore = (x) => {
    if (x === undefined) return '<span class="vuoto">—</span>';
    if (x === null) return '<span class="vuoto">vuoto</span>';
    if (typeof x === 'object') return `<code>${esc(Array.isArray(x) ? `${x.length} voci` : nomeVoce(x, 0))}</code>`;
    if (x === '') return '<span class="vuoto">(vuoto)</span>';
    return esc(x);
  };
  const TIPO = { modificato: 'modificato', aggiunto: 'aggiunto', rimosso: 'rimosso' };

  function carta(chiave, v) {
    if (v.errori.length) {
      return `<article class="blocco gm-carta errore-file"><h2>${esc(v.nomeFile)}</h2>
        <ul class="rossi">${v.errori.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
        <button type="button" class="btn leggero" data-togli="${esc(chiave)}">Togli</button></article>`;
    }
    const s = v.unita;
    const nota = (v.dati.noteMaster || '').trim();
    const nuova = filePerData(v);
    const righe = v.righe.length ? `
      <table class="gm-tab"><thead><tr><th>Campo</th><th>Prima (/data)</th><th>Dopo (giocatore)</th></tr></thead><tbody>
      ${v.righe.map((r) => {
        const rosso = v.percorsiRossi.has(r.percorso) || /^caratteristiche\./.test(r.percorso) || (/\.gradi$/.test(r.percorso) && Number(r.dopo) > Math.max(1, Number(s.livello) || 1));
        return `<tr class="${rosso ? 'rosso' : ''}"><td>${esc(r.etichetta.join(' › '))}<small>${esc(r.percorso)} · ${TIPO[r.tipo]}</small></td><td>${valore(r.prima)}</td><td>${valore(r.dopo)}</td></tr>`;
      }).join('')}</tbody></table>`
      : '<p class="tenue">Nessun campo diverso dalla scheda di base.</p>';
    const deriv = `
      <table class="gm-tab deriv"><thead><tr><th>Numero</th><th>Prima</th><th>Dopo</th></tr></thead><tbody>
      ${v.derivRighe.map((d) => `<tr class="${d.cambiato ? 'cambiato' : ''}${d.dopo?.errore ? ' rosso' : ''}"><td>${esc(d.etichetta)}${d.dopo && d.cambiato ? `<small>${esc(d.dopo.testo)}</small>` : ''}</td><td>${esc(mostraNum(d.prima))}</td><td>${esc(mostraNum(d.dopo))}</td></tr>`).join('')}
      </tbody></table>`;
    return `
    <article class="blocco gm-carta">
      <header class="gm-testa">
        <div><h2>${esc(s.nome || v.id)} <small>${esc(s.descrizione || '')}</small></h2>
        <p class="tenue">${esc(v.nomeFile)}${v.dati.esportatoIl ? ` · esportato il ${esc(dataOra(v.dati.esportatoIl))}` : ''} · versione ${v.vFile} (base ${v.vBase})</p></div>
        <div class="gm-bottoni">
          <button type="button" class="btn" data-scarica="${esc(chiave)}">Scarica per /data</button>
          <button type="button" class="btn leggero" data-togli="${esc(chiave)}">Togli</button>
        </div>
      </header>
      <p class="tenue piccolo">Scarica <code>${esc(nuova.nome)}</code> con versione ${nuova.versione}.</p>
      ${v.rossi.length ? `<ul class="rossi">${v.rossi.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '<p class="ok">Nessun problema di regole trovato.</p>'}
      ${v.avvisi.map((a) => `<p class="arancio">${esc(a)}</p>`).join('')}
      <h3>Note per il master</h3>
      ${nota ? `<blockquote class="nota-master">${esc(nota)}</blockquote>` : '<p class="tenue">Nessuna nota.</p>'}
      <h3>Campi modificati (${v.righe.length})</h3>
      ${righe}
      <details class="gm-deriv" ${v.derivRighe.some((d) => d.cambiato) ? 'open' : ''}>
        <summary>Numeri ricalcolati (${v.derivRighe.filter((d) => d.cambiato).length} cambiati)</summary>
        ${deriv}
      </details>
    </article>`;
  }

  function rendi() {
    $('risultati').innerHTML = [...voci].map(([k, v]) => carta(k, v)).join('');
    const validi = [...voci.values()].filter((v) => !v.errori.length).length;
    $('gm-azioni').hidden = validi === 0;
  }

  async function leggiFile(files) {
    const nuovi = [];
    for (const f of files) {
      let v;
      try { v = analizza(f.name, await f.text()); } catch (e) {
        console.error(e);
        v = { nomeFile: f.name, errori: [`Impossibile analizzare il file: ${e && e.message ? e.message : e}`] };
      }
      const chiave = v.errori.length ? `file:${f.name}:${Math.random()}` : v.id;
      if (voci.has(chiave)) nuovi.push(`${v.id}: il nuovo file sostituisce il precedente`);
      voci.delete(chiave); voci.set(chiave, v);
    }
    try { rendi(); } catch (e) {
      console.error(e);
      $('gm-stato').textContent = `Errore nella pagina del master: ${e && e.message ? e.message : e}`;
      $('gm-stato').classList.add('male');
      return;
    }
    $('gm-stato').classList.remove('male');
    $('gm-stato').textContent = `${voci.size} file in revisione.${nuovi.length ? ' ' + nuovi.join('; ') + '.' : ''}`;
  }

  /* ---------- eventi ---------- */
  const zona = $('zona');
  ['dragenter', 'dragover'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.add('sopra'); }));
  ['dragleave', 'drop'].forEach((t) => zona.addEventListener(t, () => zona.classList.remove('sopra')));
  zona.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer?.files?.length) leggiFile([...e.dataTransfer.files]); });
  // un file lasciato fuori dalla zona non deve aprire il JSON al posto della pagina
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
  $('file-gm').addEventListener('change', (e) => { leggiFile([...e.target.files]); e.target.value = ''; });

  $('risultati').addEventListener('click', (e) => {
    const s = e.target.closest('[data-scarica]'); const t = e.target.closest('[data-togli]');
    if (s) { const f = filePerData(voci.get(s.dataset.scarica)); scarica(f.nome, f.testo); }
    if (t) { voci.delete(t.dataset.togli); rendi(); $('gm-stato').textContent = `${voci.size} file in revisione.`; }
  });
  $('scarica-tutte').addEventListener('click', async () => {
    for (const v of voci.values()) {
      if (v.errori.length) continue;
      const f = filePerData(v); scarica(f.nome, f.testo);
      await new Promise((r) => setTimeout(r, 400)); // alcuni browser bloccano download troppo ravvicinati
    }
  });
  $('svuota').addEventListener('click', () => { voci.clear(); rendi(); $('gm-stato').textContent = 'Nessun file in revisione.'; });

  /* ---------- avvio: schede di base ---------- */
  (async function () {
    try {
      ids = await (await fetch('data/personaggi.json', { cache: 'no-cache' })).json();
      await Promise.all(ids.map(async (id) => {
        const r = await fetch(`data/${id}.json`, { cache: 'no-cache' });
        if (!r.ok) throw new Error(id);
        base[id] = normalizza(await r.json());
      }));
      $('gm-stato').textContent = `Schede di base caricate: ${ids.join(', ')}. Pronto.`;
    } catch (e) {
      $('gm-stato').textContent = 'Impossibile leggere le schede in /data. Apri questa pagina dal sito (GitHub Pages o server locale), non come file.';
      $('gm-stato').classList.add('male');
    }
  })();
})();
