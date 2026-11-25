# Fenus, The First Instance · Schede personaggio

Schede modificabili per Pathfinder 1e, sito statico per GitHub Pages.
HTML, CSS e JavaScript semplici: niente build, niente server.

- `index.html`: elenco dei personaggi.
- `sheet.html?pg=<id>`: la scheda, per esempio `sheet.html?pg=jeko`.
- `data/<id>.json`: la scheda predefinita di ogni personaggio.
- `data/personaggi.json`: quali personaggi compaiono nell'elenco, in ordine.
- `data/comune.json`: il riquadro «Regole condivise» mostrato su ogni scheda.
- `config.js`: l'indirizzo della web app del foglio Google.
- `apps-script/Code.gs`, `tools/seed.gs`: lo script da incollare nel foglio Google.

## Pubblicare su GitHub Pages

Servono un account GitHub e `git` installato. Da un terminale, dentro questa cartella:

```sh
git init
git add .
git commit -m "Schede Fenus"
git branch -M main
```

1. Su github.com: **New repository**, nome per esempio `fenus-schede`, visibilità
   **Public**, senza README né licenza (la cartella ha già i suoi file). **Create repository**.
2. Collega e carica (sostituisci `TUO-UTENTE`):

   ```sh
   git remote add origin https://github.com/TUO-UTENTE/fenus-schede.git
   git push -u origin main
   ```

3. Nel repository: **Settings → Pages**. In **Build and deployment** scegli
   **Source: Deploy from a branch**, poi **Branch: main** e cartella **/ (root)**. **Save**.
4. Dopo uno o due minuti il sito è su
   `https://TUO-UTENTE.github.io/fenus-schede/`.
   Il link di una scheda è `https://TUO-UTENTE.github.io/fenus-schede/sheet.html?pg=jeko`.

Il file vuoto `.nojekyll` dice a GitHub di servire i file così come sono.

## Provare in locale

Le schede leggono i JSON con `fetch`, quindi aprire il file con doppio clic non basta.
Avvia un server statico nella cartella:

```sh
python3 -m http.server 8000
```

e apri `http://localhost:8000/sheet.html?pg=jeko`.

## Dove stanno i dati

Le schede vivono in un **foglio Google**, letto e scritto da una piccola web app di
Apps Script (`apps-script/Code.gs`). La pagina:

- all'apertura mostra subito l'ultima copia salvata sul dispositivo, segnata
  «Aggiornamento…», poi la sostituisce con quella del foglio;
- salva sul foglio 1,5 secondi dopo l'ultima modifica, **solo i campi cambiati**, e scrive
  in alto «Salvato alle …» oppure «Non salvato, riprovo» (e riprova da sola);
- senza rete tiene le modifiche in coda sul dispositivo e le invia quando la rete torna;
- se nel frattempo il foglio è cambiato (per esempio lo hai corretto tu), rilegge quei
  campi prima di salvare e dice al giocatore quali sono;
- chiede il **codice** del personaggio una volta per dispositivo («Cambia codice» in alto
  per cambiarlo). Senza codice la scheda è in sola lettura;
- se il foglio non risponde e il dispositivo non ha una copia, mostra `data/<id>.json`
  in sola lettura, con un avviso.

**Ricarica dal foglio** scarta le modifiche non ancora salvate e rilegge il foglio.

`data/*.json` resta la scheda di base: serve a riempire il foglio la prima volta
(`tools/seed.gs`) e come riserva in sola lettura.

## Collegare il foglio Google

1. Su [sheets.google.com](https://sheets.google.com) crea un foglio vuoto, per esempio
   «Fenus · schede». Non condividerlo con i giocatori: contiene i loro codici.
2. Nel foglio: **Extensions > Apps Script** (in italiano **Estensioni > Apps Script**).
   Si apre l'editor con un file `Code.gs`.
3. Cancella il contenuto di `Code.gs` e incolla tutto `apps-script/Code.gs` di questo repository.
4. Accanto a **Files** premi **+ > Script**, chiamalo `seed` e incollaci tutto `tools/seed.gs`.
   Salva (icona del dischetto o Ctrl/Cmd+S).
5. In alto scegli la funzione **semina** e premi **Run** (**Esegui**). La prima volta Google
   chiede l'autorizzazione: scegli il tuo account, poi **Advanced > Go to … (unsafe)**
   (**Avanzate > Vai a …**) e **Allow**. È il tuo script sul tuo foglio.
   Nel registro compare «Schede create: livio, mozzo, paga, nomag, jeko».
6. Torna al foglio: c'è una scheda per personaggio e la scheda `_config`. Nella colonna
   **passcode** di `_config` scrivi un codice per ogni personaggio. Un personaggio senza
   codice non si può modificare dalla pagina.
7. Nell'editor: **Deploy > New deployment** (**Esegui il deployment > Nuovo deployment**).
   Tipo (ingranaggio): **Web app**. **Execute as: Me** (**Esegui come: io**),
   **Who has access: Anyone** (**Chi può accedere: Chiunque**). **Deploy**.
8. Copia il **Web app URL** (finisce con `/exec`) e mettilo in `config.js`:

   ```js
   window.FENUS_CONFIG = {
     webAppUrl: 'https://script.google.com/macros/s/…/exec',
   };
   ```

9. `git commit -am "Collega il foglio Google" && git push`. Dopo un minuto il sito usa il foglio.
10. Dai a ogni giocatore il suo codice. Alla prima apertura della scheda lo inserisce una volta.

### Dopo una modifica allo script

Incolla il nuovo `Code.gs` nell'editor e salva. Poi **Deploy > Manage deployments**
(**Gestisci deployment**), matita sul deployment attivo, **Version: New version**
(**Nuova versione**), **Deploy**. L'URL resta lo stesso, quindi `config.js` non cambia.
Un **New deployment** invece crea un URL nuovo, da rimettere in `config.js`.

### Cose da sapere

- Il foglio ha due colonne, **campo** e **valore**. Puoi correggere un valore a mano:
  la versione in `_config` sale da sola e le pagine aperte rileggono il campo prima di
  salvare. Gli elenchi (abilità, attacchi, equipaggiamento, …) sono JSON in una cella.
- Chiunque abbia l'URL della web app (che sta in `config.js`, quindi è pubblico) può
  **leggere** le schede; per **scriverle** serve il codice.
- Per rifare da capo una scheda del foglio: cancella quella scheda (tab) e riesegui
  **semina**. Le schede esistenti non vengono toccate.

## Cambiare una scheda di base

1. Modifica `data/<id>.json` (i campi sono descritti sotto) e controlla che sia JSON valido,
   per esempio con `python3 -m json.tool data/jeko.json`.
2. Rigenera lo script di semina: `node tools/genera-seed.js`.
3. `git commit -am "Aggiorna Jeko" && git push`.

Se il foglio è già stato riempito, le schede di base non lo cambiano: correggi il foglio
direttamente, oppure cancella la scheda (tab) del personaggio e riesegui **semina**
con il nuovo `tools/seed.gs`.

Campi principali:
- `caratteristiche`: punteggi già con i modificatori razziali (`for`, `des`, `cos`, `int`, `sag`, `car`).
- `dadoVita`, `bab`, `livello`, `taglia` (`Piccola`, `Media`, …).
- `ts`: `base` di classe e `vari` per Tempra, Riflessi, Volontà.
- `ca`: `armatura`, `naturale`, `vari`. Des e taglia si aggiungono da soli.
- `attacchi`: `caratt` (caratteristica usata), `vari` e `nota` (il motivo del bonus).
- `abilita`: `gradi`, `caratt`, `vari`, `nota`.
- `puntiAbilitaClasse` (e `puntiAbilitaRazza`): punti abilità per livello, per il controllo del master.
- `risorse`: i contatori per giorno (`nome`, `max`, `attuale`).
- Liste di testo: `tratti`, `capacita`, `talenti`, `equipaggiamento`.
- Aggiungi `"verifica": true` a una voce per mostrare il bollino **VERIFICA**
  (`razzaVerifica` per la riga della razza).
- I totali (CA, TS, attacchi, abilità, PF max, CD) non si scrivono: li calcola la scheda.
- `incantesimi`: `caratt` è la caratteristica da incantatore (CD e incantesimi bonus).
  Un gruppo con `giornalieriBase` mostra gli incantesimi al giorno calcolati
  (base di classe + bonus); una risorsa con `"maxDa": "giorn.<n>"` prende da lì il massimo.

Per aggiungere un personaggio: crea `data/<nuovo-id>.json` (copiane uno esistente e
cambia `id`), aggiungi l'id a `data/personaggi.json`, rigenera `tools/seed.gs` e
riesegui **semina** nel foglio (crea solo la scheda nuova).

## Provare senza Google

`tools/mock-webapp.js` è una finta web app: esegue i veri `Code.gs` e `seed.gs` dentro
Node, con un foglio finto salvato in un file JSON, e risponde come Apps Script.

```sh
node tools/mock-webapp.js --semina --codice jeko=drago     # http://localhost:8787/exec
```

Poi metti `webAppUrl: 'http://localhost:8787/exec'` in `config.js` (solo in locale,
non fare commit) e apri il sito col server statico.

## Stampa

Il pulsante **Stampa** (o Ctrl/Cmd+P) produce un A4 per personaggio. I contatori
diventano caselle vuote da segnare a matita.
