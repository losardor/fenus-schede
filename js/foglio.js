/* Conversione scheda ⇄ righe del foglio Google ("campo", "valore").
   Funzioni pure, usate dalla pagina e dagli strumenti Node (tools/).
   - Le caratteristiche diventano righe col loro nome breve: for, des, cos, int, sag, car.
   - Gli altri gruppi di campi (ts, ca, pf) diventano righe col percorso puntato: ts.tempra.base.
   - Gli elenchi e gli incantesimi diventano una riga con il JSON compatto.
   - Ogni valore è testo: numeri come "14", vuoto come "", vero/falso come "true"/"false".
   Restano fuori: id (è il nome della scheda del foglio), versione (sta in _config),
   e i campi dell'invio al master (noteMaster, esportatoIl, inviataIl). */
'use strict';
(function (radice) {
  const { CARATT } = radice.Regole;
  const { SCHEMA, META } = radice.Scambio;

  const ESCLUSI = new Set(['id', 'versione', ...META]);
  const COME_JSON = new Set(['risorse', 'attacchi', 'abilita', 'incantesimi', 'tratti', 'capacita', 'talenti', 'equipaggiamento']);

  const testo = (v) => (v == null ? '' : typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v));

  /* Scheda → [[campo, valore], …] nell'ordine dello schema. */
  function inRighe(s) {
    const righe = [];
    for (const k of Object.keys(SCHEMA)) {
      if (ESCLUSI.has(k) || !(k in s) || s[k] === undefined) continue;
      if (k === 'caratteristiche') { for (const c of CARATT) righe.push([c, testo(s.caratteristiche?.[c])]); continue; }
      if (COME_JSON.has(k)) { righe.push([k, s[k] == null ? '' : JSON.stringify(s[k])]); continue; }
      if (typeof SCHEMA[k] === 'object' && !Array.isArray(SCHEMA[k])) {
        (function giro(v, schema, p) {
          for (const sk of Object.keys(schema)) {
            if (!v || !(sk in v)) continue;
            if (typeof schema[sk] === 'object') giro(v[sk], schema[sk], `${p}.${sk}`);
            else righe.push([`${p}.${sk}`, testo(v[sk])]);
          }
        })(s[k], SCHEMA[k], k);
        continue;
      }
      righe.push([k, testo(s[k])]);
    }
    return righe;
  }
  const inCampi = (s) => Object.fromEntries(inRighe(s));

  // Percorso nella scheda e tipo atteso per un nome di campo del foglio.
  function percorsoDi(campo) {
    if (CARATT.includes(campo)) return { percorso: ['caratteristiche', campo], tipo: 'num' };
    const p = campo.split('.');
    if (ESCLUSI.has(p[0]) || !(p[0] in SCHEMA)) return null;
    if (COME_JSON.has(p[0])) return p.length === 1 ? { percorso: p, tipo: 'json' } : null;
    let tipo = SCHEMA;
    for (const x of p) { if (!tipo || typeof tipo !== 'object' || Array.isArray(tipo) || !(x in tipo)) return null; tipo = tipo[x]; }
    return typeof tipo === 'string' ? { percorso: p, tipo } : null;
  }

  function converti(valore, tipo) {
    const t = valore == null ? '' : String(valore).trim();
    switch (tipo) {
      case 'json': return t === '' ? null : JSON.parse(t);
      case 'num': { if (t === '') return 0; const n = Number(t.replace(',', '.')); if (!Number.isFinite(n)) throw new Error('non è un numero'); return Math.trunc(n); }
      case 'num?': { if (t === '') return null; const n = Number(t.replace(',', '.')); if (!Number.isFinite(n)) throw new Error('non è un numero'); return Math.trunc(n); }
      case 'bool': return /^(true|vero|sì|si|1|x)$/i.test(t);
      default: return valore == null ? '' : String(valore);
    }
  }

  /* {campo: valore} → scheda. `base` (da /data) dà id e i campi che il foglio non ha.
     Restituisce { scheda, problemi: [testo], sconosciuti: [campo] }. */
  function daCampi(campi, base) {
    const s = JSON.parse(JSON.stringify(base || {}));
    const problemi = []; const sconosciuti = [];
    for (const [campo, valore] of Object.entries(campi || {})) {
      const dove = percorsoDi(campo);
      if (!dove) { sconosciuti.push(campo); continue; }
      let v;
      try { v = converti(valore, dove.tipo); } catch (e) { problemi.push(`${campo}: ${e.message}`); continue; }
      const ultimo = dove.percorso[dove.percorso.length - 1];
      const dest = dove.percorso.slice(0, -1).reduce((a, x) => (a[x] && typeof a[x] === 'object' ? a[x] : (a[x] = {})), s);
      if (dove.tipo === 'json' && v === null && ultimo !== 'incantesimi') v = [];
      if (dove.tipo === 'json' && v === null) delete dest[ultimo]; else dest[ultimo] = v;
    }
    return { scheda: s, problemi, sconosciuti };
  }

  /* Campi della scheda che differiscono da un'istantanea del foglio. */
  function differenze(s, istantanea) {
    const ora = inCampi(s); const diff = {};
    for (const [k, v] of Object.entries(ora)) if (!istantanea || istantanea[k] !== v) diff[k] = v;
    return diff;
  }

  // Nome leggibile di un campo, per gli avvisi ("des" → "Des", "ts.tempra.base" → "ts.tempra.base").
  const nomeCampo = (campo) => (CARATT.includes(campo) ? radice.Regole.CARATT_BREVE[campo] : campo);

  const Foglio = { inRighe, inCampi, daCampi, differenze, nomeCampo, percorsoDi };
  radice.Foglio = Foglio;
  if (typeof module === 'object' && module.exports) module.exports = Foglio;
})(typeof window !== 'undefined' ? window : globalThis);
