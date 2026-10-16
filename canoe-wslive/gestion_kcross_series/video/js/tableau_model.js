// Modèle du tableau des phases finales, sans DOM.
//
// À partir des séries d'une catégorie (api_get_next_heats.php) et des règles
// de son format (format_competition.js), construit l'arbre que le spectateur
// lit comme un tableau de coupe : deux branches qui convergent vers la finale.
//
// Seuls les formats qui sont réellement un arbre sont dessinés : chaque série
// envoie ses qualifiés dans une seule série du tour suivant, et la dernière
// phase n'a qu'une série. C'est le cas de l'élimination directe ICF. La
// montante-descendante, le Joker ou les Piges redistribuent les bateaux entre
// plusieurs séries : un arbre serait faux, on n'en dessine pas.

const ROUND_LABELS = {
  HUITIEMES: 'Huitièmes de finale',
  QUARTS: 'Quarts de finale',
  DEMI: 'Demi-finales',
  FINALE: 'Finale',
};

const LANES = ['R', 'V', 'B', 'J'];
const OUT_OF_PROGRESSION = new Set(['DNS', 'DQB']);

/**
 * Dames ou Hommes, d'après le code de catégorie (K1D, K1H, K1DJ, XK1D, XK1H…). Les tours
 * des deux catégories sont intercalés : le public doit savoir d'un coup d'œil
 * laquelle il regarde. null si le code ne le dit pas.
 */
export function genreOf(categoryKey) {
  const m = String(categoryKey || '').toUpperCase().match(/^X?[KC]\d([DFH])/);
  if (!m) return null;
  return m[1] === 'H' ? 'hommes' : 'dames';
}

export function roundLabel(phase) {
  if (ROUND_LABELS[phase.cle]) return ROUND_LABELS[phase.cle];
  const nom = String(phase.nom || phase.cle).toLowerCase();
  return nom.charAt(0).toUpperCase() + nom.slice(1);
}

function rulesOf(progression, formatDef) {
  return progression.regles || formatDef.schemasCommuns?.[progression.refSchemaCommun]?.regles || [];
}

export function variantOf(formats, formatKey, nomVariante) {
  const formatDef = formats[formatKey];
  const variante = formatDef?.variantesParNbParticipants?.[nomVariante];
  return variante ? { formatDef, variante } : null;
}

/** Liens source -> cible du format : [{ from: {phase, index}, to: {phase, index} }]. */
function links(variante, formatDef) {
  const out = [];
  for (const prog of variante.progressions || []) {
    for (const regle of rulesOf(prog, formatDef)) {
      for (const groupe of regle.groupesDeSeeding || []) {
        for (const src of groupe.sources || []) {
          out.push({
            from: { phase: prog.phaseSourceCle, index: src.serieSourceIndex },
            to: { phase: prog.phaseCibleCle, index: regle.serieCibleIndex },
          });
        }
      }
    }
  }
  return out;
}

/**
 * Le format se dessine-t-il comme un tableau ? Une seule finale, et chaque
 * série envoie ses qualifiés dans une ou deux séries du tour suivant, jamais
 * plus loin. Les huitièmes « barrage » à 20 bateaux (le 1er et le 2e partent
 * dans deux quarts différents) passent ; le Joker, qui repêche sur plusieurs
 * tours, et la montante-descendante, qui redistribue tout, non.
 */
export function isBracket(variante, formatDef) {
  if (!variante || variante.type === 'brassage') return false;
  const phases = variante.phases || [];
  if (phases.length < 2 || phases[phases.length - 1].nbSeries !== 1) return false;
  const order = new Map(phases.map((p, i) => [p.cle, i]));
  const targets = new Map();
  for (const l of links(variante, formatDef)) {
    if (order.get(l.to.phase) !== order.get(l.from.phase) + 1) return false;
    const k = `${l.from.phase}:${l.from.index}`;
    if (!targets.has(k)) targets.set(k, new Set());
    targets.get(k).add(l.to.index);
  }
  if ([...targets.values()].some((t) => t.size > 2)) return false;
  // Chaque série hors finale doit mener quelque part.
  return phases.slice(0, -1).every((p) =>
    Array.from({ length: p.nbSeries }, (_, i) => targets.has(`${p.cle}:${i}`)).every(Boolean));
}

const ordinal = (n) => (n === 1 ? '1er' : `${n}e`);

/**
 * Construit le tableau d'une catégorie.
 *   heats      séries de la catégorie (format api_get_next_heats, club=true)
 *   formats    FORMATS_COMPETITION
 *   highlight  id de la prochaine série à courir (mise en avant)
 * Renvoie null si le format n'est pas un arbre.
 */
export function buildBracket({ heats, formats, highlight = null }) {
  if (!heats.length) return null;
  const { formatKey, nomVariante, categoryKey } = heats[0];
  const v = variantOf(formats, formatKey, nomVariante);
  if (!v || !isBracket(v.variante, v.formatDef)) return null;
  const { variante, formatDef } = v;
  const phases = variante.phases;
  const last = phases[phases.length - 1];

  const nameOf = (phaseCle, index) => {
    const p = phases.find((x) => x.cle === phaseCle);
    return `S${p.nomSeriesCommenceA + index}`;
  };

  // Places réservées : qualifiés d'office par le time trial, et qualifiés à
  // venir d'une série précédente (« Vainqueur S1 »).
  const reserved = new Map(); // `${phase}:${index}:${prio}` -> { label, direct }
  for (const pre of variante.preRemplissagePhasesSuivantes || []) {
    for (const s of pre.slots) {
      reserved.set(`${pre.phaseCibleCle}:${pre.serieCibleIndex}:${s.prioAffichage}`, {
        label: `${ordinal(s.rangTT)} du time trial`,
        direct: true,
      });
    }
  }
  for (const prog of variante.progressions || []) {
    for (const regle of rulesOf(prog, formatDef)) {
      for (const g of regle.groupesDeSeeding || []) {
        g.slotsCibles.forEach((slotIndex, i) => {
          const src = g.sources[i];
          if (!src) return;
          const who = src.rangDansSerieSource === 1 ? 'Vainqueur' : `${ordinal(src.rangDansSerieSource)} de`;
          const sourceName = nameOf(prog.phaseSourceCle, src.serieSourceIndex);
          reserved.set(`${prog.phaseCibleCle}:${regle.serieCibleIndex}:${slotIndex + 1}`, {
            label: `${who} ${sourceName}`,
            direct: false,
            source: { phase: prog.phaseSourceCle, name: sourceName, rank: src.rangDansSerieSource },
          });
        });
      }
    }
  }

  // Nœuds : une série par case, même si elle n'existe pas encore en base.
  const nodes = new Map();
  phases.forEach((phase, pi) => {
    for (let index = 0; index < phase.nbSeries; index++) {
      const name = nameOf(phase.cle, index);
      const heat = heats.find((h) => h.roundKey === phase.cle && h.name === name) || null;
      const isFinal = pi === phases.length - 1;
      const qualifies = isFinal ? 0 : phase.nbQualifiesParSerie || 0;
      const official = heat && heat.etat === 5;
      // Place encore vide dont la série source est déjà validée : on connaît le
      // bateau qualifié, même si le moteur ne l'affecte qu'une fois l'autre
      // série source courue (son couloir dépend alors du time trial).
      const provisionalFor = (res) => {
        const src = res?.source;
        const srcHeat = src && heats.find((h) => h.roundKey === src.phase && h.name === src.name);
        if (!srcHeat || srcHeat.etat !== 5) return null;
        const q = srcHeat.slots.find((x) => parseInt(x.participant?.finalRank, 10) === src.rank);
        if (!q || OUT_OF_PROGRESSION.has(q.participant.specialStatus)) return null;
        return { name: q.participant.name, club: q.participant.club || null, from: `${ordinal(src.rank)} ${src.name}` };
      };
      const slots = [];
      for (let prio = 1; prio <= 4; prio++) {
        const s = heat?.slots.find((x) => x.prioDepart === prio);
        const res = reserved.get(`${phase.cle}:${index}:${prio}`) || null;
        const p = s?.participant;
        const rankNum = p && Number.isFinite(parseInt(p.finalRank, 10)) ? parseInt(p.finalRank, 10) : null;
        const status = p?.specialStatus || null;
        slots.push({
          prio,
          lane: LANES[(prio - 1) % 4],
          name: p?.name || null,
          club: p?.club || null,
          bib: p?.bib || null,
          rank: official ? rankNum : null,
          status,
          placeholder: p ? null : res?.label || null,
          provisional: p ? null : provisionalFor(res),
          direct: !!res?.direct && !!p,
          qualified: official && !isFinal && rankNum !== null && rankNum <= qualifies && !OUT_OF_PROGRESSION.has(status),
          eliminated: official && !isFinal && !(rankNum !== null && rankNum <= qualifies && !OUT_OF_PROGRESSION.has(status)),
          medal: official && isFinal && rankNum && rankNum <= 3 ? rankNum : null,
        });
      }
      // Classement à l'arrivée : la série officielle se lit de haut en bas.
      if (official) {
        slots.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.prio - b.prio);
      }
      nodes.set(`${phase.cle}:${index}`, {
        key: `${phase.cle}:${index}`,
        phase: phase.cle,
        phaseIndex: pi,
        index,
        name,
        id: heat?.id ?? null,
        startTime: heat?.startTime ? heat.startTime.slice(0, 5).replace(':', 'h') : null,
        globalHeatNumber: heat?.globalHeatNumber ?? null,
        etat: heat?.etat ?? 1,
        next: heat ? heat.id === highlight : false,
        isFinal,
        qualifies,
        slots,
        side: null,
      });
    }
  });

  const edges = links(variante, formatDef).map((l) => ({
    from: `${l.from.phase}:${l.from.index}`,
    to: `${l.to.phase}:${l.to.index}`,
  }));
  const uniqueEdges = [...new Map(edges.map((e) => [`${e.from}>${e.to}`, e])).values()];
  // Une série de barrage alimente deux séries : on la range sous la première.
  const parentsOf = (key) => uniqueEdges.filter((e) => e.from === key).map((e) => e.to);
  const childrenOf = (key) => uniqueEdges.filter((e) => e.to === key).map((e) => e.from);

  // Branches : les séries qui alimentent la finale partagent le tableau en
  // deux, et chaque série hérite du côté de la série qu'elle alimente.
  const finalKey = `${last.cle}:0`;
  const feeders = childrenOf(finalKey).sort((a, b) => nodes.get(a).index - nodes.get(b).index);
  const half = Math.ceil(feeders.length / 2);
  const assign = (key, side) => {
    const n = nodes.get(key);
    if (!n || n.side) return;
    n.side = side;
    childrenOf(key).forEach((c) => assign(c, side));
  };
  feeders.forEach((k, i) => assign(k, i < half ? 'left' : 'right'));
  nodes.get(finalKey).side = 'center';

  // Colonnes, de la finale vers l'extérieur, ordonnées comme leurs parents
  // pour que les traits ne se croisent pas.
  const columns = { left: [], right: [] };
  for (const side of ['left', 'right']) {
    let previous = [finalKey];
    for (let pi = phases.length - 2; pi >= 0; pi--) {
      const col = [...nodes.values()]
        .filter((n) => n.phaseIndex === pi && n.side === side)
        .sort((a, b) => {
          const pos = (n) => Math.min(...parentsOf(n.key).map((k) => previous.indexOf(k)).filter((i) => i >= 0), 999);
          return pos(a) - pos(b) || a.index - b.index;
        });
      columns[side].unshift({ phase: phases[pi], label: roundLabel(phases[pi]), nodes: col });
      previous = col.map((n) => n.key);
    }
  }

  // Disposition de gauche à droite : chaque tour est une colonne, la branche
  // haute au-dessus de la branche basse, dans l'ordre qui évite les croisements.
  const rounds = columns.left.map((col, pi) => ({
    phase: col.phase,
    label: col.label,
    nodes: [...col.nodes, ...(columns.right[pi]?.nodes || [])],
  }));

  return {
    categoryKey,
    rounds,
    formatKey,
    perHeat: 4,
    qualifies: phases[0].nbQualifiesParSerie || 0,
    hasDirect: (variante.preRemplissagePhasesSuivantes || []).length > 0,
    phases: phases.map((p) => ({ cle: p.cle, label: roundLabel(p) })),
    left: columns.left,
    right: columns.right,
    final: { phase: last, label: roundLabel(last), node: nodes.get(finalKey) },
    edges: uniqueEdges,
    nodes,
    next: [...nodes.values()].find((n) => n.next) || null,
  };
}

/**
 * Vue resserrée pour l'antenne : la branche de la course qui part, en grand.
 *   - 1/8, 1/4 : les séries qui alimentent la même série que celle qui part,
 *     cette série, puis le tour d'après (trois colonnes au plus : au-delà, on
 *     n'afficherait que des « Vainqueur S… » sans intérêt) ;
 *   - demies et finale : la fin de l'arbre, demies puis finale.
 * Sans course à venir dans la catégorie, on se cale sur la première série non
 * jouée, ou sur la finale une fois celle-ci courue.
 * Renvoie des colonnes [{ label, phaseIndex, nodes }] ; la dernière est la
 * finale dès que la branche l'atteint.
 */
export function focusBranch(model, focus = model.next) {
  const final = model.final.node;
  if (!focus) {
    focus = final.etat === 5
      ? final
      : [...model.nodes.values()]
        .filter((n) => n.etat < 5)
        .sort((a, b) => a.phaseIndex - b.phaseIndex || a.index - b.index)[0] || final;
  }
  const up = (key) => model.nodes.get(model.edges.find((e) => e.from === key)?.to);
  const feedersOf = (key) => model.edges
    .filter((e) => e.to === key)
    .map((e) => model.nodes.get(e.from))
    .sort((a, b) => a.index - b.index);

  const root = focus.isFinal ? final : up(focus.key) || final;
  const columns = [];
  const feeders = feedersOf(root.key);
  if (feeders.length) columns.push({ phaseIndex: feeders[0].phaseIndex, nodes: feeders });
  for (let n = root; n && columns.length < 3; n = n.isFinal ? null : up(n.key)) {
    columns.push({ phaseIndex: n.phaseIndex, nodes: [n] });
  }
  return columns.map((c) => ({ ...c, label: model.phases[c.phaseIndex].label }));
}
