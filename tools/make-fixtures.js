'use strict';

/**
 * Génère les fixtures de `fixtures/`. Les JSON produits sont versionnés :
 * ce script ne sert qu'à les régénérer ou à en dériver de nouvelles.
 *
 *   node tools/make-fixtures.js
 */

const fs = require('fs');
const path = require('path');

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
    perEpreuve: 4,
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

fs.mkdirSync(OUT, { recursive: true });
for (const f of [descente, slalom, international]) {
  const file = path.join(OUT, `${f.id}.json`);
  fs.writeFileSync(file, JSON.stringify(f, null, 2) + '\n');
  console.log(`${path.relative(path.join(__dirname, '..'), file)} — ${f.boats.length} bateaux`);
}
