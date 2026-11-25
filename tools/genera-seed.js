#!/usr/bin/env node
/* Rigenera tools/seed.gs dalle schede in /data. Da rilanciare dopo ogni modifica a data/*.json:
     node tools/genera-seed.js
   Usa la stessa conversione della pagina (js/foglio.js), quindi le righe combaciano. */
'use strict';
const fs = require('fs');
const path = require('path');
const radice = path.join(__dirname, '..');
globalThis.window = globalThis;
require(path.join(radice, 'js/regole.js'));
require(path.join(radice, 'js/scambio.js'));
const Foglio = require(path.join(radice, 'js/foglio.js'));

const ids = JSON.parse(fs.readFileSync(path.join(radice, 'data/personaggi.json'), 'utf8'));
const dati = {};
for (const id of ids) {
  const s = JSON.parse(fs.readFileSync(path.join(radice, `data/${id}.json`), 'utf8'));
  dati[id] = { versione: Number(s.versione) || 1, righe: Foglio.inRighe(s) };
}
const corpo = Object.entries(dati).map(([id, d]) =>
  `  ${JSON.stringify(id)}: {\n    versione: ${d.versione},\n    righe: [\n${d.righe.map((r) => `      ${JSON.stringify(r)},`).join('\n')}\n    ],\n  },`).join('\n');

const gs = `/**
 * Fenus, The First Instance — semina del foglio.
 * FILE GENERATO da tools/genera-seed.js a partire da /data/*.json: non modificarlo a mano.
 *
 * Esegui la funzione semina() una volta, dall'editor di Apps Script.
 * Crea la scheda _config e una scheda per ogni personaggio, già compilata.
 * Le schede che esistono già vengono saltate (per rifarne una, cancellala e rilancia).
 * Dopo la semina, scrivi i codici dei giocatori nella colonna "passcode" di _config.
 */

var DATI_SEME = {
${corpo}
};

function semina() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var config = ss.getSheetByName('_config');
  if (!config) {
    config = ss.insertSheet('_config');
    config.getRange(1, 1, 1, 3).setValues([['id', 'passcode', 'versione']]);
    config.setFrozenRows(1);
  }
  config.getRange(1, 2, config.getMaxRows(), 1).setNumberFormat('@'); // i codici restano testo (es. "0042")
  var giaInConfig = {};
  config.getDataRange().getValues().slice(1).forEach(function (r) { giaInConfig[String(r[0]).trim()] = true; });

  var creati = [], saltati = [];
  Object.keys(DATI_SEME).forEach(function (id) {
    var d = DATI_SEME[id];
    if (ss.getSheetByName(id)) { saltati.push(id); }
    else {
      var sh = ss.insertSheet(id);
      var righe = [['campo', 'valore']].concat(d.righe.map(function (r) { return [r[0], testoSicuro_(r[1])]; }));
      sh.getRange(1, 1, righe.length, 2).setNumberFormat('@').setValues(righe);
      sh.setFrozenRows(1);
      creati.push(id);
    }
    if (!giaInConfig[id]) {
      var riga = config.getLastRow() + 1;
      config.getRange(riga, 1, 1, 3).setValues([[id, '', d.versione]]);
    }
  });
  Logger.log('Schede create: ' + (creati.join(', ') || 'nessuna') + '. Già presenti, saltate: ' + (saltati.join(', ') || 'nessuna') + '.');
  Logger.log('Ora scrivi i codici dei giocatori nella colonna "passcode" di _config.');
}
`;
fs.writeFileSync(path.join(__dirname, 'seed.gs'), gs);
console.log(`tools/seed.gs: ${ids.length} personaggi, ${Object.values(dati).reduce((a, d) => a + d.righe.length, 0)} righe.`);
