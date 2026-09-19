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

  { name: 'tv_oncourse / temps et place a l arrivee', url: '/canoe/tv_oncourse.html',
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

  { name: 'tv_ranking', url: '/canoe/tv_ranking.html', settle: 8000 },
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

async function runCase(c) {
  await api('fixture', { name: c.fixture || 'descente-sprint' });
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
