'use strict';

/**
 * Relais vers un serveur de course distant (Laragon + competFFCK), quand le Mac
 * a deux interfaces sur le même réseau (Wi-Fi pour Internet + câble Ethernet
 * vers le serveur) et que macOS envoie tout par le Wi-Fi.
 *
 *   node tools/relay.js [--remote 192.168.1.52] [--via 192.168.1.103]
 *                       [--http 8052] [--ws 8081] [--remote-ws 8080]
 *
 *   --via   adresse IP du Mac SUR LE CÂBLE : `ipconfig getifaddr en7`
 *
 *   localhost:8052 -> http://<remote>/            le site du serveur
 *   localhost:8081 -> <remote>:8080               le WebSocket competFFCK
 *
 * Les ws_params.js servis par le serveur sont réécrits au passage pour viser
 * localhost:8081 : les versions qui codent l'IP en dur (ws_live_ICF)
 * marchent donc aussi.
 */

const net = require('net');
const http = require('http');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };

const REMOTE = opt('remote', '192.168.1.52');
const VIA = opt('via', '192.168.1.103');
const HTTP_LOCAL = Number(opt('http', 8052));
const WS_LOCAL = Number(opt('ws', 8081));
const WS_REMOTE = Number(opt('remote-ws', 8080));

net.createServer(c => {
  const r = net.connect({ host: REMOTE, port: WS_REMOTE, localAddress: VIA });
  c.pipe(r).pipe(c);
  c.on('error', () => r.destroy());
  r.on('error', e => { console.log('ws :', e.message); c.destroy(); });
}).listen(WS_LOCAL, '127.0.0.1', () => console.log(`  websocket  ws://localhost:${WS_LOCAL}  -> ${REMOTE}:${WS_REMOTE}`));

const ip = REMOTE.replace(/\./g, '\\.');

http.createServer((req, res) => {
  const rewrite = /ws_params\.js(\?|$)/.test(req.url);
  const headers = { ...req.headers, host: REMOTE };
  if (rewrite) {
    delete headers['accept-encoding'];
    delete headers['if-none-match'];
    delete headers['if-modified-since'];
  }

  const p = http.request({ host: REMOTE, port: 80, path: req.url, method: req.method, headers, localAddress: VIA }, pr => {
    if (!rewrite) {
      res.writeHead(pr.statusCode, pr.headers);
      return pr.pipe(res);
    }

    let body = '';
    pr.setEncoding('utf8');
    pr.on('data', d => body += d);
    pr.on('end', () => {
      body = body.replace(new RegExp('ws://' + ip, 'g'), 'ws://localhost')
                 .replace(/port\s*:\s*\d+/g, `port:${WS_LOCAL}`)
                 .replace(/DEFAULT_PORT = \d+/, `DEFAULT_PORT = ${WS_LOCAL}`);
      const h = { ...pr.headers, 'cache-control': 'no-store' };
      delete h['content-length'];
      delete h['etag'];
      delete h['last-modified'];
      res.writeHead(pr.statusCode, h);
      res.end(body);
    });
  });

  p.on('error', e => { res.writeHead(502); res.end(`${REMOTE} injoignable par ${VIA} : ${e.message}`); });
  req.pipe(p);
}).listen(HTTP_LOCAL, '127.0.0.1', () => console.log(`  site       http://localhost:${HTTP_LOCAL}/  -> http://${REMOTE}/  (via ${VIA})`));
