'use strict';

/**
 * Bouchon competFFCK : sert les pages ws_live et parle le protocole WebSocket
 * du logiciel, sans MySQL ni competFFCK.exe.
 *
 *   node mock/server.js [--fixture slalom-finale] [--speed 4] [--record out.jsonl]
 *   node mock/server.js --scenario vendredi-matin [--speed 10]
 *
 * --scenario rejoue une demi-journée de régie (fixture regie-<id>, démarrée
 * 10 min avant le premier départ) ; « test » donne la petite répétition.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const { Engine } = require('./engine');
const php = require('./php-lite');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'ws_live');

const args = parseArgs(process.argv.slice(2));
const HTTP_PORT = Number(args.port || process.env.PORT || 3000);
const WS_PORT = Number(args['ws-port'] || process.env.WS_PORT || 8080);

const scenario = typeof args.scenario === 'string' ? args.scenario : null;
const fixtureName = scenario ? (scenario === 'test' ? 'france-elite-test' : `regie-${scenario}`)
  : (args.fixture || 'slalom-finale');
const fixture = loadFixture(fixtureName);
if (args.speed) fixture.speed = Number(args.speed);

const engine = new Engine(fixture);
const clients = new Set();
// Liaison morte sans fermeture (wifi, switch) : la socket reste ouverte mais
// plus rien ne passe, dans un sens comme dans l'autre. Les nouveaux clients
// ne sont pas concernés.
const muted = new WeakSet();

let recorder = null;
if (args.record) {
  recorder = fs.createWriteStream(path.resolve(args.record), { flags: 'a' });
  console.log(`enregistrement des trames -> ${path.resolve(args.record)}`);
}

// ----------------------------------------------------------------- WebSocket

// competFFCK impose le sous-protocole 'lws' depuis adv/ws.js (juillet 2026) :
// sans accord explicite du serveur, le navigateur rompt la negociation. On
// accepte aussi les clients qui n'en demandent aucun (anciennes pages).
const wss = new WebSocketServer({
  port: WS_PORT,
  handleProtocols: (protocols) => (protocols.has('lws') ? 'lws' : false),
});

wss.on('connection', (socket, req) => {
  clients.add(socket);
  console.log(`[ws] connexion ${req.socket.remoteAddress} (${clients.size} client(s))`);

  socket.on('message', (raw) => {
    if (muted.has(socket)) return;
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.warn(`[ws] trame illisible : ${raw.toString().slice(0, 120)}`);
      return;
    }
    handleCommand(socket, msg);
  });

  socket.on('close', () => {
    clients.delete(socket);
    console.log(`[ws] déconnexion (${clients.size} client(s))`);
  });

  socket.on('error', (e) => console.warn(`[ws] erreur socket : ${e.message}`));
});

function handleCommand(socket, msg) {
  const key = msg.key;
  console.log(`[ws] <- ${key} ${JSON.stringify(omit(msg, 'key'))}`);

  switch (key) {
    // Accuse de reception envoye par ws.Context.SendAck : rien a repondre.
    case '<ack_ws>':
      return;

    case '<competition_load>':
      return send(socket, engine.competitionLoadFrame());

    case '<race_load>':
      return send(socket, engine.raceLoadFrame());

    case '<epreuve_load>':
      return send(socket, engine.epreuveLoadFrame(msg.epreuve));

    case '<pdf>':
      return send(socket, { key: '<pdf>', url: `/mock/pdf-indisponible.html?type=${msg.type || ''}` });

    // Régie TV : une page pilote les autres. competFFCK rediffuse l'ordre.
    case '<order>':
      return broadcast(msg, socket);

    case '<passage_add>':
      if (Number(msg.passage) >= 1) engine.boat(msg.bib) && (engine.boat(msg.bib).inters[msg.passage] = Number(msg.time));
      else engine.forceFinish(msg.bib);
      return send(socket, { key: '<passage_add>', bib: msg.bib, passage: msg.passage, ok: 1 });

    case '<bib_delete>':
    case '<bib_next>':
      return send(socket, { key, bib: msg.bib, ok: 1 });

    default:
      console.warn(`[ws] commande inconnue du bouchon : ${key}`);
      return send(socket, { key, error: 'commande non implémentée par le bouchon' });
  }
}

function send(socket, frame) {
  if (socket.readyState !== socket.OPEN || muted.has(socket)) return;
  socket.send(JSON.stringify(frame));
  record('out', frame);
}

function broadcast(frame, except = null) {
  const payload = JSON.stringify(frame);
  for (const c of clients) {
    if (c !== except && c.readyState === c.OPEN && !muted.has(c)) c.send(payload);
  }
  record('out', frame);
}

function record(dir, frame) {
  if (!recorder) return;
  recorder.write(JSON.stringify({ t: Date.now(), dir, frame }) + '\n');
}

// ----------------------------------------------------------------- latence

/**
 * Serveur lent simulé (--lag ou bouton du panneau) : chaque trame part avec un
 * retard aléatoire de 0 à 250 ms, et toutes les 4 s le serveur « gèle » 1,5 s
 * puis délivre d'un coup ce qu'il a retenu. L'ordre des trames est conservé,
 * comme sur une vraie connexion TCP.
 */
const lag = {
  on: !!args.lag,
  queue: [],
  lastOut: 0,
  freezeUntil: 0,
  nextFreeze: Date.now() + 4000,
  push(frame) {
    if (!this.on) return broadcast(frame);
    const now = Date.now();
    if (now >= this.nextFreeze) {
      this.freezeUntil = now + 1500;
      this.nextFreeze = now + 4000;
    }
    const at = Math.max(this.lastOut, this.freezeUntil, now + Math.random() * 250);
    this.lastOut = at;
    this.queue.push({ at, frame });
  },
  flush() {
    const now = Date.now();
    while (this.queue.length && this.queue[0].at <= now) broadcast(this.queue.shift().frame);
  },
};
setInterval(() => lag.flush(), 10);

engine.on('frame', (frame) => lag.push(frame));

// ----------------------------------------------------------------- HTTP

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
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
  '.eot': 'application/vnd.ms-fontobject',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.map': 'application/json',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/') {
    res.writeHead(302, { Location: '/mock/' });
    return res.end();
  }

  if (pathname.startsWith('/mock/api/')) return handleApi(req, res, pathname, url);

  if (pathname === '/mock' || pathname === '/mock/') {
    return serveFile(res, path.join(__dirname, 'public', 'control.html'), {});
  }
  if (pathname.startsWith('/mock/')) {
    return serveFile(res, path.join(__dirname, 'public', pathname.slice('/mock/'.length)), {});
  }

  // statique ws_live, protégé contre la traversée de répertoire
  const target = path.normalize(path.join(WWW, pathname));
  if (!target.startsWith(WWW)) {
    res.writeHead(403);
    return res.end('403');
  }
  return serveFile(res, target, Object.fromEntries(url.searchParams));
});

function serveFile(res, target, query) {
  fs.stat(target, (err, stat) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(`404 ${path.relative(ROOT, target)}`);
    }
    if (stat.isDirectory()) return serveFile(res, path.join(target, 'index.html'), query);

    const ext = path.extname(target).toLowerCase();

    if (ext === '.php') {
      const src = fs.readFileSync(target, 'utf8');
      const html = php.render(src, query);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    const type = MIME[ext] || 'application/octet-stream';

    // Requêtes partielles : Chrome lit les vidéos par morceaux (générique de
    // tv_regie) et refuse d'en lancer une servie d'un bloc sans Accept-Ranges.
    const range = /^bytes=(\d*)-(\d*)$/.exec(res.req.headers.range || '');
    if (range) {
      const start = range[1] === '' ? Math.max(0, stat.size - Number(range[2])) : Number(range[1]);
      const end = range[1] !== '' && range[2] !== '' ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      });
      return fs.createReadStream(target, { start, end }).pipe(res);
    }

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(target).pipe(res);
  });
}

function handleApi(req, res, pathname, url) {
  const action = pathname.slice('/mock/api/'.length);
  const json = (code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  if (action === 'state') return json(200, { ...engine.snapshot(), lag: lag.on });
  if (action === 'fixtures') return json(200, listFixtures());

  readBody(req, (body) => {
    const p = { ...Object.fromEntries(url.searchParams), ...body };
    try {
      switch (action) {
        case 'start': engine.start(); break;
        case 'pause': engine.pause(); break;
        case 'reset': engine.reset(); break;
        case 'speed': engine.setSpeed(p.speed); break;
        case 'bib-start': engine.forceStart(p.bib); break;
        case 'bib-finish': engine.forceFinish(p.bib, p.time); break;
        case 'bib-status': engine.setStatus(p.bib, p.status); break;
        case 'bib-remove': engine.removeFromCourse(p.bib); break;
        case 'penalty': engine.addPenalty(p.bib, p.porte, p.value); break;
        case 'finish-categ': engine.finishCategory(p.epreuve); break;
        case 'erase': engine.eraseRun(); break;
        case 'mode-chrono': engine.setModeChrono(p.mode || 1); break;
        case 'pena-plan': engine.penaPlan = !!p.on; break;
        case 'lag':
          lag.on = !!p.on;
          if (!lag.on) {
            for (const q of lag.queue) broadcast(q.frame);
            lag.queue = [];
          }
          break;
        case 'kill-clients':
          // simule une coupure réseau : le cas que les pages ws_live ne savent pas encore gérer
          for (const c of clients) c.terminate();
          break;
        case 'mute-clients':
          // simule une liaison morte : la socket reste ouverte, plus rien ne passe
          for (const c of clients) muted.add(c);
          break;
        case 'fixture': {
          const next = loadFixture(p.name);
          engine.pause();
          engine.load(next);
          break;
        }
        default:
          return json(404, { error: `action inconnue : ${action}` });
      }
    } catch (e) {
      return json(500, { error: e.message });
    }
    json(200, { ...engine.snapshot(), lag: lag.on });
  });
}

function readBody(req, cb) {
  if (req.method !== 'POST') return cb({});
  let data = '';
  req.on('data', (c) => (data += c));
  req.on('end', () => {
    try {
      cb(data ? JSON.parse(data) : {});
    } catch {
      cb({});
    }
  });
}

// ----------------------------------------------------------------- utilitaires

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    out[k] = v;
  }
  return out;
}

function fixturesDir() {
  return path.join(ROOT, 'fixtures');
}

function listFixtures() {
  return fs
    .readdirSync(fixturesDir())
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const j = JSON.parse(fs.readFileSync(path.join(fixturesDir(), f), 'utf8'));
      return { id: j.id, label: j.label, activite: j.competition.Code_activite, boats: j.boats.length };
    });
}

function loadFixture(name) {
  const file = path.join(fixturesDir(), `${name}.json`);
  if (!fs.existsSync(file)) {
    console.error(`fixture introuvable : ${file}`);
    console.error(`disponibles : ${listFixtures().map((f) => f.id).join(', ')}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function omit(obj, k) {
  const { [k]: _, ...rest } = obj;
  return rest;
}

/** Adresses IPv4 non internes, pour ouvrir les pages depuis un téléphone. */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(require('os').networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

server.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log('');
  console.log(`  bouchon competFFCK — fixture « ${fixture.label} » (${fixture.competition.Code_activite})`);
  console.log('');
  console.log(`  panneau de contrôle  http://localhost:${HTTP_PORT}/mock/`);
  console.log(`  live                 http://localhost:${HTTP_PORT}/canoe/live.html`);
  console.log(`  monitor              http://localhost:${HTTP_PORT}/canoe/monitor_race.html`);
  console.log(`  tv inrace            http://localhost:${HTTP_PORT}/canoe/tv_inrace.html`);
  console.log(`  tv oncourse          http://localhost:${HTTP_PORT}/canoe/tv_oncourse.html`);
  console.log(`  tv leaders           http://localhost:${HTTP_PORT}/canoe/tv_leaders.html`);
  console.log(`  tv podium            http://localhost:${HTTP_PORT}/canoe/tv_podium.html`);
  console.log(`  tv ranking           http://localhost:${HTTP_PORT}/canoe/tv_ranking.html`);
  console.log(`  tv startlist         http://localhost:${HTTP_PORT}/canoe/tv_startlist.html`);
  console.log(`  tv duo               http://localhost:${HTTP_PORT}/canoe/tv_duo.html`);
  console.log(`  tv duo kayak-cross   http://localhost:${HTTP_PORT}/canoe/tv_duo_kx.html`);
  console.log(`  tv résultats KX      http://localhost:${HTTP_PORT}/canoe/tv_results_kx.html`);
  console.log(`  tv regie             http://localhost:${HTTP_PORT}/canoe/tv_regie.html?scenario=${scenario || 'test'}&repetition=1&debug=1`);
  console.log(`  jugement             http://localhost:${HTTP_PORT}/canoe/jugement.html`);
  console.log(`  inrace (php)         http://localhost:${HTTP_PORT}/canoe/inrace.php`);
  console.log('');
  console.log(`  websocket            ws://localhost:${WS_PORT}`);

  const lan = lanAddresses();
  if (lan.length) {
    console.log('');
    console.log('  depuis un téléphone ou une tablette du même réseau :');
    for (const ip of lan) console.log(`    http://${ip}:${HTTP_PORT}/canoe/live.html`);
    console.log('    (ws_params.js déduit l\'adresse du serveur : rien à configurer)');
  }
  console.log('');
});

process.on('SIGINT', () => {
  engine.pause();
  if (recorder) recorder.end();
  process.exit(0);
});
