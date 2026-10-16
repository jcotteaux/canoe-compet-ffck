// Pilote automatique de l'incrustation : voir video_pilote.html.
//
// Fait ce que l'opérateur de video_control.html ferait, d'après l'état des
// séries seulement, sans rien retenir : recharger la page la remet au même
// point. Toutes les 1,5 s :
//   - une série en course : LIVE_RUN (la dernière partie : elle passe avant
//     une série précédente restée à valider), arrivés dans l'ordre d'arrivée
//     puis les autres dans l'ordre des couloirs ;
//   - une série à valider (ou en modification) dont tous les bateaux ont une
//     place ou un statut : RESULTS « PROVISOIRE », le classement déduit des
//     places et des fautes (voir classementProvisoire), pendant ?maintien= s
//     depuis sa dernière modification ; ensuite on passe à la série suivante
//     (sa préparation) sans attendre les résultats officiels. Pas tous
//     arrivés : LIVE_RUN, pendant le même maintien ;
//   - sinon la dernière série validée, pendant ?maintien= s : RESULTS ;
//   - sinon la prochaine série : d'abord ?tableau= s de tableau des phases
//     finales (BRACKET, si le format en a un), puis sa rampe (START_RAMP) ;
//   - plus rien à courir : l'incrustation est vidée.
// L'état n'est réécrit que s'il change. Charges utiles identiques à celles de
// pushToOBS (ui_video_control.js) et de la régie du simulateur (mock/kcross/regie.mjs).

import { createPenaltySummaryHTML } from '../../js/utils.js?v=2.2.0';
import { FORMATS_COMPETITION } from '../../js/format_competition.js?v=2.2.0';
import { buildBracket } from './tableau_model.js?v=2.2.0';

const params = new URLSearchParams(window.location.search);
const competition = (params.get('competition') || '').replace(/[^a-zA-Z0-9_]/g, '');
const STYLE = (params.get('style') || 'incrustation_TV.css').replace(/[^\w.-]/g, '');
const HOLD_MS = (Number(params.get('maintien')) || 20) * 1000;
const BRACKET_MS = (params.has('tableau') ? Number(params.get('tableau')) : 12) * 1000;
// Régie TV : au passage d'un bloc de séries à l'autre (1/8 Dames -> 1/8 Hommes),
// elle couvre l'écran de son titre pendant ?titre= s ; le tableau attend la fin.
const TITLE_MS = (Number(params.get('titre')) || 0) * 1000;
const POLL_MS = 1500;

// js/texts/fr_text_ui_roundnames.js, regie_video.roundNames
const ROUND_NAMES = {
  INVITES: 'Invités', TOUR1: 'Tour 1', TOUR2: 'Tour 2', TOUR3: 'Tour 3',
  MANCHE1: 'Manche 1', MANCHE2: 'Manche 2', MANCHE3: 'Manche 3',
  HUITIEMES: 'Huitième de Finale', QUARTS: 'Quart de Finale', DEMI: 'Demi-Finale', FINALE: 'Finale',
};
const PRIO_CLASSES = ['prio-red', 'prio-green', 'prio-blue', 'prio-yellow'];
// js/constants.js, statusOrder : sans statut d'abord, puis DNF, DSQ, DNS, DQB.
const STATUS_ORDER = { DNF: 1, DSQ: 2, DNS: 3, DQB: 4 };
const ON_WATER = new Set([3, 4, 6]);

let clockOffset = 0;	// heure serveur - heure locale
let lastSent = '';

const $ = (id) => document.getElementById(id);

async function syncClock() {
  try {
    const t0 = Date.now();
    const j = await (await fetch('../api/api_get_server_time.php')).json();
    clockOffset = j.serverTime - (t0 + Date.now()) / 2;
  } catch (_) { /* on garde l'écart précédent */ }
}

async function loadHeats() {
  const r = await fetch(`../api/api_get_next_heats.php?competition=${competition}&etat=1,2,3,4,5,6&club=true`);
  if (!r.ok) throw new Error(`api_get_next_heats ${r.status}`);
  const j = await r.json();
  return (j.heats || [])
    .filter((h) => h.name !== '_TEST_RESEAU_' && h.globalHeatNumber)
    .sort((a, b) => a.globalHeatNumber - b.globalHeatNumber);
}

/** js/engine.js, PenaltyEncoder.encode : le nombre de RAL, puis de FLT, puis leur position. */
function penaltyScore(penaltyString) {
  if (!penaltyString || [...penaltyString].every((c) => c === '0')) return 0;
  const n = penaltyString.length;
  let ralCount = 0, fltCount = 0, ralMask = 0, fltMask = 0;
  for (let i = 0; i < n; i++) {
    const pos = n - 1 - i;
    if (penaltyString[i] === '5') { ralCount++; ralMask |= (1 << pos); }
    else if (penaltyString[i] === '2') { fltCount++; fltMask |= (1 << pos); }
  }
  return (ralCount << 28) | (fltCount << 24) | (ralMask << 12) | fltMask;
}

/**
 * Classement provisoire d'une série sur l'eau, dès que tous ses bateaux ont
 * une place d'arrivée ou un statut ; null sinon. Mêmes règles que
 * Serie.calculateAndApplyRanking (js/engine.js) : le statut (aucun, DNF, DSQ,
 * DNS, DQB), puis les pénalités (RAL d'abord, puis FLT, puis leur position),
 * puis la place d'arrivée. Le rang du contre-la-montre, dernier départage du
 * moteur, n'est pas dans l'API : le couloir (prioDepart) en tient lieu.
 * Renvoie les slots dans l'ordre, chacun avec son rang provisoire.
 */
function classementProvisoire(heat) {
  const slots = heat.slots.filter((s) => s.participant && s.participant.id);
  if (slots.length === 0) return null;
  const aResultat = (p) => (p.ordre_arrivee !== null && p.ordre_arrivee !== '' && p.ordre_arrivee !== undefined) || !!p.specialStatus;
  if (!slots.every((s) => aResultat(s.participant))) return null;

  const tries = [...slots].sort((a, b) => {
    const pa = a.participant, pb = b.participant;
    return (STATUS_ORDER[pa.specialStatus] || 0) - (STATUS_ORDER[pb.specialStatus] || 0)
      || penaltyScore(pa.penalite) - penaltyScore(pb.penalite)
      || (parseInt(pa.ordre_arrivee, 10) || Infinity) - (parseInt(pb.ordre_arrivee, 10) || Infinity)
      || a.prioDepart - b.prioDepart;
  });
  return tries.map((s, i) => ({ slot: s, rank: String(i + 1) }));
}

/** La charge utile d'un mode pour une série, comme pushToOBS. */
function payloadFor(mode, heat, provisoire = null) {
  const payload = {
    mode,
    title: `${heat.categoryKey} | ${ROUND_NAMES[heat.roundKey] || heat.roundKey} | ${heat.name}`,
    slots: [],
    showPenalties: true,
    showResultPenalties: true,
    // Les deux premiers d'une série sont qualifiés, sauf en finale.
    showQualifiers: heat.roundKey !== 'FINALE',
    showNextHeat: false,
    resultsLabel: 'RÉSULTATS',
    nextHeatLabel: 'PROCHAINE SÉRIE',
    styleSheet: STYLE,
    categoryKey: heat.categoryKey,
  };
  const slots = heat.slots.filter((s) => s.participant && s.participant.id);

  if (mode === 'START_RAMP') {
    for (let p = 1; p <= 4; p++) {
      const s = slots.find((sl) => sl.prioDepart === p);
      payload.slots.push(s
        ? { name: s.participant.name, club: s.participant.club || null, numPos: (p - 1) % 4, colorLetter: PRIO_CLASSES[(p - 1) % 4] }
        : { name: '', numPos: '', colorLetter: '' });
    }
    return payload;
  }

  // Provisoire : l'ordre et les rangs déduits des places et des fautes.
  const rangs = new Map();
  if (provisoire) {
    payload.resultsLabel = 'PROVISOIRE';
    provisoire.forEach((e) => rangs.set(e.slot, e.rank));
  }

  const list = provisoire ? provisoire.map((e) => e.slot)
    : mode === 'RESULTS'
    ? [...slots].sort((a, b) => (parseInt(a.participant.finalRank) || 999) - (parseInt(b.participant.finalRank) || 999))
    : [...slots].sort((a, b) => (parseInt(a.participant.ordre_arrivee) || 99) - (parseInt(b.participant.ordre_arrivee) || 99)
                                || a.prioDepart - b.prioDepart);

  for (const s of list) {
    const p = s.participant;
    if (p.specialStatus === 'DNS') continue;
    const penaltyHtml = p.specialStatus
      ? `<div class="penalty-summary-box"><div class="penalty-tag ral" >${p.specialStatus}</div></div>`
      : createPenaltySummaryHTML(p.penalite, { heatResult: { order: null }, gateCount: heat.gateCount, rollZoneAfterGate: heat.rollZoneAfterGate }, '');
    payload.slots.push({
      name: p.name, club: p.club || null, numPos: (s.prioDepart - 1) % 4,
      colorLetter: PRIO_CLASSES[(s.prioDepart - 1) % 4], rank: rangs.get(s) || p.finalRank, penaltyHtml,
    });
  }
  return payload;
}

/** Le format de la série a-t-il un tableau ? (pas la montante-descendante, le Joker, les Piges) */
function hasBracket(heat, heats) {
  try {
    return buildBracket({ heats: heats.filter((h) => h.categoryKey === heat.categoryKey), formats: FORMATS_COMPETITION }) !== null;
  } catch (_) {
    return false;
  }
}

/** Ce qu'il faut montrer maintenant : la charge utile, ou null pour vider. */
function decide(heats) {
  const now = Date.now() + clockOffset;

  // La série en course d'abord : la dernière partie, même si une série
  // précédente attend encore sa validation.
  const enCourse = [...heats].reverse().find((h) => h.etat === 3);
  if (enCourse) {
    const provisoire = classementProvisoire(enCourse);
    return provisoire ? payloadFor('RESULTS', enCourse, provisoire) : payloadFor('LIVE_RUN', enCourse);
  }

  // À valider (ou en modification) : le provisoire pendant le maintien, puis
  // la préparation de la suivante, sans attendre les résultats officiels.
  const aValider = [...heats].reverse().find((h) => ON_WATER.has(h.etat));
  let provisoire = null;
  if (aValider) {
    provisoire = classementProvisoire(aValider);
    // Un bateau sans place ni statut (DNF pas saisi) ne bloque pas l'écran :
    // même maintien, puis la suite.
    if (now - (aValider.lastModified || 0) < HOLD_MS)
      return provisoire ? payloadFor('RESULTS', aValider, provisoire) : payloadFor('LIVE_RUN', aValider);
  }

  const lastDone = [...heats].reverse().find((h) => h.etat === 5);
  if (lastDone && now - lastDone.lastModified < HOLD_MS
      && !(aValider && aValider.globalHeatNumber > lastDone.globalHeatNumber))
    return payloadFor('RESULTS', lastDone);

  const next = heats.find((h) => h.etat <= 2);
  // Plus rien à courir : la dernière série reste en provisoire jusqu'à la validation.
  if (!next) return provisoire ? payloadFor('RESULTS', aValider, provisoire) : null;

  // Le tableau d'abord, juste après les résultats de la série précédente (et
  // après le titre de la régie si l'on change de bloc).
  const newBlock = lastDone && (lastDone.categoryKey !== next.categoryKey || lastDone.roundKey !== next.roundKey);
  const since = lastDone ? now - (lastDone.lastModified + HOLD_MS + (newBlock ? TITLE_MS : 0)) : Infinity;
  if (BRACKET_MS > 0 && since < BRACKET_MS && (since >= 0 || !newBlock) && hasBracket(next, heats)) {
    return {
      mode: 'BRACKET',
      title: `${next.categoryKey} | Tableau`,
      categoryKey: next.categoryKey,
      heatId: next.id,
      slots: [],
      styleSheet: STYLE,
    };
  }
  return payloadFor('START_RAMP', next);
}

async function push(payload) {
  const body = JSON.stringify(payload || { action: 'DELETE' });
  if (body === lastSent) return;
  // Corps texte, sans en-tête particulier : pas de requête préalable CORS.
  const r = await fetch(`../api/api_overlay_state.php?competition=${competition}`, { method: 'POST', body });
  if (r.ok) lastSent = body;
}

async function tick() {
  try {
    const heats = await loadHeats();
    const payload = decide(heats);
    await push(payload);
    $('etat').textContent = `${new Date().toLocaleTimeString('fr-FR')} · ${payload ? payload.mode + ' · ' + payload.title : 'incrustation vide'}`;
  } catch (e) {
    $('etat').textContent = `${new Date().toLocaleTimeString('fr-FR')} · erreur : ${e.message}`;
  }
}

$('comp').textContent = competition || '(aucune)';
if (competition) {
  syncClock();
  setInterval(syncClock, 60000);
  tick();
  setInterval(tick, POLL_MS);
}
