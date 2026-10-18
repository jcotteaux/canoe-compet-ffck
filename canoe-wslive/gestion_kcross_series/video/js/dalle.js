// Dalles LED du kayak cross : une série, ses 4 couloirs. Voir dalle.html.

import { FORMATS_COMPETITION } from '../../js/format_competition.js?v=2.2.0';
import { ConfigurationPenalites, PenaltyEncoder } from '../../js/engine.js?v=2.2.0';
import { genreOf, variantOf } from './tableau_model.js?v=2.2.0';

const params = new URLSearchParams(window.location.search);
const competition = params.get('competition');
// Temps pendant lequel une série validée reste à l'écran avec son classement.
const HOLD_MS = (Number(params.get('maintien')) || 20) * 1000;
const POLL_MS = 1500;

const LANES = ['R', 'V', 'B', 'J'];
const SHORT_ROUND = { HUITIEMES: '1/8', QUARTS: '1/4', DEMI: '1/2', FINALE: 'Finale' };
const GENRE = { dames: 'Dames', hommes: 'Hommes' };
// js/constants.js, statusOrder : sans statut d'abord, puis DNF, DSQ, DNS, DQB.
const STATUS_ORDER = { DNF: 1, DSQ: 2, DNS: 3, DQB: 4 };

let heats = [];
let clockOffset = 0; // heure serveur - heure locale, pour mesurer le maintien
const copies = [];

// ------------------------------------------------------------------ données

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

/**
 * Série affichée, comme sur ecran_tv :
 *   1. celle qui est sur l'eau ou à l'arrivée ;
 *   2. sinon la dernière validée, pendant HOLD_MS ;
 *   3. sinon la prochaine au départ.
 */
function serieAffichee() {
  const now = Date.now() + clockOffset;
  const onWater = heats.find((h) => h.etat === 3 || h.etat === 4 || h.etat === 6);
  const lastDone = [...heats].reverse().find((h) => h.etat === 5);
  const upcoming = heats.find((h) => h.etat <= 2);
  if (onWater) return onWater;
  if (lastDone && now - lastDone.lastModified < HOLD_MS) return lastDone;
  return upcoming || lastDone || null;
}

/** Nombre de qualifiés par série de ce tour, et s'il s'agit de la finale. */
function regleDuTour(h) {
  const v = variantOf(FORMATS_COMPETITION, h.formatKey, h.nomVariante);
  const phases = v?.variante.phases || [];
  const i = phases.findIndex((p) => p.cle === h.roundKey);
  const isFinal = h.roundKey === 'FINALE' || (i >= 0 && i === phases.length - 1);
  return { isFinal, qualifies: isFinal || i < 0 ? 0 : phases[i].nbQualifiesParSerie || 0 };
}

/**
 * Les zones du parcours dans l'ordre (S départ, portes, R esquimautage) et,
 * pour ce bateau, l'état de chacune : 'ok' jugée sans pénalité, 'flt', 'ral',
 * ou '' pas encore jugée.
 */
function zones(h, p, avecEtat) {
  const code = p?.penalite || '';
  const jugees = h.zonesJugees || '';
  return ConfigurationPenalites.genererSequenceZones(h.gateCount, h.rollZoneAfterGate, h.detailPortes || null).map((zone, i) => {
    const label = zone.type === 'START' ? 'S' : zone.type === 'ROLL' ? 'R' : String(zone.numeroPorte);
    const c = code[i] || '0';
    let etat = '';
    if (avecEtat) etat = c === '5' ? 'ral' : c === '2' ? 'flt' : (jugees[i] || '0') !== '0' ? 'ok' : '';
    return { label, etat };
  });
}

/** « DUMAS Camille » → « DUMAS » : les mots en capitales, le nom de famille. */
function nomCourt(nom) {
  const mots = String(nom || '').trim().split(/\s+/);
  const capitales = mots.filter((m) => m.length > 1 && m === m.toUpperCase() && /[A-Z]/i.test(m));
  return (capitales.length ? capitales : mots.slice(0, 1)).join(' ').toUpperCase();
}

/** Le prénom : les mots qui ne sont pas en capitales. */
function prenomDe(nom) {
  return String(nom || '').trim().split(/\s+/).filter((m) => m !== m.toUpperCase()).join(' ');
}

/**
 * Deux homonymes dans la même série : « VASSEUR M. », ou le prénom entier
 * si les initiales sont les mêmes (« MERCIER Arthur », « MERCIER Adam »).
 */
function nomDistinct(nom, autres) {
  const n = nomCourt(nom);
  const prenom = prenomDe(nom);
  if (!prenom || !autres.some((a) => nomCourt(a) === n)) return n;
  const initiale = (x) => prenomDe(x).charAt(0).toUpperCase();
  const memeInitiale = autres.some((a) => nomCourt(a) === n && initiale(a) === initiale(nom));
  return memeInitiale ? `${n} ${prenom}` : `${n} ${initiale(nom)}.`;
}

/** Ce que montre la dalle : la tête et les 4 lignes. */
function vue(h) {
  if (!h) return null;
  const etat = h.etat === 5 ? 'resultats' : h.etat === 3 || h.etat === 4 || h.etat === 6 ? 'course' : 'attente';
  const { isFinal, qualifies } = regleDuTour(h);

  // Une ligne par couloir, toujours dans l'ordre des couloirs : c'est `pos`,
  // sa place à l'écran, qui la fait glisser (voir peindre).
  const lignes = LANES.map((lane, i) => {
    const slot = h.slots.find((s) => s.prioDepart === i + 1);
    return { lane, i, p: slot?.participant || null };
  });

  // L'ordre de l'écran. Résultats : le classement officiel. En course : celui
  // de l'instant, d'après les pénalités déjà jugées (statut, RAL, FLT et leur
  // position, place d'arrivée, couloir), comme l'incrustation. Couloir vide en
  // bas. Avant le départ : les couloirs.
  const vide = (l) => (l.p ? 0 : 1);
  const tri = etat === 'resultats'
    ? (a, b) => vide(a) - vide(b) || (parseInt(a.p?.finalRank, 10) || 99) - (parseInt(b.p?.finalRank, 10) || 99) || a.i - b.i
    : etat === 'course'
    ? (a, b) => vide(a) - vide(b)
      || (STATUS_ORDER[a.p?.specialStatus] || 0) - (STATUS_ORDER[b.p?.specialStatus] || 0)
      || PenaltyEncoder.encode(a.p?.penalite) - PenaltyEncoder.encode(b.p?.penalite)
      || (parseInt(a.p?.ordre_arrivee, 10) || Infinity) - (parseInt(b.p?.ordre_arrivee, 10) || Infinity)
      || a.i - b.i
    : (a, b) => a.i - b.i;
  [...lignes].sort(tri).forEach((l, pos) => { l.pos = pos; });

  const noms = lignes.filter((l) => l.p).map((l) => l.p.name);

  return {
    cle: h.id,
    etat,
    genre: genreOf(h.categoryKey) || '',
    tour: SHORT_ROUND[h.roundKey] || h.roundKey,
    serie: h.roundKey === 'FINALE' ? '' : h.name,
    categorie: GENRE[genreOf(h.categoryKey)] || h.categoryKey,
    lignes: lignes.map(({ lane, p, pos }) => {
      // Aux résultats, un couloir vide disparaît (en bas, sans bande).
      if (!p) return { lane, pos, vide: true, absente: etat === 'resultats', zones: zones(h, null, false) };
      const rank = parseInt(p.finalRank, 10);
      const statut = p.specialStatus || '';
      let place = '';
      let classe = '';
      if (etat === 'resultats') {
        place = statut ? '' : Number.isFinite(rank) ? String(rank) : '';
        if (isFinal && rank >= 1 && rank <= 3 && !statut) classe = `p${rank}`;
        else if (qualifies && rank <= qualifies && !statut) classe = 'qualifie';
        else if (qualifies) classe = 'elimine';
      } else if (etat === 'course') {
        place = p.ordre_arrivee ? String(p.ordre_arrivee) : '';
        if (place) classe = 'arrive';
      }
      return {
        lane,
        pos,
        nom: nomDistinct(p.name, noms.filter((x) => x !== p.name)),
        statut,
        zones: zones(h, p, etat !== 'attente'),
        place,
        classe,
      };
    }),
  };
}

// ----------------------------------------------------------------- rendu

function texte(el, t) {
  if (el.textContent !== t) el.textContent = t;
}

function classe(el, c) {
  if (el.className !== c) el.className = c;
}

/** Un texte trop long rétrécit jusqu'à tenir dans sa place (jamais sous 45 %). */
function ajuster(el) {
  el.style.fontSize = '';
  const base = parseFloat(getComputedStyle(el).fontSize);
  let k = 1;
  while (k > 0.45 && el.scrollWidth > el.clientWidth) {
    k -= 0.05;
    el.style.fontSize = `${Math.round(base * k)}px`;
  }
}

/** Arrondit la largeur d'une boîte au pixel supérieur. */
function largeurEntiere(el) {
  el.style.minWidth = '';
  if (!el.textContent) return;
  const w = el.getBoundingClientRect().width;
  if (w !== Math.round(w)) el.style.minWidth = `${Math.ceil(w)}px`;
}

function creerCopie() {
  const el = document.createElement('div');
  el.className = 'dalle';
  el.innerHTML = `
    <div class="kx-tete"><span class="kx-tour"></span><span class="kx-genre"></span><span class="kx-serie"></span></div>
    <div class="kx-lignes">${LANES.map(() => `
      <div class="kx-ligne">
        <span class="kx-lane"></span><span class="kx-nom"></span><span class="kx-pena"></span><span class="kx-place"></span>
      </div>`).join('')}
    </div>`;
  document.body.appendChild(el);
  return { el };
}

function peindre(copie, v) {
  const el = copie.el;
  classe(el, `dalle ${v ? v.etat : 'vide'} ${v?.genre || ''}`);
  if (!v) return;

  // Nouvelle série : les lignes se posent sans glisser depuis les places de
  // la précédente.
  const nouvelle = copie.cle !== v.cle;
  copie.cle = v.cle;

  const tete = el.querySelector('.kx-tete');
  // « Finale », « Hommes » rétrécissent pour tenir dans la largeur de la tête.
  [['.kx-tour', v.tour], ['.kx-genre', v.categorie], ['.kx-serie', v.serie]].forEach(([sel, t]) => {
    const e = tete.querySelector(sel);
    if (e.textContent !== t) {
      e.textContent = t;
      ajuster(e);
    }
  });

  el.querySelectorAll('.kx-ligne').forEach((ligne, i) => {
    const l = v.lignes[i];
    if (!l || l.absente) {
      classe(ligne, 'kx-ligne absente');
      return;
    }

    // La ligne i est celle du couloir i ; elle glisse jusqu'à sa place (la
    // transition est dans dalle.css). Celle qui monte passe au-dessus.
    const avant = Number(ligne.dataset.pos);
    if (avant !== l.pos || nouvelle) {
      ligne.style.zIndex = Number.isFinite(avant) && l.pos < avant ? '2' : '1';
      ligne.dataset.pos = l.pos;
      if (nouvelle) ligne.style.transition = 'none';
      ligne.style.transform = l.pos === i ? '' : `translateY(calc(${l.pos - i} * var(--u25)))`;
      if (nouvelle) {
        void ligne.offsetHeight;
        ligne.style.transition = '';
      }
    }
    classe(ligne, `kx-ligne ${l.vide ? 'vide' : ''} ${l.classe || ''}`.trim().replace(/\s+/g, ' '));

    // Le couloir : sa couleur et sa lettre (R, V, B, J), sans le dossard.
    const lane = ligne.querySelector('.kx-lane');
    classe(lane, `kx-lane lane-${l.lane}`);
    texte(lane, l.lane);

    // Une case par zone du parcours, comme les portes de tv_duo_kx : sombre
    // pas encore jugée, verte sans pénalité, « F » sur jaune pour une FLT,
    // « R » sur rouge pour un RAL. Un statut les remplace.
    const pena = ligne.querySelector('.kx-pena');
    const penaHtml = l.statut
      ? `<span class="kx-statut">${l.statut}</span>`
      : l.zones.map((z) => `<span class="${z.etat}">${z.etat === 'flt' ? 'F' : z.etat === 'ral' ? 'R' : ''}</span>`).join('');
    if (pena._html !== penaHtml) {
      pena._html = penaHtml;
      pena.innerHTML = penaHtml;
      const statut = pena.querySelector('.kx-statut');
      if (statut) largeurEntiere(statut);
    }

    texte(ligne.querySelector('.kx-place'), l.place || '');

    const nom = ligne.querySelector('.kx-nom');
    const charge = `${l.nom}|${penaHtml}|${l.place}`;
    if (nom.dataset.charge !== charge) {
      nom.dataset.charge = charge;
      texte(nom, l.vide ? '' : l.nom);
      ajuster(nom);
    }
  });
}

// ------------------------------------------------------------ dimensions

function lireZone() {
  const m = /^(\d+)x(\d+)(?:\+(\d+)\+(\d+))?$/.exec(params.get('zone') || '512x128+0+0');
  return m ? { w: +m[1], h: +m[2], x: +(m[3] || 0), y: +(m[4] || 0) } : null;
}

/** Copies empilées au pixel près ; tailles en pixels entiers, --u1 à --u100. */
function redimensionner() {
  const z = lireZone();
  if (!z) return;
  copies.forEach((c, k) => {
    Object.assign(c.el.style, { left: `${z.x}px`, top: `${z.y + k * z.h}px`, width: `${z.w}px`, height: `${z.h}px` });
  });
  for (let k = 1; k <= 100; k++)
    document.documentElement.style.setProperty(`--u${k}`, `${Math.round(k * z.h / 100)}px`);
}

// ---------------------------------------------------------------- boucle

async function tick() {
  await loadHeats();
  const v = vue(serieAffichee());
  copies.forEach((c) => peindre(c, v));
}

if (!competition) {
  document.body.innerHTML = '<p style="color:#fff;font:16px sans-serif;padding:8px">Paramètre ?competition= manquant.</p>';
} else {
  const n = Math.max(1, Number(params.get('copies')) || 2);
  for (let k = 0; k < n; k++) copies.push(creerCopie());
  redimensionner();
  await document.fonts.load('bold 20px Calibri').catch(() => {});
  await syncClock();
  await tick();
  setInterval(() => tick().catch((e) => console.warn('[dalle]', e)), POLL_MS);
  setInterval(syncClock, 60000);
}
