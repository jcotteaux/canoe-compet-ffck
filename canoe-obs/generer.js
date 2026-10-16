#!/usr/bin/env node
/*
 * Fabrique la configuration OBS de la régie TV : une collection de scènes et
 * un profil, à partir de quelques variables (serveur de course, port local,
 * kayak-cross, cadence). Rien d'autre que Node, pas de dépendance.
 *
 *   node generer.js --sortie build
 *   SERVEUR=192.168.1.60 FPS=50 node generer.js --sortie build
 *
 * Produit, sous le dossier de sortie :
 *   scenes/canoe_ffck.json         la collection « Canoë FFCK »
 *   profiles/canoe-ffck/basic.ini  le profil « Canoë FFCK »
 *
 * obs.sh l'appelle puis copie le résultat dans la configuration d'OBS.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const NOM = 'Canoë FFCK';
const FICHIER_SCENES = 'canoe_ffck.json';
const DOSSIER_PROFIL = 'canoe-ffck';

const env = process.env;
const SERVEUR = env.SERVEUR || '192.168.1.52';      // competFFCK, port 8080
const PORT = env.PORT || '3000';                    // ws_live servi par ce Mac (regie.sh)
const SERVEUR_KX = env.SERVEUR_KX || '';            // competCrossFFCK, samedi après-midi
const CODE_KX = env.CODE_KX || '';
const FPS = Number(env.FPS || 25);                  // doit suivre le format vidéo de l'ATEM
// Sortie son vers l'ATEM : le HDMI du Mac, vu par macOS sous le nom « BMD HDMI ».
const SON_ID = env.SON_ID || '23010000-0000-0000-2610-010380472896';
const SON_NOM = env.SON_NOM || 'BMD HDMI';
const ENREGISTREMENTS = env.ENREGISTREMENTS || path.join(env.HOME || '~', 'Movies', 'canoe-obs');

// La couleur de clé des pages TV (--chroma-key, tv_regie.css et tv_oncourse.css)
// et de l'incrustation gravée dans l'ATEM (atemctl atem incrust --couleur CC00CC).
const CLE = 0xCC00CC;

const LARGEUR = 1920;
const HAUTEUR = 1080;

const base = `http://localhost:${PORT}/canoe`;
const ws = `ws=${SERVEUR}:8080`;

/* ------------------------------------------------------------------ */
/* Les scènes                                                          */
/* ------------------------------------------------------------------ */

const DEMI_JOURNEES = [
	['vendredi-matin', 'Vendredi matin — qualifs M1'],
	['vendredi-apres-midi', 'Vendredi après-midi — qualifs M2'],
	['samedi-matin', 'Samedi matin — KX contre-la-montre'],
	['samedi-apres-midi', 'Samedi après-midi — KX séries'],
	['dimanche-matin', 'Dimanche matin — demi-finales'],
	['dimanche-apres-midi', 'Dimanche après-midi — finales'],
];

function urlRegie(scenario) {
	let url = `${base}/tv_regie.html?scenario=${scenario}&${ws}`;
	if (scenario === 'samedi-apres-midi')
		url += `&kx=http://${SERVEUR_KX}/gestion_kcross_series&kx_competition=${CODE_KX}`;
	return url;
}

// Chaque scène : un fond de clé plein cadre, puis la page par-dessus.
// Le fond de clé est le repli : page vide, plantée ou pas encore chargée,
// l'ATEM découpe tout et l'antenne garde les caméras seules.
const scenes = [];

for (const [scenario, titre] of DEMI_JOURNEES) {
	if (scenario === 'samedi-apres-midi' && !(SERVEUR_KX && CODE_KX)) {
		console.warn('⚠︎ SERVEUR_KX ou CODE_KX manquant : pas de scène « samedi après-midi »');
		continue;
	}
	scenes.push({ nom: `Régie · ${titre}`, page: urlRegie(scenario), son: true });
}

// Secours manuel, si la régie automatique ne convient pas : chaque page seule.
scenes.push(
	{ nom: 'Caméras seules', page: null },
	{ nom: 'Manuel · Course duo', page: `${base}/tv_duo.html?bg=1&${ws}` },
	{ nom: 'Manuel · Course duo KX', page: `${base}/tv_duo_kx.html?bg=1&${ws}` },
	{ nom: 'Manuel · Course 1 bateau', page: `${base}/tv_inrace.html?bg=1&${ws}` },
	{ nom: 'Manuel · Bateaux en course', page: `${base}/tv_oncourse.html?bg=1&${ws}` },
	{ nom: 'Manuel · Départs', page: `${base}/tv_departs.html?${ws}` },
	{ nom: 'Manuel · Résultats', page: `${base}/tv_results.html?${ws}&no_course` },
	{ nom: 'Répétition · bouchon', page: `${base}/tv_regie.html?scenario=test&repetition=1&ws=localhost:8080`, son: true },
);

/* ------------------------------------------------------------------ */
/* Le format d'OBS                                                     */
/* ------------------------------------------------------------------ */

// UUID tirés du nom : deux générations donnent le même fichier, un diff
// entre deux versions ne montre que ce qui a changé.
function uuid(nom) {
	const h = crypto.createHash('sha1').update(`canoe-obs:${nom}`).digest('hex');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function source(nom, id, versioned_id, settings, extra = {}) {
	return {
		name: nom,
		uuid: uuid(nom),
		id,
		versioned_id,
		settings,
		mixers: 0,
		sync: 0,
		flags: 0,
		volume: 1.0,
		balance: 0.5,
		enabled: true,
		muted: false,
		'push-to-mute': false,
		'push-to-mute-delay': 0,
		'push-to-talk': false,
		'push-to-talk-delay': 0,
		hotkeys: {},
		deinterlace_mode: 0,
		deinterlace_field_order: 0,
		monitoring_type: 0,
		private_settings: {},
		...extra,
	};
}

function element(src, id, verrouille) {
	return {
		name: src.name,
		source_uuid: src.uuid,
		visible: true,
		locked: verrouille,
		rot: 0.0,
		pos: { x: 0.0, y: 0.0 },
		scale: { x: 1.0, y: 1.0 },
		align: 5,
		bounds_type: 0,
		bounds_align: 0,
		bounds_crop: false,
		bounds: { x: 0.0, y: 0.0 },
		crop_left: 0,
		crop_top: 0,
		crop_right: 0,
		crop_bottom: 0,
		id,
		group_item_backup: false,
		scale_filter: 'disable',          // 1:1, pas de filtre sur les aplats
		blend_method: 'default',
		blend_type: 'normal',
		show_transition: { duration: 0 },
		hide_transition: { duration: 0 },
		private_settings: {},
	};
}

// OBS range les couleurs en ABGR.
function abgr(rgb) {
	const r = (rgb >> 16) & 0xff, g = (rgb >> 8) & 0xff, b = rgb & 0xff;
	return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}

const fondCle = source('Fond clé #CC00CC', 'color_source', 'color_source_v3', {
	color: abgr(CLE),
	width: LARGEUR,
	height: HAUTEUR,
});

const sources = [fondCle];

for (const scene of scenes) {
	const items = [element(fondCle, 1, true)];
	if (scene.page) {
		const page = source(`Page · ${scene.nom}`, 'browser_source', 'browser_source', {
			url: scene.page,
			width: LARGEUR,
			height: HAUTEUR,
			fps_custom: false,
			// Les pages posent elles-mêmes leur fond (clé ou transparent) :
			// on retire juste les marges, sans imposer de fond.
			css: 'body { margin: 0; overflow: hidden; }',
			// Une page cachée est arrêtée, et rechargée quand sa scène revient :
			// pas dix connexions WebSocket ouvertes pour rien, et la régie,
			// sans état, se recale sur l'heure au rechargement.
			shutdown: true,
			restart_when_active: false,
			reroute_audio: !!scene.son,
		}, scene.son ? {
			mixers: 0xff,
			// Le générique : dans le mix d'OBS et sur le HDMI vers l'ATEM.
			monitoring_type: 2,
			hotkeys: { 'ObsBrowser.Refresh': [] },
		} : { hotkeys: { 'ObsBrowser.Refresh': [] } });
		sources.push(page);
		items.push(element(page, 2, false));
	}
	sources.push(source(scene.nom, 'scene', 'scene', {
		custom_size: false,
		id_counter: items.length,
		items,
	}, { hotkeys: { 'OBSBasic.SelectScene': [] } }));
}

// Test son : le vrai générique, lu par OBS et non par la page, sur le même
// chemin que celui de la régie (écoute vers le HDMI de l'ATEM). À passer au
// programme avant l'antenne : l'ATEM doit l'entendre, ses vumètres bouger.
const GENERIQUE = path.resolve(__dirname, '../canoe-wslive/ws_live/canoe/video/generique.mp4');
const testSon = source('Générique (test son)', 'ffmpeg_source', 'ffmpeg_source', {
	is_local_file: true,
	local_file: GENERIQUE,
	looping: false,
	restart_on_activate: true,       // repart du début à chaque passage
	close_when_inactive: true,       // et se tait dès qu'on quitte la scène
	clear_on_media_end: false,
}, { mixers: 0xff, monitoring_type: 2 });
sources.push(testSon);
scenes.push({ nom: 'Test son · générique' });
sources.push(source('Test son · générique', 'scene', 'scene', {
	custom_size: false,
	id_counter: 2,
	items: [element(fondCle, 1, true), element(testSon, 2, false)],
}, { hotkeys: { 'OBSBasic.SelectScene': [] } }));
if (!fs.existsSync(GENERIQUE))
	console.warn(`⚠︎ ${GENERIQUE} manque : la scène « Test son » et la régie n'auront pas de générique`);

// Sponsors : la vidéo des partenaires en boucle, plein cadre et opaque (rien
// n'y est découpé), avec son son sur le même chemin que le générique.
const SPONSORS = path.resolve(env.SPONSORS || path.join(__dirname, '../sponsors/Sponsor.mp4'));
const sponsors = source('Vidéo sponsors', 'ffmpeg_source', 'ffmpeg_source', {
	is_local_file: true,
	local_file: SPONSORS,
	looping: true,
	restart_on_activate: true,       // repart du début à chaque passage
	close_when_inactive: true,       // fichier fermé, son coupé hors de la scène
	clear_on_media_end: false,
	hw_decode: true,
}, { mixers: 0xff, monitoring_type: 2 });
sources.push(sponsors);
// rangée juste après « Caméras seules », avec les scènes d'antenne
scenes.splice(scenes.findIndex(s => s.nom === 'Caméras seules') + 1, 0, { nom: 'Sponsors · boucle' });
sources.push(source('Sponsors · boucle', 'scene', 'scene', {
	custom_size: false,
	id_counter: 2,
	items: [element(fondCle, 1, true), element(sponsors, 2, false)],
}, { hotkeys: { 'OBSBasic.SelectScene': [] } }));

// Sponsors avec le temps avant la prochaine session : la même vidéo, et
// par-dessus tv_prochaine.html (fond transparent), qui trouve seule la
// prochaine demi-journée et compte à rebours. Pour les pauses entre deux
// sessions. La page est arrêtée hors de la scène, et repart à l'heure.
const timer = source('Page · Sponsors · boucle avec Timer', 'browser_source', 'browser_source', {
	url: `${base}/tv_prochaine.html`,
	width: LARGEUR,
	height: HAUTEUR,
	fps_custom: false,
	css: 'body { margin: 0; overflow: hidden; }',
	shutdown: true,
	restart_when_active: false,
	reroute_audio: false,
}, { hotkeys: { 'ObsBrowser.Refresh': [] } });
sources.push(timer);
scenes.splice(scenes.findIndex(s => s.nom === 'Sponsors · boucle') + 1, 0, { nom: 'Sponsors · boucle avec Timer' });
sources.push(source('Sponsors · boucle avec Timer', 'scene', 'scene', {
	custom_size: false,
	id_counter: 3,
	items: [element(fondCle, 1, true), element(sponsors, 2, false), element(timer, 3, false)],
}, { hotkeys: { 'OBSBasic.SelectScene': [] } }));
if (!fs.existsSync(SPONSORS))
	console.warn(`⚠︎ ${SPONSORS} manque : les scènes « Sponsors » resteront magenta (caméras seules)`);

// Écran derrière le podium : le palmarès plein écran (tv_palmares.html), une
// page opaque pour un écran public, à sortir par un projecteur de scène vers
// cet écran. Pas de fond de clé : rien n'y est découpé, et une page vide doit
// donner du noir, pas du magenta, devant le public.
//
// Une scène par catégorie de la demi-journée PODIUM (un scénario de
// regie_scenarios.js, samedi-matin par défaut), lue dans le fichier même de la
// régie : les codes suivent le programme. Plus l'attente de la remise des prix
// et la rotation sur toutes les catégories courues.
const PODIUM_SCENARIO = env.PODIUM || 'samedi-matin';
const PODIUM_HEURE = env.PODIUM_HEURE || '';        // ex. 16:30 : compte à rebours de l'attente
function scenariosRegie() {
	const vm = require('vm');
	const src = fs.readFileSync(path.resolve(__dirname, '../canoe-wslive/ws_live/canoe/js/regie_scenarios.js'), 'utf8');
	const ctx = {};
	vm.runInNewContext(`${src}\nthis.S = REGIE_SCENARIOS;`, ctx);
	return ctx.S;
}
const scPodium = scenariosRegie()[PODIUM_SCENARIO];
if (!scPodium)
	throw new Error(`PODIUM=${PODIUM_SCENARIO} : scénario inconnu dans regie_scenarios.js`);
const PODIUM = [
	['Écran podium · attente', `${base}/tv_podium_attente.html?scenario=${PODIUM_SCENARIO}&${ws}${PODIUM_HEURE ? `&heure=${PODIUM_HEURE}` : ''}`],
	...scPodium.categories
		.filter(c => c.vue !== 'kcross')
		.map(c => [`Écran podium · ${c.libelle}`, `${base}/tv_palmares.html?epreuve=${encodeURIComponent(c.epreuve)}&${ws}`]),
	['Écran podium · rotation', `${base}/tv_palmares.html?sans_inv&duree=20&${ws}`],
	// À la main : catégorie et révélation 3e, 2e, 1er depuis tv_podium_pilote.html.
	['Écran podium · piloté', `${base}/tv_palmares.html?pilote=1&${ws}`],
	// Sans competFFCK : le palmarès vient de ws_live/canoe/podium/podium.json, édité à la main.
	['Écran podium · fichier, piloté', `${base}/tv_palmares.html?fichier&pilote=1`],
	['Écran podium · fichier, rotation', `${base}/tv_palmares.html?fichier&sans_inv&duree=20`],
];
for (const [nom, url] of PODIUM) {
	const page = source(`Page · ${nom}`, 'browser_source', 'browser_source', {
		url,
		width: LARGEUR,
		height: HAUTEUR,
		fps_custom: false,
		css: 'body { margin: 0; overflow: hidden; }',
		shutdown: true,
		restart_when_active: false,
		reroute_audio: false,
	}, { hotkeys: { 'ObsBrowser.Refresh': [] } });
	sources.push(page);
	scenes.splice(scenes.findIndex(s => s.nom.startsWith('Manuel')), 0, { nom });
	sources.push(source(nom, 'scene', 'scene', {
		custom_size: false,
		id_counter: 1,
		items: [element(page, 1, false)],
	}, { hotkeys: { 'OBSBasic.SelectScene': [] } }));
}

// La transition : le rideau de la régie (bandes obliques, logos), rendu en
// vidéo transparente par rideau/rideau.sh. La scène change à 600 ms, au
// milieu du passage, quand la bande marine couvre tout l'écran (400 → 840 ms).
const RIDEAU_NOM = 'Rideau';
const RIDEAU = path.resolve(__dirname, 'rideau/rideau.webm');
const transitions = [];
if (fs.existsSync(RIDEAU)) {
	transitions.push({
		name: RIDEAU_NOM,
		id: 'obs_stinger_transition',
		settings: {
			path: RIDEAU,
			tp_type: 0,                  // point de bascule en temps
			transition_point: 600,       // ms
			hw_decode: false,            // le décodeur matériel perdrait l'alpha du VP9
			preload: true,
			audio_monitoring: 0,
			audio_fade_style: 0,
		},
	});
} else {
	console.warn(`⚠︎ ${RIDEAU} manque (rideau/rideau.sh) : coupe sèche entre les scènes`);
}

const premiere = scenes.find(s => s.nom === 'Caméras seules').nom;

const collection = {
	name: NOM,
	current_scene: premiere,
	current_program_scene: premiere,
	scene_order: scenes.map(s => ({ name: s.nom })),
	sources,
	groups: [],
	quick_transitions: [],
	transitions,
	// Le rideau à chaque changement de scène ; jamais de fondu, qui sur une
	// image découpée par chroma montrerait du rose.
	current_transition: transitions.length ? RIDEAU_NOM : 'Coupure',
	transition_duration: 300,
	saved_projectors: [],
	preview_locked: false,
	scaling_enabled: false,
	scaling_level: 0,
	scaling_off_x: 0.0,
	scaling_off_y: 0.0,
	modules: {},
};

/* ------------------------------------------------------------------ */
/* Le profil                                                           */
/* ------------------------------------------------------------------ */

const profil = `[General]
Name=${NOM}

[Video]
BaseCX=${LARGEUR}
BaseCY=${HAUTEUR}
OutputCX=${LARGEUR}
OutputCY=${HAUTEUR}
FPSType=1
FPSInt=${FPS}
ScaleType=bicubic
ColorFormat=NV12
ColorSpace=709
ColorRange=Partial

[Audio]
SampleRate=48000
ChannelSetup=Stereo
MonitoringDeviceId=${SON_ID}
MonitoringDeviceName=${SON_NOM}

[Output]
Mode=Simple
FilenameFormatting=%CCYY-%MM-%DD %hh-%mm-%ss
Reconnect=true

[SimpleOutput]
FilePath=${ENREGISTREMENTS}
RecFormat2=mkv
RecQuality=Small
RecEncoder=apple_h264
StreamEncoder=apple_h264
VBitrate=8000
ABitrate=192
RecRB=false
`;

/* ------------------------------------------------------------------ */

const i = process.argv.indexOf('--sortie');
const sortie = i > 0 ? process.argv[i + 1] : 'build';

fs.mkdirSync(path.join(sortie, 'scenes'), { recursive: true });
fs.mkdirSync(path.join(sortie, 'profiles', DOSSIER_PROFIL), { recursive: true });
fs.writeFileSync(path.join(sortie, 'scenes', FICHIER_SCENES), JSON.stringify(collection, null, '\t') + '\n');
fs.writeFileSync(path.join(sortie, 'profiles', DOSSIER_PROFIL, 'basic.ini'), profil);

console.log(`✓ ${scenes.length} scènes, ${FPS} i/s, competFFCK ${SERVEUR}:8080, pages sur localhost:${PORT}`);
