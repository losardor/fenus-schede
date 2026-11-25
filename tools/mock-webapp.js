#!/usr/bin/env node
/* Finta web app per provare il sito senza Google.
   Esegue i veri apps-script/Code.gs e tools/seed.gs dentro Node, con un piccolo finto
   SpreadsheetApp salvato in un file JSON, e risponde come Apps Script:
   ogni GET/POST su /exec restituisce un 302 verso /echo, che dà il JSON.
   Le richieste OPTIONS (preflight CORS) vengono rifiutate, come fa Apps Script.

   Uso:
     node tools/mock-webapp.js [--porta 8787] [--archivio foglio-finto.json] [--semina] [--codice jeko=drago ...]
   Poi in config.js: webAppUrl: 'http://localhost:8787/exec'

   Solo per le prove: /_test/modifica simula il master che scrive a mano nel foglio
   (POST JSON { foglio, campo, valore }), /_test/foglio?nome=… restituisce le righe,
   /_test/registro restituisce e azzera l'elenco delle celle scritte dallo script. */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const vm = require('vm');

const arg = (nome, def) => { const i = process.argv.indexOf(nome); return i > 0 ? process.argv[i + 1] : def; };
const PORTA = Number(arg('--porta', 8787));
const ARCHIVIO = path.resolve(arg('--archivio', path.join(require('os').tmpdir(), 'fenus-foglio-finto.json')));
const SEMINA = process.argv.includes('--semina') || !fs.existsSync(ARCHIVIO);
const CODICI = process.argv.flatMap((a, i) => (process.argv[i - 1] === '--codice' ? [a.split('=')] : []));
const RADICE = path.join(__dirname, '..');

/* ---------- finto foglio di calcolo ---------- */
let dati = { fogli: {}, ordine: [] };            // fogli: nome → { valori: [[…]], testo: { "r,c": true } }
let registro = [];                                // celle scritte dallo script
let inTest = false;                               // true durante /_test/modifica: non registrare

const salvaArchivio = () => fs.writeFileSync(ARCHIVIO, JSON.stringify(dati));
const caricaArchivio = () => { dati = JSON.parse(fs.readFileSync(ARCHIVIO, 'utf8')); };

function comeSheets(v, formatoTesto) {
  // Imita la conversione di Sheets: l'apostrofo forza il testo e sparisce; senza formato testo i numeri diventano numeri.
  if (typeof v === 'string' && v.startsWith("'")) return v.slice(1);
  if (typeof v === 'string' && !formatoTesto && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return v;
}

function Foglio(nome) {
  const f = () => dati.fogli[nome];
  const righeUsate = () => { const v = f().valori; let n = v.length; while (n > 0 && v[n - 1].every((x) => x === '' || x == null)) n--; return n; };
  const colonneUsate = () => Math.max(0, ...f().valori.map((r) => { let n = r.length; while (n > 0 && (r[n - 1] === '' || r[n - 1] == null)) n--; return n; }));
  function imposta(r, c, v) {
    const val = f().valori;
    while (val.length < r) val.push([]);
    while (val[r - 1].length < c) val[r - 1].push('');
    val[r - 1][c - 1] = comeSheets(v, f().testo[`${r},${c}`]);
    if (!inTest) registro.push({ foglio: nome, riga: r, colonna: c, valore: val[r - 1][c - 1] });
  }
  function Intervallo(r, c, nr = 1, nc = 1) {
    return {
      getSheet: () => foglioOggetto,
      setNumberFormat(fmt) { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) f().testo[`${r + i},${c + j}`] = fmt === '@'; return this; },
      setValue(v) { imposta(r, c, v); return this; },
      setValues(m) { m.forEach((riga, i) => riga.forEach((v, j) => imposta(r + i, c + j, v))); return this; },
      getValues() { const out = []; for (let i = 0; i < nr; i++) { const riga = []; for (let j = 0; j < nc; j++) riga.push(f().valori[r + i - 1]?.[c + j - 1] ?? ''); out.push(riga); } return out; },
    };
  }
  const foglioOggetto = {
    getName: () => nome,
    getDataRange: () => Intervallo(1, 1, righeUsate(), colonneUsate()),
    getRange: (r, c, nr, nc) => Intervallo(r, c, nr, nc),
    getLastRow: righeUsate,
    getMaxRows: () => Math.max(1000, f().valori.length),
    setFrozenRows: () => foglioOggetto,
  };
  return foglioOggetto;
}
const Spreadsheet = {
  getSheetByName: (n) => (dati.fogli[n] ? Foglio(n) : null),
  insertSheet: (n) => { dati.fogli[n] = { valori: [], testo: {} }; dati.ordine.push(n); return Foglio(n); },
};

/* ---------- ambiente Apps Script e caricamento degli script veri ---------- */
const contesto = vm.createContext({
  SpreadsheetApp: { getActiveSpreadsheet: () => Spreadsheet },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (testo) => ({ testo, setMimeType() { return this; } }),
  },
  Logger: { log: (...a) => console.log('[Logger]', ...a) },
});
for (const file of ['apps-script/Code.gs', 'tools/seed.gs']) {
  vm.runInContext(fs.readFileSync(path.join(RADICE, file), 'utf8'), contesto, { filename: file });
}

if (SEMINA) {
  dati = { fogli: {}, ordine: [] };
  vm.runInContext('semina()', contesto);
} else caricaArchivio();
inTest = true;
for (const [id, codice] of CODICI) {
  const v = dati.fogli._config.valori;
  const i = v.findIndex((r) => String(r[0]) === id);
  if (i > 0) v[i][1] = codice;
}
inTest = false;
salvaArchivio();
registro = [];

/* ---------- HTTP come Apps Script ---------- */
const echi = new Map();
let contatore = 0;
let preflight = 0;
const CORS = { 'Access-Control-Allow-Origin': '*' };

function rispondiConRedirect(req, res, uscita) {
  const k = String(++contatore);
  echi.set(k, uscita.testo);
  res.writeHead(302, { ...CORS, Location: `http://${req.headers.host}/echo?k=${k}` });
  res.end();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const corpo = [];
  req.on('data', (c) => corpo.push(c));
  req.on('end', () => {
    const testo = Buffer.concat(corpo).toString('utf8');
    try {
      if (req.method === 'OPTIONS') { preflight++; res.writeHead(405); return res.end(); }
      if (url.pathname === '/exec' && req.method === 'GET') {
        caricaArchivio();
        return rispondiConRedirect(req, res, contesto.doGet({ parameter: Object.fromEntries(url.searchParams) }));
      }
      if (url.pathname === '/exec' && req.method === 'POST') {
        caricaArchivio();
        console.log(`POST ${req.headers['content-type']} ${testo.length} byte`);
        const uscita = contesto.doPost({ postData: { contents: testo, type: req.headers['content-type'] } });
        salvaArchivio();
        return rispondiConRedirect(req, res, uscita);
      }
      if (url.pathname === '/echo') {
        const t = echi.get(url.searchParams.get('k'));
        echi.delete(url.searchParams.get('k'));
        res.writeHead(t ? 200 : 404, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(t || '{"ok":false,"errore":"echo"}');
      }
      // ----- solo prove -----
      if (url.pathname === '/_test/modifica' && req.method === 'POST') {
        caricaArchivio();
        const { foglio, campo, valore } = JSON.parse(testo);
        const sh = Spreadsheet.getSheetByName(foglio);
        const righe = sh.getDataRange().getValues();
        const i = righe.findIndex((r) => String(r[0]) === campo);
        inTest = true;
        const intervallo = sh.getRange(i + 1, 2);
        intervallo.setValue(valore);           // come un utente che scrive nella cella
        inTest = false;
        contesto.onEdit({ range: intervallo }); // il trigger semplice che Sheets chiamerebbe
        salvaArchivio();
        res.writeHead(200, CORS); return res.end('{"ok":true}');
      }
      if (url.pathname === '/_test/foglio') {
        caricaArchivio();
        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(dati.fogli[url.searchParams.get('nome')]?.valori ?? null));
      }
      if (url.pathname === '/_test/registro') {
        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ scritture: registro, preflight }));
        registro = [];
        return;
      }
      res.writeHead(404, CORS); res.end();
    } catch (e) {
      console.error(e);
      res.writeHead(500, CORS); res.end(String(e));
    }
  });
});
server.listen(PORTA, () => console.log(`Finta web app su http://localhost:${PORTA}/exec  (foglio: ${ARCHIVIO})`));
