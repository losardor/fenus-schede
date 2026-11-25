/* Scambio giocatore → master: file di esportazione, schema della scheda, validazione.
   Usato da sheet.html (Esporta JSON, Invia al master, Importa) e da gm.html. */
'use strict';
(function () {
  const { CARATT, TAGLIE } = window.Regole;

  // Campi aggiunti dall'invio, che non fanno parte della scheda di base.
  const META = ['noteMaster', 'esportatoIl', 'inviataIl'];

  /* Schema: 'num', 'num?' (anche null), 'str', 'bool', 'caratt', 'taglia', oggetti annidati, [elemento]. */
  const TS = { base: 'num', vari: 'num', nota: 'str' };
  const VERIFICA = { verifica: 'bool' };
  const SCHEMA = {
    id: 'str', versione: 'num', nome: 'str', descrizione: 'str', razza: 'str', razzaVerifica: 'bool',
    livello: 'num', taglia: 'taglia', velocita: 'str',
    caratteristiche: Object.fromEntries(CARATT.map((c) => [c, 'num'])),
    dadoVita: 'num', pfVari: 'num', pfVariNota: 'str', bab: 'num',
    puntiAbilitaClasse: 'num', puntiAbilitaRazza: 'num',
    ts: { tempra: TS, riflessi: TS, volonta: TS },
    ca: { armatura: 'num', naturale: 'num', vari: 'num', nota: 'str' },
    iniziativaVari: 'num',
    pf: { attuali: 'num?', nonLetali: 'num' },
    risorse: [{ nome: 'str', max: 'num', attuale: 'num', maxDa: 'str', ...VERIFICA }],
    attacchi: [{ nome: 'str', caratt: 'caratt', vari: 'num', nota: 'str', tipo: 'str', danni: 'str', critico: 'str', dettagli: 'str', ...VERIFICA }],
    abilita: [{ nome: 'str', caratt: 'caratt', gradi: 'num', vari: 'num', nota: 'str', ...VERIFICA }],
    incantesimi: { titolo: 'str', caratt: 'caratt', mostraCD: 'bool', gruppi: [{ livello: 'num', nome: 'str', voci: 'str', giornalieriBase: 'num' }] },
    tratti: [{ testo: 'str', ...VERIFICA }],
    capacita: [{ nome: 'str', testo: 'str', ...VERIFICA }],
    talenti: [{ testo: 'str', ...VERIFICA }],
    equipaggiamento: [{ testo: 'str', ...VERIFICA }],
    protesi: 'str', note: 'str',
    noteMaster: 'str', esportatoIl: 'str', inviataIl: 'str',
  };

  function tipoOk(tipo, v) {
    switch (tipo) {
      case 'num': return typeof v === 'number' && Number.isFinite(v);
      case 'num?': return v === null || (typeof v === 'number' && Number.isFinite(v));
      case 'str': return typeof v === 'string';
      case 'bool': return typeof v === 'boolean';
      case 'caratt': return CARATT.includes(v);
      case 'taglia': return Object.prototype.hasOwnProperty.call(TAGLIE, v);
      default: return false;
    }
  }

  /* Restituisce { errori: [testo] (il file non si può usare), problemi: [{percorso, tipo, testo}] }. */
  function valida(dati, idNoti) {
    const errori = []; const problemi = [];
    if (!dati || typeof dati !== 'object' || Array.isArray(dati)) return { errori: ['Il file non contiene una scheda.'], problemi };
    if (typeof dati.id !== 'string' || !dati.id) errori.push('Manca l\'id del personaggio.');
    else if (idNoti && !idNoti.includes(dati.id)) errori.push(`Personaggio sconosciuto: «${dati.id}».`);
    if (!dati.caratteristiche || typeof dati.caratteristiche !== 'object') errori.push('Mancano le caratteristiche.');
    (function giro(v, schema, percorso) {
      if (Array.isArray(schema)) {
        if (!Array.isArray(v)) return problemi.push({ percorso, tipo: 'tipo', testo: 'dovrebbe essere un elenco' });
        return v.forEach((x, i) => giro(x, schema[0], `${percorso}.${i}`));
      }
      if (typeof schema === 'object') {
        if (v === null && percorso === 'incantesimi') return;
        if (!v || typeof v !== 'object' || Array.isArray(v)) return problemi.push({ percorso, tipo: 'tipo', testo: 'dovrebbe essere un gruppo di campi' });
        for (const k of Object.keys(v)) {
          const p = percorso ? `${percorso}.${k}` : k;
          if (!(k in schema)) problemi.push({ percorso: p, tipo: 'sconosciuto', testo: 'campo non previsto dallo schema' });
          else giro(v[k], schema[k], p);
        }
        return;
      }
      if (!tipoOk(schema, v)) problemi.push({ percorso, tipo: 'tipo', testo: `valore non valido (${JSON.stringify(v)})` });
    })(dati, SCHEMA, '');
    return { errori, problemi };
  }

  function normalizza(s) {
    delete s._firmaPredefinita; // residuo di una versione precedente del sito
    s.pf ??= { attuali: null, nonLetali: 0 };
    for (const k of ['attacchi', 'abilita', 'tratti', 'capacita', 'talenti', 'equipaggiamento', 'risorse']) s[k] ??= [];
    return s;
  }

  const due = (x) => String(x).padStart(2, '0');
  const dataBreve = (d) => `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;

  /* File da inviare o esportare: la scheda con id, versione, momento dell'esportazione e note per il master. */
  function fileScheda(scheda, adesso = new Date()) {
    const dati = JSON.parse(JSON.stringify(scheda));
    dati.versione = Number(dati.versione) || 1;
    dati.esportatoIl = adesso.toISOString();
    dati.noteMaster ??= '';
    // id e versione in testa, per chi apre il file a mano
    const ordinato = { id: dati.id, versione: dati.versione, esportatoIl: dati.esportatoIl, noteMaster: dati.noteMaster, ...dati };
    return { nome: `${dati.id}-${dataBreve(adesso)}.json`, testo: JSON.stringify(ordinato, null, 2) + '\n' };
  }

  function scarica(nome, testo) {
    const blob = new Blob([testo], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const dataOra = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  window.Scambio = { META, SCHEMA, valida, normalizza, fileScheda, scarica, dataOra };
})();
