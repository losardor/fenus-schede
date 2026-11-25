/**
 * Fenus, The First Instance — web app delle schede personaggio.
 * Tutto l'accesso al foglio Google sta in questo file. Incollalo nell'editor di Apps Script.
 *
 * Struttura del foglio:
 *   - una scheda (tab) per personaggio, col nome dell'id: livio, mozzo, paga, nomag, jeko.
 *     Due colonne: "campo" | "valore". Una riga per campo. Gli elenchi sono JSON in una cella.
 *   - una scheda "_config": "id" | "passcode" | "versione".
 *
 * Contratto:
 *   GET  ?pg=<id>  → { ok: true, pg, versione, campi: { campo: valore, … } }
 *   POST (testo JSON) { pg, passcode, changes: { campo: valore }, baseVersion }
 *        → { ok: true, versione, scritti }
 *        → { ok: false, errore: "codice" }                         codice sbagliato, nulla scritto
 *        → { ok: false, errore: "versione", versione, campi }      il foglio è cambiato: rileggi e riprova
 *        → { ok: false, errore: "pg" | "richiesta" | "occupato", messaggio }
 *   Un POST con "changes" vuoto serve solo a verificare il codice: non scrive e non cambia versione.
 */

var FOGLIO_CONFIG = '_config';
var MAX_LUNGHEZZA_VALORE = 45000;   // una cella di Google Sheets tiene al massimo 50.000 caratteri
var MAX_CAMPI_PER_RICHIESTA = 200;

/* ---------------- ingressi della web app ---------------- */

function doGet(e) {
  var pg = String((e && e.parameter && e.parameter.pg) || '').trim();
  var config = leggiConfig_();
  if (!config[pg]) return rispondi_({ ok: false, errore: 'pg', messaggio: 'Personaggio sconosciuto: ' + pg });
  var campi = leggiCampi_(pg);
  if (!campi) return rispondi_({ ok: false, errore: 'pg', messaggio: 'Manca la scheda del foglio per ' + pg });
  return rispondi_({ ok: true, pg: pg, versione: config[pg].versione, campi: campi });
}

function doPost(e) {
  var richiesta;
  try {
    richiesta = JSON.parse(e.postData.contents);
  } catch (err) {
    return rispondi_({ ok: false, errore: 'richiesta', messaggio: 'Il corpo della richiesta non è JSON.' });
  }
  var pg = String(richiesta.pg || '').trim();
  var modifiche = richiesta.changes && typeof richiesta.changes === 'object' ? richiesta.changes : {};
  var nomi = Object.keys(modifiche);
  var problema = controllaModifiche_(modifiche, nomi);
  if (problema) return rispondi_({ ok: false, errore: 'richiesta', messaggio: problema });

  var lucchetto = LockService.getScriptLock();
  if (!lucchetto.tryLock(10000)) return rispondi_({ ok: false, errore: 'occupato', messaggio: 'Foglio occupato, riprova.' });
  try {
    var config = leggiConfig_();
    var voce = config[pg];
    if (!voce) return rispondi_({ ok: false, errore: 'pg', messaggio: 'Personaggio sconosciuto: ' + pg });
    if (!codiceValido_(voce, richiesta.passcode)) return rispondi_({ ok: false, errore: 'codice', messaggio: 'Codice sbagliato.' });
    if (nomi.length === 0) return rispondi_({ ok: true, versione: voce.versione, scritti: 0 });
    if (Number(richiesta.baseVersion) !== voce.versione) {
      return rispondi_({ ok: false, errore: 'versione', versione: voce.versione, campi: leggiCampi_(pg) });
    }
    scriviCampi_(pg, modifiche);
    var nuova = voce.versione + 1;
    scriviVersione_(voce.riga, nuova);
    return rispondi_({ ok: true, versione: nuova, scritti: nomi.length });
  } finally {
    lucchetto.releaseLock();
  }
}

/**
 * Trigger semplice: quando il master modifica a mano la scheda di un personaggio,
 * la versione sale, così le pagine aperte rileggono i campi prima di salvare.
 * (Le scritture fatte dallo script non lo attivano.)
 */
function onEdit(e) {
  if (!e || !e.range) return;
  var nome = e.range.getSheet().getName();
  if (nome.charAt(0) === '_') return;
  var config = leggiConfig_();
  if (config[nome]) scriviVersione_(config[nome].riga, config[nome].versione + 1);
}

/* ---------------- accesso al foglio ---------------- */

function foglio_(nome) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
}

/** { id: { riga, passcode, versione } } da _config. La riga 1 è l'intestazione. */
function leggiConfig_() {
  var sh = foglio_(FOGLIO_CONFIG);
  var config = {};
  if (!sh) return config;
  var valori = sh.getDataRange().getValues();
  for (var i = 1; i < valori.length; i++) {
    var id = String(valori[i][0]).trim();
    if (!id || id.charAt(0) === '_') continue;
    config[id] = { riga: i + 1, passcode: String(valori[i][1]).trim(), versione: Number(valori[i][2]) || 1 };
  }
  return config;
}

/** { campo: valore } dalla scheda del personaggio, tutto come testo. null se la scheda manca. */
function leggiCampi_(pg) {
  var sh = foglio_(pg);
  if (!sh) return null;
  var valori = sh.getDataRange().getValues();
  var campi = {};
  for (var i = 1; i < valori.length; i++) {
    var campo = String(valori[i][0]).trim();
    if (campo) campi[campo] = valoreInTesto_(valori[i][1]);
  }
  return campi;
}

/** Scrive solo le righe indicate; i campi nuovi vanno in fondo. Le celle valore restano in formato testo. */
function scriviCampi_(pg, modifiche) {
  var sh = foglio_(pg);
  var valori = sh.getDataRange().getValues();
  var rigaDi = {};
  for (var i = 1; i < valori.length; i++) rigaDi[String(valori[i][0]).trim()] = i + 1;
  var prossima = Math.max(valori.length, 1) + 1;
  Object.keys(modifiche).forEach(function (campo) {
    var valore = testoSicuro_(modifiche[campo]);
    if (rigaDi[campo]) {
      sh.getRange(rigaDi[campo], 2).setNumberFormat('@').setValue(valore);
    } else {
      sh.getRange(prossima, 1, 1, 2).setNumberFormat('@').setValues([[testoSicuro_(campo), valore]]);
      rigaDi[campo] = prossima;
      prossima++;
    }
  });
}

function scriviVersione_(riga, versione) {
  foglio_(FOGLIO_CONFIG).getRange(riga, 3).setValue(versione);
}

/* ---------------- controlli e risposte ---------------- */

function codiceValido_(voce, passcode) {
  return voce.passcode !== '' && String(passcode == null ? '' : passcode).trim() === voce.passcode;
}

function controllaModifiche_(modifiche, nomi) {
  if (nomi.length > MAX_CAMPI_PER_RICHIESTA) return 'Troppi campi in una richiesta.';
  for (var i = 0; i < nomi.length; i++) {
    var campo = nomi[i];
    if (!campo || campo.length > 100 || /^[=+\-@]/.test(campo)) return 'Nome di campo non valido: ' + campo;
    var v = modifiche[campo];
    if (v !== null && typeof v === 'object') return 'Valore non valido per ' + campo;
    if (String(v).length > MAX_LUNGHEZZA_VALORE) return 'Valore troppo lungo per ' + campo;
  }
  return '';
}

/**
 * Testo da scrivere in una cella: l'apostrofo iniziale obbliga Sheets a tenerlo come testo
 * (niente formule da "=…", niente date da "1-2"); Sheets lo toglie quando il valore viene riletto.
 */
function testoSicuro_(v) {
  return "'" + (v === null || v === undefined ? '' : String(v));
}

function valoreInTesto_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function rispondi_(oggetto) {
  return ContentService.createTextOutput(JSON.stringify(oggetto)).setMimeType(ContentService.MimeType.JSON);
}
