// Écran TV du site : suit la course seul, sans régie. Voir ecran_tv.html.

import { FORMATS_COMPETITION } from '../../js/format_competition.js?v=2.2.0';
import { createPenaltySummaryHTML } from '../../js/utils.js?v=2.2.0';
import { buildBracket, genreOf, roundLabel, variantOf } from './tableau_model.js?v=2.2.0';
import { renderTree, playIntro, esc } from './tableau_view.js?v=2.2.0';

const params = new URLSearchParams(window.location.search);
const competition = params.get('competition');
// Temps pendant lequel une série validée reste à l'écran avec son tableau.
const HOLD_MS = (Number(params.get('maintien')) || 20) * 1000;
const POLL_MS = 1500;

const $ = (id) => document.getElementById(id);
const LANES = ['R', 'V', 'B', 'J'];
const SHORT_ROUND = { HUITIEMES: '1/8', QUARTS: '1/4', DEMI: '1/2', FINALE: 'Finale' };

let heats = [];
let categoryNames = {};
let competitionName = '';
let clockOffset = 0; // heure serveur - heure locale, pour mesurer le maintien
let treeKey = '';
let introKey = '';

/** Ne remplace le contenu que s'il a changé : sinon les animations d'entrée
 *  des lignes se rejoueraient à chaque relevé. */
function setHtml(el, html, className) {
  if (className !== undefined && el.className !== className) el.className = className;
  if (el._html !== html) {
    el._html = html;
    el.innerHTML = html;
  }
}

// ------------------------------------------------------------------ données

async function loadStatic() {
  try {
    const r = await fetch(`../api/api_competffck_resultats.php?competition=${competition}`);
    const j = await r.json();
    competitionName = j.data?.competition_details?.Nom || '';
    for (const [k, v] of Object.entries(j.data?.statuts_categories || {})) categoryNames[k] = v.Nom_categorie || '';
  } catch (_) { /* libellés facultatifs */ }
}

async function syncClock() {
  try {
    const t0 = Date.now();
    const j = await (await fetch('../api/api_get_server_time.php')).json();
    clockOffset = j.serverTime - (t0 + Date.now()) / 2;
  } catch (_) { /* on garde l'écart précédent */ }
}

async function loadHeats() {
  const r = await fetch(`../api/api_get_next_heats.php?competition=${competition}&etat=1,2,3,4,5,6&club=true`);
  if (!r.ok) return;
  const j = await r.json();
  heats = (j.heats || [])
    .filter((h) => h.name !== '_TEST_RESEAU_' && h.globalHeatNumber)
    .sort((a, b) => a.globalHeatNumber - b.globalHeatNumber);
}

// ------------------------------------------------------------- où en est-on

/**
 * Série affichée :
 *   1. celle qui est sur l'eau ou à l'arrivée ;
 *   2. sinon la dernière validée, pendant HOLD_MS : on voit le résultat et son
 *      effet sur le tableau ;
 *   3. sinon la prochaine au départ.
 */
function situation() {
  const now = Date.now() + clockOffset;
  const onWater = heats.find((h) => h.etat === 3 || h.etat === 4 || h.etat === 6);
  const lastDone = [...heats].reverse().find((h) => h.etat === 5);
  const upcoming = heats.find((h) => h.etat <= 2);
  let current;
  if (onWater) current = onWater;
  else if (lastDone && now - lastDone.lastModified < HOLD_MS) current = lastDone;
  else current = upcoming || lastDone || null;
  const i = heats.indexOf(current);
  const next = i >= 0 ? heats.slice(i + 1).find((h) => h.etat < 5) : null;
  return { current, next };
}

const genreLabel = (key) => ({ dames: 'Dames', hommes: 'Hommes' }[genreOf(key)] || '');
const roundName = (h) => {
  const v = variantOf(FORMATS_COMPETITION, h.formatKey, h.nomVariante);
  const phase = v?.variante.phases.find((p) => p.cle === h.roundKey);
  return phase ? roundLabel(phase) : h.roundKey;
};
const heatTitle = (h) => (h.roundKey === 'FINALE' ? 'Finale' : `${roundName(h)} · Série ${h.name.replace('S', '')}`);
const hhmm = (t) => (t ? t.slice(0, 5).replace(':', 'h') : '');

function genreChip(key) {
  const g = genreOf(key);
  return g ? `<span class="tv-genre ${g}">${genreLabel(key)}</span>` : '';
}

// ------------------------------------------------------------------- en-tête

/** Programme de la journée par blocs (catégorie + tour), comme sur un panneau d'affichage. */
function renderProgram(current) {
  const blocks = [];
  for (const h of heats) {
    const key = `${h.categoryKey}|${h.roundKey}`;
    const last = blocks[blocks.length - 1];
    if (last && last.key === key) last.heats.push(h);
    else blocks.push({ key, categoryKey: h.categoryKey, roundKey: h.roundKey, heats: [h] });
  }
  setHtml($('tv-program'), blocks.map((b) => {
    const done = b.heats.filter((h) => h.etat === 5).length;
    const isCurrent = current && b.heats.includes(current);
    const state = done === b.heats.length ? 'done' : isCurrent ? 'current' : '';
    const g = genreOf(b.categoryKey) || '';
    const progress = isCurrent && b.heats.length > 1 ? `<i>${b.heats.indexOf(current) + 1}/${b.heats.length}</i>` : '';
    return `<span class="tv-block ${state} ${g}"><b>${SHORT_ROUND[b.roundKey] || b.roundKey}</b> ${esc(genreLabel(b.categoryKey) || b.categoryKey)}${progress}${state === 'done' ? '<em>✓</em>' : ''}</span>`;
  }).join(''));
  const n = current ? heats.indexOf(current) + 1 : 0;
  $('tv-count').textContent = current ? `Course ${n} sur ${heats.length}` : '';
}

function renderClock() {
  const d = new Date(Date.now() + clockOffset);
  $('tv-clock').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ------------------------------------------------------------------- arbre

function renderTreeFor(current) {
  const board = $('board');
  if (!current) return;
  const catHeats = heats.filter((h) => h.categoryKey === current.categoryKey);
  const model = buildBracket({ heats: catHeats, formats: FORMATS_COMPETITION, highlight: current.id });

  const g = genreOf(current.categoryKey);
  if (g) board.dataset.genre = g;
  else delete board.dataset.genre;
  $('tb-genre').textContent = genreLabel(current.categoryKey);
  $('tb-cat').textContent = current.categoryKey;
  $('tb-catname').textContent = categoryNames[current.categoryKey] || '';

  $('tv-notree').hidden = !!model;
  board.querySelector('.tb-stage').hidden = !model;
  if (!model) return;

  const key = JSON.stringify([current.id, catHeats.map((h) => [h.id, h.etat, h.lastModified])]);
  if (key !== treeKey) {
    treeKey = key;
    const focus = [...model.nodes.values()].find((n) => n.id === current.id);
    renderTree(board, model, { focus });
  }
  // Nouvelle série à l'écran : l'arbre rejoue son entrée.
  if (introKey !== String(current.id)) {
    introKey = String(current.id);
    playIntro(board);
  }
  return model;
}

// ------------------------------------------------------------ série en cours

const STATUS = {
  waiting: ['Au départ', 'waiting'],
  racing: ['En course', 'racing'],
  arrival: ['Arrivée', 'arrival'],
  results: ['Résultats', 'results'],
};

function renderCurrent(current, model) {
  if (!current) {
    setHtml($('tv-current'), '<p class="tv-empty">Aucune série au programme.</p>');
    return;
  }
  const state = current.etat === 5 ? 'results' : current.etat === 4 || current.etat === 6 ? 'arrival' : current.etat === 3 ? 'racing' : 'waiting';
  const [label, cls] = STATUS[state];
  const node = model ? [...model.nodes.values()].find((n) => n.id === current.id) : null;
  const qualifies = node && !node.isFinal ? node.qualifies : 0;

  // Les 4 couloirs, complétés par les places à venir du tableau.
  const rows = LANES.map((lane, i) => {
    const prio = i + 1;
    const slot = current.slots.find((s) => s.prioDepart === prio);
    const p = slot?.participant;
    const nodeSlot = node?.slots.find((s) => s.prio === prio);
    return { prio, lane, p, placeholder: nodeSlot?.placeholder || null, provisional: nodeSlot?.provisional || null };
  }).filter((r) => r.p || r.placeholder);

  if (state === 'results') {
    rows.sort((a, b) => (parseInt(a.p?.finalRank, 10) || 99) - (parseInt(b.p?.finalRank, 10) || 99));
  } else if (state !== 'waiting') {
    // Les arrivés remontent dans l'ordre d'arrivée, les autres restent par couloir.
    rows.sort((a, b) => (a.p?.ordre_arrivee || 99) - (b.p?.ordre_arrivee || 99) || a.prio - b.prio);
  }

  const html = rows.map((r) => {
    const p = r.p;
    if (!p) return pendingRow(r.lane, r.placeholder, r.provisional, '');
    const rank = parseInt(p.finalRank, 10);
    const qualified = state === 'results' && qualifies && rank && rank <= qualifies && p.specialStatus !== 'DNS';
    const medal = state === 'results' && node?.isFinal && rank <= 3 ? `medal-${rank}` : '';
    const classes = ['tv-row', qualified ? 'qualified' : '', state === 'results' && qualifies && !qualified ? 'eliminated' : '', medal].join(' ');
    const pena = p.specialStatus
      ? `<div class="penalty-summary-box"><div class="penalty-tag ral">${esc(p.specialStatus)}</div></div>`
      : state !== 'waiting'
        ? createPenaltySummaryHTML(p.penalite, { heatResult: { order: null }, gateCount: current.gateCount, rollZoneAfterGate: current.rollZoneAfterGate }, '')
        : '';
    const place = state === 'results' ? (Number.isFinite(rank) ? rank : '') : p.ordre_arrivee || '';
    return `<div class="${classes}">
        <span class="tv-lane lane-${r.lane}">${r.lane}</span>
        <span class="tv-who"><span class="tv-name">${esc(p.name)}</span><span class="tv-club">${esc(p.club || '')}</span></span>
        ${pena}
        ${qualified ? '<span class="tv-q">Q</span>' : ''}
        <span class="tv-place">${esc(place)}</span>
      </div>`;
  }).join('');

  const rule = state === 'results' && qualifies
    ? `<p class="tv-rule">Les ${qualifies} premiers passent au tour suivant</p>`
    : state === 'results' && node?.isFinal ? '<p class="tv-rule">Classement final de la catégorie</p>' : '';

  setHtml($('tv-current'), `
    <div class="tv-status"><span class="tv-badge ${cls}">${label}</span>
      <span class="tv-when">${esc(hhmm(current.startTime))}</span></div>
    <h2 class="tv-heat">${genreChip(current.categoryKey)}<span>${esc(current.categoryKey)} · ${esc(heatTitle(current))}</span></h2>
    <div class="tv-rows">${html || '<p class="tv-empty">Bateaux à déterminer</p>'}</div>
    ${rule}`, `tv-current ${cls}`);
}

/** Place encore vide : le qualifié déjà connu (couloir à fixer) ou d'où il viendra. */
function pendingRow(lane, placeholder, provisional, size) {
  if (provisional) {
    return `<div class="tv-row${size}"><span class="tv-lane unsure">?</span>
      <span class="tv-who"><span class="tv-name">${esc(provisional.name)}</span><span class="tv-club">${esc(provisional.club || '')}</span></span>
      <span class="tv-from">${esc(provisional.from)}</span></div>`;
  }
  return `<div class="tv-row${size} empty"><span class="tv-lane lane-${lane}">${lane}</span>
    <span class="tv-who"><span class="tv-placeholder">${esc(placeholder)}</span></span></div>`;
}

function renderNext(next) {
  if (!next) {
    setHtml($('tv-next'), '<div class="tv-next-label">À suivre</div><p class="tv-empty">Fin du programme.</p>');
    return;
  }
  const catHeats = heats.filter((h) => h.categoryKey === next.categoryKey);
  const model = buildBracket({ heats: catHeats, formats: FORMATS_COMPETITION });
  const node = model ? [...model.nodes.values()].find((n) => n.id === next.id) : null;
  const rows = LANES.map((lane, i) => {
    const slot = next.slots.find((s) => s.prioDepart === i + 1);
    const p = slot?.participant;
    const nodeSlot = node?.slots.find((s) => s.prio === i + 1);
    if (!p && !nodeSlot?.placeholder) return '';
    if (!p) return pendingRow(lane, nodeSlot.placeholder, nodeSlot.provisional, ' small');
    return `<div class="tv-row small"><span class="tv-lane lane-${lane}">${lane}</span>
      <span class="tv-who"><span class="tv-name">${esc(p.name)}</span><span class="tv-club">${esc(p.club || '')}</span></span></div>`;
  }).join('');
  setHtml($('tv-next'), `
    <div class="tv-next-label">À suivre <span class="tv-when">${esc(hhmm(next.startTime))}</span></div>
    <h3 class="tv-heat small">${genreChip(next.categoryKey)}<span>${esc(next.categoryKey)} · ${esc(heatTitle(next))}</span></h3>
    <div class="tv-rows">${rows || '<p class="tv-empty">Bateaux à déterminer</p>'}</div>`);
}

// ---------------------------------------------------------------- boucle

async function tick() {
  await loadHeats();
  const { current, next } = situation();
  $('tv-comp').textContent = competitionName;
  renderProgram(current);
  const model = renderTreeFor(current);
  renderCurrent(current, model);
  renderNext(next);
}

/** Composé pour 1920 x 1080 ; réduit d'un bloc sur un écran plus petit. */
function fitToScreen() {
  const screen = $('screen');
  const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  screen.style.transform = `scale(${k})`;
  screen.style.left = `${Math.max(0, (window.innerWidth - 1920 * k) / 2)}px`;
  screen.style.top = `${Math.max(0, (window.innerHeight - 1080 * k) / 2)}px`;
}

fitToScreen();
window.addEventListener('resize', fitToScreen);

if (!competition) {
  document.body.innerHTML = '<p style="color:#fff;font:24px sans-serif;padding:40px">Paramètre ?competition= manquant.</p>';
} else {
  await Promise.all([loadStatic(), syncClock()]);
  await tick();
  renderClock();
  setInterval(() => tick().catch((e) => console.warn('[ecran_tv]', e)), POLL_MS);
  setInterval(renderClock, 5000);
  setInterval(syncClock, 60000);
}
