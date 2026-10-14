'use strict';

/**
 * Simulateur de mélangeur ATEM.
 *
 * Il parle le vrai protocole UDP sur le port 9910 : poignée de main, numéros
 * de paquet, acquittements, puis le vidage d'état qu'un ATEM envoie à la
 * connexion (version, nom de produit, entrées, capacités, SuperSource,
 * programme/preview, macros).
 * Il répond à `MAct` en jouant la macro demandée, et il sait **enregistrer**
 * une macro : entre `MSRc` et l'action `stopRecord`, tout ce qu'il reçoit est
 * gravé dans l'emplacement visé, comme le fait un vrai mélangeur.
 *
 * Il existe pour une raison précise : le protocole ATEM ne se découvre pas à
 * l'exécution, il n'y a rien à interroger. Sans mélangeur sous la main, le
 * seul moyen de vérifier que le client Swift encode juste est de le confronter
 * à un pair qui décode selon la même spécification.
 *
 *   node sim/atem-sim.js [--port 9910] [--verbose]
 */

const dgram = require('dgram');
const { FLAG, buildPacket, parsePacket, cmd, parseCommands, fixedString } = require('./protocol');

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const PORT = Number(opt('port', 9910));
const VERBOSE = argv.includes('--verbose');

// ---------------------------------------------------------------------------
// État simulé du mélangeur
// ---------------------------------------------------------------------------

const PRODUCT = 'ATEM Mini Extreme ISO G2';

// Les entrées d'un ATEM Mini Extreme : 8 HDMI, plus les sources internes.
// `port` est l'InternalPortType de atem-connection : 0 externe, 1 noir,
// 2 mire, 4 lecteur de médias, 6 SuperSource. C'est par lui que le client
// reconnaît le SuperSource sans avoir à figer l'identifiant 6000.
const INPUTS = [
  ...Array.from({ length: 8 }, (_, i) => ({
    id: i + 1, long: `Camera ${i + 1}`, short: `CAM${i + 1}`, external: true, port: 0,
  })),
  { id: 0, long: 'Black', short: 'BLK', external: false, port: 1 },
  { id: 1000, long: 'Color Bars', short: 'BARS', external: false, port: 2 },
  { id: 3010, long: 'Media Player 1', short: 'MP1', external: false, port: 4 },
  { id: 6000, long: 'SuperSource', short: 'SSRC', external: false, port: 6 },
];

// Les capacités annoncées par `_top`, reprises de la fiche technique du
// modèle : ce sont elles qui autorisent le jeu de macros à deux fenêtres.
const CAPABILITIES = { mixEffects: 1, downstreamKeyers: 2, dves: 2, superSources: 1 };
const SUPERSOURCE_BOXES = 4;
const UPSTREAM_KEYERS = 4;

// Des macros plausibles pour une régie de slalom : c'est ce qu'on veut voir
// apparaître dans l'app sans avoir à inventer un jeu de test à chaque essai.
const MACROS = [
  { name: 'Depart', description: 'Camera depart + overlay startlist' },
  { name: 'Riviere', description: 'Camera riviere plein cadre' },
  { name: 'Arrivee', description: 'Camera arrivee + chrono' },
  { name: 'Classement', description: 'Incrustation du classement 8 s' },
  { name: 'Podium', description: 'Sequence podium fin d epreuve' },
  { name: 'Pause', description: 'Mire et son d ambiance' },
];

// Le pool de macros du mélangeur. Les six premières sont déjà gravées ; les
// autres sont vides et peuvent être enregistrées.
const MACRO_POOL_SIZE = 100;
const pool = Array.from({ length: MACRO_POOL_SIZE }, (_, i) =>
  MACROS[i] ? { ...MACROS[i], used: true, ops: null } : { name: '', description: '', used: false, ops: [] });

const state = {
  program: 1,
  preview: 2,
  streaming: 1, // StreamingStatus.Idle
  recording: 0, // RecordingStatus.Idle
  macro: { running: false, waiting: false, loop: false, index: 0 },
  // L'enregistreur de macros : quand il tourne, les commandes reçues sont
  // gravées au lieu d'être seulement appliquées.
  recorder: { active: false, index: 0 },
  // Les keyers amont. `chroma` retient la couleur échantillonnée : c'est elle
  // que la sonde du client vient relire.
  keyers: Array.from({ length: UPSTREAM_KEYERS }, () => ({
    type: 0, fill: 1, onAir: false, chroma: { y: 0, cb: 0, cr: 0 }, hue: 0,
  })),
  superSource: {
    artFill: 0,
    boxes: Array.from({ length: SUPERSOURCE_BOXES }, (_, i) => ({
      enabled: i === 0, source: i + 1, x: 0, y: 0, size: 1000,
    })),
  },
};

// ---------------------------------------------------------------------------
// Encodage des commandes (offsets repris de atem-connection)
// ---------------------------------------------------------------------------

const w = (size, fn) => { const b = Buffer.alloc(size); fn(b); return b; };

// src/commands/DeviceProfile/VersionCommand.ts
const cmdVersion = () => cmd('_ver', w(4, (b) => { b.writeUInt16BE(2, 0); b.writeUInt16BE(30, 2); }));

// src/commands/DeviceProfile/ProductIdentifierCommand.ts — nom sur 44 octets
const cmdProduct = () => cmd('_pin', fixedString(PRODUCT, 44));

// src/commands/Inputs/InputPropertiesCommand.ts
const cmdInput = (input) =>
  cmd('InPr', w(36, (b) => {
    b.writeUInt16BE(input.id, 0);
    fixedString(input.long, 20).copy(b, 2);
    fixedString(input.short, 4).copy(b, 22);
    b.writeUInt8(1, 26);                                  // noms par défaut
    b.writeUInt16BE(input.external ? 2 : 0, 28);          // ExternalPortType.HDMI
    b.writeUInt16BE(input.external ? 2 : 256, 30);        // HDMI / Internal
    b.writeUInt8(input.port, 32);                         // InternalPortType
    b.writeUInt8(1, 34);
    b.writeUInt8(1, 35);
  }));

// src/commands/MixEffects/{Program,Preview}InputCommand.ts
const cmdProgram = () => cmd('PrgI', w(4, (b) => { b.writeUInt8(0, 0); b.writeUInt16BE(state.program, 2); }));
const cmdPreview = () => cmd('PrvI', w(4, (b) => { b.writeUInt8(0, 0); b.writeUInt16BE(state.preview, 2); }));

// src/commands/DeviceProfile/topologyCommand.ts — les décalages au-delà de
// l'octet 6 valent pour la version 2.30, celle qu'annonce ce simulateur.
const cmdTopology = () =>
  cmd('_top', w(28, (b) => {
    b.writeUInt8(CAPABILITIES.mixEffects, 0);
    b.writeUInt8(INPUTS.filter((i) => i.external).length, 1);
    b.writeUInt8(CAPABILITIES.downstreamKeyers, 2);
    b.writeUInt8(1, 3);                        // auxiliaires
    b.writeUInt8(1, 6);                        // multivues (inséré en 2.30)
    b.writeUInt8(CAPABILITIES.dves, 9);
    b.writeUInt8(CAPABILITIES.superSources, 11);
    b.writeUInt8(1, 22);                       // keyers chroma avancés
  }));

// src/commands/MixEffects/Key/MixEffectKeyPropertiesGetCommand.ts
const cmdKeyer = (index) => {
  const k = state.keyers[index];
  return cmd('KeBP', w(20, (b) => {
    b.writeUInt8(0, 0);                        // M/E 1
    b.writeUInt8(index, 1);
    b.writeUInt8(k.type, 2);
    b.writeUInt8(1, 4);                        // peut voler
    b.writeUInt16BE(k.fill, 6);
    b.writeUInt16BE(k.fill, 8);                // source de decoupe
  }));
};

// src/commands/MixEffects/Key/MixEffectKeyOnAirCommand.ts
const cmdKeyerOnAir = (index) =>
  cmd('KeOn', w(4, (b) => {
    b.writeUInt8(0, 0);
    b.writeUInt8(index, 1);
    b.writeUInt8(state.keyers[index].onAir ? 1 : 0, 2);
  }));

// src/commands/MixEffects/Key/MixEffectKeyAdvancedChromaSampleCommand.ts
const cmdKeyerChroma = (index) => {
  const c = state.keyers[index].chroma;
  return cmd('KACC', w(16, (b) => {
    b.writeUInt8(0, 0);
    b.writeUInt8(index, 1);
    b.writeUInt16BE(c.y, 10);
    b.writeInt16BE(c.cb, 12);
    b.writeInt16BE(c.cr, 14);
  }));
};

// src/commands/Macro/MacroPropertiesCommand.ts
const cmdMacroProperties = (index) => {
  const m = pool[index];
  const name = Buffer.from(m.used ? m.name : '', 'utf8');
  const desc = Buffer.from(m.used ? m.description : '', 'utf8');
  const head = w(8, (b) => {
    b.writeUInt16BE(index, 0);
    b.writeUInt8(m.used ? 1 : 0, 2);   // isUsed
    b.writeUInt8(0, 3);                // hasUnsupportedOps
    b.writeUInt16BE(name.length, 4);
    b.writeUInt16BE(desc.length, 6);
  });
  return cmd('MPrp', Buffer.concat([head, name, desc]));
};

// src/commands/Macro/MacroRecordingStatusCommand.ts
const cmdMacroRecordStatus = () =>
  cmd('MRcS', w(4, (b) => {
    b.writeUInt8(state.recorder.active ? 1 : 0, 0);
    b.writeUInt16BE(state.recorder.index, 2);
  }));

// src/commands/SuperSource/SuperSourceBoxParametersCommand.ts — disposition
// 8.0 : l'identifiant du SuperSource ouvre le message et décale le reste.
const cmdSuperSourceBox = (index) => {
  const box = state.superSource.boxes[index];
  return cmd('SSBP', w(16, (b) => {
    b.writeUInt8(0, 0);                        // SuperSource 0
    b.writeUInt8(index, 1);
    b.writeUInt8(box.enabled ? 1 : 0, 2);
    b.writeUInt16BE(box.source, 4);
    b.writeInt16BE(box.x, 6);
    b.writeInt16BE(box.y, 8);
    b.writeUInt16BE(box.size, 10);
    b.writeUInt8(0, 12);                       // pas de recadrage
  }));
};

// src/commands/Macro/MacroRunStatusCommand.ts
const cmdMacroRunStatus = () =>
  cmd('MRPr', w(4, (b) => {
    b.writeUInt8((state.macro.running ? 1 : 0) | (state.macro.waiting ? 2 : 0), 0);
    b.writeUInt8(state.macro.loop ? 1 : 0, 1);
    b.writeUInt16BE(state.macro.index, 2);
  }));

// src/commands/Streaming|Recording
const cmdStreaming = () => cmd('StRS', w(4, (b) => b.writeUInt16BE(state.streaming, 0)));
const cmdRecording = () => cmd('RTMS', w(8, (b) => { b.writeUInt16BE(state.recording, 0); b.writeUInt32BE(3600, 4); }));

// Fin du vidage d'état : le client sait qu'il a tout reçu.
const cmdInitComplete = () => cmd('InCm', w(4, (b) => b.writeUInt8(1, 0)));

const cmdTime = () => {
  const d = new Date();
  return cmd('Time', w(4, (b) => {
    b.writeUInt8(d.getHours(), 0); b.writeUInt8(d.getMinutes(), 1);
    b.writeUInt8(d.getSeconds(), 2); b.writeUInt8(0, 3);
  }));
};

/** Le vidage complet envoyé à la connexion. */
function stateDump() {
  return [
    cmdVersion(), cmdProduct(), cmdTopology(),
    ...INPUTS.map(cmdInput),
    cmdProgram(), cmdPreview(),
    ...state.superSource.boxes.map((_, i) => cmdSuperSourceBox(i)),
    ...state.keyers.flatMap((_, i) => [cmdKeyer(i), cmdKeyerOnAir(i), cmdKeyerChroma(i)]),
    ...pool.map((m, i) => (m.used ? cmdMacroProperties(i) : null)).filter(Boolean),
    cmdMacroRunStatus(), cmdMacroRecordStatus(), cmdStreaming(), cmdRecording(),
    cmdInitComplete(),
  ];
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const socket = dgram.createSocket('udp4');
const sessions = new Map(); // clé "ip:port" -> session
let nextSessionId = 0x1000;

const keyOf = (rinfo) => `${rinfo.address}:${rinfo.port}`;
const log = (...a) => console.log('[atem-sim]', ...a);
const vlog = (...a) => VERBOSE && console.log('[atem-sim]', ...a);

function send(session, payload, { flags = FLAG.ACK_REQUEST } = {}) {
  session.packetId = (session.packetId + 1) & 0x7fff;
  const pkt = buildPacket({ flags, sessionId: session.id, packetId: session.packetId, payload });
  socket.send(pkt, session.port, session.address);
  return session.packetId;
}

/**
 * Envoie une liste de commandes en les groupant par paquet. La longueur tient
 * sur 11 bits : au-delà de ~1400 octets on coupe, comme le fait le mélangeur
 * quand il vide son état.
 */
function sendCommands(session, commands) {
  let batch = [];
  let size = 12;
  for (const c of commands) {
    if (size + c.length > 1400) {
      send(session, Buffer.concat(batch));
      batch = []; size = 12;
    }
    batch.push(c); size += c.length;
  }
  if (batch.length) send(session, Buffer.concat(batch));
}

function runMacro(session, index) {
  const m = pool[index];
  if (!m || !m.used) { log(`macro ${index} inexistante`); return; }

  log(`macro ${index} « ${m.name} » lancée`);
  state.macro = { running: true, waiting: false, loop: false, index };
  sendCommands(session, [cmdMacroRunStatus()]);

  // Une macro gravée rejoue ses opérations, une à une : c'est ce qui permet de
  // vérifier qu'on a bien gravé ce qu'on croyait, en regardant l'état bouger.
  if (m.ops) {
    let delay = 60;
    for (const op of m.ops) {
      setTimeout(() => sendCommands(session, applyCommand(op)), delay);
      delay += 60;
    }
    setTimeout(() => {
      state.macro = { ...state.macro, running: false };
      log(`macro ${index} terminée (${m.ops.length} opérations)`);
      sendCommands(session, [cmdMacroRunStatus()]);
    }, delay + 60);
    return;
  }

  // Les macros de démonstration n'ont pas d'opérations : on simule un effet
  // visible pour que l'app ait quelque chose à afficher pendant l'exécution.
  setTimeout(() => {
    state.program = ((index % 4) + 1);
    state.preview = (state.program % 4) + 1;
    state.macro = { ...state.macro, running: false };
    log(`macro ${index} terminée — programme ${state.program}`);
    sendCommands(session, [cmdProgram(), cmdPreview(), cmdMacroRunStatus()]);
  }, 1200);
}

/**
 * Applique une commande reçue et rend les commandes d'état à renvoyer.
 *
 * Séparée de la réception parce qu'elle sert deux fois : quand le client
 * l'envoie, et quand une macro la rejoue. C'est la même opération dans les
 * deux cas — c'est précisément ce qu'est une macro sur un ATEM.
 */
function applyCommand(c) {
  switch (c.name) {
    case 'CPgI':
      state.program = c.data.readUInt16BE(2);
      vlog(`<- CPgI programme=${state.program}`);
      return [cmdProgram()];

    case 'CPvI':
      state.preview = c.data.readUInt16BE(2);
      vlog(`<- CPvI preview=${state.preview}`);
      return [cmdPreview()];

    // src/commands/SuperSource/SuperSourceBoxParametersCommand.ts
    case 'CSBP': {
      const mask = c.data.readUInt16BE(0);
      const index = c.data.readUInt8(3);
      const box = state.superSource.boxes[index];
      if (!box) return [];
      // Le masque est le cœur de l'affaire : sans lui, changer la caméra d'une
      // fenêtre remettrait aussi son cadrage à zéro.
      if (mask & 0x01) box.enabled = c.data.readUInt8(4) === 1;
      if (mask & 0x02) box.source = c.data.readUInt16BE(6);
      if (mask & 0x04) box.x = c.data.readInt16BE(8);
      if (mask & 0x08) box.y = c.data.readInt16BE(10);
      if (mask & 0x10) box.size = c.data.readUInt16BE(12);
      vlog(`<- CSBP fenetre=${index} masque=0x${mask.toString(16)} source=${box.source} x=${box.x} y=${box.y} taille=${box.size} ${box.enabled ? 'allumee' : 'eteinte'}`);
      return [cmdSuperSourceBox(index)];
    }

    // src/commands/MixEffects/Key/MixEffectKeyTypeSetCommand.ts
    case 'CKTp': {
      const index = c.data.readUInt8(2);
      if (!state.keyers[index]) return [];
      if (c.data.readUInt8(0) & 0x01) state.keyers[index].type = c.data.readUInt8(3);
      vlog(`<- CKTp incrust=${index} type=${state.keyers[index].type}`);
      return [cmdKeyer(index)];
    }

    case 'CKeF': {
      const index = c.data.readUInt8(1);
      if (!state.keyers[index]) return [];
      state.keyers[index].fill = c.data.readUInt16BE(2);
      vlog(`<- CKeF incrust=${index} source=${state.keyers[index].fill}`);
      return [cmdKeyer(index)];
    }

    case 'CKOn': {
      const index = c.data.readUInt8(1);
      if (!state.keyers[index]) return [];
      state.keyers[index].onAir = c.data.readUInt8(2) === 1;
      vlog(`<- CKOn incrust=${index} ${state.keyers[index].onAir ? 'antenne' : 'hors antenne'}`);
      return [cmdKeyerOnAir(index)];
    }

    // src/commands/MixEffects/Key/MixEffectKeyAdvancedChromaSampleCommand.ts
    case 'CACC': {
      const mask = c.data.readUInt8(0);
      const index = c.data.readUInt8(2);
      if (!state.keyers[index]) return [];
      const chroma = state.keyers[index].chroma;
      if (mask & 0x20) chroma.y = c.data.readUInt16BE(12);
      if (mask & 0x40) chroma.cb = c.data.readInt16BE(14);
      if (mask & 0x80) chroma.cr = c.data.readInt16BE(16);
      vlog(`<- CACC incrust=${index} Y=${chroma.y} Cb=${chroma.cb} Cr=${chroma.cr}`);
      return [cmdKeyerChroma(index)];
    }

    // src/commands/MixEffects/Key/MixEffectKeyChromaCommand.ts (ancien keyer)
    case 'CKCk': {
      const index = c.data.readUInt8(2);
      if (!state.keyers[index]) return [];
      if (c.data.readUInt8(0) & 0x01) state.keyers[index].hue = c.data.readUInt16BE(4);
      vlog(`<- CKCk incrust=${index} teinte=${state.keyers[index].hue}`);
      return [];
    }

    // src/commands/SuperSource/SuperSourcePropertiesCommand.ts (forme 8.0)
    case 'CSSc':
      if (c.data.readUInt8(0) & 0x01) state.superSource.artFill = c.data.readUInt16BE(2);
      vlog(`<- CSSc fond=${state.superSource.artFill}`);
      return [];

    default:
      vlog(`<- commande ignorée ${c.name} (${c.data.length} octets)`);
      return [];
  }
}

function handleCommands(session, payload) {
  for (const c of parseCommands(payload)) {
    switch (c.name) {
      // src/commands/Macro/MacroRecordCommand.ts — ouvre l'enregistrement.
      case 'MSRc': {
        const index = c.data.readUInt16BE(0);
        const nameLength = c.data.readUInt16BE(2);
        const descLength = c.data.readUInt16BE(4);
        const name = c.data.toString('utf8', 6, 6 + nameLength);
        const description = c.data.toString('utf8', 6 + nameLength, 6 + nameLength + descLength);
        pool[index] = { name, description, used: true, ops: [] };
        state.recorder = { active: true, index };
        log(`enregistrement de la macro ${index} « ${name} »`);
        sendCommands(session, [cmdMacroRecordStatus(), cmdMacroProperties(index)]);
        break;
      }

      case 'MAct': { // src/commands/Macro/MacroActionCommand.ts
        const index = c.data.readUInt16BE(0);
        const action = c.data.readUInt8(2);
        vlog(`<- MAct index=${index} action=${action}`);
        if (action === 0) runMacro(session, index);
        else if (action === 1) { state.macro.running = false; sendCommands(session, [cmdMacroRunStatus()]); }
        else if (action === 2) { // stopRecord
          const recorded = state.recorder.index;
          const count = pool[recorded].ops.length;
          state.recorder = { active: false, index: recorded };
          log(`macro ${recorded} gravée — ${count} opération(s)`);
          sendCommands(session, [cmdMacroRecordStatus(), cmdMacroProperties(recorded)]);
        } else if (action === 5) { // delete
          pool[index] = { name: '', description: '', used: false, ops: [] };
          log(`macro ${index} effacée`);
          sendCommands(session, [cmdMacroProperties(index)]);
        }
        break;
      }

      // src/commands/Macro/MacroPropertiesCommand.ts — renomme sans regraver.
      case 'CMPr': {
        const index = c.data.readUInt16BE(2);
        const nameLength = c.data.readUInt16BE(4);
        const descLength = c.data.readUInt16BE(6);
        if (pool[index]) {
          pool[index].name = c.data.toString('utf8', 8, 8 + nameLength);
          pool[index].description = c.data.toString('utf8', 8 + nameLength, 8 + nameLength + descLength);
          log(`macro ${index} renommée « ${pool[index].name} »`);
          sendCommands(session, [cmdMacroProperties(index)]);
        }
        break;
      }

      default: {
        // Pendant un enregistrement, le mélangeur grave ce qu'il reçoit — de
        // n'importe quel client — en plus de l'appliquer.
        const updates = applyCommand(c);
        if (state.recorder.active) {
          pool[state.recorder.index].ops.push({ name: c.name, data: Buffer.from(c.data) });
        }
        if (updates.length) sendCommands(session, updates);
      }
    }
  }
}

socket.on('message', (msg, rinfo) => {
  const pkt = parsePacket(msg);
  if (!pkt) return;
  const key = keyOf(rinfo);

  // Poignée de main : le client propose un identifiant temporaire, le
  // mélangeur en attribue un définitif que le client adopte à la volée.
  if (pkt.flags & FLAG.HELLO) {
    const id = nextSessionId++;
    const session = { id, address: rinfo.address, port: rinfo.port, packetId: 0, dumped: false };
    sessions.set(key, session);
    log(`connexion de ${key} — session 0x${id.toString(16)}`);

    const payload = Buffer.alloc(8);
    payload.writeUInt8(0x02, 0); // connexion acceptée
    socket.send(buildPacket({ flags: FLAG.HELLO, sessionId: id, packetId: 0, payload }), rinfo.port, rinfo.address);
    return;
  }

  const session = sessions.get(key);
  if (!session) return;

  // Premier acquittement du client : il a vu la réponse de poignée de main,
  // on peut vider l'état.
  if (!session.dumped) {
    session.dumped = true;
    log(`vidage d'état vers ${key} (${MACROS.length} macros)`);
    sendCommands(session, stateDump());
  }

  if (pkt.payload.length > 0) handleCommands(session, pkt.payload);

  // Tout paquet portant ACK_REQUEST doit être acquitté.
  if (pkt.flags & FLAG.ACK_REQUEST) {
    socket.send(
      buildPacket({ flags: FLAG.ACK, sessionId: session.id, ackId: pkt.packetId }),
      rinfo.port, rinfo.address
    );
  }
});

// Horloge périodique : garde la session vivante et prouve que le client
// acquitte bien ce qu'il reçoit.
setInterval(() => {
  for (const session of sessions.values()) if (session.dumped) sendCommands(session, [cmdTime()]);
}, 1000);

socket.on('listening', () => {
  const a = socket.address();
  log(`${PRODUCT} simulé sur ${a.address}:${a.port} (UDP)`);
  log(`macros : ${MACROS.map((m, i) => `${i}=${m.name}`).join(', ')}`);
  log(`SuperSource : ${SUPERSOURCE_BOXES} fenetres, ${MACRO_POOL_SIZE} emplacements de macro`);
});

socket.on('error', (e) => { console.error('[atem-sim] erreur :', e.message); process.exit(1); });
socket.bind(PORT);
