/**
 * Adresse du serveur WebSocket competFFCK.
 *
 * Ce fichier n'est pas fourni dans le zip officiel : chaque déploiement doit le
 * créer (cf. canoe_national/ws_params.js et canoe_pau/js/ws_params.js, qui
 * codent l'IP en dur). Ici on la déduit, pour qu'aucun poste du réseau de course
 * n'ait à éditer un fichier JS à la main.
 *
 * Ordre de résolution :
 *   1. ?ws=hote:port dans l'URL de la page   -> http://.../live.html?ws=192.168.1.10:8080
 *   2. localStorage 'competffck.ws'          -> réglage persistant par poste
 *   3. l'hôte qui a servi la page            -> cas normal (Laragon et competFFCK
 *                                               tournent sur la même machine)
 */
const wsParams = (function () {
  const DEFAULT_PORT = 8080;   // port competFFCK constaté sur le serveur de course (cf. canoe_national/ws_params.js)

  function parse(value) {
    if (!value) return null;
    const m = String(value).trim().match(/^(?:(wss?):\/\/)?([^:/]+)(?::(\d+))?$/);
    if (!m) return null;
    return {
      url: (m[1] || (location.protocol === 'https:' ? 'wss' : 'ws')) + '://' + m[2],
      port: m[3] ? parseInt(m[3], 10) : DEFAULT_PORT,
    };
  }

  const fromUrl = parse(new URLSearchParams(location.search).get('ws'));
  if (fromUrl) {
    try { localStorage.setItem('competffck.ws', location.search.match(/[?&]ws=([^&]*)/)[1]); } catch (e) { /* mode privé */ }
    return fromUrl;
  }

  let stored = null;
  try { stored = localStorage.getItem('competffck.ws'); } catch (e) { /* mode privé */ }
  const fromStorage = parse(stored && decodeURIComponent(stored));
  if (fromStorage) return fromStorage;

  const host = location.hostname || 'localhost';
  return {
    url: (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + host,
    port: DEFAULT_PORT,
  };
})();
