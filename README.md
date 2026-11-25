# Fenus, The First Instance · Schede personaggio

Schede modificabili per Pathfinder 1e, sito statico per GitHub Pages.
HTML, CSS e JavaScript semplici: niente build, niente server.

- `index.html`: elenco dei personaggi.
- `sheet.html?pg=<id>`: la scheda, per esempio `sheet.html?pg=jeko`.
- `data/<id>.json`: la scheda predefinita di ogni personaggio.
- `data/personaggi.json`: quali personaggi compaiono nell'elenco, in ordine.
- `data/comune.json`: il riquadro «Regole condivise» mostrato su ogni scheda.

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

## Cambiare una scheda predefinita

1. Apri `data/<id>.json` e modifica i valori. I campi principali:
   - `caratteristiche`: punteggi già con i modificatori razziali (`for`, `des`, `cos`, `int`, `sag`, `car`).
   - `dadoVita`, `bab`, `livello`, `taglia` (`Piccola`, `Media`, …).
   - `ts`: `base` di classe e `vari` per Tempra, Riflessi, Volontà.
   - `ca`: `armatura`, `naturale`, `vari`. Des e taglia si aggiungono da soli.
   - `attacchi`: `caratt` (caratteristica usata), `vari` e `nota` (il motivo del bonus).
   - `abilita`: `gradi`, `caratt`, `vari`, `nota`.
   - `risorse`: i contatori per giorno (`nome`, `max`, `attuale`).
   - Liste di testo: `tratti`, `capacita`, `talenti`, `equipaggiamento`.
   - Aggiungi `"verifica": true` a una voce per mostrare il bollino **VERIFICA**
     (`razzaVerifica` per la riga della razza).
   - I totali (CA, TS, attacchi, abilità, PF max, CD) non si scrivono: li calcola la scheda.
2. Controlla che il file sia JSON valido (per esempio con `python3 -m json.tool data/jeko.json`).
3. `git commit -am "Aggiorna Jeko" && git push`.

Chi ha già modificato la scheda sul proprio dispositivo continua a vedere la sua copia,
con un avviso che la predefinita è cambiata. Per caricare la nuova versione preme
**Ripristina** (meglio fare prima **Esporta JSON** se vuole tenere le sue modifiche).

Per aggiungere un personaggio: crea `data/<nuovo-id>.json` (copiane uno esistente e
cambia `id`) e aggiungi l'id a `data/personaggi.json`.

## Salvataggio

Ogni modifica si salva nel `localStorage` del browser, con chiave `fenus-scheda-<id>`.
Resta su quel dispositivo e quel browser. Per spostarla altrove: **Esporta JSON**, poi
**Importa JSON** sull'altro dispositivo. Se il browser non permette il salvataggio
(navigazione privata, per esempio) la scheda funziona lo stesso e lo segnala in alto.

## Stampa

Il pulsante **Stampa** (o Ctrl/Cmd+P) produce un A4 per personaggio. I contatori
diventano caselle vuote da segnare a matita.
