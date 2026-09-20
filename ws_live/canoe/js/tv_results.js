/*
 * Classement plein écran de la dernière épreuve TERMINÉE.
 *
 * Page d'attente entre deux épreuves : opaque, pas d'incrustation. Elle ne
 * demande aucun réglage, elle trouve seule l'épreuve à montrer et se remet à
 * jour toute seule.
 *
 * Choix de l'épreuve
 *   Une épreuve est terminée quand TOUS ses bateaux ont une valeur dans Tps.
 *   competFFCK laisse cette colonne vide tant qu'un bateau n'a pas de
 *   résultat, et y met une valeur négative pour DNF / DNS / DSQ
 *   (adv/adv.js:3) : un abandon compte donc comme un bateau traité, pas comme
 *   un bateau attendu. C'est la même définition que tv_podium.js.
 *
 *   Entre plusieurs épreuves terminées, on prend celle dont le dernier
 *   partant est parti le plus tard : les épreuves s'enchaînent dans l'ordre
 *   du programme, c'est donc bien la dernière finie.
 *
 *   Tant qu'aucune épreuve n'est complète — début de journée, ou une épreuve
 *   en cours et rien derrière — on affiche quand même la dernière qui a des
 *   résultats, en la marquant « classement provisoire ». Un écran vide à
 *   l'antenne serait pire.
 *
 *   ?encours=1 renverse la règle : on suit l'épreuve en cours de
 *   chronométrage, celle que porte le flux <on_course>, dès qu'elle a un
 *   classé. Avant son premier arrivant on reste sur l'épreuve précédente,
 *   sinon l'écran se viderait à chaque changement d'épreuve.
 *
 * Disposition
 *   Les `fixes` premiers du classement restent en haut en permanence : ce
 *   sont eux que le spectateur cherche, les faire tourner avec le reste
 *   l'obligerait à attendre son tour pour savoir qui mène. Seule la queue
 *   défile, par fenêtres de `max - fixes` lignes.
 *
 * Arrivée mise en valeur
 *   Quand un bateau de l'épreuve affichée franchit la ligne, la fenêtre qui
 *   le contient est amenée à l'écran et sa ligne encadrée. Le défilement est
 *   gelé pendant toute la durée de l'encadrement, sinon l'arrivée
 *   disparaîtrait avant d'avoir été lue.
 *
 * Mise à jour
 *   Toute modification (arrivée, pénalité, décision de jury, manche effacée)
 *   fait redemander le classement, puis redessiner SUR PLACE. Le navigateur
 *   n'est jamais rechargé : pas de noir à l'antenne, et le WebSocket reste
 *   ouvert. Les lignes déjà affichées sont mises à jour sans être recréées,
 *   sinon leur animation d'entrée repartirait à chaque correction.
 *
 * Bandeau des bateaux en course
 *   Dès qu'un bateau est sur l'eau, un bandeau apparaît en bas avec, côte à
 *   côte, son dossard, son nom, son chrono qui tourne et son cumul de
 *   pénalités. Il disparaît quand la rivière est vide. Le tableau au-dessus
 *   rétrécit d'autant, sa hauteur de ligne étant calculée ici.
 *
 *   Ce bandeau se rend SÉPARÉMENT du classement : <on_course> arrive à 10 Hz,
 *   et redessiner le tableau à cette cadence relancerait ses animations en
 *   boucle. Les cartes sont réutilisées d'une trame à l'autre pour la même
 *   raison.
 *
 * Source des données :
 *   <race_load>    nom de la compétition, lieu, phase
 *   <epreuve_load> le classement complet, toutes épreuves
 *   <on_course>    les bateaux sur l'eau et leur chrono, ~10 Hz
 *   <bib_time>     les arrivées
 *   <penalty_add>  les pénalités
 *   <run_erase>    la manche est refaite
 *
 * Paramètres d'URL :
 *   max=8             nombre de lignes affichées en tout (défaut : 8)
 *   fixes=3           dont combien restent figées en haut (défaut : 3)
 *   delay=8000        durée d'affichage d'une page en ms (défaut : 8000)
 *   epreuve=K1H       fige l'épreuve au lieu de suivre la dernière terminée
 *   encours=1         suit l'épreuve en cours de chronométrage
 *   vedette=10000     durée de mise en valeur d'une arrivée en ms (0 = jamais)
 *   titre=...         remplace le nom de compétition venu de competFFCK
 *   lieu=...          remplace le lieu
 *   length_identity=26 longueur max du nom (défaut : 26)
 *   no_nation         masque la colonne nation même si elle est renseignée
 *   max_course=6      nombre max de bateaux dans le bandeau (défaut : 6)
 *   no_course         supprime le bandeau des bateaux en course
 *   fmt=XSCC          format du chrono (défaut : selon l'activité)
 *   anim=0            désactive les animations
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

	const tRanking = canoe.GetTableRanking();
	canoe.SetColumnNameRanking(tRanking);

	// Le nom de la compétition n'arrive qu'avec <race_load>, mais la phase
	// peut changer en cours de journée : on rafraîchit à chaque classement.
	SetEnTete();

	const avant = wsMain.epreuve;
	wsMain.epreuve = wsMain.epreuveForcee !== '' ? wsMain.epreuveForcee : ChoisirEpreuve();

	// Changement d'épreuve : on repart de la première page, avec animation.
	Render(avant !== wsMain.epreuve);
}

/**
 * Redemande le classement complet.
 *
 * Groupé : une arrivée déclenche souvent plusieurs trames coup sur coup
 * (le temps, puis les pénalités du même bateau). Sans ce délai on relancerait
 * un <epreuve_load> par trame.
 */
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

	// Le plus avancé à gauche : l'ordre reste stable d'une trame à l'autre,
	// les cartes ne se réordonnent pas sous l'oeil du spectateur.
	rows.sort(function(a, b) { return b.time - a.time; });

	if (typeof objJSON.epreuve === 'string')
		wsMain.epreuveChrono = objJSON.epreuve;

	wsMain.onCourse = rows;
	RenderCourse();
}

function OnBroadcastBibTime(objJSON)
{
	// passage >= 1 : un intermédiaire, il ne change pas le classement.
	if (parseInt(objJSON.passage) >= 1)
		return;

	/*
	 * Le bateau a franchi la ligne : on le sort du bandeau tout de suite.
	 * Attendre la prochaine trame <on_course> laisserait son chrono figé à
	 * l'antenne, et indéfiniment si le flux se tait juste après.
	 */
	const bib = String(objJSON.bib);
	const avant = wsMain.onCourse.length;
	wsMain.onCourse = wsMain.onCourse.filter(function(r) { return r.bib !== bib; });
	if (wsMain.onCourse.length !== avant)
		RenderCourse();

	// Le classement à jour arrive avec le <epreuve_load> : c'est lui qui
	// saura sur quelle page se trouve ce bateau.
	if (wsMain.vedetteDuree > 0)
		wsMain.bibArrive = bib;

	ReloadEpreuve();
}

function OnBroadcastRunErase(objJSON)
{
	// La manche est refaite : plus aucune épreuve n'est terminée.
	wsMain.epreuve = '';
	wsMain.page = 0;
	wsMain.onCourse = [];
	RenderCourse();
	ReloadEpreuve();
}

/******************** choix de l'épreuve ********************/

/**
 * Relevé par catégorie : combien de bateaux, combien sont traités, et à
 * quelle heure le dernier d'entre eux est parti.
 */
function ReleverCategories()
{
	const tRanking = canoe.GetTableRanking();
	const course_phase = canoe.GetCodeCoursePhase();
	const cats = new Map();

	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		const categ = tRanking.GetCell('Code_categorie', row);
		if (categ === '')
			continue;

		let e = cats.get(categ);
		if (e === undefined)
		{
			e = { total : 0, traites : 0, classes : 0, dernierDepart : 0 };
			cats.set(categ, e);
		}

		e.total++;

		// '' = pas encore de résultat. Une valeur, même négative (DNF, DSQ),
		// signifie que le bateau est traité.
		if (String(tRanking.GetCell('Tps' + course_phase, row)) !== '')
		{
			e.traites++;
			if (tRanking.GetCellInt('Tps' + course_phase, row, adv.chrono.KO) >= adv.chrono.OK)
				e.classes++;
		}

		const heure = tRanking.GetCellInt('Heure_depart' + course_phase, row, 0);
		if (heure > e.dernierDepart)
			e.dernierDepart = heure;
	}

	return cats;
}

/**
 * La dernière épreuve terminée, ou à défaut la dernière qui a des résultats.
 * Pose la classe `provisoire` dans le second cas.
 */
function ChoisirEpreuve()
{
	const cats = ReleverCategories();

	/*
	 * ?encours=1 : on suit le chronométrage, mais seulement une fois que
	 * l'épreuve a un classé. Basculer dès le premier départ viderait l'écran
	 * entre la fin d'une épreuve et la première arrivée de la suivante.
	 */
	if (wsMain.suivreEnCours && wsMain.epreuveChrono !== '')
	{
		const e = cats.get(wsMain.epreuveChrono);
		if (e !== undefined && e.classes > 0)
		{
			document.body.classList.toggle('provisoire', e.traites < e.total);
			return wsMain.epreuveChrono;
		}
	}

	let terminee = '';
	let terminee_h = -1;
	let partielle = '';
	let partielle_h = -1;

	cats.forEach(function(e, categ) {
		if (e.total > 0 && e.traites === e.total)
		{
			if (e.dernierDepart > terminee_h)
			{
				terminee_h = e.dernierDepart;
				terminee = categ;
			}
		}
		else if (e.classes > 0)
		{
			if (e.dernierDepart > partielle_h)
			{
				partielle_h = e.dernierDepart;
				partielle = categ;
			}
		}
	});

	document.body.classList.toggle('provisoire', terminee === '' && partielle !== '');

	return terminee !== '' ? terminee : partielle;
}

/******************** extraction du classement ********************/

function GetFmt()
{
	return wsMain.fmtChrono ? wsMain.fmtChrono : canoe.GetFmtChrono();
}

/**
 * Le cumul de pénalités du bateau.
 *
 * competFFCK fournit Total_pena quand il l'a calculé — c'est lui qui fait foi,
 * il intègre les décisions de jury qui ne passent pas par les portes. Sinon on
 * retombe sur la somme des portes. Hors slalom il n'y a pas de porte, donc 0.
 */
function GetPena(tRanking, row, course_phase)
{
	if (canoe.GetNbPorte() <= 0)
		return 0;

	if (tRanking.GetIndexColumn('Total_pena' + course_phase) >= 0)
		return tRanking.GetCellInt('Total_pena' + course_phase, row, 0);

	return canoe.GetCurrentSlalomTotalPena(tRanking, row);
}

/**
 * Les bateaux de l'épreuve : les classés d'abord, triés au temps, puis les
 * non classés (DNF, DNS, DSQ) qui ferment la liste.
 */
function GetClassement()
{
	const tRanking = canoe.GetTableRanking();
	const course_phase = canoe.GetCodeCoursePhase();
	const classes = [];
	const horsClassement = [];

	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		if (tRanking.GetCell('Code_categorie', row) != wsMain.epreuve)
			continue;

		const brut = tRanking.GetCell('Tps' + course_phase, row);
		if (String(brut) === '')
			continue;			// pas encore de résultat : rien à montrer

		const tps = tRanking.GetCellInt('Tps' + course_phase, row, adv.chrono.KO);
		const r = {
			bib : String(tRanking.GetCell('Dossard', row)),
			name : tRanking.GetCell('Bateau', row),
			nation : tRanking.GetCell('Code_nation', row),
			time : tps,
			pena : GetPena(tRanking, row, course_phase),
		};

		if (tps >= adv.chrono.OK)
		{
			// Cltc est le rang dans la catégorie, calculé par competFFCK : on le
			// reprend tel quel pour ne pas diverger de lui en cas d'ex aequo.
			const rank = parseInt(tRanking.GetCellRank('Cltc' + course_phase, row, 0));
			r.rank = rank > 0 ? rank : 0;
			classes.push(r);
		}
		else
		{
			r.rank = 0;
			horsClassement.push(r);
		}
	}

	classes.sort(function(a, b) { return a.time - b.time; });

	for (let i = 0; i < classes.length; i++)
	{
		if (classes[i].rank === 0)
			classes[i].rank = i + 1;

		classes[i].diff = i === 0 ? 0 : classes[i].time - classes[0].time;
	}

	horsClassement.sort(function(a, b) { return parseInt(a.bib) - parseInt(b.bib); });

	return classes.concat(horsClassement);
}

/******************** rendu ********************/

/**
 * Un écart se lit en secondes tant qu'il reste sous la minute (« +3,20 ») ;
 * au-delà la forme minutes est plus lisible (« +1:30.00 »).
 *
 * `temps` est le temps déjà formaté du premier. adv.js écrit la virgule dans
 * ses formats « secondes » et le point dans ses formats « minutes » : on
 * aligne le séparateur de l'écart sur celui du temps, sinon la colonne mêle
 * les deux.
 */
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

function SetEnTete()
{
	const tCompetition = canoe.GetTable('Competition');
	const tCourse = canoe.GetTable('Competition_Course');

	const titre = wsMain.titre !== '' ? wsMain.titre
	            : (tCompetition.GetNbRows() > 0 ? tCompetition.GetCell('Nom', 0) : '');
	const lieu = wsMain.lieu !== '' ? wsMain.lieu
	           : (tCourse.GetNbRows() > 0 ? tCourse.GetCell('Libelle', 0) : '');

	document.getElementById('titre').textContent = titre;
	document.getElementById('lieu').textContent = lieu;
}

/** Construit une ligne. Réutilise le noeud existant s'il porte déjà ce dossard. */
/**
 * Remplit une ligne. `r` à null donne une ligne de remplissage : la fenêtre
 * qui tourne garde toujours le même nombre de lignes, l'oeil n'a donc jamais
 * à se réhabituer à un bloc de taille différente d'un cycle à l'autre.
 */
function SyncLigne(el, r, premier, ouvreLaRotation)
{
	if (r === null)
	{
		el.className = 'ligne res place-vide' + (ouvreLaRotation ? ' ouvre-rotation' : '');
		el.querySelector('.c_rang').textContent = '';
		el.querySelector('.c_dossard').textContent = '';
		el.querySelector('.c_nom').textContent = '';
		el.querySelector('.c_nation').innerHTML = '';
		el.querySelector('.c_pena').textContent = '';
		el.querySelector('.c_temps').textContent = '';
		el.querySelector('.c_ecart').textContent = '';
		return;
	}

	const fmt = GetFmt();
	const classe = r.rank > 0;

	// Le temps de chacun, et l'écart dans sa propre colonne : sur un
	// classement d'arrivée on veut lire la performance ET la distance au
	// premier, pas l'une ou l'autre selon la place.
	const txtTemps = adv.GetChrono(r.time, fmt);
	const txtEcart = (!classe || r.diff === 0) ? ''
	               : FormatEcart(r.diff, adv.GetChrono(premier.time, fmt));

	el.className = 'ligne res'
		+ (classe && r.rank <= 3 ? ' p' + r.rank : '')
		+ (classe ? '' : ' hc')
		+ (r.bib === wsMain.vedette ? ' vedette' : '')
		+ (ouvreLaRotation ? ' ouvre-rotation' : '');

	el.querySelector('.c_rang').textContent = classe ? String(r.rank) : '—';
	el.querySelector('.c_dossard').textContent = r.bib;
	el.querySelector('.c_nom').textContent = TronquerNom(r.name);

	const elNation = el.querySelector('.c_nation');
	if (r.nation !== '')
		elNation.innerHTML = "<img src='./img/Flags/" + r.nation + ".png' alt='' />"
			+ '<span>' + r.nation + '</span>';
	else
		elNation.innerHTML = '';

	const elPena = el.querySelector('.c_pena');
	if (canoe.GetNbPorte() > 0)
	{
		elPena.textContent = String(r.pena);
		elPena.classList.toggle('chargee', r.pena > 0 && r.pena < 50);
		elPena.classList.toggle('eliminatoire', r.pena >= 50);
	}
	else
	{
		elPena.textContent = '';
		elPena.classList.remove('chargee', 'eliminatoire');
	}

	el.querySelector('.c_temps').textContent = txtTemps;
	el.querySelector('.c_ecart').textContent = txtEcart;
}

function CreerLigne()
{
	const el = document.createElement('div');
	el.className = 'ligne res';
	el.innerHTML =
		'<div class="c_rang"></div>' +
		'<div class="c_dossard"></div>' +
		'<div class="c_nom"></div>' +
		'<div class="c_nation"></div>' +
		'<div class="c_pena"></div>' +
		'<div class="c_temps"></div>' +
		'<div class="c_ecart"></div>';

	return el;
}

/**
 * Dessine la page courante.
 *
 * `remonter` remet le défilement à la première page — au changement
 * d'épreuve. Une simple correction de résultat ne doit pas faire sauter le
 * spectateur au début du classement.
 */
/**
 * Dessine la page courante.
 *
 * Le classement est coupé en deux : les `fixes` premiers restent en haut en
 * permanence — ce sont eux que le spectateur cherche — et seule la queue
 * défile, par fenêtres de `max - fixes` lignes. Faire tourner le podium avec
 * le reste obligerait à attendre le bon tour pour savoir qui mène.
 *
 * `remonter` remet le défilement au début de la queue, au changement
 * d'épreuve. Une simple correction de résultat ne doit pas faire sauter le
 * spectateur au début du classement.
 */
function Render(remonter)
{
	if (remonter)
		wsMain.page = 0;

	const tout = wsMain.epreuve === '' ? [] : GetClassement();

	document.body.classList.toggle('vide', tout.length === 0);
	document.getElementById('epreuve_nom').textContent =
		typeof Categorie_name === 'function' ? Categorie_name(wsMain.epreuve) : wsMain.epreuve;

	if (tout.length === 0)
	{
		document.getElementById('corps').innerHTML = '';
		document.body.classList.remove('pagine');
		return;
	}

	// Colonne nation : inutile sur un championnat de France, où elle est vide
	// pour tout le monde. On la replie plutôt que d'aligner des cases vides.
	const avecNation = !wsMain.noNation && tout.some(function(r) { return r.nation !== ''; });
	document.body.classList.toggle('sans-nation', !avecNation);

	const nbFixes = Math.min(wsMain.fixes, tout.length);
	const tete = tout.slice(0, nbFixes);
	const queue = tout.slice(nbFixes);

	/*
	 * Le nombre de bateaux par fenêtre reste équilibré — 11 en queue donnent
	 * trois fenêtres de 4, 4 et 3 plutôt que 5, 5 et 1 — pour que le vide se
	 * réparte au lieu de se concentrer sur la dernière.
	 */
	const fenetre = Math.max(1, wsMain.max - nbFixes);
	const nbPages = Math.max(1, Math.ceil(queue.length / fenetre));
	const parPage = queue.length > 0 ? Math.ceil(queue.length / nbPages) : 0;

	if (wsMain.page >= nbPages)
		wsMain.page = 0;

	/*
	 * Un bateau vient d'arriver : on amène la fenêtre qui le contient et on
	 * l'encadre. S'il est déjà dans les fixes, il n'y a rien à faire défiler.
	 * Le défilement est gelé tant que l'encadrement dure (voir Programmer),
	 * sinon l'arrivée disparaîtrait avant d'avoir été lue.
	 */
	if (wsMain.bibArrive !== null)
	{
		const cible = tout.findIndex(function(r) { return r.bib === wsMain.bibArrive; });
		if (cible >= 0)
		{
			if (cible >= nbFixes && parPage > 0)
				wsMain.page = Math.floor((cible - nbFixes) / parPage);

			wsMain.vedette = wsMain.bibArrive;
			wsMain.vedetteFin = Date.now() + wsMain.vedetteDuree;

			if (wsMain.pageTimer !== null)
			{
				window.clearTimeout(wsMain.pageTimer);
				wsMain.pageTimer = null;
			}

			// Un rendu de plus à l'expiration, pour retirer l'encadrement et
			// relancer le défilement même si rien d'autre ne se passe.
			window.setTimeout(function() { Render(false); }, wsMain.vedetteDuree + 50);
		}

		wsMain.bibArrive = null;
	}

	if (wsMain.vedette !== null && Date.now() >= wsMain.vedetteFin)
		wsMain.vedette = null;

	const debut = wsMain.page * parPage;
	const page = tete.concat(queue.slice(debut, debut + parPage));

	/*
	 * Complément à la taille de fenêtre : le bloc du bas garde toujours le
	 * même nombre de lignes, même quand la dernière fenêtre est incomplète.
	 * Une épreuve qui tient entièrement dans la tête n'a pas de queue : on
	 * n'invente pas cinq lignes vides sous un classement de trois bateaux.
	 */
	if (queue.length > 0)
	{
		while (page.length < nbFixes + fenetre)
			page.push(null);
	}

	const avecFilet = nbFixes > 0 && queue.length > 0;

	document.body.classList.toggle('pagine', nbPages > 1);
	document.getElementById('pagination').textContent =
		(wsMain.page + 1) + ' / ' + nbPages + ' — ' + tout.length + ' bateaux';

	const corps = document.getElementById('corps');
	const existantes = corps.children;

	/*
	 * Mise à jour sur place : tant que la ligne n° i montre déjà ce dossard,
	 * on ne touche qu'à son contenu. Recréer le noeud relancerait l'animation
	 * d'entrée, et tout le classement clignoterait à chaque pénalité saisie.
	 */
	for (let i = 0; i < page.length; i++)
	{
		let el = existantes[i];
		if (el === undefined)
		{
			el = CreerLigne();
			corps.appendChild(el);
		}

		// Un filet sépare le bloc figé de la partie qui tourne, sinon on lit
		// les huit lignes comme un classement continu de 1 à 8.
		SyncLigne(el, page[i], tout[0], avecFilet && i === nbFixes);
	}

	while (corps.children.length > page.length)
		corps.removeChild(corps.lastChild);

	Programmer(nbPages);
}

/** Enchaîne la page suivante. Le minuteur n'est pas relancé par une simple mise à jour. */
function Programmer(nbPages)
{
	if (wsMain.pageTimer !== null || nbPages <= 1)
		return;

	// Gelé tant qu'une arrivée est encadrée : c'est tout l'intérêt de l'avoir
	// amenée à l'écran.
	if (wsMain.vedette !== null)
		return;

	wsMain.pageTimer = setTimeout(function() {
		wsMain.pageTimer = null;
		wsMain.page++;
		Render(false);
	}, wsMain.pageDelay);
}

/******************** bandeau des bateaux en course ********************/

/**
 * Nom et cumul de pénalités d'un bateau, lus dans le classement.
 * Les pénalités y sont rafraîchies par <penalty_add>, qui redemande la table.
 */
function GetCoureur(bib)
{
	const tRanking = canoe.GetTableRanking();
	const row = canoe.GetRankingBibIndex(tRanking, bib);
	if (row < 0)
		return null;

	const course_phase = canoe.GetCodeCoursePhase();

	return {
		name : tRanking.GetCell('Bateau', row),
		pena : GetPena(tRanking, row, course_phase),
	};
}

function CreerCarte()
{
	const el = document.createElement('div');
	el.className = 'coureur';
	el.innerHTML =
		'<div class="c_corps">' +
			'<div class="c_bib"></div>' +
			'<div class="c_nom"></div>' +
			'<div class="c_chrono"></div>' +
			'<div class="c_pena"></div>' +
		'</div>';

	return el;
}

/**
 * Dessine le bandeau.
 *
 * Appelée à chaque trame <on_course>, soit ~10 fois par seconde : les cartes
 * déjà à l'écran sont mises à jour, jamais recréées, sinon leur animation
 * d'entrée repartirait à chaque trame et le bandeau clignoterait.
 */
function RenderCourse()
{
	const bandeau = document.getElementById('encourse');
	const liste = wsMain.showCourse ? wsMain.onCourse.slice(0, wsMain.maxCourse) : [];
	const fmt = GetFmt();

	const vus = new Set();

	for (let i = 0; i < liste.length; i++)
	{
		const r = liste[i];
		const id = 'course_' + r.bib;
		vus.add(id);

		let el = document.getElementById(id);
		if (el === null)
		{
			el = CreerCarte();
			el.id = id;
			bandeau.appendChild(el);
		}

		el.classList.remove('sortant');
		el.style.order = i;

		const info = GetCoureur(r.bib);
		el.querySelector('.c_bib').textContent = r.bib;
		el.querySelector('.c_nom').textContent = info ? TronquerNom(info.name) : '';
		el.querySelector('.c_chrono').textContent = adv.GetChrono(r.time, fmt);

		const elPena = el.querySelector('.c_pena');
		const pena = info ? info.pena : 0;
		elPena.textContent = '+' + pena;
		elPena.classList.toggle('vide', pena <= 0);
	}

	// Les bateaux qui viennent de quitter le flux : on les sort en douceur
	// plutôt que de les faire disparaître d'un coup.
	const cartes = bandeau.children;
	for (let i = cartes.length - 1; i >= 0; i--)
	{
		const el = cartes[i];
		if (vus.has(el.id) || el.classList.contains('sortant'))
			continue;

		el.classList.add('sortant');
		window.setTimeout(function() {
			if (el.parentNode && el.classList.contains('sortant'))
				el.parentNode.removeChild(el);
		}, 350);
	}

	/*
	 * L'apparition du bandeau change la hauteur utile du tableau : on le
	 * redessine, mais uniquement sur la bascule, pas à chaque trame.
	 */
	const avant = document.body.classList.contains('en-course');
	const apres = liste.length > 0;
	if (avant !== apres)
	{
		document.body.classList.toggle('en-course', apres);
		Render(false);
	}
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
	/*
	 * Surtout pas wsMain.delay : ws.Context s'en sert pour la diffusion
	 * differee (adv/ws.js:24 et :314). Y ecrire la duree d'une page ferait
	 * retarder CHAQUE trame recue d'autant.
	 */
	wsMain.pageDelay = num('delay', 8000);
	wsMain.lengthIdentity = num('length_identity', 26);
	wsMain.epreuveForcee = urlParams.has('epreuve') ? urlParams.get('epreuve') : '';
	wsMain.epreuve = '';
	wsMain.titre = urlParams.has('titre') ? urlParams.get('titre') : '';
	wsMain.lieu = urlParams.has('lieu') ? urlParams.get('lieu') : '';
	wsMain.noNation = urlParams.has('no_nation');
	wsMain.suivreEnCours = urlParams.get('encours') === '1';
	wsMain.epreuveChrono = '';
	wsMain.vedetteDuree = num('vedette', 10000);
	wsMain.bibArrive = null;
	wsMain.vedette = null;
	wsMain.vedetteFin = 0;
	wsMain.showCourse = !urlParams.has('no_course');
	wsMain.maxCourse = Math.max(1, num('max_course', 6));
	wsMain.onCourse = [];
	wsMain.fmtChrono = urlParams.has('fmt') ? urlParams.get('fmt') : '';

	wsMain.page = 0;
	wsMain.pageTimer = null;
	wsMain.reloadTimer = null;

	if (urlParams.get('anim') === '0')
		document.body.classList.add('no-anim');

	CalerHauteurLignes();
	Redimensionner();
	window.addEventListener('resize', Redimensionner);

	wsMain.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsMain.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.mapCommand.set('<on_course>', OnFlowOnCourse);
	wsMain.mapCommand.set('<bib_time>', OnBroadcastBibTime);
	wsMain.mapCommand.set('<penalty_add>', function() { ReloadEpreuve(); });
	wsMain.mapCommand.set('<mode_chrono>', function() { ReloadEpreuve(); });
	wsMain.mapCommand.set('<run_erase>', OnBroadcastRunErase);

	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}

/**
 * Hauteur d'une ligne. Calculée UNE SEULE FOIS, au démarrage.
 *
 * Elle ne dépend que de ?max=, jamais du contenu : une ligne doit garder la
 * même hauteur d'un cycle à l'autre, et que le bandeau des bateaux en course
 * soit là ou non. Sinon tout le tableau respire à chaque changement, ce qui
 * est pénible à lire à l'antenne.
 *
 * On dimensionne donc sur la situation la plus contrainte — bandeau présent,
 * qui ramène le bas du tableau de 992 à 846. Sans bandeau, le tableau
 * n'occupe pas toute la hauteur disponible, et c'est justement dans cet
 * espace libre que le bandeau vient se loger.
 */
function CalerHauteurLignes()
{
	const HAUT = 226;				// haut du tableau (tv_results.css)
	const BAS = 846;				// bas du tableau quand le bandeau est là
	const ENTETE = 46;				// en-tête de colonnes + sa marge
	const MARGE = 4;				// espace entre deux lignes
	const FILET = 16;				// marge du filet de la partie tournante
	const MINI = 22;				// en dessous, plus rien n'est lisible

	const h = Math.floor((BAS - HAUT - ENTETE - FILET) / Math.max(1, wsMain.max)) - MARGE;
	document.documentElement.style.setProperty('--res-ligne-h', Math.max(MINI, h) + 'px');
}

/**
 * La scène est dessinée en 1920x1080 et mise à l'échelle d'un bloc : le
 * cadrage vu dans une fenêtre de contrôle est exactement celui envoyé à
 * l'ATEM. En 1:1 le facteur vaut 1 et aucun pixel n'est recalculé.
 */
function Redimensionner()
{
	const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
	document.documentElement.style.setProperty('--res-scale', k);
}
