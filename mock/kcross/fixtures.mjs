// Compétitions simulées : fixtures/kcross/*.json décrit le format et les
// catégories ; les bateaux et le time trial sont générés ici, de façon
// déterministe (même graine -> mêmes noms, mêmes temps, mêmes séries).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = path.join(HERE, '..', '..', 'fixtures', 'kcross');

const PRENOMS_H = ['Lucas', 'Théo', 'Hugo', 'Mathis', 'Nolan', 'Enzo', 'Gabin', 'Arthur',
  'Baptiste', 'Quentin', 'Maxime', 'Antoine', 'Titouan', 'Malo', 'Esteban', 'Romain'];
const PRENOMS_F = ['Camille', 'Marion', 'Anaïs', 'Jeanne', 'Clara', 'Léa', 'Manon', 'Louise',
  'Émilie', 'Sarah', 'Alice', 'Chloé', 'Lison', 'Margot', 'Zoé', 'Inès'];
const NOMS = ['Mercier', 'Faure', 'Roussel', 'Blanchard', 'Perrin', 'Guillet', 'Bonnet', 'Lemoine',
  'Delaunay', 'Vasseur', 'Barbier', 'Chevalier', 'Marchand', 'Dumas', 'Leroy', 'Colin',
  'Hébert', 'Pichon', 'Royer', 'Neveu', 'Gaudin', 'Masson', 'Rivière', 'Aubert', 'Lacroix',
  'Fontaine', 'Garnier', 'Brunet', 'Carpentier', 'Morel'];
const CLUBS = ['CK Pau-Béarn', 'ACA Aviron Canoë', 'CKC Argentat', 'Canoë Club Vallée Ubaye',
  'US Ivry CK', 'CK Metz', 'ASCPA Tours', 'Sablé CK', 'CK Saint-Pierre', 'Annecy CK',
  'CK Cesson-Sévigné', 'Rennes EC', 'CK Vallée de l\'Aure', 'Bourg-Saint-Maurice CK'];

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function listFixtures() {
  return fs.readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const id = f.replace(/\.json$/, '');
      return { id, label: JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, f), 'utf8')).label || id };
    });
}

export function loadFixture(id) {
  const name = id.replace(/^kcross-/, '');
  const file = path.join(FIXTURES_DIR, `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`fixture introuvable : ${file} (disponibles : ${listFixtures().map((f) => f.id).join(', ')})`);
  }
  return { id: name, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
}

/**
 * Ce que competFFCK aurait en base pour cette compétition : la compétition,
 * ses catégories et, pour chaque bateau, le résultat du time trial (Tps_chrono
 * en millisecondes, -500 DNF, -600 DNS comme dans competFFCK).
 */
export function buildSource(fx) {
  const rand = rng(fx.seed ?? 1);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const categories = {};
  const boats = [];
  let code = Number(fx.competition.Code) * 1000;

  fx.categories.forEach((cat, ci) => {
    categories[cat.code] = { Nom_categorie: cat.nom, Statut_epreuve: 4 };
    const inscrits = cat.inscrits ?? cat.nb;
    const used = new Set();
    const entries = [];
    for (let i = 0; i < inscrits; i++) {
      let nom, prenom;
      do {
        nom = pick(NOMS);
        prenom = pick(cat.sexe === 'F' ? PRENOMS_F : PRENOMS_H);
      } while (used.has(nom + prenom));
      used.add(nom + prenom);
      const tt = Math.round((cat.tt_base_s ?? 62) * 1000 + rand() * (cat.tt_spread_s ?? 12) * 1000);
      entries.push({
        Code_bateau: String(++code),
        Dossard: String((ci + 1) * 100 + i + 1),
        Club: pick(CLUBS),
        Bateau: `${nom.toUpperCase()} ${prenom}`,
        Code_categorie: cat.code,
        Nom: nom,
        Prenom: prenom,
        Sexe: cat.sexe === 'F' ? 'F' : 'H',
        Matric: String(100000 + Math.floor(rand() * 899999)),
        Code_nation: 'FRA',
        Tps_chrono: tt,
      });
    }
    // Un abandon et un forfait au time trial : le DNF reste sélectionnable
    // (competFFCK le classe derrière les temps), le DNS non.
    if (inscrits > cat.nb) entries[entries.length - 1].Tps_chrono = -600;
    if (inscrits > cat.nb + 1) entries[entries.length - 2].Tps_chrono = -500;

    const timed = entries.filter((e) => e.Tps_chrono > 0).sort((a, b) => a.Tps_chrono - b.Tps_chrono);
    timed.forEach((e, i) => { e.Cltc = i + 1; e.Rang_initial = i + 1; });
    boats.push(...entries);
  });

  return { competition: fx.competition, categories, boats };
}
