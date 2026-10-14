// Tableau des phases finales pour l'incrustation OBS : pilotage par la régie
// et en-tête. L'arbre est calculé par tableau_model.js et dessiné par
// tableau_view.js (partagé avec l'écran TV).

import { FORMATS_COMPETITION } from '../../js/format_competition.js?v=2.2.0';
import { buildBracket, variantOf, isBracket, genreOf } from './tableau_model.js?v=2.2.0';
import { renderTree, playIntro, esc } from './tableau_view.js?v=2.2.0';

const params = new URLSearchParams(window.location.search);
const competition = params.get('competition');
const forced = params.get('force') === '1';
const fixedCategory = params.get('categorie');
// Toujours de gauche à droite, Dames comme Hommes : même lecture pour toutes
// les catégories. À 32 bateaux (8 huitièmes) les lignes se resserrent pour
// tenir à l'écran. ?disposition=branches pour deux branches convergeant vers
// la finale au centre.
const layoutParam = params.get('disposition');
// À l'antenne, seulement la branche de la course qui part (gros caractères,
// lisibles sur YouTube). ?vue=complet pour l'arbre entier.
const fullView = params.get('vue') === 'complet';
const chooseLayout = () => (layoutParam === 'branches' ? 'branches' : 'ltr');
const POLL_MS = 1500;

const $ = (id) => document.getElementById(id);

let categoryNames = {};
let heats = [];
let overlay = null;
let lastFingerprint = '';
let shown = false;
let shownCategory = null;

async function loadCategoryNames() {
  try {
    const r = await fetch(`../api/api_competffck_resultats.php?competition=${competition}`);
    const j = await r.json();
    for (const [k, v] of Object.entries(j.data?.statuts_categories || {})) categoryNames[k] = v.Nom_categorie || '';
  } catch (_) { /* libellé long facultatif */ }
}

async function loadHeats() {
  const r = await fetch(`../api/api_get_next_heats.php?competition=${competition}&etat=1,2,3,4,5,6&club=true`);
  if (!r.ok) return;
  const j = await r.json();
  heats = (j.heats || []).filter((h) => h.name !== '_TEST_RESEAU_');
}

async function loadOverlay() {
  if (forced) return;
  try {
    const r = await fetch(`../api/api_overlay_state.php?competition=${competition}`);
    overlay = await r.json();
  } catch (_) { /* réseau coupé : on garde l'état précédent */ }
}

function hasBracket(categoryKey) {
  const h = heats.find((x) => x.categoryKey === categoryKey);
  const v = h && variantOf(FORMATS_COMPETITION, h.formatKey, h.nomVariante);
  return !!v && isBracket(v.variante, v.formatDef);
}

/** Catégorie et série mises en avant. */
function target() {
  if (!forced && overlay?.mode === 'BRACKET') {
    return { categoryKey: fixedCategory || overlay.categoryKey, highlight: overlay.heatId ?? null };
  }
  if (!forced) return null;
  // Répétition : la prochaine série à courir d'une catégorie en tableau.
  const upcoming = heats.find((h) => h.etat <= 3 && hasBracket(h.categoryKey) && (!fixedCategory || h.categoryKey === fixedCategory));
  const categoryKey = fixedCategory || upcoming?.categoryKey || heats.find((h) => hasBracket(h.categoryKey))?.categoryKey;
  return categoryKey ? { categoryKey, highlight: upcoming?.id ?? null } : null;
}

// ------------------------------------------------------------------ rendu

function render(model) {
  const board = $('board');
  renderTree(board, model, { full: fullView, layout: chooseLayout() });

  const genre = genreOf(model.categoryKey);
  if (genre) board.dataset.genre = genre;
  else delete board.dataset.genre;
  $('tb-genre').textContent = genre === 'dames' ? 'Dames' : genre === 'hommes' ? 'Hommes' : '';
  $('tb-cat').textContent = model.categoryKey;
  $('tb-catname').textContent = categoryNames[model.categoryKey] || '';

  // Prochaine course, en clair.
  const nx = model.next;
  $('tb-next').innerHTML = nx
    ? `<span class="tb-next-label">Prochaine course</span><span class="tb-next-what">${esc(nx.isFinal ? 'Finale' : `${model.phases.find((p) => p.cle === nx.phase)?.label} · Série ${nx.name.replace('S', '')}`)}${nx.startTime ? ` · ${esc(nx.startTime)}` : ''}</span>`
    : '';
}

// ---------------------------------------------------------------- boucle

async function tick() {
  await Promise.all([loadHeats(), loadOverlay()]);
  const t = target();
  const board = $('board');
  const heatsOfCat = t ? heats.filter((h) => h.categoryKey === t.categoryKey) : [];
  const model = t ? buildBracket({ heats: heatsOfCat, formats: FORMATS_COMPETITION, highlight: t.highlight }) : null;

  if (!model) {
    if (shown) {
      board.classList.remove('visible', 'played');
      board.classList.add('hidden');
      shown = false;
      lastFingerprint = '';
    }
    return;
  }

  const fingerprint = JSON.stringify([t, heatsOfCat.map((h) => [h.id, h.etat, h.lastModified])]);
  if (fingerprint !== lastFingerprint) {
    lastFingerprint = fingerprint;
    render(model);
  }
  if (!shown) {
    shown = true;
    board.classList.remove('hidden');
    void board.offsetWidth;
    board.classList.add('visible');
  }
  // Entrée en cascade à chaque apparition et à chaque changement de catégorie,
  // jamais sur une simple mise à jour des résultats.
  if (shownCategory !== t.categoryKey || !board.classList.contains('played')) {
    shownCategory = t.categoryKey;
    playIntro(board);
  }
}

/**
 * Le tableau est composé pour 1920 x 1080 (sortie OBS). Sur un écran ou une
 * fenêtre plus petits, on le réduit d'un bloc plutôt que de le couper : tout
 * reste à sa place, carte du vainqueur comprise.
 */
function fitToScreen() {
  const board = $('board');
  const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  board.style.transform = `scale(${k})`;
  board.style.left = `${Math.max(0, (window.innerWidth - 1920 * k) / 2)}px`;
  board.style.top = `${Math.max(0, (window.innerHeight - 1080 * k) / 2)}px`;
}

fitToScreen();
window.addEventListener('resize', fitToScreen);

if (!competition) {
  document.body.innerHTML = '<p style="color:#fff;font:20px sans-serif;padding:40px">Paramètre ?competition= manquant.</p>';
} else {
  await loadCategoryNames();
  await tick();
  setInterval(() => tick().catch(() => {}), POLL_MS);

}
