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
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const php = require('../mock/php-lite');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };

const PORT = Number(opt('port', process.env.PORT || 3000));
const WWW = path.join(__dirname, '..', 'ws_live');

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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end(); }

  if (pathname === '/') {
    res.writeHead(302, { Location: '/canoe/' });
    return res.end();
  }

  // Protégé contre la traversée de répertoire.
  const target = path.normalize(path.join(WWW, pathname));
  if (!target.startsWith(WWW)) {
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
  if (!fs.existsSync(path.join(WWW, 'canoe', 'video', 'generique.mp4')))
    console.log('  ⚠ canoe/video/generique.mp4 absent : la régie sautera le générique');
  console.log('');
});
