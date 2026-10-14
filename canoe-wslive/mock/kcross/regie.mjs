// Régie vidéo automatique : joue l'opérateur de video/video_control.html.
//
// L'incrustation OBS (video/video_incrustation.html) n'affiche que ce que la
// régie lui pousse par api_overlay_state.php. Sans opérateur, elle reste vide.
// Ici, chaque étape de la course pousse la charge utile que pushToOBS()
// construirait au même moment :
//   appel -> BRACKET (branche du tableau de la série qui part) puis START_RAMP,
//   départ -> LIVE_RUN, série officielle -> RESULTS.
// BRACKET n'est pas un mode de video_control.html : l'incrustation n'y montre
// aucun de ses blocs, et c'est la page video_tableau.html (embarquée par
// l'incrustation) qui s'affiche.
//
// En course, le Live est repoussé à chaque arrivée, pénalité ou abandon, dans
// l'ordre que l'opérateur obtiendrait en glissant les lignes : arrivés dans
// l'ordre d'arrivée, puis les bateaux encore sur l'eau dans l'ordre des couloirs.

import { createPenaltySummaryHTML } from './kx-engine.mjs';

// js/texts/fr_text_ui_roundnames.js, regie_video.roundNames
const ROUND_NAMES = {
  INVITES: 'Invités', TOUR1: 'Tour 1', TOUR2: 'Tour 2', TOUR3: 'Tour 3',
  MANCHE1: 'Manche 1', MANCHE2: 'Manche 2', MANCHE3: 'Manche 3',
  HUITIEMES: 'Huitième de Finale', QUARTS: 'Quart de Finale', DEMI: 'Demi-Finale', FINALE: 'Finale',
};
const PRIO_CLASSES = ['prio-red', 'prio-green', 'prio-blue', 'prio-yellow'];

export class Regie {
  constructor(db, { auto = true, style = 'incrustation_TV.css' } = {}) {
    this.db = db;
    this.auto = auto;
    this.style = style;
  }

  /** Construit et pousse l'état d'incrustation pour une série (heatJson). */
  push(mode, heat) {
    if (!this.auto || !heat) return;
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
      styleSheet: this.style,
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
    } else {
      const list = mode === 'RESULTS'
        ? [...slots].sort((a, b) => (parseInt(a.participant.finalRank) || 999) - (parseInt(b.participant.finalRank) || 999))
        : [...slots].sort((a, b) => (a.participant.ordre_arrivee || 99) - (b.participant.ordre_arrivee || 99) || a.prioDepart - b.prioDepart);
      for (const s of list) {
        const p = s.participant;
        if (p.specialStatus === 'DNS') continue;
        const penaltyHtml = p.specialStatus
          ? `<div class="penalty-summary-box"><div class="penalty-tag ral" >${p.specialStatus}</div></div>`
          : createPenaltySummaryHTML(p.penalite, { heatResult: { order: null }, gateCount: heat.gateCount, rollZoneAfterGate: heat.rollZoneAfterGate }, '');
        payload.slots.push({ name: p.name, club: p.club || null, numPos: (s.prioDepart - 1) % 4, colorLetter: PRIO_CLASSES[(s.prioDepart - 1) % 4], rank: p.finalRank, penaltyHtml });
      }
    }
    this.db.api_overlay_state({ competition: this.db.code }, payload, 'POST');
  }

  /** Tableau des phases finales de la catégorie, prochaine série mise en avant. */
  bracket(heat, highlight = true) {
    if (!this.auto || !heat) return;
    this.db.api_overlay_state({ competition: this.db.code }, {
      mode: 'BRACKET',
      title: `${heat.categoryKey} | Tableau`,
      categoryKey: heat.categoryKey,
      heatId: highlight ? heat.id : null,
      slots: [],
      styleSheet: this.style,
    }, 'POST');
  }

  hide() {
    if (!this.auto) return;
    this.db.api_overlay_state({ competition: this.db.code }, { action: 'DELETE' }, 'POST');
  }
}
