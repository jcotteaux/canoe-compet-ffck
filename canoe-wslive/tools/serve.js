'use strict';

/**
 * Serveur web local de ws_live, SANS bouchon : pour faire tourner les pages
 * (régie TV comprise) sur ce poste contre un vrai serveur WebSocket competFFCK
 * distant. Pas de WebSocket ici, pas de course simulée, pas de panneau : une
 * page qui aurait perdu son ?ws= reste vide au lieu d'afficher une course
 * inventée.
 *
 *   node tools/serve.js [--port 3000]
 *
 * Mêmes réponses que le bouchon pour les fichiers : types MIME, requêtes
 * partielles (le générique vidéo), gabarits .php par mock/php-lite.js.
 *
 * Un seul ajout, le relais du pilote du podium (/pilote/podium) : la page de
 * pilotage (canoe/tv_podium_pilote.html, sur ce poste ou un téléphone) envoie
 * la catégorie et l'étape de révélation, l'écran du podium (tv_palmares.html
 * ?pilote=1, dans OBS) les reçoit aussitôt. Voir PILOTE plus bas.
 *
 * Et le kayak-cross des séries (samedi après-midi) : /gestion_kcross_series/
 * sert la copie de ce dépôt (pilote automatique de l'incrustation, tableau,
 * écran TV, dalles…), et /gestion_kcross_series/api/ est transmis au serveur
 * competCrossFFCK (--kx, défaut SERVEUR_KX ou 192.168.1.65). La régie n'a donc
 * pas besoin que ces pages soient installées sur la machine de course : seule
 * son API (PHP + base) sert.
 *
 *   node tools/serve.js [--port 3000] [--kx 192.168.1.65]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const php = require('../mock/php-lite');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };

const PORT = Number(opt('port', process.env.PORT || 3000));
const WWW = path.join(__dirname, '..', 'ws_live');
const KX = '/gestion_kcross_series';
const KX_ROOT = path.join(__dirname, '..', 'gestion_kcross_series');
const KX_SERVEUR = opt('kx', process.env.SERVEUR_KX || '192.168.1.65');

const MIME = {
  '.html': 'text/html; charset=utf-8',
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
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

/*
 * PILOTE du podium. Un état en mémoire, { epreuve, etape, seq } :
 *   etape 0  marches vides, 1  le 3e, 2  le 3e et le 2e, 3  le podium complet
 *            et la suite du classement.
 *   GET  /pilote/podium         l'état, en JSON
 *   GET  /pilote/podium/flux    l'état à chaque changement (text/event-stream)
 *   POST /pilote/podium         { epreuve?, etape?, categories? } : change l'état
 *   categories : [{ code, libelle }], publiées par l'écran (celles qu'il a
 *            vraiment) pour que la télécommande les propose.
 * Rien n'est gardé au redémarrage du serveur : l'écran repart sur les marches vides.
 */
const pilote = { epreuve: '', etape: 0, categories: [], seq: 0 };
const abonnes = new Set();

function diffuserPilote() {
  const msg = `data: ${JSON.stringify(pilote)}\n\n`;
  for (const r of abonnes) r.write(msg);
}

// Un commentaire toutes les 20 s : rien ne coupe un flux resté muet.
setInterval(() => { for (const r of abonnes) r.write(': ok\n\n'); }, 20000).unref();

function routePilote(req, res, pathname) {
  const entetes = { 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' };
  if (pathname === '/pilote/podium/flux') {
    res.writeHead(200, { ...entetes, 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive' });
    res.write(`retry: 1000\ndata: ${JSON.stringify(pilote)}\n\n`);
    abonnes.add(res);
    req.on('close', () => abonnes.delete(res));
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...entetes, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }
  if (req.method === 'POST') {
    let corps = '';
    req.on('data', (c) => { corps += c; if (corps.length > 10000) req.destroy(); });
    req.on('end', () => {
      let p = {};
      try { p = JSON.parse(corps || '{}'); } catch (e) { res.writeHead(400, entetes); return res.end('JSON invalide'); }
      if (typeof p.epreuve === 'string') pilote.epreuve = p.epreuve.slice(0, 32);
      if (Number.isInteger(p.etape)) pilote.etape = Math.max(0, Math.min(3, p.etape));
      if (Array.isArray(p.categories))
        pilote.categories = p.categories.slice(0, 40)
          .filter((c) => c && typeof c.code === 'string' && c.code !== '')
          .map((c) => ({ code: c.code.slice(0, 32), libelle: String(c.libelle || c.code).slice(0, 64) }));
      pilote.seq++;
      diffuserPilote();
      res.writeHead(200, { ...entetes, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(pilote));
    });
    return;
  }
  res.writeHead(200, { ...entetes, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(pilote));
}

/** Transmet une requête d'API kayak-cross à competCrossFFCK, telle quelle. */
function relaisKx(req, res) {
  const [hote, port] = KX_SERVEUR.split(':');
  const amont = http.request({
    host: hote, port: Number(port || 80), method: req.method, path: req.url,
    headers: { ...req.headers, host: KX_SERVEUR }, timeout: 8000,
  }, (r) => {
    res.writeHead(r.statusCode, { ...r.headers, 'access-control-allow-origin': '*' });
    r.pipe(res);
  });
  amont.on('timeout', () => amont.destroy(new Error('délai dépassé')));
  amont.on('error', (e) => {
    if (res.headersSent) return res.end();
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: false, message: `competCrossFFCK ${KX_SERVEUR} injoignable : ${e.message}` }));
  });
  req.pipe(amont);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end(); }

  if (pathname === '/pilote/podium' || pathname === '/pilote/podium/flux')
    return routePilote(req, res, pathname);

  if (pathname === '/') {
    res.writeHead(302, { Location: '/canoe/' });
    return res.end();
  }

  // Kayak-cross : l'API part vers competCrossFFCK, les pages viennent d'ici.
  let racine = WWW;
  let chemin = pathname;
  if (pathname === KX || pathname.startsWith(KX + '/')) {
    if (pathname.startsWith(KX + '/api/'))
      return relaisKx(req, res);
    racine = KX_ROOT;
    chemin = pathname.slice(KX.length) || '/';
  }

  // Protégé contre la traversée de répertoire.
  const target = path.normalize(path.join(racine, chemin));
  if (!target.startsWith(racine)) {
    res.writeHead(403);
    return res.end('403');
  }

  fs.stat(target, (err, stat) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(`404 ${pathname}`);
    }
    if (stat.isDirectory()) {
      const index = ['index.html', 'live.html'].map((f) => path.join(target, f)).find((f) => fs.existsSync(f));
      if (!index) { res.writeHead(404); return res.end('404'); }
      res.writeHead(302, { Location: path.posix.join(pathname, path.basename(index)) });
      return res.end();
    }

    const ext = path.extname(target).toLowerCase();
    if (ext === '.php') {
      const html = php.render(fs.readFileSync(target, 'utf8'), Object.fromEntries(url.searchParams));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    const type = MIME[ext] || 'application/octet-stream';
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] === '' ? Math.max(0, stat.size - Number(range[2])) : Number(range[1]);
      const end = range[1] !== '' && range[2] !== '' ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache',
      });
      return fs.createReadStream(target, { start, end }).pipe(res);
    }

    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    fs.createReadStream(target).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log(`  ws_live servi sur http://localhost:${PORT}/  (sans bouchon : aucune donnée simulée)`);
  console.log(`  régie : http://localhost:${PORT}/canoe/tv_regie.html?scenario=<demi-journée>&ws=<serveur>:8080`);
  console.log(`  pilote du podium : http://localhost:${PORT}/canoe/tv_podium_pilote.html (ou l'adresse de ce Mac, depuis un téléphone)`);
  console.log(`  kayak-cross : http://localhost:${PORT}${KX}/ (pages de ce dépôt, API sur ${KX_SERVEUR})`);
  if (!fs.existsSync(path.join(WWW, 'canoe', 'video', 'generique.mp4')))
    console.log('  ⚠ canoe/video/generique.mp4 absent : la régie sautera le générique');
  console.log('');
});
