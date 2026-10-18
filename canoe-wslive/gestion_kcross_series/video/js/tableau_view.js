// Dessin du tableau des phases finales, partagé par l'incrustation OBS
// (video_tableau.html) et l'écran TV du site (ecran_tv.html). Le calcul de
// l'arbre est dans tableau_model.js.

import { focusBranch } from './tableau_model.js?v=2.2.0';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TROPHY = '<svg class="tb-trophy" viewBox="0 0 64 64" aria-hidden="true"><path d="M18 6h28v6h10v6c0 8-6 14-13 15-2 5-6 8-9 9v8h8l2 8H20l2-8h8v-8c-3-1-7-4-9-9C14 32 8 26 8 18v-6h10V6zm-4 12c0 4 2 7 5 9-1-3-1-6-1-9h-4zm32 0c0 3 0 6-1 9 3-2 5-5 5-9h-4z"/></svg>';

/**
 * Dessine l'arbre dans `board` (qui contient .tb-stage > svg.tb-links + .tb-grid)
 * et pose sur lui les classes de taille.
 *   full    arbre entier ; sinon la branche de `focus` (par défaut la prochaine course)
 *   trim    avec full, de gauche à droite : l'arbre part du premier tour pas
 *           encore entièrement couru (ses places montrent déjà les qualifiés
 *           du tour d'avant) ; les tours finis disparaissent et le reste
 *           grossit au fil de la compétition
 *   layout  'ltr' ou 'branches' (arbre entier seulement)
 *   focus   nœud du modèle autour duquel resserrer la vue
 */
export function renderTree(board, model, { full = false, trim = false, layout = 'ltr', focus = undefined } = {}) {
  // Colonne de chaque série (0 = premier tour) : cadence l'entrée en cascade.
  const columnOf = new Map();

  const heatBox = (n, { big = false, ci = 0, bi = 0 } = {}) => {
    columnOf.set(n.key, ci);
    const state = n.next ? 'next' : n.etat === 3 ? 'live' : n.etat === 5 ? 'done' : '';
    const rows = n.slots.map((s) => {
      const classes = ['tb-row', `lane-${s.lane}`];
      if (!s.name && !s.provisional) classes.push('empty');
      if (s.provisional) classes.push('provisional');
      if (s.qualified) classes.push('qualified');
      if (s.eliminated) classes.push('eliminated');
      if (s.medal) classes.push(`medal-${s.medal}`);
      const result = s.status && s.status !== '-' ? esc(s.status) : s.rank ?? '';
      const who = s.name
        ? `<span class="tb-name">${esc(s.name)}</span>${s.club ? `<span class="tb-club">${esc(s.club)}</span>` : ''}${s.direct ? '<span class="tb-tt">TT</span>' : ''}`
        : s.provisional
          ? `<span class="tb-name">${esc(s.provisional.name)}</span><span class="tb-from">${esc(s.provisional.from)}</span>`
          : `<span class="tb-placeholder">${esc(s.placeholder || 'à déterminer')}</span>`;
      return `<div class="${classes.join(' ')}"><span class="tb-who">${who}</span><span class="tb-rank">${result}</span></div>`;
    }).join('');
    const label = [n.isFinal ? null : `Série ${n.name.replace('S', '')}`, n.startTime].filter(Boolean).join(' · ');
    const live = n.etat === 3 ? '<span class="tb-live">en course</span>'
      : n.provisoire ? '<span class="tb-prov">provisoire</span>' : '';
    return `<div class="tb-heat ${state}${big ? ' big' : ''}" data-key="${esc(n.key)}" style="--ci:${ci};--bi:${bi}">
        ${label || live ? `<div class="tb-heat-label">${esc(label)}${live}</div>` : ''}
        <div class="tb-heat-box">${rows}</div>
      </div>`;
  };

  const column = (col, side, ci) => `<div class="tb-col ${side}" style="--ci:${ci}">
      <div class="tb-col-head">${esc(col.label)}</div>
      <div class="tb-col-body">${col.nodes.map((n, bi) => heatBox(n, { ci, bi })).join('')}</div>
    </div>`;

  const branch = full ? null : focusBranch(model, focus);
  const lay = branch ? 'ltr' : layout;
  // Premier tour dont une série reste à jouer (une série validée ou classée
  // en provisoire compte comme jouée) : l'arbre part de là. Tout couru avant
  // la finale : le dernier tour, pour voir d'où viennent les finalistes.
  let rounds = model.rounds;
  if (trim && !branch && lay === 'ltr' && rounds.length > 1) {
    const joue = (c) => c.nodes.length > 0 && c.nodes.every((n) => n.etat === 5);
    const first = rounds.findIndex((c) => !joue(c));
    rounds = rounds.slice(first < 0 ? rounds.length - 1 : first);
  }
  const cols = branch || (lay === 'ltr' ? rounds : [...model.left, ...model.right]);
  const maxPerColumn = Math.max(1, ...cols.map((c) => c.nodes.length));
  board.classList.toggle('focus', !!branch);
  board.classList.toggle('ltr', lay === 'ltr');
  board.classList.toggle('compact', maxPerColumn >= (lay === 'ltr' ? 8 : 4));
  board.classList.toggle('dense', lay === 'ltr' && maxPerColumn >= 4 && maxPerColumn < 8);
  board.classList.toggle('roomy', maxPerColumn <= (lay === 'ltr' ? 2 : 1));

  // Finale jouée : la carte du vainqueur, avec le podium. C'est la question
  // que tout le monde se pose ; le reste du tableau passe au second plan.
  const fn = model.final.node;
  const podium = fn.etat === 5 ? [1, 2, 3].map((m) => fn.slots.find((x) => x.medal === m)) : [];
  const winner = podium[0];
  board.classList.toggle('has-champion', !!winner);
  const champion = winner
    ? `<div class="tb-champion">
        <div class="tb-champion-top">${TROPHY}
          <div class="tb-champion-text">
            <span class="tb-champion-label">Victoire ${esc(model.categoryKey)}</span>
            <span class="tb-champion-name">${esc(winner.name)}</span>
            ${winner.club ? `<span class="tb-champion-club">${esc(winner.club)}</span>` : ''}
          </div>
        </div>
        <div class="tb-podium">${podium.slice(1).filter(Boolean).map((p) =>
          `<span class="tb-podium-place m${p.medal}"><b>${p.medal}</b>${esc(p.name)}</span>`).join('')}</div>
      </div>`
    : '';
  const finalColumn = (ci) => `<div class="tb-col center" style="--ci:${ci}">
      <div class="tb-col-head final">${esc(model.final.label)}</div>
      <div class="tb-col-body">${heatBox(fn, { big: true, ci })}${champion}</div>
    </div>`;

  let html;
  if (branch) {
    // La finale, quand la branche l'atteint, garde sa présentation (case
    // agrandie, carte du vainqueur).
    const reachesFinal = branch[branch.length - 1].nodes[0] === fn;
    html = [
      ...(reachesFinal ? branch.slice(0, -1) : branch).map((c, i) => column(c, 'left', i)),
      reachesFinal ? finalColumn(branch.length - 1) : '',
    ].join('');
  } else if (lay === 'ltr') {
    html = [...rounds.map((c, i) => column(c, 'left', i)), finalColumn(rounds.length)].join('');
  } else {
    html = [
      ...model.left.map((c, i) => column(c, 'left', i)),
      finalColumn(model.left.length),
      ...[...model.right].reverse().map((c, i, all) => column(c, 'right', all.length - 1 - i)),
    ].join('');
  }

  // Pendant une course, les données bougent sans cesse (zones jugées, places
  // d'arrivée) alors que l'arbre, lui, n'en montre rien. Le reconstruire à
  // chaque fois ferait clignoter les traits et relancer les animations : on
  // ne touche au DOM que si ce qui s'affiche change.
  const grid = board.querySelector('.tb-grid');
  if (grid._html === html) return;
  grid._html = html;
  grid.innerHTML = html;
  requestAnimationFrame(() => drawLinks(board, model, columnOf));
}

/** Position d'une case dans le plateau, hors transformations : les colonnes
 *  glissent à leur entrée, getBoundingClientRect donnerait des traits décalés. */
function layoutBox(el, stage) {
  let x = 0;
  let y = 0;
  for (let n = el; n && n !== stage; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { left: x, top: y, right: x + el.offsetWidth, width: el.offsetWidth, height: el.offsetHeight };
}

/** Traits entre une série et celle qu'elle alimente, coudés à mi-chemin. */
function drawLinks(board, model, columnOf) {
  const svg = board.querySelector('.tb-links');
  const stage = board.querySelector('.tb-stage');
  svg.setAttribute('width', stage.offsetWidth);
  svg.setAttribute('height', stage.offsetHeight);
  const box = (key) => {
    const el = board.querySelector(`.tb-heat[data-key="${CSS.escape(key)}"] .tb-heat-box`);
    return el ? layoutBox(el, stage) : null;
  };
  svg.innerHTML = model.edges.map((e) => {
    const a = box(e.from);
    const b = box(e.to);
    if (!a || !b) return '';
    const leftSide = a.left < b.left;
    const x1 = leftSide ? a.right : a.left;
    const x2 = leftSide ? b.left : b.right;
    const y1 = a.top + a.height / 2;
    const y2 = b.top + b.height / 2;
    const xm = (x1 + x2) / 2;
    const done = model.nodes.get(e.from).etat === 5;
    const d = `M${x1},${y1} H${xm} V${y2} H${x2}`;
    // Le trait se dessine juste après l'apparition de sa série ; une fois la
    // série jouée, une lumière y circule vers la finale.
    const delay = `--d:${(columnOf.get(e.from) ?? 0) * 0.35 + 0.45}s`;
    return `<path class="link${done ? ' done' : ''}" pathLength="1" style="${delay}" d="${d}"/>`
      + (done ? `<path class="flow" pathLength="1" style="${delay}" d="${d}"/>` : '');
  }).join('');
}

/** Rejoue l'entrée en cascade (classe .intro pendant 5 s). */
export function playIntro(board) {
  board.classList.remove('intro', 'played');
  void board.offsetWidth;
  board.classList.add('intro', 'played');
  clearTimeout(board._introTimer);
  board._introTimer = setTimeout(() => board.classList.remove('intro'), 5000);
}
