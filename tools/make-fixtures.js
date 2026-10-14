'use strict';

/**
 * Génère les fixtures de `fixtures/`. Les JSON produits sont versionnés :
 * ce script ne sert qu'à les régénérer ou à en dériver de nouvelles.
 *
 *   node tools/make-fixtures.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const OUT = path.join(__dirname, '..', 'fixtures');

const PRENOMS_H = ['Lucas', 'Théo', 'Hugo', 'Mathis', 'Nolan', 'Enzo', 'Gabin', 'Arthur',
  'Baptiste', 'Quentin', 'Maxime', 'Antoine'];
const PRENOMS_F = ['Camille', 'Marion', 'Anaïs', 'Jeanne', 'Clara', 'Léa', 'Manon', 'Louise',
  'Émilie', 'Sarah', 'Alice', 'Chloé'];
const NOMS = ['Mercier', 'Faure', 'Roussel', 'Blanchard', 'Perrin', 'Guillet', 'Bonnet', 'Lemoine',
  'Delaunay', 'Vasseur', 'Barbier', 'Chevalier', 'Marchand', 'Dumas', 'Leroy', 'Colin',
  'Hebert', 'Pichon', 'Royer', 'Neveu', 'Gaudin', 'Masson', 'Riviere', 'Aubert'];
const CLUBS = ['CK Pau-Béarn', 'ACA Aviron Canoë', 'CKC Argentat', 'Canoë Club Vallée Ubaye',
  'US Ivry CK', 'CK Metz', 'ASCPA Tours', 'Sablé CK', 'CK Saint-Pierre', 'Annecy CK'];

/** Générateur pseudo-aléatoire déterministe : les fixtures doivent être reproductibles. */
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function buildBoats({ epreuves, perEpreuve, baseTimeMs, spreadMs, seed }) {
  const rand = rng(seed);
  const boats = [];
  let bib = 1;

  for (const e of epreuves) {
    for (let i = 0; i < perEpreuve; i++) {
      const prenoms = e.code.endsWith('D') ? PRENOMS_F : PRENOMS_H;
      const p = prenoms[(bib * 7) % prenoms.length];
      const n = NOMS[(bib * 11) % NOMS.length];
      boats.push({
        bib: bib++,
        epreuve: e.code,
        nom: `${n.toUpperCase()} ${p}`,
        club: CLUBS[(bib * 3) % CLUBS.length],
        nation: 'FRA',
        // temps de référence : base + dérive par épreuve + aléa déterministe
        ref_time_ms: Math.round(baseTimeMs + e.offsetMs + rand() * spreadMs),
      });
    }
  }
  return boats;
}

const descenteEpreuves = [
  { code: 'K1H', libelle: 'Kayak monoplace hommes', etat: '1', offsetMs: 0 },
  { code: 'K1D', libelle: 'Kayak monoplace dames', etat: '1', offsetMs: 9000 },
  { code: 'C1H', libelle: 'Canoë monoplace hommes', etat: '1', offsetMs: 6000 },
  { code: 'C1D', libelle: 'Canoë monoplace dames', etat: '1', offsetMs: 15000 },
];

const descente = {
  id: 'descente-sprint',
  label: 'Championnat de France Descente Sprint — Finale',
  speed: 4,
  first_start: '10:00:00',
  start_interval_s: 45,
  nb_inter: 1,
  nb_porte: 0,
  competition: {
    Code_competition: 3141,
    Nom: 'Championnat de France Descente Sprint',
    Code_activite: 'DES',
    Code_niveau: 'NAT',
    Date_debut: '2026-05-16',
    Lieu: 'Treignac',
  },
  course: { Code_course: 1, Libelle: 'Descente Sprint' },
  phase: { Code_phase: 1, Libelle: 'Finale' },
  epreuves: descenteEpreuves,
  boats: buildBoats({
    epreuves: descenteEpreuves,
    // 12 par épreuve : il en faut plus que les 8 places de tv_leaders pour que
    // le cas « dernier arrivé hors du classement affiché » existe.
    perEpreuve: 12,
    baseTimeMs: 88000,
    spreadMs: 22000,
    seed: 20260516,
  }),
};

const slalomEpreuves = [
  { code: 'K1H', libelle: 'Kayak monoplace hommes', etat: '1', offsetMs: 0 },
  { code: 'K1D', libelle: 'Kayak monoplace dames', etat: '1', offsetMs: 11000 },
  { code: 'C1H', libelle: 'Canoë monoplace hommes', etat: '1', offsetMs: 7000 },
  { code: 'C1D', libelle: 'Canoë monoplace dames', etat: '1', offsetMs: 18000 },
];

/**
 * Pénalités prévues sur les premiers K1H : elles tombent pendant la course,
 * au passage de la porte (voir mock/engine.js), pour voir l'incrustation se
 * remplir sans rien saisir. Porte -> 2 (touchée) ou 50 (manquée). Le dossard 4
 * reste propre : il faut aussi un parcours sans faute.
 */
const SLALOM_PENA_PLAN = {
  1: { 3: 2 },
  2: { 5: 2, 12: 2 },
  3: { 7: 50 },
  5: { 2: 2, 9: 2, 15: 50 },
  6: { 11: 2 },
};

const slalom = {
  id: 'slalom-finale',
  label: 'Coupe de France Slalom — Finale (18 portes)',
  speed: 4,
  first_start: '14:00:00',
  start_interval_s: 90,
  nb_inter: 2,
  nb_porte: 18,
  competition: {
    Code_competition: 3207,
    Nom: 'Coupe de France Slalom',
    Code_activite: 'SLA',
    Code_niveau: 'NAT',
    Date_debut: '2026-06-20',
    Lieu: "L'Argentière-la-Bessée",
  },
  course: { Code_course: 1, Libelle: 'Slalom' },
  phase: { Code_phase: 1, Libelle: 'Finale' },
  epreuves: slalomEpreuves,
  boats: buildBoats({
    epreuves: slalomEpreuves,
    // 12 par épreuve, comme la descente : il en faut plus que les 8 places de
    // tv_leaders pour que le classement se remplisse et que le cas « dernier
    // arrivé hors du classement » existe.
    perEpreuve: 12,
    baseTimeMs: 96000,
    spreadMs: 26000,
    seed: 20260620,
  }),
};

// Épreuve internationale : déclenche l'affichage nation/drapeau au lieu du club
const NATIONS = ['FRA', 'GER', 'CZE', 'SVK', 'ESP', 'ITA', 'GBR', 'POL', 'SLO', 'AUT'];
const internationalEpreuves = [
  { code: 'K1H', libelle: 'Kayak monoplace hommes', etat: '1', offsetMs: 0 },
  { code: 'K1D', libelle: 'Kayak monoplace dames', etat: '1', offsetMs: 10000 },
];
const international = {
  id: 'descente-internationale',
  label: 'Coupe du Monde Descente — Finale (niveau INT)',
  speed: 4,
  first_start: '09:30:00',
  start_interval_s: 60,
  nb_inter: 2,
  nb_porte: 0,
  competition: {
    Code_competition: 3300,
    Nom: 'ICF Wildwater World Cup',
    Code_activite: 'DES',
    Code_niveau: 'INT',
    Date_debut: '2026-07-04',
    Lieu: 'Bourg-Saint-Maurice',
  },
  course: { Code_course: 1, Libelle: 'Classique' },
  phase: { Code_phase: 1, Libelle: 'Finale' },
  epreuves: internationalEpreuves,
  boats: buildBoats({
    epreuves: internationalEpreuves,
    perEpreuve: 8,
    baseTimeMs: 1080000,
    spreadMs: 120000,
    seed: 20260704,
  }).map((b, i) => ({ ...b, nation: NATIONS[i % NATIONS.length] })),
};

// Slalom à 24 portes, le maximum courant en élite : la grille des portes de
// tv_duo doit tenir sur une ligne. Épreuves « élite » de categories.js.
const eliteEpreuves = [
  { code: 'K1HE', libelle: 'Kayak homme élite', etat: '1', offsetMs: 0 },
  { code: 'C1DE', libelle: 'Canoë dame élite', etat: '1', offsetMs: 9000 },
  { code: 'K1DE', libelle: 'Kayak dame élite', etat: '1', offsetMs: 6000 },
  { code: 'C1HE', libelle: 'Canoë homme élite', etat: '1', offsetMs: 4000 },
];

const ELITE_PENA_PLAN = {
  1: { 4: 2, 19: 2 },
  2: { 8: 2 },
  3: { 13: 50 },
  5: { 2: 2, 11: 2, 22: 2 },
  6: { 17: 50, 23: 2 },
  8: { 6: 2 },
};

const slalom24 = {
  id: 'slalom-24',
  label: 'Championnats de France Elite Slalom (24 portes)',
  speed: 4,
  first_start: '10:00:00',
  start_interval_s: 60,
  nb_inter: 2,
  nb_porte: 24,
  competition: {
    Code_competition: 3412,
    Nom: 'Championnats de France Elite Slalom & Kayak-Cross',
    Code_activite: 'SLA',
    Code_niveau: 'NAT',
    Date_debut: '2026-10-15',
    Lieu: 'Cesson-Sévigné',
  },
  course: { Code_course: 1, Libelle: 'Cesson-Sévigné' },
  phase: { Code_phase: 1, Libelle: 'Finale' },
  epreuves: eliteEpreuves,
  boats: buildBoats({
    epreuves: eliteEpreuves,
    perEpreuve: 12,
    baseTimeMs: 98000,
    spreadMs: 22000,
    seed: 20261015,
  }),
};

// Répétition de la régie (tv_regie.html?scenario=test) : trois catégories
// courtes, séparées par des pauses, comme le programme des France Elite. Les
// heures de départ suivent le scénario `test` de js/regie_scenarios.js.
const regieEpreuves = [
  { code: 'INV', libelle: 'Invités', etat: '1', offsetMs: 0, first: '09:00:00', every: 60, nb: 3 },
  { code: 'K1H', libelle: 'Kayak homme', etat: '1', offsetMs: 0, first: '09:07:00', every: 60, nb: 4 },
  { code: 'K1D', libelle: 'Kayak dame', etat: '1', offsetMs: 6000, first: '09:15:00', every: 120, nb: 3 },
];

const regieBoats = [];
for (const e of regieEpreuves) {
  const lot = buildBoats({ epreuves: [e], perEpreuve: e.nb, baseTimeMs: 92000, spreadMs: 12000, seed: 20261016 + e.nb });
  const [h, m, s] = e.first.split(':').map(Number);
  lot.forEach((b, i) => {
    const t = h * 3600 + m * 60 + s + i * e.every;
    const pad = (n) => String(n).padStart(2, '0');
    regieBoats.push({ ...b, hour_start: `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}` });
  });
}
regieBoats.forEach((b, i) => { b.bib = i + 1; });

const regieTest = {
  id: 'france-elite-test',
  label: 'Répétition régie France Elite (3 catégories)',
  speed: 4,
  first_start: '09:00:00',
  clock_start: '08:50:00',
  start_interval_s: 60,
  nb_inter: 2,
  nb_porte: 24,
  competition: {
    Code_competition: 3413,
    Nom: 'Championnat de France Slalom Elite',
    Code_activite: 'SLA',
    Code_niveau: 'NAT',
    Date_debut: '2026-10-16',
    Lieu: 'Cesson-Sévigné',
  },
  course: { Code_course: 1, Libelle: 'Cesson-Sévigné' },
  phase: { Code_phase: 1, Libelle: 'Qualification Manche 1' },
  epreuves: regieEpreuves.map(({ code, libelle, etat, offsetMs }) => ({ code, libelle, etat, offsetMs })),
  boats: regieBoats,
};

/*
 * Une fixture par scénario de régie (ws_live/canoe/js/regie_scenarios.js) :
 * les mêmes catégories, aux mêmes heures, avec le même nombre de bateaux. La
 * course simulée démarre 10 min avant le premier départ (5 min de compte à
 * rebours, puis le présentateur), et se rejoue à la vitesse voulue (panneau
 * ou --speed).
 * Avec tv_regie.html?scenario=<id>&repetition=1, la régie suit l'horloge du
 * bouchon : c'est une répétition de la demi-journée en accéléré.
 */
function scenariosRegie() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'ws_live', 'canoe', 'js', 'regie_scenarios.js'), 'utf8');
  const ctx = {};
  vm.runInNewContext(`${src}\nthis.S = REGIE_SCENARIOS;`, ctx);
  return ctx.S;
}

const clockMs = (txt) => {
  const [h, m, s] = txt.split(':').map(Number);
  return ((h * 60 + m) * 60 + (s || 0)) * 1000;
};
const clockTxt = (ms) => {
  const t = Math.round(ms / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`;
};

const regieFixtures = [];
let regieSeed = 20261100;
for (const [id, sc] of Object.entries(scenariosRegie())) {
  if (id === 'test') continue;          // le scénario test a sa fixture, france-elite-test

  const cross = sc.categories.every((c) => c.epreuve.startsWith('XK'));
  const rand = rng(++regieSeed);
  const epreuves = sc.categories.map((c, i) => ({
    code: c.epreuve, libelle: c.libelle, etat: '1', offsetMs: i * 3000,
  }));

  const boats = [];
  for (const c of sc.categories) {
    const first = clockMs(c.depart);
    const step = c.nb > 1 ? (clockMs(c.fin) - first) / (c.nb - 1) : 0;
    const lot = buildBoats({
      epreuves: [{ code: c.epreuve, offsetMs: 0 }], perEpreuve: c.nb,
      baseTimeMs: cross ? 58000 : 92000, spreadMs: cross ? 10000 : 16000, seed: ++regieSeed,
    });
    lot.forEach((b, i) => {
      const boat = { ...b, hour_start: clockTxt(first + i * step) };
      // Slalom : un bateau sur trois touche une porte, un sur vingt en manque une.
      if (!cross) {
        const plan = {};
        if (rand() < 0.33) plan[1 + Math.floor(rand() * 24)] = 2;
        if (rand() < 0.05) plan[1 + Math.floor(rand() * 24)] = 50;
        if (Object.keys(plan).length) boat.pena_plan = plan;
      }
      boats.push(boat);
    });
  }
  boats.forEach((b, i) => { b.bib = i + 1; });

  const premier = clockMs(sc.categories[0].depart);
  regieFixtures.push({
    id: `regie-${id}`,
    label: `Régie ${id} — ${sc.phase}`,
    speed: 1,
    first_start: sc.categories[0].depart,
    clock_start: clockTxt(premier - 10 * 60000),
    start_interval_s: 60,
    nb_inter: 2,
    nb_porte: cross ? 0 : 24,
    competition: {
      Code_competition: 3420 + regieFixtures.length,
      Nom: sc.titre,
      Code_activite: 'SLA',
      Code_niveau: 'NAT',
      Date_debut: sc.date,
      Lieu: 'Cesson-Sévigné',
    },
    course: { Code_course: 1, Libelle: 'Cesson-Sévigné' },
    phase: { Code_phase: 1, Libelle: sc.phase },
    epreuves,
    boats,
  });
}

fs.mkdirSync(OUT, { recursive: true });
for (const b of slalom.boats) {
  if (SLALOM_PENA_PLAN[b.bib]) b.pena_plan = SLALOM_PENA_PLAN[b.bib];
}
for (const b of slalom24.boats) {
  if (ELITE_PENA_PLAN[b.bib]) b.pena_plan = ELITE_PENA_PLAN[b.bib];
}

for (const f of [descente, slalom, international, slalom24, regieTest, ...regieFixtures]) {
  const file = path.join(OUT, `${f.id}.json`);
  fs.writeFileSync(file, JSON.stringify(f, null, 2) + '\n');
  console.log(`${path.relative(path.join(__dirname, '..'), file)} — ${f.boats.length} bateaux`);
}
