// Simulateur kayak cross : sert gestion_kcross_series et répond à ses API PHP
// depuis une base en mémoire, pendant qu'un directeur de course fait courir
// les séries. Ni PHP, ni MySQL, ni tablettes.
//
//   node mock/kcross/server.mjs [--fixture icf] [--speed 4] [--port 3001]
//                               [--paused] [--manual] [--no-config]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { KxDatabase } from './db.mjs';
import { Director } from './director.mjs';
import { loadFixture, listFixtures, buildSource } from './fixtures.mjs';
import * as kx from './kx-engine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WWW = kx.KX_ROOT;

const args = parseArgs(process.argv.slice(2));
const PORT = Number(args.port || process.env.KX_PORT || 3001);

const ctx = { fixture: null, db: null, director: null, outageUntil: 0 };

await boot(args.fixture || 'huitiemes', {
  speed: args.speed ? Number(args.speed) : undefined,
  running: !args.paused,
  autoValidate: !args.manual,
  configure: !args['no-config'],
});

/** (Re)crée la compétition : base vide, configuration par le moteur, directeur. */
async function boot(fixtureId, { speed, running = true, autoValidate = true, configure = true } = {}) {
  const fixture = loadFixture(fixtureId);
  if (ctx.director) ctx.director.close();
  const db = new KxDatabase(buildSource(fixture));
  if (configure) await configureCompetition(db, fixture);
  ctx.fixture = fixture;
  ctx.db = db;
  ctx.director = new Director(db, fixture, { speed, running, autoValidate });
  const nb = db.heats.length ? db.heats.length - 1 : 0;
  console.log(`[kx] ${fixture.label} — compétition ${db.code}, ${nb} séries${configure ? '' : ' (non configurée : passer par admin.html)'}`);
}

/** Écran « Configuration » du gestionnaire, rejoué par le moteur réel. */
async function configureCompetition(db, fx) {
  const cfg = await kx.buildConfiguration({
    formatKey: fx.format,
    gateCount: fx.gates,
    gateProfil: fx.gate_profil,
    rollZoneAfterGate: fx.roll_after_gate,
    ecartSeries: fx.ecart_series ?? 120,
    ecartCategories: fx.ecart_categories ?? 240,
    ecartPhases: fx.ecart_phases ?? 900,
    firstStart: fx.first_start ?? '14:00:00',
    categories: fx.categories.map((c) => ({ code: c.code, variante: c.variante ?? kx.pickVariante(fx.format, c.nb) })),
  }, db.resultatsData());
  const r = db.api_save_state({}, { action: 'save_full_config', competitionCode: db.code, modifiedBy: 'gestionnaire', ...cfg });
  if (!r.body.success) throw new Error(`configuration refusée : ${r.body.message}`);
}

// ----------------------------------------------------------------- HTTP

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

// Scripts PHP du dossier api/ et méthode de KxDatabase qui les remplace.
const PHP_API = {
  'api_get_next_heats.php': 'api_get_next_heats',
  'api_get_heat_details.php': 'api_get_heat_details',
  'api_load_state.php': 'api_load_state',
  'api_save_state.php': 'api_save_state',
  'api_competffck_resultats.php': 'api_competffck_resultats',
  'api_competffck_competitions.php': 'api_competffck_competitions',
  'api_get_manual_competitions.php': 'api_get_manual_competitions',
  'api_test_tables.php': 'api_test_tables',
  'api_create_tables.php': 'api_create_tables',
  'api_get_server_time.php': 'api_get_server_time',
  'api_display_state.php': 'api_display_state',
  'api_overlay_state.php': 'api_overlay_state',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (pathname === '/') {
      res.writeHead(302, { Location: '/mock/' });
      return res.end();
    }
    if (pathname.startsWith('/mock/api/')) return await handleControl(req, res, pathname.slice('/mock/api/'.length));
    if (pathname === '/mock' || pathname === '/mock/') return serveFile(res, path.join(HERE, 'public', 'control.html'));
    if (pathname.startsWith('/mock/')) return serveFile(res, path.join(HERE, 'public', pathname.slice('/mock/'.length)), path.join(HERE, 'public'));

    if (pathname.endsWith('.php')) return await handlePhp(req, res, pathname, url);

    return serveFile(res, path.join(WWW, pathname), WWW);
  } catch (e) {
    console.error(`[kx] ${req.method} ${pathname} : ${e.stack || e.message}`);
    if (!res.headersSent) sendJson(res, 500, { success: false, message: e.message });
  }
});

async function handlePhp(req, res, pathname, url) {
  // Coupure réseau simulée : la connexion tombe, fetch lève une TypeError comme
  // sur un Wi-Fi perdu (le 503 serait, lui, une réponse du serveur).
  if (Date.now() < ctx.outageUntil) return req.socket.destroy();

  const script = path.basename(pathname);
  const method = PHP_API[script];
  if (!method) {
    if (script === 'api_get_styles.php') return sendJson(res, 200, videoStyles());
    if (script === 'api_get_baseUrl.php') {
      const host = req.headers.host.split(':')[0];
      return sendJson(res, 200, { success: true, data: { ip_server: host, url_racine: `http://${req.headers.host}`, path: '' } });
    }
    console.warn(`[kx] ${script} n'est pas simulé`);
    return sendJson(res, 501, { success: false, message: `${script} n'est pas simulé par le bouchon kayak cross.` });
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors());
    return res.end();
  }
  const query = Object.fromEntries(url.searchParams);
  let payload = {};
  if (req.method === 'POST') {
    const raw = await readBody(req);
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      return sendJson(res, 400, { success: false, message: 'JSON invalide.' });
    }
  }

  // Régie automatique active : elle seule écrit l'incrustation. Une page
  // video_control.html restée ouverte renvoie l'état de sa série à chaque
  // rafraîchissement ; la laisser écrire figerait l'écran sur une série que
  // personne ne fait avancer. Pour piloter à la main, couper la régie auto.
  if (method === 'api_overlay_state' && req.method === 'POST' && ctx.director.regie.auto) {
    if (!ctx.regieIgnored) {
      ctx.regieIgnored = true;
      ctx.director.note('Régie vidéo réelle ignorée : la régie automatique pilote l\'incrustation (la couper dans le panneau pour piloter à la main).');
    }
    return sendJson(res, 200, { success: true });
  }
  const { status, body } = ctx.db[method](query, payload, req.method);
  if (status === 304) {
    res.writeHead(304, cors());
    return res.end();
  }
  if (method === 'api_save_state') {
    const tag = body.success ? '' : ` -> ${body.locked ? 'verrouillé' : 'échec'} : ${body.message}`;
    console.log(`[api] ${payload.action} par ${payload.modifiedBy ?? '?'}${tag}`);
  }
  return sendJson(res, status, body);
}

/** api_get_styles.php : les feuilles video/css/incrustation_*.css. */
function videoStyles() {
  const dir = path.join(WWW, 'video', 'css');
  const styles = [{ file: 'incrustation.css', label: 'Défaut' }];
  for (const f of fs.readdirSync(dir).filter((f) => /^incrustation_.+\.css$/.test(f)).sort()) {
    const name = f.match(/^incrustation_(.+)\.css$/)[1];
    styles.push({ file: f, label: name.charAt(0).toUpperCase() + name.slice(1) });
  }
  return styles;
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors() });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function serveFile(res, target, root = path.dirname(target)) {
  const file = path.normalize(target);
  if (!file.startsWith(path.normalize(root))) {
    res.writeHead(403);
    return res.end('403');
  }
  fs.stat(file, (err, stat) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(`404 ${path.relative(WWW, file)}`);
    }
    if (stat.isDirectory()) return serveFile(res, path.join(file, 'index.html'), root);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

// ----------------------------------------------------------------- panneau

async function handleControl(req, res, action) {
  const body = req.method === 'POST' ? JSON.parse((await readBody(req)) || '{}') : {};
  const { director } = ctx;

  switch (action) {
    case 'state':
      return sendJson(res, 200, controlState());
    case 'fixtures':
      return sendJson(res, 200, listFixtures());
    case 'start':
      director.running = true;
      director.note('Course relancée.');
      break;
    case 'pause':
      director.running = false;
      director.note('Course en pause : les pages réelles (départ, arrivée, juges, gestionnaire) ont la main.');
      break;
    case 'step':
      await director.step();
      break;
    case 'speed':
      director.speed = Math.max(0.25, Number(body.speed) || 1);
      break;
    case 'auto':
      director.autoValidate = !!body.on;
      if (director.autoValidate && director.phase === 'validation') director.validateAt = director.t;
      break;
    case 'regie':
      if (body.auto !== undefined) {
        director.regie.auto = !!body.auto;
        ctx.regieIgnored = false;
      }
      if (body.style) director.regie.style = String(body.style).replace(/[^\w.-]/g, '');
      // Change de style tout de suite, sans attendre la prochaine étape.
      if (ctx.db.overlayState && director.regie.auto) ctx.db.overlayState.styleSheet = director.regie.style;
      if (!director.regie.auto) director.note('Régie vidéo automatique coupée : video_control.html a la main.');
      break;
    case 'styles':
      return sendJson(res, 200, videoStyles());
    case 'validate': {
      const r = await director.validate(Number(body.heatId));
      return sendJson(res, 200, { ok: !!r.success, ...r });
    }
    case 'incident':
      return sendJson(res, 200, director.incident(body.slot, body.kind));
    case 'outage':
      ctx.outageUntil = Date.now() + (Number(body.seconds) || 15) * 1000;
      director.note(`Coupure réseau simulée pendant ${Number(body.seconds) || 15} s : les API ne répondent plus.`);
      break;
    case 'reset':
    case 'fixture': {
      const keep = { speed: director.speed, running: director.running, autoValidate: director.autoValidate };
      await boot(body.id || ctx.fixture.id, { ...keep, configure: body.configure !== false });
      ctx.director.note(`Compétition réinitialisée : ${ctx.fixture.label}`);
      break;
    }
    default:
      return sendJson(res, 404, { ok: false, message: `action inconnue : ${action}` });
  }
  return sendJson(res, 200, { ok: true, state: controlState() });
}

function controlState() {
  const { db, director, fixture } = ctx;
  const heats = director.realHeats().map((h) => {
    const j = db.heatJson(h, true);
    return { ...j, startTime: h.H_depart };
  });
  const rankings = {};
  for (const cat of db.categories) {
    if (cat.Nom_Categorie === '_TEST_RESEAU_') continue;
    rankings[cat.Nom_Categorie] = db.ranking
      .filter((r) => r.Code_Categorie === cat.Code_Categorie)
      .sort((a, b) => a.Cltc - b.Cltc)
      .map((r) => {
        const b = db.boat(r.Code_bateau);
        return { rank: r.Cltc, bib: b?.Dossard, name: b ? `${b.Nom.toUpperCase()} ${b.Prenom}` : r.Code_bateau, club: b?.Club, source: r.Serie_Source };
      });
  }
  return {
    fixture: { id: fixture.id, label: fixture.label, format: fixture.format },
    code: db.code,
    configured: !!db.settings,
    zones: db.settings ? kx.penaltyZones(db.settings.Nombre_portes, db.settings.Roll_Zone, db.settings.Detail_portes).map((z) => z.nomAffichage) : [],
    outage: Math.max(0, Math.ceil((ctx.outageUntil - Date.now()) / 1000)),
    director: director.state(),
    heats,
    rankings,
  };
}

server.listen(PORT, () => {
  const code = ctx.db.code;
  console.log(`\nSimulateur kayak cross : http://localhost:${PORT}/mock/`);
  console.log(`  live      http://localhost:${PORT}/live.html?competition=${code}`);
  console.log(`  speaker   http://localhost:${PORT}/speaker.html?competition=${code}`);
  console.log(`  gestion   http://localhost:${PORT}/admin.html?competition=${code}`);
  console.log(`  vidéo     http://localhost:${PORT}/video/video_control.html?competition=${code}\n`);
});

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}
