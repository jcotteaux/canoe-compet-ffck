/*
 * Au départ : le palmarès du prochain partant.
 *
 * Entre deux bateaux d'une finale, la caméra est sur le départ : on y montre
 * qui va partir et ce qu'il a déjà gagné. La carte entre `avant` secondes
 * avant l'heure de départ du prochain partant et sort `coupe` secondes avant,
 * quand il s'élance : à l'antenne, on ne doit plus voir que lui. Tant qu'un
 * bateau est en course (flux <on_course> de moins de 3 s), pas de carte : la
 * réalisation suit le bateau, pas le départ. Il arrive : la carte du suivant
 * entre `apres` s plus tard, jusqu'à `plafond` s de son départ.
 *
 * Prochain partant : celui qui n'a ni résultat ni chrono en cours et dont
 * l'heure de départ est la plus proche, d'après le classement de competFFCK
 * (Heure_depart) et son horloge (flux <on_course>, champ clock). Sans horloge
 * de competFFCK (rivière vide depuis le lancement), l'heure du poste.
 *
 * Palmarès : palmares/palmares_slalom.json (tools/palmares_build.py), relu
 * toutes les 30 s ; le bateau y est retrouvé par son nom (Bateau de
 * competFFCK, « NOM Prénom »), accents et casse ignorés. Les lignes : les
 * titres, les compteurs Coupe du monde, puis le rang mondial de la catégorie
 * courue (K1, C1) et du kayak-cross. Sans palmarès, la carte montre le
 * bateau seul.
 *
 * Paramètres d'URL :
 *   avant=60        la carte entre tant de s avant le départ
 *   coupe=5         et sort tant de s avant
 *   apres=5         après l'arrivée du bateau précédent, la carte entre tant de s plus tard
 *   plafond=150     ... si le départ du suivant est à moins de tant de s
 *   max=5           lignes de palmarès au plus
 *   epreuve=K1H     seulement cette épreuve
 *   fichier=...     autre fichier de palmarès (chemin relatif à la page)
 *   bg=1            fond couleur de clé (sinon transparent)
 *   apercu=NOM Prénom&cat=K1H   montre la carte de ce bateau en continu,
 *                   sans competFFCK (page de vérification)
 *   anim=0          sans animation
 */

const wsMain = new ws.Context(wsParams.url, wsParams.port);

const CLASSE = { K1H : 'MK1', K1D : 'WK1', C1H : 'MC1', C1D : 'WC1' };
const CROSS = { K1H : ['MX1', 'MX1I'], K1D : ['WX1', 'WX1I'], C1H : ['MX1', 'MX1I'], C1D : ['WX1', 'WX1I'] };

/** « DELASSUS Anatole » -> « delassusanatole » : accents, casse, tirets et espaces ignorés. */
function Cle(nom)
{
	return String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

/******************** palmarès ********************/

function LirePalmares()
{
	fetch(wsMain.fichier + '?t=' + Date.now(), { cache : 'no-store' })
		.then(function(r) { if (!r.ok) throw new Error(wsMain.fichier + ' : HTTP ' + r.status); return r.json(); })
		.then(function(doc) {
			const parNom = new Map();
			(doc.athletes || []).forEach(function(a) { parNom.set(Cle(a.nom), a); });
			wsMain.palmares = parNom;
			Rafraichir();
		})
		.catch(function(e) { console.warn('palmarès illisible, version précédente gardée :', e.message); });
}

/** Les lignes d'un bateau dans une épreuve : titres, compteurs, rangs mondiaux. */
function Lignes(athlete, epreuve)
{
	if (!athlete)
		return [];

	// Rangs mondiaux : celui de la catégorie courue, et le meilleur des deux
	// kayak-cross (le cross individuel répète souvent le cross).
	const rangs = athlete.rangs || {};
	const lignesRang = [];
	if (rangs[CLASSE[epreuve]])
		lignesRang.push(rangs[CLASSE[epreuve]].ligne);
	let cross = null;
	(CROSS[epreuve] || []).forEach(function(c) {
		if (rangs[c] && (!cross || rangs[c].rang < cross.rang))
			cross = rangs[c];
	});
	if (cross)
		lignesRang.push(cross.ligne);

	// Les titres d'abord, en laissant la place aux rangs ; le compteur Coupe du
	// monde et Mondiaux seulement quand aucun titre n'est connu.
	const palm = athlete.palmares || [];
	// Une ligne « à vérifier » (identité ou fait douteux) ne passe pas à l'antenne.
	const titres = palm.filter(function(p) { return p.type !== 'compteur' && !p.a_verifier; }).map(function(p) { return p.ligne; });
	const compteurs = titres.length ? [] : palm.filter(function(p) { return p.type === 'compteur'; }).map(function(p) { return p.ligne; });
	const rangsGardes = lignesRang.slice(0, wsMain.max);
	return titres.concat(compteurs).slice(0, wsMain.max - rangsGardes.length).concat(rangsGardes);
}

/******************** competFFCK ********************/

function OnOpenWebSocketCommand()
{
	wsMain.websocket.send(JSON.stringify({ key : '<race_load>', key_race : '*' }));
}

function OnCommandRaceLoad(objJSON)
{
	canoe.SetRace(objJSON);
	wsMain.websocket.send(JSON.stringify({ key : '<epreuve_load>', epreuve : '' }));
}

function OnCommandEpreuveLoad(objJSON)
{
	canoe.SetRanking(objJSON);
	canoe.SetColumnNameRanking(canoe.GetTableRanking());
	wsMain.charge = true;
	Rafraichir();
}

/** Redemande le classement, groupé : une arrivée envoie plusieurs trames coup sur coup. */
function ReloadEpreuve()
{
	if (wsMain.reloadTimer !== null)
		return;
	wsMain.reloadTimer = setTimeout(function() {
		wsMain.reloadTimer = null;
		if (wsMain.websocket && wsMain.websocket.readyState === WebSocket.OPEN)
			wsMain.websocket.send(JSON.stringify({ key : '<epreuve_load>', epreuve : '' }));
	}, 400);
}

function OnFlowOnCourse(objJSON)
{
	const t = adv.GetTableUnique(objJSON, 'table');
	const surLeau = new Set();
	for (let i = 0; i < t.GetNbRows(); i++)
		surLeau.add(String(t.GetCell('bib', i)));
	if (surLeau.size > 0)
		wsMain.videDepuis = 0;
	else if (wsMain.surLeau.size > 0 || !wsMain.videDepuis)
		wsMain.videDepuis = wsMain.surLeau.size > 0 ? Date.now() : (wsMain.videDepuis || -1);
	wsMain.surLeau = surLeau;
	wsMain.surLeauRecu = Date.now();

	const clock = adv.toNumber(objJSON.clock);
	if (clock !== null && clock > 0)
	{
		wsMain.clock = clock;
		wsMain.clockRecu = Date.now();
	}
}

/** Heure de competFFCK (ms depuis minuit), tenue à jour entre deux trames ; sinon celle du poste. */
function Maintenant()
{
	if (wsMain.clock > 0 && Date.now() - wsMain.clockRecu < 15000)
		return wsMain.clock + (Date.now() - wsMain.clockRecu);
	const d = new Date();
	return ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds();
}

/** Le prochain partant : sans résultat, pas sur l'eau, l'heure de départ la plus proche à venir. */
function ProchainPartant(maintenant)
{
	if (!wsMain.charge)
		return null;
	const tRanking = canoe.GetTableRanking();
	const phase = canoe.GetCodeCoursePhase();
	let best = null;

	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		if (String(tRanking.GetCell('Tps' + phase, row)) !== '')
			continue;
		const bib = String(tRanking.GetCell('Dossard', row));
		if (wsMain.surLeau.has(bib))
			continue;
		const epreuve = String(tRanking.GetCell('Code_categorie', row));
		if (wsMain.epreuve && epreuve !== wsMain.epreuve)
			continue;
		const heure = tRanking.GetCellInt('Heure_depart' + phase, row, 0);
		if (!(heure > 0) || heure < maintenant - 1000)
			continue;
		if (!best || heure < best.heure)
			best = { bib : bib, heure : heure, nom : tRanking.GetCell('Bateau', row), club : tRanking.GetCell('Club', row), epreuve : epreuve };
	}
	return best;
}

/******************** rendu ********************/

function Remplir(b)
{
	const athlete = wsMain.palmares.get(Cle(b.nom)) || null;
	const lignes = Lignes(athlete, b.epreuve);
	const cle = [b.bib, b.nom, b.epreuve, lignes.join('|')].join('#');
	if (wsMain.carteCle === cle)
		return;
	wsMain.carteCle = cle;

	document.getElementById('c_dossard').textContent = b.bib || '';
	document.getElementById('c_nom').textContent = b.nom;
	document.getElementById('c_club_nom').textContent = b.club || (athlete ? athlete.club : '');
	const cat = typeof Categorie_name === 'function' ? Categorie_name(b.epreuve) : '';
	document.getElementById('c_cat').textContent = b.epreuve || '';
	document.getElementById('c_cat').title = cat || '';

	const ul = document.getElementById('c_palmares');
	ul.innerHTML = '';
	lignes.forEach(function(l) {
		const li = document.createElement('li');
		li.textContent = l;
		ul.appendChild(li);
	});
	document.getElementById('carte').classList.toggle('sans-palmares', lignes.length === 0);
}

function Montrer(oui)
{
	const carte = document.getElementById('carte');
	if (carte.classList.contains('visible') !== oui)
		carte.classList.toggle('visible', oui);
}

function Rafraichir()
{
	if (wsMain.apercu)
	{
		const a = wsMain.palmares.get(Cle(wsMain.apercu));
		Remplir({ bib : '', nom : a ? a.nom : wsMain.apercu, club : a ? a.club : '', epreuve : wsMain.apercuCat });
		document.getElementById('c_rebours_val').textContent = '0:42';
		Montrer(true);
		return;
	}

	// Un bateau en course : l'antenne est à lui. Flux sans nouvelle depuis 3 s : rivière vide.
	if (wsMain.surLeau.size > 0 && Date.now() - wsMain.surLeauRecu < 3000)
	{
		Montrer(false);
		return;
	}
	// Depuis quand la rivière est vide : arrivée vue (ms), ou -1 (aucun bateau vu, ou flux muet).
	let vide = wsMain.surLeau.size > 0 ? wsMain.surLeauRecu + 3000 : wsMain.videDepuis;
	if (!(vide > 0))
		vide = -1;

	const maintenant = Maintenant();
	const b = ProchainPartant(maintenant);
	if (!b)
	{
		Montrer(false);
		return;
	}
	const reste = (b.heure - maintenant) / 1000;
	// Entrée `apres` s après l'arrivée du précédent (départ à moins de `plafond` s),
	// sinon à `avant` s du départ ; sortie à `coupe` s du départ.
	const entree = vide > 0
		? (Date.now() - vide >= wsMain.apres * 1000 && reste <= Math.max(wsMain.plafond, wsMain.avant))
		: reste <= wsMain.avant;
	if (!entree || reste <= wsMain.coupe)
	{
		Montrer(false);
		return;
	}
	Remplir(b);
	const s = Math.ceil(reste);
	document.getElementById('c_rebours_val').textContent = Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
	Montrer(true);
}

/******************** initialisation ********************/

function Init()
{
	const urlParams = new URLSearchParams(window.location.search);
	const num = function(key, def) {
		const v = parseFloat(urlParams.get(key));
		return isNaN(v) ? def : v;
	};

	wsMain.avant = num('avant', 60);
	wsMain.coupe = num('coupe', 5);
	wsMain.apres = num('apres', 5);
	wsMain.plafond = num('plafond', 150);
	wsMain.max = Math.max(1, num('max', 5));
	wsMain.epreuve = urlParams.get('epreuve') || '';
	const fichier = urlParams.get('fichier') || 'palmares/palmares_slalom.json';
	wsMain.fichier = /^[\w\/.-]+\.json$/.test(fichier) && fichier.indexOf('..') < 0 ? fichier : 'palmares/palmares_slalom.json';
	wsMain.apercu = urlParams.get('apercu') || '';
	wsMain.apercuCat = urlParams.get('cat') || '';
	wsMain.palmares = new Map();
	wsMain.surLeau = new Set();
	wsMain.surLeauRecu = 0;
	wsMain.videDepuis = 0;
	wsMain.clock = 0;
	wsMain.clockRecu = 0;
	wsMain.charge = false;
	wsMain.carteCle = '';
	wsMain.reloadTimer = null;

	if (urlParams.get('bg') === '1')
		document.body.classList.add('chroma');
	if (urlParams.get('anim') === '0')
		document.body.classList.add('no-anim');

	Redimensionner();
	window.addEventListener('resize', Redimensionner);

	LirePalmares();
	setInterval(LirePalmares, 30000);
	setInterval(Rafraichir, 250);

	if (wsMain.apercu)
		return;			// aperçu : pas de competFFCK

	wsMain.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsMain.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.mapCommand.set('<on_course>', OnFlowOnCourse);
	wsMain.mapCommand.set('<bib_time>', function() { ReloadEpreuve(); });
	wsMain.mapCommand.set('<mode_chrono>', function() { ReloadEpreuve(); });
	wsMain.mapCommand.set('<run_erase>', function() { ReloadEpreuve(); });
	wsMain.mapCommand.set('<penalty_add>', function() {});
	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
	// Les heures de départ peuvent changer (décalage, forfait) : on relit de temps en temps.
	setInterval(ReloadEpreuve, 20000);
}

/** Scène 1920x1080 mise à l'échelle d'un bloc. */
function Redimensionner()
{
	const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
	document.documentElement.style.setProperty('--scale', k);
}
