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
