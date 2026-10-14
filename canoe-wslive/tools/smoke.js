'use strict';

/**
 * Suite de non-régression : ouvre chaque page ws_live dans Chrome, y déroule un
 * scénario réaliste, et échoue si la console produit la moindre erreur.
 *
 *   node tools/smoke.js                 # tous les cas
 *   node tools/smoke.js --only tv       # les cas dont le nom contient "tv"
 *   node tools/smoke.js --keep          # ne pas tuer le serveur à la fin
 *
 * Le serveur du bouchon est démarré automatiquement s'il ne tourne pas déjà.
 */

const http = require('http');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BASE = 'http://localhost:3000';

const opts = {};
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--')) {
    const k = process.argv[i].slice(2);
    opts[k] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --------------------------------------------------------------- API bouchon

function api(action, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      { host: 'localhost', port: 3000, path: `/mock/api/${action}`, method: data ? 'POST' : 'GET',
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function serverUp() {
  try { await api('state'); return true; } catch { return false; }
}

// ------------------------------------------------------------------ scénarios

const CLICK_RACE = '#main table td a';
const CLICK_EPREUVE = '#main table tbody tr:first-child td button';
const INTO_EPREUVE = `${CLICK_RACE} >> ${CLICK_EPREUVE}`;

/**
 * Chaque cas : une page, une navigation, et des évènements injectés pendant que
 * la page est affichée. C'est là que se trouvent les cas qu'on ne peut pas
 * provoquer sur une vraie compétition.
 */
/**
 * 11 K1H arrivés avec des temps imposés (le 12e reste sur l'eau, ce qui fixe
 * l'épreuve courante à K1H). Les temps sont imposés plutôt que chronométrés :
 * sinon il faudrait attendre la durée réelle de la course.
 */
function classementK1H() {
  const s = [];
  for (let i = 1; i <= 11; i++) {
    s.push(['bib-start', { bib: i }]);
    s.push(['bib-finish', { bib: i, time: 89000 + i * 900 }]);
  }
  s.push(['bib-start', { bib: 12 }]);
  return s;
}

/** 4 arrivees espacees de 1,15 s exactement, pour verifier les ecarts. */
function quatreArrivees() {
  const a = [];
  for (let i = 1; i <= 4; i++) {
    a.push(['bib-start', { bib: i }]);
    a.push(['bib-finish', { bib: i, time: 89000 + i * 1150 }]);
  }
  return a;
}

/**
 * Les 12 K1H traites — 11 classes et un DSQ — pour que l'epreuve compte comme
 * TERMINEE au sens de tv_results (tous les bateaux ont une valeur dans Tps).
 * Les K1D restent intacts : ils ne doivent pas etre choisis.
 */
function epreuveK1HTerminee() {
  const s = [];
  for (let i = 1; i <= 11; i++) {
    s.push(['bib-start', { bib: i }]);
    s.push(['bib-finish', { bib: i, time: 89000 + i * 900 }]);
  }
  s.push(['bib-start', { bib: 12 }]);
  s.push(['bib-status', { bib: 12, status: 'DSQ' }]);
  return s;
}

/** Les 11 premiers K1H arrives ; le 12e est laisse au scenario du cas. */
function onzeK1HArrives() {
  const s = [];
  for (let i = 1; i <= 11; i++) {
    s.push(['bib-start', { bib: i }]);
    s.push(['bib-finish', { bib: i, time: 89000 + i * 900 }]);
  }
  return s;
}

const CASES = [
  { name: 'live / liste des compétitions', url: '/canoe/live.html' },

  { name: 'live / classement descente', url: '/canoe/live.html', clicks: INTO_EPREUVE },

  { name: 'live / arrivée en direct', url: '/canoe/live.html', clicks: INTO_EPREUVE,
    setup: [['bib-start', { bib: 1 }]],
    events: [[6000, 'bib-finish', { bib: 1 }]] },

  { name: 'live / départ supprimé en course', url: '/canoe/live.html', clicks: INTO_EPREUVE,
    setup: [['bib-start', { bib: 1 }]],
    events: [[6000, 'bib-remove', { bib: 1 }]] },

  { name: 'live / DNF puis DSQ', url: '/canoe/live.html', clicks: INTO_EPREUVE,
    events: [[4000, 'bib-status', { bib: 2, status: 'DNF' }],
             [6000, 'bib-status', { bib: 3, status: 'DSQ' }]] },

  { name: 'live / effacement de manche', url: '/canoe/live.html', clicks: INTO_EPREUVE,
    setup: [['bib-start', { bib: 1 }]],
    events: [[6000, 'erase', {}]] },

  { name: 'live / changement de mode chrono', url: '/canoe/live.html', clicks: INTO_EPREUVE,
    events: [[5000, 'mode-chrono', { mode: 1 }]] },

  { name: 'live / mode chrono sans classement', url: '/canoe/live.html',
    events: [[4000, 'mode-chrono', { mode: 1 }]] },

  { name: 'live / coupure réseau', url: '/canoe/live.html', clicks: INTO_EPREUVE,
    events: [[5000, 'kill-clients', {}]], settle: 12000,
    expect: (r) => (r.wsState === 1 ? null : 'la socket ne s\'est pas rouverte') },

  { name: 'live / slalom + pénalités', url: '/canoe/live.html', clicks: INTO_EPREUVE,
    fixture: 'slalom-finale',
    setup: [['bib-start', { bib: 1 }]],
    events: [[4000, 'penalty', { bib: 1, porte: 5, value: 2 }],
             [5000, 'penalty', { bib: 1, porte: 11, value: 50 }],
             [7000, 'bib-finish', { bib: 1 }]] },

  { name: 'live / international (nations)', url: '/canoe/live.html', clicks: INTO_EPREUVE,
    fixture: 'descente-internationale' },

  { name: 'monitor_race (iframes live)', url: '/canoe/monitor_race.html', settle: 8000 },

  { name: 'tv_inrace / bateau en course', url: '/canoe/tv_inrace.html',
    setup: [['bib-start', { bib: 1 }]], settle: 8000 },

  { name: 'tv_inrace / arrivée', url: '/canoe/tv_inrace.html',
    setup: [['bib-start', { bib: 1 }]],
    events: [[6000, 'bib-finish', { bib: 1 }]], settle: 10000 },

  // Liaison morte sans fermeture : la page doit s'en apercevoir, rouvrir la
  // socket et recharger le classement, pénalité manquée comprise.
  { name: 'tv_inrace / liaison morte', url: '/canoe/tv_inrace.html', fixture: 'slalom-finale',
    setup: [['bib-start', { bib: 1 }]],
    events: [[4000, 'mute-clients', {}], [6000, 'penalty', { bib: 1, porte: 5, value: 2 }]],
    settle: 18000,
    expect: (r) => (r.wsState === 1 && r.eval && r.eval.pena === '5:2' && r.eval.running ? null
      : `pas de reprise : ${JSON.stringify(r.eval)} ws=${r.wsState}`),
    evalExpr: "JSON.stringify({pena: [...document.querySelectorAll('#block_pena .gate')].map(g => g.dataset.gate+':'+g.dataset.pen).join(','), running: document.getElementById('block_running').style.display == 'block'})" },

  { name: 'tv_oncourse / plusieurs en course', url: '/canoe/tv_oncourse.html',
    setup: [['bib-start', { bib: 1 }], ['bib-start', { bib: 2 }], ['bib-start', { bib: 3 }]],
    settle: 8000,
    expect: (r) => (r.eval && r.eval.rows >= 3 ? null : `attendu >=3 lignes, vu ${r.eval && r.eval.rows}`),
    evalExpr: "JSON.stringify({rows: document.querySelectorAll('.racer').length})" },

  { name: 'tv_oncourse / personne en course', url: '/canoe/tv_oncourse.html', settle: 7000,
    expect: (r) => (r.eval && r.eval.hidden ? null : 'le bandeau devrait etre masque'),
    evalExpr: "JSON.stringify({hidden: document.getElementById('oncourse').classList.contains('empty')})" },

  { name: 'tv_oncourse / arrivee pendant', url: '/canoe/tv_oncourse.html',
    setup: [['bib-start', { bib: 1 }], ['bib-start', { bib: 2 }]],
    events: [[5000, 'bib-finish', { bib: 1 }]], settle: 11000 },

  { name: 'tv_oncourse / slalom + penalites', url: '/canoe/tv_oncourse.html',
    fixture: 'slalom-finale',
    setup: [['bib-start', { bib: 1 }], ['bib-start', { bib: 2 }]],
    events: [[4000, 'penalty', { bib: 1, porte: 5, value: 2 }],
             [5000, 'penalty', { bib: 2, porte: 9, value: 50 }]], settle: 9000 },

  { name: 'tv_oncourse / cumul de penalites', url: '/canoe/tv_oncourse.html',
    fixture: 'slalom-finale',
    setup: [['bib-start', { bib: 1 }],
            ['penalty', { bib: 1, porte: 5, value: 2 }],
            ['penalty', { bib: 1, porte: 9, value: 50 }]],
    settle: 8000,
    expect: (r) => (r.eval && r.eval.pena === '+52' ? null : `badge penalite attendu +52, vu ${r.eval && r.eval.pena}`),
    evalExpr: "(() => { const e=document.querySelector('.racer .pena'); return JSON.stringify({pena: e && e.style.display!=='none' ? e.textContent : null}); })()" },

  // delay_finish allonge : ce cas verifie que la ligne d'arrivee s'affiche avec
  // sa place, pas qu'elle expire — l'expiration a son propre cas. Avec les
  // 10 s par defaut, la mesure tombait a ~1 s de l'expiration et le resultat
  // dependait du temps de demarrage de Chrome.
  { name: 'tv_oncourse / temps et place a l arrivee', url: '/canoe/tv_oncourse.html?delay_finish=60000',
    setup: [['bib-start', { bib: 1 }], ['bib-start', { bib: 2 }]],
    events: [[5000, 'bib-finish', { bib: 1 }]], settle: 11000,
    expect: (r) => (r.eval && r.eval.finished === 1 && r.eval.rank === '1'
      ? null : `attendu 1 ligne arrivee avec la place 1, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "(() => { const f=document.querySelector('.racer.finished'); return JSON.stringify({finished: document.querySelectorAll('.racer.finished').length, rank: f ? f.querySelector('.rank').textContent : null}); })()" },

  { name: 'tv_oncourse / arrivee expiree', url: '/canoe/tv_oncourse.html?delay_finish=2000',
    setup: [['bib-start', { bib: 1 }], ['bib-start', { bib: 2 }]],
    events: [[5000, 'bib-finish', { bib: 1 }]], settle: 11000,
    expect: (r) => (r.eval && r.eval.finished === 0 ? null : `la ligne d'arrivee aurait du disparaitre, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "JSON.stringify({finished: document.querySelectorAll('.racer.finished').length})" },

  { name: 'tv_oncourse / filtre epreuve', url: '/canoe/tv_oncourse.html?epreuve=K1H&max=3',
    // 1 = K1H, 13 = K1D (12 bateaux par épreuve)
    setup: [['bib-start', { bib: 1 }], ['bib-start', { bib: 13 }]], settle: 8000,
    expect: (r) => (r.eval && r.eval.rows === 1 ? null : `le filtre K1H devrait laisser 1 ligne, vu ${r.eval && r.eval.rows}`),
    evalExpr: "JSON.stringify({rows: document.querySelectorAll('.racer:not(.leaving)').length})" },

  { name: 'tv_oncourse / effacement de manche', url: '/canoe/tv_oncourse.html',
    setup: [['bib-start', { bib: 1 }]], events: [[5000, 'erase', {}]], settle: 10000 },

  { name: 'tv_leaders / classement de l epreuve en cours', url: '/canoe/tv_leaders.html',
    setup: classementK1H(), settle: 8000,
    expect: (r) => (r.eval && r.eval.categ === 'K1H' && r.eval.rows === 8
      ? null : `attendu K1H et 8 lignes, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "JSON.stringify({categ: document.getElementById('leaders_categ').textContent, rows: document.querySelectorAll('#leaders_list .leader').length})" },

  { name: 'tv_leaders / dernier arrive hors des 8', url: '/canoe/tv_leaders.html',
    setup: classementK1H(),
    events: [[5000, 'bib-finish', { bib: 12, time: 104500 }]], settle: 10000,
    expect: (r) => (r.eval && r.eval.pied === 1 && r.eval.piedRank === '12'
      ? null : `attendu 1 ligne en pied avec la place 12, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "(() => { const p=document.querySelector('#leaders_last .leader'); return JSON.stringify({pied: document.querySelectorAll('#leaders_last .leader').length, piedRank: p ? p.querySelector('.rank').textContent : null}); })()" },

  { name: 'tv_leaders / dernier arrive dans les 8', url: '/canoe/tv_leaders.html',
    setup: classementK1H(),
    events: [[5000, 'bib-finish', { bib: 12, time: 91200 }]], settle: 10000,
    expect: (r) => (r.eval && r.eval.surligne === 1 && r.eval.pied === 0
      ? null : `attendu 1 ligne surlignee et aucun pied, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "JSON.stringify({surligne: document.querySelectorAll('#leaders_list .leader.last').length, pied: document.querySelectorAll('#leaders_last .leader').length})" },

  // Le depart d'une nouvelle epreuve ne doit PAS faire basculer le classement :
  // elle n'a encore aucun classe, le bloc se viderait.
  { name: 'tv_leaders / pas de bascule au depart', url: '/canoe/tv_leaders.html',
    setup: classementK1H(),
    events: [[5000, 'bib-remove', { bib: 12 }], [5500, 'bib-start', { bib: 16 }]], settle: 10000,
    expect: (r) => (r.eval && r.eval.categ === 'K1H' && r.eval.rows === 8
      ? null : `le classement K1H aurait du rester affiche, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "JSON.stringify({categ: document.getElementById('leaders_categ').textContent, rows: document.querySelectorAll('#leaders_list .leader').length})" },

  { name: 'tv_leaders / bascule a la premiere arrivee', url: '/canoe/tv_leaders.html',
    setup: classementK1H().concat([['bib-start', { bib: 16 }]]),
    events: [[5000, 'bib-finish', { bib: 16, time: 103500 }]], settle: 10000,
    expect: (r) => (r.eval && r.eval.categ === 'K1D' && r.eval.rows === 1
      ? null : `l'arrivee d'un K1D aurait du basculer le classement, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "JSON.stringify({categ: document.getElementById('leaders_categ').textContent, rows: document.querySelectorAll('#leaders_list .leader').length})" },

  // Page ouverte alors qu'une epreuve sans resultat est chronometree : il faut
  // afficher la derniere epreuve qui en a, pas un bloc vide.
  // Une arrivee doit inserer une ligne et faire glisser les suivantes, sans
  // reconstruire le classement : les noeuds deja affiches doivent survivre.
  // Le temoin est pose avant l'arrivee ; une ligne recreee l'aurait perdu.
  { name: 'tv_leaders / insertion sans redessiner', url: '/canoe/tv_leaders.html',
    setup: (() => {
      const a = [];
      for (let i = 1; i <= 8; i++) {
        a.push(['bib-start', { bib: i }]);
        a.push(['bib-finish', { bib: i, time: 89000 + i * 900 }]);
      }
      a.push(['bib-start', { bib: 9 }]);
      return a;
    })(),
    events: [[5000, 'bib-finish', { bib: 9, time: 91300 }]], settle: 10000,
    evalEarlyExpr: "document.querySelectorAll('#leaders .leader').forEach(e => e.dataset.temoin='1'); 'ok'",
    expect: (r) => (r.eval && r.eval.conserves === 7 && r.eval.neufs === 1 && r.eval.glisses === 5
      ? null : `attendu 7 lignes conservees, 1 neuve et 5 glissees, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "(() => { const l=[...document.querySelectorAll('#leaders_list .leader')]; return JSON.stringify({conserves: l.filter(e=>e.dataset.temoin).length, neufs: l.filter(e=>!e.dataset.temoin).length, glisses: l.filter(e=>String(e.style.transition).indexOf('transform')>=0).length}); })()" },

  { name: 'tv_leaders / ecarts au premier', url: '/canoe/tv_leaders.html',
    setup: quatreArrivees(), settle: 7000,
    expect: (r) => (r.eval && r.eval.ecarts.join('|') === '|+1.15|+2.30|+3.45'
      ? null : `ecarts cumules attendus, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "JSON.stringify({ecarts: [...document.querySelectorAll('#leaders .leader .diff')].map(e=>e.textContent)})" },

  { name: 'tv_leaders / ecarts au precedent', url: '/canoe/tv_leaders.html?ecart=precedent',
    setup: quatreArrivees(), settle: 7000,
    expect: (r) => (r.eval && r.eval.ecarts.join('|') === '|+1.15|+1.15|+1.15'
      ? null : `ecarts au precedent attendus, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "JSON.stringify({ecarts: [...document.querySelectorAll('#leaders .leader .diff')].map(e=>e.textContent)})" },

  // adv.js ecrit la virgule dans ses formats « secondes » et le point dans ses
  // formats « minutes » : temps et ecart d'une meme ligne doivent s'accorder.
  { name: 'tv_leaders / separateur decimal coherent', url: '/canoe/tv_leaders.html',
    fixture: 'slalom-finale',
    setup: [['bib-start', { bib: 1 }], ['bib-finish', { bib: 1, time: 96300 }],
            ['bib-start', { bib: 2 }], ['bib-finish', { bib: 2, time: 97600 }]],
    settle: 7000,
    expect: (r) => (r.eval && r.eval.melanges === 0
      ? null : `temps et ecart ne doivent pas melanger . et , (${JSON.stringify(r.eval)})`),
    evalExpr: "(() => { const l=[...document.querySelectorAll('#leaders .leader')]; const sep=t=>t.indexOf(',')>=0?',':(t.indexOf('.')>=0?'.':null); return JSON.stringify({melanges: l.filter(e=>{const a=sep(e.querySelector('.time').textContent), b=sep(e.querySelector('.diff').textContent); return b!==null && a!==null && a!==b;}).length}); })()" },

  { name: 'tv_leaders / penalites au classement', url: '/canoe/tv_leaders.html',
    fixture: 'slalom-finale',
    setup: [
      ['bib-start', { bib: 1 }], ['bib-start', { bib: 2 }], ['bib-start', { bib: 3 }],
      ['penalty', { bib: 2, porte: 5, value: 2 }],
      ['penalty', { bib: 3, porte: 9, value: 50 }],
      ['penalty', { bib: 3, porte: 11, value: 2 }],
      ['bib-finish', { bib: 1, time: 96200 }],
      ['bib-finish', { bib: 2, time: 97400 }],
      ['bib-finish', { bib: 3, time: 98600 }],
    ],
    settle: 8000,
    // Le dossard 3 (+52) doit tomber derriere les autres : Tps inclut la penalite.
    expect: (r) => (r.eval && r.eval.penas.join('|') === '|+2|+52' && r.eval.dernier === '3'
      ? null : `attendu les penalites '', +2, +52 et le dossard 3 en dernier, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "(() => { const l=[...document.querySelectorAll('#leaders .leader')]; return JSON.stringify({penas: l.map(e=>{const p=e.querySelector('.pena'); return p.style.display==='none'?'':p.textContent;}), dernier: l[l.length-1].querySelector('.bib').textContent}); })()" },

  // En descente il n'y a pas de portes : aucun pave de penalite ne doit sortir.
  { name: 'tv_leaders / pas de penalites en descente', url: '/canoe/tv_leaders.html',
    setup: classementK1H(), settle: 8000,
    expect: (r) => (r.eval && r.eval.visibles === 0 ? null : `aucun pave attendu, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "JSON.stringify({visibles: [...document.querySelectorAll('#leaders .leader .pena')].filter(e=>e.style.display!=='none').length})" },

  { name: 'tv_leaders / amorcage sur une epreuve avec resultats', url: '/canoe/tv_leaders.html',
    setup: classementK1H().concat([['bib-remove', { bib: 12 }], ['bib-start', { bib: 16 }]]),
    settle: 8000,
    expect: (r) => (r.eval && r.eval.categ === 'K1H' && r.eval.rows === 8
      ? null : `attendu le classement K1H, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "JSON.stringify({categ: document.getElementById('leaders_categ').textContent, rows: document.querySelectorAll('#leaders_list .leader').length})" },

  { name: 'tv_leaders / aucun classe', url: '/canoe/tv_leaders.html',
    setup: [['bib-start', { bib: 1 }]], settle: 7000,
    expect: (r) => (r.eval && r.eval.hidden ? null : 'le bloc devrait etre masque'),
    evalExpr: "JSON.stringify({hidden: document.getElementById('leaders').classList.contains('empty')})" },

  // Le podium ne doit rien peindre tant qu'aucune epreuve n'est terminee.
  { name: 'tv_podium / silencieux hors sequence', url: '/canoe/tv_podium.html',
    setup: classementK1H(), settle: 7000,
    expect: (r) => (r.eval && r.eval.cache ? null : `le bloc devrait etre cache, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "JSON.stringify({cache: document.getElementById('podium').classList.contains('cache')})" },

  { name: 'tv_podium / declenche en fin d epreuve', url: '/canoe/tv_podium.html',
    events: [[4000, 'finish-categ', { epreuve: 'K1D' }]], settle: 9000,
    expect: (r) => (r.eval && r.eval.visible && r.eval.categ === 'K1D' && r.eval.noms === 3
      ? null : `podium K1D attendu avec 3 marches, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "(() => { const p=document.getElementById('podium'); return JSON.stringify({visible: !p.classList.contains('cache'), categ: document.getElementById('podium_categ').textContent, noms: [1,2,3].filter(i=>document.getElementById('step_'+i).querySelector('.name').textContent!=='').length}); })()" },

  // delay court : la sequence doit se refermer d'elle-meme.
  { name: 'tv_podium / disparait apres le delai', url: '/canoe/tv_podium.html?delay=2000',
    events: [[4000, 'finish-categ', { epreuve: 'K1D' }]], settle: 11000,
    expect: (r) => (r.eval && r.eval.cache ? null : `le podium aurait du se refermer, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "JSON.stringify({cache: document.getElementById('podium').classList.contains('cache')})" },

  // ?delay ne doit pas atterrir dans wsMain.delay : ws.Context s'en sert pour
  // differer la distribution de TOUTES les trames.
  { name: 'tv_podium / delay ne bloque pas les trames', url: '/canoe/tv_podium.html?delay=30000',
    setup: classementK1H(), settle: 7000,
    expect: (r) => (r.eval && r.eval.contexte === 0 && r.eval.race === 'object'
      ? null : `wsMain.delay du contexte doit rester a 0 et la course etre chargee, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "JSON.stringify({contexte: wsMain.delay, race: typeof canoe.notify_race})" },

  { name: 'tv_ranking', url: '/canoe/tv_ranking.html', settle: 8000 },

  // tv_results choisit seule la derniere epreuve TERMINEE : les 12 K1H sont
  // traites, les K1D ne le sont pas, la page doit montrer K1H sans reglage.
  { name: 'tv_results / derniere epreuve terminee', url: '/canoe/tv_results.html?delay=60000',
    fixture: 'slalom-finale', setup: epreuveK1HTerminee(), settle: 8000,
    expect: (r) => (r.eval && r.eval.categ === 'Kayak Homme' && r.eval.rows === 8
      && r.eval.provisoire === false && r.eval.figes === '1,2,3'
      ? null : `attendu Kayak Homme, 3 figes + 5 tournants, definitif ; vu ${JSON.stringify(r.eval)}`),
    evalExpr: "(() => { const l = [...document.querySelectorAll('#corps .ligne')];"
      + " return JSON.stringify({categ: document.getElementById('epreuve_nom').textContent,"
      + " rows: l.length, provisoire: document.body.classList.contains('provisoire'),"
      + " figes: l.slice(0, 3).map(e => e.querySelector('.c_rang').textContent).join(',')}); })()" },

  // Aucune epreuve complete : on montre quand meme les classes, en le disant.
  // Le coeur de la disposition : les trois premiers ne doivent JAMAIS bouger,
  // et la queue doit defiler sous eux. On echantillonne l'affichage pendant
  // plusieurs cycles.
  { name: 'tv_results / tete figee, queue tournante', url: '/canoe/tv_results.html?epreuve=K1H&delay=2500',
    fixture: 'slalom-finale', setup: epreuveK1HTerminee(),
    evalEarlyExpr: "window.__obs = [];"
      + " setInterval(() => { const l = [...document.querySelectorAll('#corps .ligne')];"
      + " if (!l.length) return;"
      + " const t = l.slice(0, 3).map(e => e.querySelector('.c_rang').textContent).join(',');"
      + " const q = l.slice(3).map(e => e.querySelector('.c_dossard').textContent).join(',');"
      + " const sig = t + ' | ' + q;"
      + " if (window.__obs[window.__obs.length - 1] !== sig) window.__obs.push(sig); }, 250); 'ok'",
    settle: 11000,
    expect: (r) => {
      const o = (r.eval && r.eval.obs) || [];
      if (o.length < 2) return `la queue devrait defiler, vu ${JSON.stringify(o)}`;
      const figee = o.every((x) => x.indexOf('1,2,3 | ') === 0);
      return figee ? null : `la tete a bouge : ${JSON.stringify(o)}`;
    },
    evalExpr: "JSON.stringify({obs: window.__obs})" },

  // Hauteur de ligne et nombre de lignes doivent rester constants : pendant
  // le defilement, ET quand le bandeau des bateaux en course apparait.
  { name: 'tv_results / hauteur et bloc constants', url: '/canoe/tv_results.html?epreuve=K1H&delay=2500',
    fixture: 'slalom-finale', setup: epreuveK1HTerminee(),
    events: [[3500, 'bib-start', { bib: 13 }]],
    evalEarlyExpr: "window.__obs = [];"
      + " setInterval(() => { const l = document.querySelectorAll('#corps .ligne');"
      + " if (!l.length) return;"
      + " const sig = document.documentElement.style.getPropertyValue('--res-ligne-h')"
      + " + '/' + l.length + '/' + (document.body.classList.contains('en-course') ? 'bandeau' : 'sans');"
      + " if (window.__obs.indexOf(sig) < 0) window.__obs.push(sig); }, 250); 'ok'",
    settle: 11000,
    expect: (r) => {
      const o = (r.eval && r.eval.obs) || [];
      if (!o.length) return 'aucune mesure';
      const hauteurs = new Set(o.map((x) => x.split('/')[0]));
      const nb = new Set(o.map((x) => x.split('/')[1]));
      const bandeau = new Set(o.map((x) => x.split('/')[2]));
      if (hauteurs.size !== 1) return `la hauteur de ligne a change : ${JSON.stringify(o)}`;
      if (nb.size !== 1 || !nb.has('8')) return `le nombre de lignes a change : ${JSON.stringify(o)}`;
      if (bandeau.size !== 2) return `le bandeau n'est jamais apparu : ${JSON.stringify(o)}`;
      return null;
    },
    evalExpr: "JSON.stringify({obs: window.__obs})" },

  // Le temps de chacun ET l'ecart, dans deux colonnes distinctes. Le premier
  // n'a pas d'ecart, les suivants si.
  { name: 'tv_results / temps et ecart separes', url: '/canoe/tv_results.html?epreuve=K1H&delay=60000',
    fixture: 'slalom-finale', setup: epreuveK1HTerminee(), settle: 8000,
    expect: (r) => (r.eval && r.eval.t1 && r.eval.e1 === '' && r.eval.t2 && r.eval.e2
      && r.eval.t1 !== r.eval.t2
      ? null : `attendu un temps pour chacun et un ecart a partir du 2e, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "(() => { const l = [...document.querySelectorAll('#corps .ligne')];"
      + " return JSON.stringify({t1: l[0].querySelector('.c_temps').textContent,"
      + " e1: l[0].querySelector('.c_ecart').textContent,"
      + " t2: l[1].querySelector('.c_temps').textContent,"
      + " e2: l[1].querySelector('.c_ecart').textContent}); })()" },

  { name: 'tv_results / classement provisoire', url: '/canoe/tv_results.html',
    fixture: 'slalom-finale',
    setup: [['bib-start', { bib: 1 }], ['bib-finish', { bib: 1, time: 89000 }],
            ['bib-start', { bib: 2 }], ['bib-finish', { bib: 2, time: 90000 }]],
    settle: 8000,
    expect: (r) => (r.eval && r.eval.provisoire === true && r.eval.rows === 2
      ? null : `attendu 2 lignes marquees provisoire, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "JSON.stringify({rows: document.querySelectorAll('#corps .ligne').length,"
      + " provisoire: document.body.classList.contains('provisoire')})" },

  // Rien du tout : ecran d'attente, pas de tableau vide.
  { name: 'tv_results / aucun resultat', url: '/canoe/tv_results.html',
    fixture: 'slalom-finale', settle: 6000,
    expect: (r) => (r.eval && r.eval.vide === true && r.eval.rows === 0
      ? null : `attendu l'ecran d'attente, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "JSON.stringify({vide: document.body.classList.contains('vide'),"
      + " rows: document.querySelectorAll('#corps .ligne').length})" },

  // Une penalite arrivee apres coup doit redescendre le bateau SANS recreer
  // les lignes : c'est tout l'interet du redessin sur place.
  { name: 'tv_results / penalite mise a jour sur place', url: '/canoe/tv_results.html?epreuve=K1H&max=12',
    fixture: 'slalom-finale', setup: epreuveK1HTerminee(),
    evalEarlyExpr: "window.__n = document.querySelector('#corps .ligne'); 'ok'",
    events: [[4000, 'penalty', { bib: 1, porte: 4, value: 50 }]], settle: 10000,
    // Le dossard 12 est DSQ : les non-classes ferment la liste, le dossard 1
    // penalise est donc DERNIER DES CLASSES, pas dernier tout court.
    expect: (r) => (r.eval && r.eval.memeNoeud === true && r.eval.pena === '50'
      && r.eval.rang === r.eval.nbClasses
      ? null : `attendu le dossard 1 dernier des classes avec 50, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "(() => { const l = [...document.querySelectorAll('#corps .ligne')];"
      + " const un = l.find(e => e.querySelector('.c_dossard').textContent === '1');"
      + " const classes = l.filter(e => !e.classList.contains('hc'));"
      + " return JSON.stringify({memeNoeud: window.__n === l[0],"
      + " pena: un ? un.querySelector('.c_pena').textContent : null,"
      + " rang: un ? un.querySelector('.c_rang').textContent : null,"
      + " nbClasses: String(classes.length)}); })()" },

  // Le bandeau n'apparait que s'il y a du monde sur l'eau, et il fait retrecir
  // le tableau : sans cela les deux se chevaucheraient en bas d'ecran.
  { name: 'tv_results / bandeau des bateaux en course', url: '/canoe/tv_results.html',
    fixture: 'slalom-finale',
    setup: epreuveK1HTerminee().concat([
      ['bib-start', { bib: 13 }], ['bib-start', { bib: 14 }],
      ['penalty', { bib: 14, porte: 5, value: 2 }]]),
    settle: 9000,
    expect: (r) => (r.eval && r.eval.enCourse === true && r.eval.cartes === 2
      && r.eval.pena14 === '+2' && r.eval.basTableau <= 862
      ? null : `attendu 2 cartes dont le 14 a +2, sous un tableau retreci ; vu ${JSON.stringify(r.eval)}`),
    evalExpr: "(() => { const c = [...document.querySelectorAll('.coureur')];"
      + " const q = c.find(e => e.querySelector('.c_bib').textContent === '14');"
      + " const l = [...document.querySelectorAll('#corps .ligne')];"
      + " const d = l.length ? l[l.length - 1] : null;"
      + " return JSON.stringify({enCourse: document.body.classList.contains('en-course'),"
      + " cartes: c.length, pena14: q ? q.querySelector('.c_pena').textContent : null,"
      + " basTableau: d ? Math.round(d.getBoundingClientRect().bottom) : 0}); })()" },

  // Une arrivee doit amener la fenetre qui contient ce bateau, et l'encadrer :
  // le dernier arrivant est en 12e position, donc dans la seconde fenetre de
  // la queue, alors que l'affichage demarre sur la premiere.
  { name: 'tv_results / arrivee mise en valeur', url: '/canoe/tv_results.html?epreuve=K1H&delay=30000',
    fixture: 'slalom-finale', setup: onzeK1HArrives(),
    evalEarlyExpr: "window.__p0 = document.getElementById('pagination').textContent; 'ok'",
    events: [[3000, 'bib-start', { bib: 12 }], [4500, 'bib-finish', { bib: 12, time: 99500 }]],
    settle: 10000,
    expect: (r) => (r.eval && r.eval.avant.indexOf('1 / 2') === 0
      && r.eval.apres.indexOf('2 / 2') === 0 && r.eval.vedette === '12'
      ? null : `attendu un saut de la fenetre 1 a la fenetre 2 avec le 12 encadre, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "(() => { const v = document.querySelector('.ligne.res.vedette');"
      + " return JSON.stringify({avant: window.__p0,"
      + " apres: document.getElementById('pagination').textContent,"
      + " vedette: v ? v.querySelector('.c_dossard').textContent : null}); })()" },

  // ?encours=1 renverse la regle : les K1H sont finis, mais un K1D est sur
  // l'eau et un autre est deja arrive, c'est donc K1D qu'il faut afficher.
  { name: 'tv_results / epreuve en cours', url: '/canoe/tv_results.html?encours=1',
    fixture: 'slalom-finale',
    setup: epreuveK1HTerminee().concat([['bib-start', { bib: 13 }], ['bib-start', { bib: 14 }]]),
    events: [[3000, 'bib-finish', { bib: 14, time: 97000 }]], settle: 10000,
    expect: (r) => (r.eval && r.eval.categ === 'Kayak Dame' && r.eval.provisoire === true
      ? null : `attendu Kayak Dame en provisoire, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "JSON.stringify({categ: document.getElementById('epreuve_nom').textContent,"
      + " provisoire: document.body.classList.contains('provisoire')})" },

  { name: 'tv_results / bandeau absent riviere vide', url: '/canoe/tv_results.html',
    fixture: 'slalom-finale', setup: epreuveK1HTerminee(), settle: 8000,
    expect: (r) => (r.eval && r.eval.enCourse === false && r.eval.cartes === 0
      ? null : `le bandeau devrait etre absent, vu ${JSON.stringify(r.eval)}`),
    evalExpr: "JSON.stringify({enCourse: document.body.classList.contains('en-course'),"
      + " cartes: document.querySelectorAll('.coureur').length})" },

  { name: 'tv_startlist', url: '/canoe/tv_startlist.html', settle: 8000 },
  { name: 'tv_clear', url: '/canoe/tv_clear.html' },
  { name: 'inrace.php', url: '/canoe/inrace.php', setup: [['bib-start', { bib: 1 }]], settle: 8000 },
  { name: 'jugement (slalom)', url: '/canoe/jugement.html', fixture: 'slalom-finale', settle: 8000 },
  { name: 'panneau de contrôle', url: '/mock/' },
];

// ---------------------------------------------------------------- exécution

function runBrowse(c) {
  const args = [path.join(__dirname, 'browse.js'), BASE + c.url, '--wait', String(c.wait || 2500)];
  if (c.clicks) args.push('--click', c.clicks, '--after', String(c.after || 2500));
  args.push('--settle', String(c.settle || 9000));
  if (c.evalEarlyExpr) args.push('--eval-early', c.evalEarlyExpr);
  if (c.evalExpr) args.push('--eval', c.evalExpr);
  args.push('--width', '1920', '--height', '1080');

  return new Promise((resolve) => {
    const child = spawn('node', args, { cwd: ROOT });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', () => {
      try { resolve(JSON.parse(out)); }
      catch { resolve({ consoleErrors: [`sortie illisible de browse.js : ${(err || out).slice(0, 200)}`] }); }
    });
  });
}

// Le bouchon demarre sur le slalom, mais la suite doit couvrir les deux
// activites : les cas qui ne precisent rien tournent donc en descente, ceux
// qui testent portes et penalites demandent explicitement le slalom.
const FIXTURE_PAR_DEFAUT = 'descente-sprint';

async function runCase(c) {
  await api('fixture', { name: c.fixture || FIXTURE_PAR_DEFAUT });
  // Les cas imposent leurs pénalités et vérifient des totaux exacts.
  await api('pena-plan', { on: false });
  await api('speed', { speed: 2 });
  await api('start', {});
  for (const [action, body] of c.setup || []) await api(action, body);

  // les évènements sont injectés pendant que la page est affichée
  const timers = (c.events || []).map(([at, action, body]) =>
    setTimeout(() => api(action, body).catch(() => {}), at + 3000)
  );

  const report = await runBrowse(c);
  timers.forEach(clearTimeout);

  // browse.js renvoie la valeur brute de --eval : les cas la produisent en JSON
  if (typeof report.eval === 'string') {
    try { report.eval = JSON.parse(report.eval); } catch { /* laisse la chaine */ }
  }

  const problems = [...(report.consoleErrors || [])];
  if (c.expect) {
    const p = c.expect(report);
    if (p) problems.push(p);
  }
  return { report, problems };
}

(async () => {
  let server = null;
  if (!(await serverUp())) {
    console.log('démarrage du bouchon…');
    server = spawn('node', [path.join(ROOT, 'mock', 'server.js'), '--speed', '2'], {
      cwd: ROOT, stdio: 'ignore', detached: false,
    });
    for (let i = 0; i < 40 && !(await serverUp()); i++) await sleep(250);
    if (!(await serverUp())) {
      console.error('le bouchon n\'a pas démarré');
      process.exit(1);
    }
  }

  const only = typeof opts.only === 'string' ? opts.only.toLowerCase() : null;
  const cases = only ? CASES.filter((c) => c.name.toLowerCase().includes(only)) : CASES;

  console.log(`\n  ${cases.length} cas\n`);

  let failed = 0;
  for (const c of cases) {
    process.stdout.write(`  ${c.name.padEnd(36)} `);
    const { problems } = await runCase(c);
    if (problems.length === 0) {
      console.log('ok');
    } else {
      failed++;
      console.log('ECHEC');
      for (const p of problems) console.log(`      ${String(p).split('\n')[0]}`);
    }
  }

  console.log(`\n  ${cases.length - failed}/${cases.length} ok${failed ? `, ${failed} en échec` : ''}\n`);

  if (server && !opts.keep) server.kill();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
