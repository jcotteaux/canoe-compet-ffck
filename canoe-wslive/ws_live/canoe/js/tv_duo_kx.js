/*
 * Habillage plein écran autour de deux vidéos de la rivière.
 *
 * La page est opaque, sauf deux fenêtres laissées vides pour les caméras :
 * transparentes dans OBS, ou remplies de la couleur de clé avec ?bg=1 quand
 * c'est l'ATEM qui incruste. Autour :
 *   - en haut à droite, le classement de l'épreuve en cours : les `fixes`
 *     premiers restent en haut, la suite défile en continu (comme tv_results) ;
 *   - en bas à gauche, les bateaux en course : dossard, nom, pénalités porte
 *     par porte, chrono tournant ; à l'arrivée, temps et place.
 *
 * Épreuve affichée
 *   Celle des bateaux sur l'eau. Rivière vide : celle que porte le flux
 *   <on_course>, à défaut la dernière épreuve courue. ?epreuve= la fige.
 *
 * Cartes des bateaux en course
 *   Une pile de hauteur fixe (`max_course` lignes, 3 par défaut) montrant les
 *   derniers partis dans l'ordre des départs : le premier en haut, un nouveau
 *   partant entre par le bas. Un arrivant garde sa ligne `delay_finish` ms
 *   avec son temps et sa place, puis s'en va vers le haut, et les cartes du
 *   dessous remontent d'une ligne en glissant.
 *
 * Prochains départs
 *   Les lignes libres de la pile, sous les bateaux en course, montrent les
 *   prochains partants (ni chrono ni résultat), dans l'ordre des heures de
 *   départ, avec le compte à rebours quand l'horloge de competFFCK est connue.
 *   Quand l'un part, sa ligne devient sa carte, sur place.
 *
 * Source des données :
 *   <race_load>    nom de la compétition, lieu
 *   <epreuve_load> le classement complet : identités, pénalités, places
 *   <on_course>    les bateaux sur l'eau et leur chrono, ~10 Hz
 *   <bib_time>     intermédiaires et arrivées
 *   <penalty_add>  les pénalités porte par porte
 *   <run_erase>    la manche est refaite
 *
 * Paramètres d'URL :
 *   v1=0,0,960,540       fenêtre vidéo 1 : x,y,largeur,hauteur en pixels 1080p
 *   v2=960,540,960,540   fenêtre vidéo 2
 *                        Par défaut, la macro « Duo » de canoe-atem : deux
 *                        fenêtres SuperSource de taille 0,50 centrées en
 *                        (-8,00 ; +4,50) et (+8,00 ; -4,50), soit les quarts
 *                        haut gauche et bas droit, sans recadrage.
 *   bg=1                 fenêtres remplies de la couleur de clé (ATEM)
 *   epreuve=K1H          fige l'épreuve du classement
 *   max=8 fixes=3        lignes du classement, dont figées en haut
 *   vitesse=40           défilement de la suite du classement, en px/s
 *   pause=4000           arrêt en haut et en bas de la suite, en ms
 *   max_course=3         nombre de lignes de la pile des bateaux en course (1 à 3) :
 *                        les derniers partis, hauteur fixe
 *   delay_inter=6000     mise en valeur d'un intermédiaire qui vient de tomber
 *   prochains=3          nombre maximal de prochains partants dans les lignes
 *                        libres de la pile (0 = aucun)
 *   retard=0             en plus de la règle du bateau doublé, saute un partant
 *                        pas parti N minutes après son heure ; 0 (défaut) = non
 *   delay_finish=8000    maintien d'un arrivant en ms
 *   (pas de time_pena : en kayak-cross, une pénalité ne s'ajoute pas au temps)
 *   titre=... lieu=...   remplacent ceux de competFFCK
 *   no_logo              masque le logo du club
 *   no_ffck              masque le logo FFCK
 *   no_partenaire        masque le partenaire technique
 *   length_identity=24   longueur max des noms
 *   fmt=XSCC             format du chrono
 *   anim=0               désactive les animations
 */

const wsMain = new ws.Context(wsParams.url, wsParams.port);

function OnOpenWebSocketCommand()
{
	wsMain.websocket.send(JSON.stringify({ key : '<race_load>', key_race : '*' }));
}

function OnCommandRaceLoad(objJSON)
{
	canoe.SetRace(objJSON);
	canoe.SetFmtChrono(wsMain.fmtChrono);

	SetEnTete();

	wsMain.websocket.send(JSON.stringify({ key : '<epreuve_load>', epreuve : '' }));
}

function OnCommandEpreuveLoad(objJSON)
{
	canoe.SetRanking(objJSON);
	canoe.SetColumnNameRanking(canoe.GetTableRanking());

	SetEnTete();
	RefreshFinished();

	const avant = wsMain.epreuve;
	wsMain.epreuve = ChoisirEpreuve();
	Render(avant !== wsMain.epreuve);
	RenderCourse();
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
	const tOnCourse = adv.GetTableUnique(objJSON, 'table');
	const rows = [];

	for (let i = 0; i < tOnCourse.GetNbRows(); i++)
	{
		rows.push({
			bib : String(tOnCourse.GetCell('bib', i)),
			time : tOnCourse.GetCellInt('time', i, 0),
		});
	}

	if (typeof objJSON.epreuve === 'string')
		wsMain.epreuveChrono = objJSON.epreuve;

	// Heure de competFFCK, en ms depuis minuit : sert au compte à rebours.
	const clock = adv.toNumber(objJSON.clock);
	if (clock !== null && clock > 0)
		wsMain.clock = clock;

	wsMain.onCourse = rows;
	RenderCourse();

	// L'épreuve suit les bateaux sur l'eau : on ne redessine le classement
	// que sur un changement, pas à chaque trame.
	const epreuve = ChoisirEpreuve();
	if (epreuve !== wsMain.epreuve)
	{
		wsMain.epreuve = epreuve;
		Render(true);
	}
}

function OnBroadcastBibTime(objJSON)
{
	const bib = String(objJSON.bib);
	const passage = parseInt(objJSON.passage);

	if (passage >= 1)
	{
		// Intermédiaire : il reste sur la carte jusqu'à l'arrivée, mis en
		// valeur quelques secondes quand il vient de tomber.
		let inters = wsMain.inters.get(bib);
		if (inters === undefined)
		{
			inters = {};
			wsMain.inters.set(bib, inters);
		}

		inters[passage] = {
			at : Date.now(),
			time : adv.toNumber(objJSON.time_chrono),
			diff : objJSON.diff_categ !== undefined ? adv.toNumber(objJSON.diff_categ) : null,
		};

		window.setTimeout(RenderCourse, wsMain.delayInter + 50);
		RenderCourse();

		// Les temps des autres bateaux à cet intermédiaire servent à calculer
		// l'écart quand competFFCK ne l'envoie pas.
		ReloadEpreuve();
		return;
	}

	// Arrivée : la carte reste, chrono arrêté, le temps du serveur en attendant
	// le classement à jour qui apportera pénalités et place. Les
	// intermédiaires restent affichés à côté du temps final.
	wsMain.finished.set(bib, {
		at : Date.now(),
		time : adv.toNumber(objJSON.time_chrono),
		rank : 0,
		final : false,
	});
	wsMain.onCourse = wsMain.onCourse.filter(function(r) { return r.bib !== bib; });

	window.setTimeout(RenderCourse, wsMain.delayFinish + 50);
	RenderCourse();

	if (wsMain.vedetteDuree > 0)
		wsMain.bibArrive = bib;

	ReloadEpreuve();
}

function OnBroadcastPenaltyAdd(objJSON)
{
	// Affichée tout de suite sur la carte, sans attendre le classement.
	const tRanking = canoe.GetTableRanking();
	const row = (typeof tRanking === 'object' && tRanking !== null)
		? canoe.GetRankingBibIndex(tRanking, parseInt(objJSON.bib)) : -1;
	if (row >= 0 && parseInt(objJSON.gate) >= 1)
		tRanking.SetCell('Pena_' + parseInt(objJSON.gate), row, String(objJSON.penalty));

	RenderCourse();
	ReloadEpreuve();
}

function OnBroadcastRunErase(objJSON)
{
	wsMain.onCourse = [];
	wsMain.finished.clear();
	wsMain.inters.clear();
	wsMain.affiches = [];
	RemonterPiste();
	RenderCourse();
	ReloadEpreuve();
}

/******************** choix de l'épreuve ********************/

/** L'épreuve du classement : figée, sinon celle des bateaux affichés, sinon la dernière courue. */
function ChoisirEpreuve()
{
	if (wsMain.epreuveForcee !== '')
		return wsMain.epreuveForcee;

	for (const bib of wsMain.affiches)
	{
		const racer = bib !== null ? GetRacer(bib) : null;
		if (racer !== null && racer.epreuve !== '')
			return racer.epreuve;
	}

	for (const r of wsMain.onCourse)
	{
		const racer = GetRacer(r.bib);
		if (racer !== null && racer.epreuve !== '')
			return racer.epreuve;
	}

	if (wsMain.epreuveChrono !== '')
		return wsMain.epreuveChrono;

	// Rivière vide et flux muet : la dernière épreuve qui a un classé, à
	// défaut celle du prochain partant (avant le premier départ du jour).
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking !== 'object' || tRanking === null)
		return wsMain.epreuve;

	const course_phase = canoe.GetCodeCoursePhase();
	let derniere = wsMain.epreuve;
	let derniere_h = -1;

	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		if (tRanking.GetCellInt('Tps' + course_phase, row, adv.chrono.KO) < adv.chrono.OK)
			continue;

		const heure = tRanking.GetCellInt('Heure_depart' + course_phase, row, 0);
		if (heure > derniere_h)
		{
			derniere_h = heure;
			derniere = tRanking.GetCell('Code_categorie', row);
		}
	}

	if (derniere === '')
	{
		const prochains = GetProchains();
		if (prochains.length > 0)
			derniere = prochains[0].epreuve;
	}

	return derniere;
}

/******************** lecture du classement ********************/

function GetFmt()
{
	return wsMain.fmtChrono ? wsMain.fmtChrono : canoe.GetFmtChrono();
}

/**
 * Pénalités en kayak-cross : pas des secondes, une liste de pénalités porte
 * par porte, affichées côte à côte (pas de cumul). Total_pena n'est pas un
 * cumul ici : canoe.UpdateExsTotalPena y range une clé de tri (puissances de 2
 * par porte, 2^30 sans chrono), à ne jamais afficher. Une pénalité ne s'ajoute
 * pas au temps : elle classe derrière les bateaux sans pénalité (Cltc).
 *
 * Contre-la-montre : un RAL (« 50 ») s'affiche FLT, comme un « 2 ».
 */
function CodePena(v)
{
	return v === '2' || v === '50' ? 'FLT' : '';
}

function GetPena(tRanking, row)
{
	const liste = [];
	for (let p = 1; p <= canoe.GetNbPorte(); p++)
	{
		const code = CodePena(String(tRanking.GetCell('Pena_' + p, row)));
		if (code !== '')
			liste.push({ code : code, porte : p });
	}
	return { nb : liste.length, elim : false, liste : liste };
}

/**
 * Rang du contre-la-montre, calculé ici plutôt que repris de Cltc : le Cltc
 * de canoe.js (UpdateExsTotalPena) compte un RAL 1000 fois plus qu'un FLT ;
 * en contre-la-montre, un RAL compte comme un FLT. Par épreuve, parmi les
 * bateaux qui ont un temps :
 *   1. le moins de FLT ;
 *   2. à nombre égal (au moins une), la première porte fautée la plus tardive
 *      (même départage que canoe.js : 2^(15 - porte), seule la 1re compte) ;
 *   3. le chrono.
 * Égalité parfaite : même rang. Une porte pas encore jugée compte sans faute.
 * Renvoie Map dossard -> rang.
 */
function RangsKx(tRanking)
{
	const course_phase = canoe.GetCodeCoursePhase();
	const parEpreuve = new Map();

	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		if (!AResultat(tRanking, row, course_phase))
			continue;
		const tps = tRanking.GetCellInt('Tps_chrono' + course_phase, row, adv.chrono.KO);
		if (tps < adv.chrono.OK)
			continue;

		let nb = 0;
		let premiere = 0;
		for (let p = 1; p <= canoe.GetNbPorte(); p++)
		{
			if (CodePena(String(tRanking.GetCell('Pena_' + p, row))) === '')
				continue;
			if (nb === 0)
				premiere = p;
			nb++;
		}

		const ep = tRanking.GetCell('Code_categorie', row);
		if (!parEpreuve.has(ep))
			parEpreuve.set(ep, []);
		parEpreuve.get(ep).push({ bib : String(tRanking.GetCell('Dossard', row)), nb : nb, premiere : premiere, tps : tps });
	}

	const rangs = new Map();
	parEpreuve.forEach(function(liste) {
		liste.sort(function(a, b) { return a.nb - b.nb || b.premiere - a.premiere || a.tps - b.tps; });
		liste.forEach(function(e, i) {
			const prec = liste[i - 1];
			const egal = prec && prec.nb === e.nb && prec.premiere === e.premiere && prec.tps === e.tps;
			rangs.set(e.bib, egal ? rangs.get(prec.bib) : i + 1);
		});
	});
	return rangs;
}

/** Les pénalités en pastilles, l'une à côté de l'autre : « FLT 3 » pour la porte 3. */
function PastillesPena(el, pena)
{
	const html = pena.liste.map(function(c) {
		return '<span class="pastille">' + c.code + '<b>' + c.porte + '</b></span>';
	}).join('');
	if (el.innerHTML !== html)
		el.innerHTML = html;
}

/**
 * A un résultat (temps, DNF, DNS, DSQ…) ? En kayak-cross, Tps ne le dit pas :
 * canoe.UpdateExsTotalPena y écrit le chrono pour tous, 0 pour qui n'est pas
 * encore arrivé. Le chrono de competFFCK, lui, reste vide.
 */
function AResultat(tRanking, row, course_phase)
{
	const v = String(tRanking.GetCell('Tps_chrono' + course_phase, row));
	return v !== '' && v !== '0';
}

/** Classes CSS des pénalités : jaune s'il y en a, rouge pour un « 50 ». */
function MarquerPena(el, pena)
{
	el.classList.toggle('chargee', pena.nb > 0 && !pena.elim);
	el.classList.toggle('eliminatoire', pena.elim);
}

/** Identité, épreuve et pénalités d'un dossard. */
function GetRacer(bib)
{
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking !== 'object' || tRanking === null)
		return null;

	const row = canoe.GetRankingBibIndex(tRanking, parseInt(bib));
	if (row < 0)
		return null;

	const course_phase = canoe.GetCodeCoursePhase();
	const gates = [];
	for (let p = 1; p <= canoe.GetNbPorte(); p++)
		gates.push(String(tRanking.GetCell('Pena_' + p, row)));

	return {
		row : row,
		name : tRanking.GetCell('Bateau', row),
		club : tRanking.GetCell('Club', row),
		nation : tRanking.GetCell('Code_nation', row),
		epreuve : tRanking.GetCell('Code_categorie', row),
		pena : GetPena(tRanking, row),
		gates : gates,
	};
}

/** Temps classant et place des arrivants, repris du classement à jour. */
function RefreshFinished()
{
	const tRanking = canoe.GetTableRanking();
	const course_phase = canoe.GetCodeCoursePhase();
	const rangs = RangsKx(tRanking);

	wsMain.finished.forEach(function(f, bib) {
		const row = canoe.GetRankingBibIndex(tRanking, parseInt(bib));
		if (row < 0)
			return;

		const tps = tRanking.GetCellInt('Tps' + course_phase, row, 0);
		if (tps !== 0)
		{
			f.time = tps;
			f.final = true;
		}

		f.rank = rangs.get(String(bib)) || 0;
	});
}

/** Les bateaux de l'épreuve : classés au temps, puis DNF / DNS / DSQ. */
function GetClassement()
{
	const tRanking = canoe.GetTableRanking();
	const course_phase = canoe.GetCodeCoursePhase();
	const classes = [];
	const horsClassement = [];
	const rangs = RangsKx(tRanking);

	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		if (tRanking.GetCell('Code_categorie', row) != wsMain.epreuve)
			continue;

		if (!AResultat(tRanking, row, course_phase))
			continue;

		const tps = tRanking.GetCellInt('Tps' + course_phase, row, adv.chrono.KO);
		const r = {
			bib : String(tRanking.GetCell('Dossard', row)),
			name : tRanking.GetCell('Bateau', row),
			time : tps,
			pena : GetPena(tRanking, row),
		};

		if (tps >= adv.chrono.OK)
		{
			r.rank = rangs.get(r.bib) || 0;
			classes.push(r);
		}
		else
		{
			r.rank = 0;
			horsClassement.push(r);
		}
	}

	// L'ordre de RangsKx (FLT d'abord, puis le temps), pas le seul temps.
	classes.sort(function(a, b) { return (a.rank || 1e9) - (b.rank || 1e9) || a.time - b.time; });

	for (let i = 0; i < classes.length; i++)
	{
		if (classes[i].rank === 0)
			classes[i].rank = i + 1;

		classes[i].diff = i === 0 ? 0 : classes[i].time - classes[0].time;
	}

	horsClassement.sort(function(a, b) { return parseInt(a.bib) - parseInt(b.bib); });

	return classes.concat(horsClassement);
}

/******************** rendu commun ********************/

/** Écart en secondes sous la minute, en minutes au-delà ; séparateur aligné sur celui du temps. */
function FormatEcart(diff, temps)
{
	const txt = adv.GetChronoDiff(diff, Math.abs(diff) >= 60000 ? 'MMSSCC' : 'XSCC');

	if (String(temps).indexOf(',') >= 0)
		return txt.replace('.', ',');

	return txt.replace(',', '.');
}

function TronquerNom(nom)
{
	if (wsMain.lengthIdentity > 0 && nom.length > wsMain.lengthIdentity)
		return nom.substring(0, wsMain.lengthIdentity) + '…';

	return nom;
}

function NomEpreuve(code)
{
	return typeof Categorie_name === 'function' ? Categorie_name(code) : code;
}

function SetEnTete()
{
	const tCompetition = canoe.GetTable('Competition');
	const tCourse = canoe.GetTable('Competition_Course');

	const titre = wsMain.titre !== '' ? wsMain.titre
	            : (tCompetition && tCompetition.GetNbRows() > 0 ? tCompetition.GetCell('Nom', 0) : '');
	const lieu = wsMain.lieu !== '' ? wsMain.lieu
	           : (tCourse && tCourse.GetNbRows() > 0 ? tCourse.GetCell('Libelle', 0) : '');

	// Niveau international : la nation remplace le club sur les cartes.
	wsMain.international = tCompetition && tCompetition.GetNbRows() > 0
		&& tCompetition.GetCell('Code_niveau', 0) === 'INT';

	document.getElementById('titre').textContent = titre;
	document.getElementById('lieu').textContent = lieu;
}

/******************** classement ********************/

function CreerLigne()
{
	const el = document.createElement('div');
	el.className = 'ligne res';
	el.innerHTML =
		'<div class="c_rang"></div>' +
		'<div class="c_dossard"></div>' +
		'<div class="c_nom"></div>' +
		'<div class="c_pena"></div>' +
		'<div class="c_temps"></div>' +
		'<div class="c_ecart"></div>';

	return el;
}

/** Remplit une ligne ; `r` à null donne une ligne de remplissage. */
function SyncLigne(el, r, premier, ouvreLaRotation)
{
	if (r === null)
	{
		el.className = 'ligne res place-vide' + (ouvreLaRotation ? ' ouvre-rotation' : '');
		el.querySelectorAll('div').forEach(function(d) { d.textContent = ''; });
		return;
	}

	const fmt = GetFmt();
	const classe = r.rank > 0;
	const txtTemps = adv.GetChrono(r.time, fmt);

	el.className = 'ligne res'
		+ (classe && r.rank <= 3 ? ' p' + r.rank : '')
		+ (classe ? '' : ' hc')
		+ (r.bib === wsMain.vedette ? ' vedette' : '')
		+ (ouvreLaRotation ? ' ouvre-rotation' : '');

	el.querySelector('.c_rang').textContent = classe ? String(r.rank) : '—';
	el.querySelector('.c_dossard').textContent = r.bib;
	el.querySelector('.c_nom').textContent = TronquerNom(r.name);

	const elPena = el.querySelector('.c_pena');
	PastillesPena(elPena, classe ? r.pena : { liste : [] });
	MarquerPena(elPena, r.pena);

	// Écart au premier, seulement s'il est derrière au temps : un bateau
	// pénalisé peut être plus rapide que le premier et classé après lui.
	el.querySelector('.c_temps').textContent = txtTemps;
	el.querySelector('.c_ecart').textContent = (!classe || r.diff <= 0) ? ''
		: FormatEcart(r.diff, adv.GetChrono(premier.time, fmt));
}

/**
 * Dessine le classement : les `fixes` premiers en haut en permanence, la
 * suite sur une piste qui défile en continu dans une fenêtre de `max - fixes`
 * lignes (voir PasDefilement). `remonter` ramène la piste en haut
 * (changement d'épreuve) : une simple correction ne fait pas sauter au début.
 */
function Render(remonter)
{
	if (remonter)
		RemonterPiste();

	document.getElementById('epreuve_nom').textContent = NomEpreuve(wsMain.epreuve);

	const tout = wsMain.epreuve === '' ? [] : GetClassement();
	document.body.classList.toggle('cl-vide', tout.length === 0);

	const corps = document.getElementById('corps');
	if (tout.length === 0)
	{
		corps.innerHTML = '';
		document.body.classList.remove('pagine');
		return;
	}

	const nbFixes = Math.min(wsMain.fixes, tout.length);
	const tete = tout.slice(0, nbFixes);
	const queue = tout.slice(nbFixes);
	const fenetre = Math.max(1, wsMain.max - nbFixes);

	// Un bateau vient d'arriver : encadré, et la piste va le chercher.
	if (wsMain.bibArrive !== null)
	{
		const cible = queue.findIndex(function(r) { return r.bib === wsMain.bibArrive; });
		if (tout.some(function(r) { return r.bib === wsMain.bibArrive; }))
		{
			wsMain.vedette = wsMain.bibArrive;
			wsMain.vedetteFin = Date.now() + wsMain.vedetteDuree;
			wsMain.def.cible = cible;		// -1 : dans la tête, rien à chercher
			window.setTimeout(function() { Render(false); }, wsMain.vedetteDuree + 50);
		}
		wsMain.bibArrive = null;
	}

	if (wsMain.vedette !== null && Date.now() >= wsMain.vedetteFin)
		wsMain.vedette = null;

	// Structure : la tête figée, un filet, puis la fenêtre et sa piste.
	if (!document.getElementById('piste'))
		corps.innerHTML = '<div id="tete"></div><div id="filet"></div><div id="defile"><div id="piste"></div></div>';

	SyncBloc(document.getElementById('tete'), tete, tout[0]);

	// Une suite plus courte que la fenêtre est complétée de lignes vides.
	const piste = queue.slice();
	if (queue.length > 0)
	{
		while (piste.length < fenetre)
			piste.push(null);
	}
	SyncBloc(document.getElementById('piste'), piste, tout[0]);

	const avecQueue = queue.length > 0;
	document.getElementById('filet').hidden = !(nbFixes > 0 && avecQueue);

	const defile = document.getElementById('defile');
	defile.hidden = !avecQueue;
	defile.style.height = avecQueue ? (fenetre * PAS_LIGNE - 3) + 'px' : '0';

	document.body.classList.toggle('pagine', queue.length > fenetre);
	document.getElementById('pagination').textContent = tout.length + ' bateaux';

	Defiler();
}

/** Met un bloc de lignes à jour sur place : recréer les noeuds les ferait clignoter. */
function SyncBloc(bloc, lignes, premier)
{
	for (let i = 0; i < lignes.length; i++)
	{
		let el = bloc.children[i];
		if (el === undefined)
		{
			el = CreerLigne();
			bloc.appendChild(el);
		}
		SyncLigne(el, lignes[i], premier, false);
	}

	while (bloc.children.length > lignes.length)
		bloc.removeChild(bloc.lastChild);
}

/******************** défilement de la suite ********************/

/*
 * Même mouvement que tv_results : `pause` ms en haut, défilement à `vitesse`
 * px/s jusqu'à la dernière ligne, `pause` ms en bas, fondu et retour en haut.
 * Un arrivant dans la suite : la piste glisse jusqu'à sa ligne et s'y arrête
 * le temps de l'encadrement, puis reprend de là. requestAnimationFrame : le
 * mouvement reste régulier quoi que fasse le flux de données.
 * PAS_LIGNE suit .ligne dans tv_duo_kx.css (40 px + 3 px de marge).
 */
const PAS_LIGNE = 43;
const FONDU_MS = 300;

function RemonterPiste()
{
	wsMain.def = { pos : 0, phase : 'haut', depuis : performance.now(), dernier : performance.now(), cible : -1 };
	const piste = document.getElementById('piste');
	if (piste)
	{
		piste.style.transform = 'translateY(0)';
		piste.classList.remove('efface');
	}
}

/** Lance la boucle si elle ne tourne pas déjà. */
function Defiler()
{
	if (wsMain.defBoucle)
		return;

	wsMain.defBoucle = true;
	window.requestAnimationFrame(PasDefilement);
}

function PasDefilement(t)
{
	const piste = document.getElementById('piste');
	const defile = document.getElementById('defile');
	if (!piste || !defile || defile.hidden)
	{
		wsMain.defBoucle = false;
		return;
	}

	const d = wsMain.def;
	const dt = Math.min(100, t - d.dernier);
	d.dernier = t;

	const max = Math.max(0, piste.scrollHeight - defile.clientHeight);

	// Un arrivant dans la suite : on va à sa ligne (au milieu de la fenêtre).
	if (d.cible >= 0)
	{
		d.but = Math.max(0, Math.min(max,
			d.cible * PAS_LIGNE - Math.floor((defile.clientHeight - PAS_LIGNE) / 2)));
		d.cible = -1;
		d.phase = 'vers';
		piste.classList.remove('efface');
	}

	if (max <= 0)
	{
		d.pos = 0;
		d.phase = 'haut';
		d.depuis = t;
	}
	else if (d.phase === 'vers')
	{
		// Plus vite que le défilement normal : l'arrivant doit apparaître tôt.
		const pas = Math.max(wsMain.vitesse * 6, 200) * dt / 1000;
		d.pos = d.pos < d.but ? Math.min(d.but, d.pos + pas) : Math.max(d.but, d.pos - pas);
		if (d.pos === d.but)
			d.phase = 'tient';
	}
	else if (d.phase === 'tient')
	{
		if (wsMain.vedette === null)
		{
			d.phase = d.pos >= max ? 'bas' : 'defile';
			d.depuis = t;
		}
	}
	else if (d.phase === 'haut')
	{
		d.pos = 0;
		if (t - d.depuis > wsMain.pause)
			d.phase = 'defile';
	}
	else if (d.phase === 'defile')
	{
		d.pos = Math.min(max, d.pos + wsMain.vitesse * dt / 1000);
		if (d.pos >= max)
		{
			d.phase = 'bas';
			d.depuis = t;
		}
	}
	else if (d.phase === 'bas')
	{
		d.pos = max;
		if (t - d.depuis > wsMain.pause)
		{
			d.phase = 'fondu';
			d.depuis = t;
			piste.classList.add('efface');
		}
	}
	else if (d.phase === 'fondu' && t - d.depuis > FONDU_MS)
	{
		// Invisible : on remonte d'un coup, et la piste réapparaît en haut.
		d.pos = 0;
		d.phase = 'haut';
		d.depuis = t;
		piste.classList.remove('efface');
	}

	// Au pixel entier : entre deux pixels, les lignes se brouillent.
	piste.style.transform = 'translateY(' + (-Math.round(d.pos)) + 'px)';
	window.requestAnimationFrame(PasDefilement);
}

/******************** bateaux en course ********************/

/*
 * Pile des cartes : hauteur fixe de `maxCourse` cartes, même quand il y en a
 * moins. Chaque carte est posée en absolu à sa ligne et glisse quand la ligne
 * change ; la hauteur et l'écart doivent suivre .carte dans tv_duo_kx.css.
 */
const CARTE_H = 134;
const CARTE_ECART = 10;

/**
 * Les bateaux à montrer : en course, ou arrivés depuis moins de
 * `delay_finish`, dans l'ordre des départs, et seulement les `maxCourse`
 * derniers partis. Un arrivant garde donc sa ligne jusqu'à sa sortie, ou
 * jusqu'à ce que trois départs plus récents le poussent dehors.
 */
function ListeAffichee(now)
{
	wsMain.finished.forEach(function(f, bib) {
		if (now - f.at > wsMain.delayFinish)
			wsMain.finished.delete(bib);
	});

	const out = [];
	const vus = new Set();
	const ajouter = function(bib) {
		if (vus.has(bib))
			return;
		vus.add(bib);

		const racer = GetRacer(bib);
		if (racer === null)
			return;

		const enCourse = wsMain.onCourse.find(function(r) { return r.bib === bib; });
		out.push({
			bib : bib,
			racer : racer,
			enCourse : enCourse,
			fini : wsMain.finished.get(bib),
			ordre : OrdreDepart(bib, racer, enCourse),
		});
	};

	wsMain.onCourse.forEach(function(r) { ajouter(r.bib); });
	wsMain.finished.forEach(function(f, bib) { ajouter(bib); });

	out.sort(function(a, b) { return a.ordre - b.ordre; });
	return out.slice(Math.max(0, out.length - wsMain.maxCourse));
}

function CreerCarte(bib, racer)
{
	const el = document.createElement('div');
	el.className = 'carte entree';
	el.dataset.bib = bib;
	el.innerHTML =
		'<div class="k_ident">' +
			'<div class="k_bib"></div>' +
			'<div class="k_nom"></div>' +
			'<div class="k_club"></div>' +
		'</div>' +
		'<div class="k_portes"></div>' +
		'<div class="k_bas">' +
			'<div class="k_etat"></div>' +
			'<div class="k_inters"></div>' +
			'<div class="k_pena"></div>' +
			'<div class="k_chrono"></div>' +
			'<div class="k_rang"></div>' +
		'</div>';

	// textContent : les identités viennent du serveur, pas de HTML.
	el.querySelector('.k_bib').textContent = bib;
	el.querySelector('.k_nom').textContent = TronquerNom(racer.name);
	el.querySelector('.k_club').textContent = racer.nation !== '' && wsMain.international ? racer.nation : racer.club;

	return el;
}

/** Grille des portes : vert 0, jaune 2, rouge 50, blanc pas encore jugée. */
function SyncPortes(elPortes, gates)
{
	if (elPortes.children.length !== gates.length)
	{
		elPortes.innerHTML = '';
		for (let p = 0; p < gates.length; p++)
		{
			const c = document.createElement('div');
			c.className = 'porte';
			elPortes.appendChild(c);
		}
	}

	for (let p = 0; p < gates.length; p++)
	{
		const c = elPortes.children[p];
		const v = gates[p];
		// Contre-la-montre : un RAL (« 50 ») compte comme un FLT, en jaune.
		const etat = v === '0' ? 'p0' : (v === '2' || v === '50') ? 'p2' : '';
		const classe = 'porte ' + etat;
		if (c.className !== classe)
			c.className = classe;

		const txt = CodePena(v);
		if (c.textContent !== txt)
			c.textContent = txt;
	}
}

/** Contenu d'une carte : portes, intermédiaires, pénalités, chrono, place. */
function SyncCarte(el, item, fmt, now)
{
	const racer = item.racer;
	const fini = item.fini;
	const slalom = canoe.GetNbPorte() > 0;

	el.classList.toggle('arrivee', fini !== undefined);
	el.classList.toggle('avec-inter', SyncInters(el.querySelector('.k_inters'), item.bib, racer, fmt, now) > 0);

	const elPortes = el.querySelector('.k_portes');
	elPortes.style.display = slalom ? '' : 'none';
	if (slalom)
		SyncPortes(elPortes, racer.gates);

	// Pas de cumul sur la carte : les portes montrent déjà chaque FLT.
	const elPena = el.querySelector('.k_pena');
	elPena.textContent = '';
	elPena.style.display = 'none';

	// Chrono : tournant en course, figé à l'arrivée.
	let txt = '';
	if (fini)
		txt = adv.GetChrono(fini.time, fmt);
	else if (item.enCourse)
		txt = adv.GetChrono(item.enCourse.time, fmt);
	el.querySelector('.k_chrono').textContent = txt;

	el.querySelector('.k_etat').textContent = fini ? 'Arrivée' : 'En course';

	// Place à l'arrivée, aux couleurs du podium.
	const elRang = el.querySelector('.k_rang');
	const rang = fini && fini.final ? fini.rank : 0;
	elRang.textContent = rang > 0 ? rang + (rang === 1 ? 'er' : 'e') : '';
	elRang.className = 'k_rang' + (rang > 0 ? ' visible' : '') + (rang > 0 && rang <= 3 ? ' p' + rang : '');
}

/**
 * Dessine la pile. Appelée ~10 fois par seconde : une carte n'est créée qu'à
 * l'arrivée de son bateau dans la liste (elle monte depuis le bas), et ne
 * disparaît qu'à sa sortie (elle s'en va vers le haut, les suivantes
 * remontent d'une ligne en glissant).
 */
function RenderCourse()
{
	const now = Date.now();
	const liste = ListeAffichee(now);
	const elCartes = document.getElementById('cartes');
	const fmt = GetFmt();
	const garder = new Set(liste.map(function(it) { return it.bib; }));

	wsMain.affiches = liste.map(function(it) { return it.bib; });

	// Sorties : vers le haut, en fondu, puis retrait du DOM.
	wsMain.cartes.forEach(function(el, bib) {
		if (garder.has(bib) || el.classList.contains('sortie'))
			return;

		el.classList.remove('entree');
		el.classList.add('sortie');
		wsMain.cartes.delete(bib);
		window.setTimeout(function() {
			if (el.parentNode)
				el.parentNode.removeChild(el);
		}, 600);
	});

	for (let i = 0; i < liste.length; i++)
	{
		const item = liste[i];
		let el = wsMain.cartes.get(item.bib);
		const top = i * (CARTE_H + CARTE_ECART);

		if (el === undefined)
		{
			el = CreerCarte(item.bib, item.racer);
			el.style.top = top + 'px';

			// Il attendait dans la pile : sa carte prend la place de sa ligne
			// d'attente, sur place, au lieu d'entrer par le bas.
			const attente = wsMain.attentes.get(item.bib);
			if (attente !== undefined)
			{
				attente.remove();
				wsMain.attentes.delete(item.bib);
				el.classList.replace('entree', 'entree-place');
			}

			elCartes.appendChild(el);
			wsMain.cartes.set(item.bib, el);
		}
		else if (el.style.top !== top + 'px')
		{
			el.style.top = top + 'px';		// la transition CSS fait glisser
		}

		SyncCarte(el, item, fmt, now);
	}

	// Les lignes libres : les prochains partants.
	const libres = wsMain.maxCourse - liste.length;
	const prochains = libres > 0 ? GetProchains().slice(0, libres) : [];
	RenderAttentes(prochains, liste.length, elCartes);

	document.body.classList.toggle('riviere-vide', liste.length === 0 && prochains.length === 0);

	// Les intermédiaires des bateaux qui ne sont plus affichés.
	wsMain.inters.forEach(function(v, bib) {
		if (!garder.has(bib) && !wsMain.onCourse.some(function(r) { return r.bib === bib; }))
			wsMain.inters.delete(bib);
	});
}

/**
 * Rang de départ d'un bateau affiché, qui ordonne la pile. L'heure
 * de départ du classement fait foi ; à défaut (départ hors programme), le
 * départ est déduit du chrono qui tourne. Le dossard départage.
 */
function OrdreDepart(bib, racer, enCourse)
{
	const course_phase = canoe.GetCodeCoursePhase();
	let heure = canoe.GetTableRanking().GetCellInt('Heure_depart' + course_phase, racer.row, 0);

	if (!(heure > 0) && enCourse && wsMain.clock > 0)
		heure = wsMain.clock - enCourse.time;

	// Secondes depuis minuit, puis le dossard : un entier qui tient dans `order`.
	return Math.floor(Math.max(0, heure) / 1000) * 1000 + (parseInt(bib) % 1000);
}

/**
 * Les prochains partants : sans résultat, pas sur l'eau, triés à l'heure de
 * départ. Un bateau doublé (un bateau prévu après lui, dans son épreuve, est
 * déjà parti ou arrivé) est sauté : forfait pas encore saisi, il bloquerait la
 * liste. L'heure seule ne suffit pas : un retard sur l'horaire, ou un test
 * hors des horaires réels, cacherait tout le monde. ?retard=N ajoute la règle
 * à l'heure (N minutes après l'heure de départ).
 */
function GetProchains()
{
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking !== 'object' || tRanking === null || wsMain.nbProchains <= 0)
		return [];

	const course_phase = canoe.GetCodeCoursePhase();
	const enCourse = new Set(wsMain.onCourse.map(function(r) { return r.bib; }));
	const out = [];

	// Par épreuve, l'heure de départ du dernier bateau parti (en course ou arrivé).
	const dernierParti = new Map();
	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		const bib = String(tRanking.GetCell('Dossard', row));
		if (!AResultat(tRanking, row, course_phase) && !enCourse.has(bib) && !wsMain.finished.has(bib))
			continue;
		const ep = tRanking.GetCell('Code_categorie', row);
		const h = tRanking.GetCellInt('Heure_depart' + course_phase, row, 0);
		if (h > (dernierParti.get(ep) || 0))
			dernierParti.set(ep, h);
	}

	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		if (AResultat(tRanking, row, course_phase))
			continue;

		const bib = String(tRanking.GetCell('Dossard', row));
		if (enCourse.has(bib) || wsMain.finished.has(bib))
			continue;

		const heure = tRanking.GetCellInt('Heure_depart' + course_phase, row, 0);
		if (heure <= 0)
			continue;

		if (heure < (dernierParti.get(tRanking.GetCell('Code_categorie', row)) || 0))
			continue;		// doublé : forfait non saisi

		if (wsMain.retard > 0 && wsMain.clock > 0 && heure < wsMain.clock - wsMain.retard)
			continue;

		out.push({
			bib : bib,
			heure : heure,
			name : tRanking.GetCell('Bateau', row),
			club : tRanking.GetCell('Club', row),
			epreuve : tRanking.GetCell('Code_categorie', row),
		});
	}

	out.sort(function(a, b) { return a.heure - b.heure || parseInt(a.bib) - parseInt(b.bib); });
	return out.slice(0, wsMain.nbProchains);
}

/** Heure de départ, ms depuis minuit -> « 10:03:00 ». */
function FormatHeure(ms)
{
	const s = Math.floor(ms / 1000);
	const pad = function(n) { return (n < 10 ? '0' : '') + n; };
	return pad(Math.floor(s / 3600) % 24) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60);
}

/** Compte à rebours « dans 1:05 », vide si l'heure est passée ou inconnue. */
function FormatRebours(heure)
{
	if (!(wsMain.clock > 0) || heure <= wsMain.clock)
		return '';

	const s = Math.ceil((heure - wsMain.clock) / 1000);
	const m = Math.floor(s / 60);
	return 'dans ' + m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
}

/**
 * Les lignes d'attente, sous les cartes à partir de la ligne `debut`. Une
 * ligne est réutilisée d'une trame à l'autre tant que son bateau attend ;
 * elle glisse quand une ligne se libère au-dessus.
 */
function RenderAttentes(prochains, debut, elCartes)
{
	const garder = new Set(prochains.map(function(r) { return r.bib; }));

	wsMain.attentes.forEach(function(el, bib) {
		if (garder.has(bib))
			return;

		wsMain.attentes.delete(bib);
		el.classList.add('sortie-attente');
		window.setTimeout(function() { el.remove(); }, 400);
	});

	for (let i = 0; i < prochains.length; i++)
	{
		const r = prochains[i];
		const top = (debut + i) * (CARTE_H + CARTE_ECART);
		let el = wsMain.attentes.get(r.bib);

		if (el === undefined)
		{
			el = document.createElement('div');
			el.className = 'carte attente entree';
			el.innerHTML =
				'<div class="p_heure"><span class="p_lbl">Départ</span><span class="p_h"></span></div>' +
				'<div class="p_bib"></div>' +
				'<div class="p_qui"><div class="p_nom"></div><div class="p_club"></div></div>' +
				'<div class="p_droite"><div class="p_rebours"></div><div class="p_epreuve"></div></div>';
			el.querySelector('.p_bib').textContent = r.bib;
			el.querySelector('.p_nom').textContent = TronquerNom(r.name);
			el.querySelector('.p_club').textContent = r.club;
			el.style.top = top + 'px';
			elCartes.appendChild(el);
			wsMain.attentes.set(r.bib, el);
		}
		else if (el.style.top !== top + 'px')
		{
			el.style.top = top + 'px';
		}

		el.classList.toggle('premier', i === 0);
		el.querySelector('.p_h').textContent = FormatHeure(r.heure);
		el.querySelector('.p_rebours').textContent = FormatRebours(r.heure);
		// L'épreuve n'est rappelée que si elle change de celle du classement.
		el.querySelector('.p_epreuve').textContent = r.epreuve !== wsMain.epreuve ? NomEpreuve(r.epreuve) : '';
	}
}

/**
 * Les temps intermédiaires d'un bateau : ceux reçus par <bib_time>, à défaut
 * ceux du classement (page ouverte pendant la course). L'écart est celui de
 * competFFCK (diff_categ) quand il l'envoie, sinon calculé ici sur le meilleur
 * temps de l'épreuve à cet intermédiaire.
 */
function GetInters(bib, racer)
{
	const tRanking = canoe.GetTableRanking();
	const course_phase = canoe.GetCodeCoursePhase();
	const recus = wsMain.inters.get(bib) || {};
	const out = [];

	for (let k = 1; k <= canoe.GetNbInter(); k++)
	{
		const col = 'Tps_chrono' + course_phase + '_inter' + k;
		const aCol = tRanking.GetIndexColumn(col) >= 0;

		let time = recus[k] ? recus[k].time : (aCol ? tRanking.GetCellInt(col, racer.row, 0) : 0);
		if (!(time >= adv.chrono.OK))
			continue;

		let diff = recus[k] ? recus[k].diff : null;
		if ((diff === null || isNaN(diff)) && aCol)
		{
			let meilleur = 0;
			for (let row = 0; row < tRanking.GetNbRows(); row++)
			{
				if (row === racer.row || tRanking.GetCell('Code_categorie', row) != racer.epreuve)
					continue;

				const t = tRanking.GetCellInt(col, row, 0);
				if (t >= adv.chrono.OK && (meilleur === 0 || t < meilleur))
					meilleur = t;
			}

			diff = meilleur > 0 ? time - meilleur : null;
		}

		out.push({ k : k, time : time, diff : diff, at : recus[k] ? recus[k].at : 0 });
	}

	return out;
}

/** Une pastille par intermédiaire franchi ; rend leur nombre. */
function SyncInters(elInters, bib, racer, fmt, now)
{
	const inters = GetInters(bib, racer);

	while (elInters.children.length > inters.length)
		elInters.removeChild(elInters.lastChild);

	for (let i = 0; i < inters.length; i++)
	{
		const it = inters[i];
		let el = elInters.children[i];
		if (el === undefined)
		{
			el = document.createElement('div');
			el.innerHTML = '<span class="i_lbl"></span><span class="i_tps"></span><span class="i_diff"></span>';
			elInters.appendChild(el);
		}

		const ecart = it.diff !== null && !isNaN(it.diff) && it.diff !== 0
			? FormatEcart(it.diff, adv.GetChrono(it.time, fmt)) : '';

		el.className = 'k_i'
			+ (it.diff !== null && it.diff < 0 ? ' avance' : it.diff > 0 ? ' retard' : '')
			+ (it.at > 0 && now - it.at < wsMain.delayInter ? ' frais' : '');
		el.querySelector('.i_lbl').textContent = 'I' + it.k;
		el.querySelector('.i_tps').textContent = adv.GetChrono(it.time, fmt);
		el.querySelector('.i_diff').textContent = ecart;
	}

	return inters.length;
}

/******************** fenêtres vidéo ********************/

function LireFenetre(urlParams, key, def)
{
	if (!urlParams.has(key))
		return def;

	const v = urlParams.get(key).split(',').map(function(s) { return parseFloat(s); });
	if (v.length !== 4 || v.some(isNaN))
		return def;

	return { x : v[0], y : v[1], w : v[2], h : v[3] };
}

/**
 * Perce le fond aux emplacements des vidéos. Un clip-path pair-impair : le
 * rectangle de la scène moins les deux fenêtres. Les cadres sont posés juste
 * à l'extérieur, ils ne mordent jamais sur l'image.
 */
function PoserFenetres(fenetres)
{
	let d = 'M0 0H1920V1080H0Z';
	fenetres.forEach(function(f, i) {
		d += ' M' + f.x + ' ' + f.y + 'h' + f.w + 'v' + f.h + 'h' + (-f.w) + 'Z';

		const cadre = document.getElementById('cadre' + (i + 1));
		cadre.style.left = f.x + 'px';
		cadre.style.top = f.y + 'px';
		cadre.style.width = f.w + 'px';
		cadre.style.height = f.h + 'px';
	});

	document.getElementById('fond').style.clipPath = 'path(evenodd, "' + d + '")';
}

/******************** initialisation ********************/

function Init()
{
	const urlParams = new URLSearchParams(window.location.search);
	const num = function(key, def) {
		const v = parseFloat(urlParams.get(key));
		return isNaN(v) ? def : v;
	};

	wsMain.lang = 'fr';
	wsMain.max = Math.max(1, num('max', 8));
	wsMain.fixes = Math.max(0, num('fixes', 3));
	wsMain.vitesse = Math.max(5, num('vitesse', 40));		// px/s de la suite
	wsMain.pause = num('pause', 4000);						// ms en haut et en bas
	wsMain.defBoucle = false;
	wsMain.lengthIdentity = num('length_identity', 24);
	wsMain.epreuveForcee = urlParams.has('epreuve') ? urlParams.get('epreuve') : '';
	wsMain.epreuve = '';
	wsMain.epreuveChrono = '';
	wsMain.titre = urlParams.has('titre') ? urlParams.get('titre') : '';
	wsMain.lieu = urlParams.has('lieu') ? urlParams.get('lieu') : '';
	wsMain.vedetteDuree = num('vedette', 10000);
	wsMain.bibArrive = null;
	wsMain.vedette = null;
	wsMain.vedetteFin = 0;
	wsMain.fmtChrono = urlParams.has('fmt') ? urlParams.get('fmt') : '';
	wsMain.timePena = urlParams.get('time_pena') === '1';
	wsMain.delayFinish = num('delay_finish', 8000);
	wsMain.delayInter = num('delay_inter', 6000);
	wsMain.international = false;
	wsMain.nbProchains = Math.max(0, Math.min(3, num('prochains', 3)));
	wsMain.retard = Math.max(0, num('retard', 0)) * 60000;		// min ; 0 = pas de règle à l'heure
	wsMain.clock = 0;

	wsMain.onCourse = [];
	wsMain.finished = new Map();
	wsMain.inters = new Map();
	wsMain.maxCourse = Math.max(1, Math.min(3, num('max_course', 3)));
	wsMain.affiches = [];
	wsMain.cartes = new Map();
	wsMain.attentes = new Map();

	// Hauteur fixe : celle de `maxCourse` cartes, même quand il y en a moins.
	document.getElementById('cartes').style.height =
		(wsMain.maxCourse * (CARTE_H + CARTE_ECART) - CARTE_ECART) + 'px';

	RemonterPiste();
	wsMain.reloadTimer = null;

	if (urlParams.get('bg') === '1')
		document.body.classList.add('chroma');
	if (urlParams.get('anim') === '0')
		document.body.classList.add('no-anim');
	if (urlParams.has('no_logo'))
		document.body.classList.add('sans-logo');
	if (urlParams.has('no_ffck'))
		document.body.classList.add('sans-ffck');
	if (urlParams.has('no_partenaire'))
		document.body.classList.add('sans-partenaire');

	PoserFenetres([
		LireFenetre(urlParams, 'v1', { x : 0, y : 0, w : 960, h : 540 }),
		LireFenetre(urlParams, 'v2', { x : 960, y : 540, w : 960, h : 540 }),
	]);

	document.body.classList.add('cl-vide', 'riviere-vide');

	Redimensionner();
	window.addEventListener('resize', Redimensionner);

	wsMain.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsMain.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.mapCommand.set('<on_course>', OnFlowOnCourse);
	wsMain.mapCommand.set('<bib_time>', OnBroadcastBibTime);
	wsMain.mapCommand.set('<penalty_add>', OnBroadcastPenaltyAdd);
	wsMain.mapCommand.set('<mode_chrono>', function() { ReloadEpreuve(); });
	wsMain.mapCommand.set('<run_erase>', OnBroadcastRunErase);

	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}

/** Scène 1920x1080 mise à l'échelle d'un bloc : le contrôle en fenêtre montre le cadrage exact. */
function Redimensionner()
{
	const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
	document.documentElement.style.setProperty('--duo-scale', k);
}
