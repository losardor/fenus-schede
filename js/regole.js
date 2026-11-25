/* Calcoli di regola. Funzioni pure: ricevono la scheda, restituiscono valori e spiegazioni. */
'use strict';

const CARATT = ['for', 'des', 'cos', 'int', 'sag', 'car'];
const CARATT_BREVE = { for: 'For', des: 'Des', cos: 'Cos', int: 'Int', sag: 'Sag', car: 'Car' };
const CARATT_NOME = { for: 'Forza', des: 'Destrezza', cos: 'Costituzione', int: 'Intelligenza', sag: 'Saggezza', car: 'Carisma' };

// Modificatori di taglia: CA e tiri per colpire, manovre (BMC/DMC).
const TAGLIE = {
  Minuta: { ca: 2, mano: -2 },
  Piccola: { ca: 1, mano: -1 },
  Media: { ca: 0, mano: 0 },
  Grande: { ca: -1, mano: 1 },
};

const TIRI_SALVEZZA = [
  { chiave: 'tempra', nome: 'Tempra', caratt: 'cos' },
  { chiave: 'riflessi', nome: 'Riflessi', caratt: 'des' },
  { chiave: 'volonta', nome: 'Volontà', caratt: 'sag' },
];

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? Math.trunc(x) : 0; };
const modDi = (punteggio) => Math.floor((n(punteggio) - 10) / 2);
const conSegno = (v) => (v < 0 ? '−' + -v : '+' + v);
const numero = (v) => (v < 0 ? '−' + -v : String(v));

/* Somma di termini [valore, etichetta, mostraSeZero]. Il primo termine si mostra sempre. */
function somma(nome, termini, segnato = true) {
  const usati = termini.filter((t, i) => i === 0 || t[2] || n(t[0]) !== 0);
  const totale = termini.reduce((a, t) => a + n(t[0]), 0);
  const testo = usati.map((t, i) => {
    const v = n(t[0]);
    if (i === 0) return `${numero(v)} ${t[1]}`;
    return (v < 0 ? ` − ${-v} ` : ` + ${v} `) + t[1];
  }).join('');
  return { v: totale, testo: `${nome} ${segnato ? conSegno(totale) : totale} = ${testo}`, segnato };
}

function calcola(s) {
  const r = {};
  const mod = {};
  for (const c of CARATT) {
    const p = n(s.caratteristiche?.[c]);
    mod[c] = modDi(p);
    r['mod.' + c] = {
      v: mod[c], segnato: true,
      testo: `${CARATT_BREVE[c]} ${conSegno(mod[c])} = (${p} − 10) ÷ 2, arrotondato per difetto`,
    };
  }
  const B = (c) => CARATT_BREVE[c] || c;
  const nota = (x, predefinita = 'vari') => (x && x.trim() ? x.trim() : predefinita);
  const taglia = TAGLIE[s.taglia] || TAGLIE.Media;
  const liv = Math.max(1, n(s.livello));
  const bab = n(s.bab);

  r['pf.max'] = somma('PF max', [
    [s.dadoVita, `d${n(s.dadoVita)} al massimo`],
    [mod.cos * liv, liv > 1 ? `Cos × ${liv} livelli` : 'Cos'],
    [s.pfVari, nota(s.pfVariNota)],
  ], false);

  const ca = s.ca || {};
  r['ca'] = somma('CA', [
    [10, 'base'], [ca.armatura, 'armatura'], [mod.des, 'Des'], [ca.naturale, 'naturale'],
    [taglia.ca, 'taglia'], [ca.vari, nota(ca.nota)],
  ], false);
  r['ca.contatto'] = somma('Contatto', [
    [10, 'base'], [mod.des, 'Des'], [taglia.ca, 'taglia'], [ca.vari, nota(ca.nota)],
  ], false);
  r['ca.impreparato'] = somma('Impreparato', [
    [10, 'base'], [ca.armatura, 'armatura'], [Math.min(0, mod.des), 'Des (solo se negativa)'],
    [ca.naturale, 'naturale'], [taglia.ca, 'taglia'], [ca.vari, nota(ca.nota)],
  ], false);
  r['ca.taglia'] = { v: taglia.ca, segnato: true, testo: `Taglia ${s.taglia || 'Media'}: ${conSegno(taglia.ca)} a CA e tiri per colpire` };

  for (const t of TIRI_SALVEZZA) {
    const ts = s.ts?.[t.chiave] || {};
    r['ts.' + t.chiave] = somma(t.nome, [
      [ts.base, 'classe', true], [mod[t.caratt], B(t.caratt), true], [ts.vari, nota(ts.nota)],
    ]);
  }

  r['iniziativa'] = somma('Iniziativa', [[mod.des, 'Des', true], [s.iniziativaVari, 'vari']]);
  r['bmc'] = somma('BMC', [[bab, 'BAB', true], [mod.for, 'For', true], [taglia.mano, 'taglia']]);
  r['dmc'] = somma('DMC', [
    [10, 'base'], [bab, 'BAB', true], [mod.for, 'For', true], [mod.des, 'Des', true], [taglia.mano, 'taglia'],
  ], false);

  (s.attacchi || []).forEach((a, i) => {
    r[`att.${i}`] = somma(a.nome || 'Attacco', [
      [bab, 'BAB', true], [mod[a.caratt] ?? 0, B(a.caratt), true], [taglia.ca, 'taglia'], [a.vari, nota(a.nota)],
    ]);
  });

  r['gradi.max'] = { v: liv, segnato: false, testo: `Gradi massimi = livello ${liv}` };
  (s.abilita || []).forEach((a, i) => {
    const res = somma(a.nome || 'Abilità', [
      [a.gradi, 'gradi', true], [mod[a.caratt] ?? 0, B(a.caratt), true], [a.vari, nota(a.nota)],
    ]);
    if (n(a.gradi) > liv) { res.testo += ` — attenzione: ${n(a.gradi)} gradi superano il massimo (${liv})`; res.errore = true; }
    r[`ab.${i}`] = res;
  });

  const inc = s.incantesimi;
  if (inc && inc.caratt) {
    (inc.gruppi || []).forEach((g, i) => {
      r[`cd.${i}`] = somma(`CD ${n(g.livello)}°`, [
        [10, 'base'], [g.livello, 'livello incantesimo', true], [mod[inc.caratt] ?? 0, B(inc.caratt), true],
      ], false);
    });
  }
  return r;
}

window.Regole = { CARATT, CARATT_BREVE, CARATT_NOME, TAGLIE, TIRI_SALVEZZA, calcola, modDi, conSegno, numero };
