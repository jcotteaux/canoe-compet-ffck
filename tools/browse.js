'use strict';

/**
 * Pilote Chrome via le DevTools Protocol : ouvre une page ws_live, laisse le
 * temps réel s'écouler (indispensable, les données arrivent par WebSocket),
 * puis renvoie le DOM, les erreurs console et éventuellement une capture.
 *
 *   node tools/browse.js <url> [--wait 6000] [--click "sel"] [--after 4000]
 *                        [--settle 8000] [--eval "expression"] [--shot out.png]
 *                        [--width 1920] [--height 1080]
 *
 * `--settle` attend encore après les clics : c'est la fenêtre pendant laquelle on
 * observe le flux temps réel (arrivées, pénalités, effacement de manche).
 *
 * `--click` accepte plusieurs sélecteurs séparés par ` >> `, cliqués l'un après
 * l'autre : les pages ws_live se naviguent en cascade (compétition, puis épreuve).
 *
 * Aucune dépendance en plus : Chrome est déjà installé, `ws` sert de client CDP.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// port de debug tire au hasard : plusieurs instances peuvent tourner en parallele
const PORT = Number(process.env.CDP_PORT || 9333 + Math.floor(Math.random() * 400));

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      out[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    } else out._.push(argv[i]);
  }
  return out;
}

const opts = args(process.argv.slice(2));
const url = opts._[0];
if (!url) {
  console.error('usage : node tools/browse.js <url> [--wait ms] [--eval expr] [--shot fichier.png]');
  process.exit(1);
}
const waitMs = Number(opts.wait || 6000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(pathname) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path: pathname }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
        });
      })
      .on('error', reject);
  });
}

async function waitForChrome(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { return await getJson('/json/version'); } catch { await sleep(200); }
  }
  throw new Error('Chrome ne répond pas sur le port de debug');
}

(async () => {
  const profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cdp-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    `--window-size=${opts.width || 1920},${opts.height || 1080}`,
    'about:blank',
  ], { stdio: 'ignore' });

  const cleanup = () => { try { chrome.kill(); } catch {} };
  process.on('exit', cleanup);

  await waitForChrome();

  const targets = await getJson('/json/list');
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });

  let id = 0;
  const pending = new Map();
  const consoleErrors = [];
  const consoleLogs = [];

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      return m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      consoleErrors.push(`${d.text} ${d.exception ? d.exception.description || d.exception.value : ''}`.trim());
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
      consoleLogs.push(`[${m.params.type}] ${text}`);
      if (m.params.type === 'error') consoleErrors.push(text);
    }
  });

  await new Promise((r) => ws.on('open', r));

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Page.navigate', { url });

  await sleep(waitMs);

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: r.exceptionDetails.text };
    return r.result.value;
  };

  if (opts.click) {
    const clickTimeout = Number(opts.clickTimeout || 10000);
    for (const sel of String(opts.click).split(' >> ')) {
      // Le contenu arrive par WebSocket : l'element peut ne pas encore exister.
      // On sonde jusqu'a clickTimeout plutot que d'echouer au premier essai.
      const start = Date.now();
      let clicked = 'introuvable';
      while (Date.now() - start < clickTimeout) {
        clicked = await evaluate(
          `(() => { const el = document.querySelector(${JSON.stringify(sel)});
                    if (!el) return 'introuvable'; el.click(); return 'ok'; })()`
        );
        if (clicked === 'ok') break;
        await sleep(250);
      }
      if (clicked !== 'ok') {
        console.error(`clic impossible sur ${sel} apres ${clickTimeout} ms : ${clicked}`);
        process.exit(3);
      }
      await sleep(Number(opts.after || 3000));
    }
  }

  if (opts.settle) await sleep(Number(opts.settle));

  const report = {
    url,
    title: await evaluate('document.title'),
    header: await evaluate("document.getElementById('title') ? document.getElementById('title').textContent.trim() : null"),
    subheader: await evaluate("document.getElementById('sub_title') ? document.getElementById('sub_title').textContent.trim() : null"),
    clock: await evaluate("document.getElementById('clock') ? document.getElementById('clock').textContent.trim() : null"),
    rows: await evaluate("document.querySelectorAll('#main table tbody tr').length"),
    wsState: await evaluate("typeof wsMain !== 'undefined' && wsMain.websocket ? wsMain.websocket.readyState : 'pas de wsMain'"),
    mainText: await evaluate("document.getElementById('main') ? document.getElementById('main').innerText.split('\\n').slice(0,14).join(' | ') : null"),
  };

  if (opts.eval) report.eval = await evaluate(String(opts.eval));

  if (opts.shot) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(opts.shot, Buffer.from(shot.data, 'base64'));
    report.screenshot = path.resolve(opts.shot);
  }

  report.consoleErrors = consoleErrors;
  report.consoleLogs = consoleLogs.slice(0, 20);

  console.log(JSON.stringify(report, null, 2));

  ws.close();
  cleanup();
  await sleep(300); // laisse Chrome relâcher son profil avant de le supprimer
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* sans importance */ }
  process.exit(consoleErrors.length ? 2 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
