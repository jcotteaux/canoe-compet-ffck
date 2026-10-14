/*
 * Classement plein écran de la dernière épreuve courue.
 *
 * Page d'attente entre deux épreuves : opaque, pas d'incrustation. Elle ne
 * demande aucun réglage, elle trouve seule l'épreuve à montrer et se remet à
 * jour toute seule.
 *
 * Choix de l'épreuve
 *   Par défaut : l'épreuve du bateau sur l'eau, dès son départ (en attente
 *   de la première arrivée, l'écran le dit). Rivière vide : la DERNIÈRE
 *   épreuve qui a au moins un classé, c'est-à-dire
 *   celle du dernier bateau arrivé (le plus tard parti parmi ceux qui ont un
 *   résultat). Tant qu'elle n'est pas finie, elle est marquée « classement
 *   provisoire ». Avant le premier DÉPART d'une nouvelle épreuve, on reste
 *   sur la précédente : ses résultats restent affichés entre deux épreuves.
 *
 *   ?terminee=1 rétablit la règle d'origine, décrite ci-dessous : la
 *   dernière épreuve TERMINÉE d'abord.
 *
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
 *   sont eux que le spectateur cherche. La suite défile en continu dans une
 *   fenêtre de `max - fixes` lignes ; arrivée en bas, elle s'efface en fondu
 *   et repart du haut.
 *
 * Arrivée mise en valeur
 *   Quand un bateau de l'épreuve affichée franchit la ligne, sa ligne est
 *   encadrée quelques secondes, sans interrompre le défilement : le dernier
 *   arrivé est de toute façon en bas, dans la première tuile du bandeau.
 *
 * Mise à jour
 *   Toute modification (arrivée, pénalité, décision de jury, manche effacée)
 *   fait redemander le classement, puis redessiner SUR PLACE. Le navigateur
 *   n'est jamais rechargé : pas de noir à l'antenne, et le WebSocket reste
 *   ouvert. Les lignes déjà affichées sont mises à jour sans être recréées,
 *   sinon leur animation d'entrée repartirait à chaque correction.
 *
 * Bandeau du bas
 *   Quatre tuiles de même taille : le dernier arrivé de l'épreuve (temps,
 *   place, pénalités), les bateaux sur l'eau, puis les prochains partants
 *   avec leur heure et le compte à rebours. Il se rend SÉPARÉMENT du
 *   classement : <on_course> arrive à 10 Hz, et ses emplacements sont
 *   réutilisés d'une trame à l'autre.
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
 *   vitesse=40        défilement de la suite, en px/s (défaut : 40)
 *   pause=4000        arrêt en haut et en bas de la suite, en ms (défaut : 4000)
 *   epreuve=K1H       fige l'épreuve au lieu de suivre la dernière terminée
 *   encours=1         suit l'épreuve en cours de chronométrage
 *   terminee=1        dernière épreuve TERMINÉE plutôt que dernière courue
 *   vedette=10000     durée de mise en valeur d'une arrivée en ms (0 = jamais)
 *   titre=...         remplace le nom de compétition venu de competFFCK
 *   lieu=...          remplace le lieu
 *   length_identity=26 longueur max du nom (défaut : 26)
 *   no_nation         masque la colonne du club (ou de la nation)
 *   nation            la nation (drapeau) à la place du club, pour une
 *                     compétition internationale
 *   tuiles=4          emplacements du bandeau du bas, toujours de même taille :
 *                     dernier arrivé, bateaux en course, prochains partants
 *   delai_glisse=1000 attente entre une arrivée et le glissement des tuiles, en ms
 *   no_course         supprime le bandeau des bateaux en course
 *   fmt=XSCC          format du chrono (défaut : selon l'activité)
 *   anim=1            active les animations (défaut : aucune, tout apparaît
 *                     d'un coup ; anim=0 reste accepté)
 *   style=classique   habillage d'origine, fond uni (défaut : photo)
 *   fond=mewen        photo de fond, prise dans img/fonds/<nom>.jpg
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

	// Changement d'épreuve : la piste repart du haut.
	Render(avant !== wsMain.epreuve);
	RenderCourse();
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

	// Heure de competFFCK : sert au compte à rebours des prochains partants.
	const clock = adv.toNumber(objJSON.clock);
	if (clock !== null && clock > 0)
	{
		wsMain.clock = clock;
		wsMain.clockRecu = Date.now();
	}

	wsMain.onCourse = rows;

	// L'épreuve suit les bateaux sur l'eau : un départ dans une nouvelle
	// épreuve change l'en-tête et le classement tout de suite.
	if (wsMain.epreuveForcee === '' && typeof canoe.GetTableRanking() === 'object' && canoe.GetTableRanking() !== null)
	{
		const epreuve = ChoisirEpreuve();
		if (epreuve !== wsMain.epreuve)
		{
			wsMain.epreuve = epreuve;
			Render(true);
		}
	}

	RenderCourse();
}

function OnBroadcastBibTime(objJSON)
{
	// passage >= 1 : un intermédiaire. Il ne change pas le classement, mais
	// s'affiche sur la tuile du bateau.
	if (parseInt(objJSON.passage) >= 1)
	{
		const b = String(objJSON.bib);
		const inters = wsMain.inters.get(b) || {};
		inters[parseInt(objJSON.passage)] = {
			time : adv.toNumber(objJSON.time_chrono),
			diff : objJSON.diff_categ !== undefined ? adv.toNumber(objJSON.diff_categ) : null,
		};
		wsMain.inters.set(b, inters);
		RenderCourse();
		return;
	}

	/*
	 * Le bateau a franchi la ligne : on le sort du bandeau tout de suite.
	 * Attendre la prochaine trame <on_course> laisserait son chrono figé à
	 * l'antenne, et indéfiniment si le flux se tait juste après.
	 */
	const bib = String(objJSON.bib);

	// Il devient tout de suite le dernier arrivé, avec le chrono de la trame,
	// en attendant le classement à jour (pénalités, place).
	wsMain.arriveRecent = { bib : bib, time : adv.toNumber(objJSON.time_chrono) };

	// Les tuiles ne bougent pas tout de suite : l'arrivant passe en « Arrivée »
	// sur place, puis tout glisse une seconde après.
	wsMain.gelTuiles = Date.now() + wsMain.delaiGlisse;
	window.setTimeout(RenderCourse, wsMain.delaiGlisse + 30);
	wsMain.inters.delete(bib);

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
	RemonterPiste();
	wsMain.onCourse = [];
	wsMain.arriveRecent = null;
	wsMain.inters.clear();
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
			e = { total : 0, traites : 0, classes : 0, dernierDepart : 0, dernierTraite : -1 };
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

		// Départ du dernier bateau qui a un résultat : c'est lui qui dit quelle
		// épreuve vient d'être courue.
		if (String(tRanking.GetCell('Tps' + course_phase, row)) !== '' && heure > e.dernierTraite)
			e.dernierTraite = heure;
	}

	return cats;
}

/**
 * L'épreuve à afficher : la dernière courue (défaut), ou avec ?terminee=1 la
 * dernière terminée, à défaut la dernière qui a des résultats. Pose la classe
 * `provisoire` quand l'épreuve affichée n'est pas finie.
 */
function ChoisirEpreuve()
{
	const cats = ReleverCategories();

	/*
	 * Un bateau sur l'eau : son épreuve, même sans classé encore. L'en-tête
	 * suit la course ; avant la première arrivée, l'écran d'attente dit qu'on
	 * attend le premier compétiteur. (Hors ?terminee=1, qui ne montre que des
	 * épreuves finies.)
	 */
	if (!wsMain.preferTerminee)
	{
		const enCourse = EpreuveSurLeau();
		if (enCourse !== '')
		{
			const e = cats.get(enCourse);
			document.body.classList.toggle('provisoire', e !== undefined && e.traites < e.total);
			return enCourse;
		}
	}

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

	if (!wsMain.preferTerminee)
	{
		let derniere = '';
		let derniere_h = -1;

		cats.forEach(function(e, categ) {
			if (e.classes > 0 && e.dernierTraite > derniere_h)
			{
				derniere_h = e.dernierTraite;
				derniere = categ;
			}
		});

		// Aucun résultat encore : l'épreuve du prochain partant (compte à rebours).
		if (derniere === '')
		{
			const p = Prochains(1)[0];
			if (p)
				derniere = p.epreuve;
		}

		const e = cats.get(derniere);
		document.body.classList.toggle('provisoire', e !== undefined && e.traites < e.total);
		return derniere;
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

/** L'épreuve du bateau sur l'eau parti le premier, '' si la rivière est vide. */
function EpreuveSurLeau()
{
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking !== 'object' || tRanking === null)
		return '';

	const tries = wsMain.onCourse.slice().sort(function(a, b) { return b.time - a.time; });
	for (const r of tries)
	{
		const row = canoe.GetRankingBibIndex(tRanking, parseInt(r.bib));
		if (row >= 0)
			return tRanking.GetCell('Code_categorie', row);
	}
	return '';
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
			club : tRanking.GetCell('Club', row),
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

	// Le club, comme sur tv_duo et tv_departs ; la nation et son drapeau
	// seulement avec ?nation (compétition internationale).
	const elNation = el.querySelector('.c_nation');
	if (wsMain.avecNation && r.nation !== '')
	{
		elNation.innerHTML = "<img src='./img/Flags/" + encodeURIComponent(r.nation) + ".png' alt='' /><span></span>";
		elNation.querySelector('span').textContent = r.nation;
	}
	else if (!wsMain.avecNation && r.club !== '')
	{
		elNation.innerHTML = '<span class="club"></span>';
		elNation.querySelector('span').textContent = r.club;
	}
	else
	{
		elNation.innerHTML = '';
	}

	// Pénalités en pastille, aux couleurs des portes de tv_duo : jaune quand
	// ce ne sont que des touches (2), rouge dès qu'une porte est manquée (50).
	const elPena = el.querySelector('.c_pena');
	if (canoe.GetNbPorte() > 0)
	{
		elPena.innerHTML = '<span class="pastille"></span>';
		elPena.firstChild.textContent = r.pena > 0 ? '+' + r.pena : '0';
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
 * Dessine le classement.
 *
 * Les `fixes` premiers restent en haut en permanence — ce sont eux que le
 * spectateur cherche. La suite est une piste qui DÉFILE en continu dans une
 * fenêtre de `max - fixes` lignes : pause en haut, défilement lent, pause en
 * bas, fondu, et retour en haut (voir Defiler). Une arrivée est encadrée à sa
 * place, sans interrompre le défilement.
 *
 * `remonter` ramène la piste en haut, au changement d'épreuve. Une simple
 * correction de résultat ne doit pas faire sauter le spectateur au début.
 */
function Render(remonter)
{
	if (remonter)
		RemonterPiste();

	const tout = wsMain.epreuve === '' ? [] : GetClassement();

	document.body.classList.toggle('vide', tout.length === 0);
	document.getElementById('epreuve_nom').textContent =
		typeof Categorie_name === 'function' ? Categorie_name(wsMain.epreuve) : wsMain.epreuve;

	// En bas : combien de bateaux de l'épreuve doivent encore arriver. Mis à
	// jour avant tout, y compris quand l'épreuve n'a encore aucun résultat.
	const e = wsMain.epreuve !== '' ? ReleverCategories().get(wsMain.epreuve) : undefined;
	const reste = e ? e.total - e.traites : 0;
	document.body.classList.toggle('pagine', e !== undefined);
	document.getElementById('pagination').textContent = reste > 0
		? (reste === 1 ? 'Encore 1 bateau à arriver' : 'Encore ' + reste + ' bateaux à arriver')
		: 'Épreuve terminée';

	const corps = document.getElementById('corps');
	if (tout.length === 0)
	{
		corps.innerHTML = '';
		return;
	}

	// Colonne du club (ou de la nation avec ?nation) : repliée si vide pour tous.
	const avecColonne = !wsMain.noNation && tout.some(function(r) {
		return wsMain.avecNation ? r.nation !== '' : r.club !== '';
	});
	document.body.classList.toggle('sans-nation', !avecColonne);

	const nbFixes = Math.min(wsMain.fixes, tout.length);
	const tete = tout.slice(0, nbFixes);
	const queue = tout.slice(nbFixes);
	const fenetre = Math.max(1, wsMain.max - nbFixes);

	// Un bateau vient d'arriver : il est encadré, et la piste vient à lui.
	if (wsMain.bibArrive !== null)
	{
		if (tout.some(function(r) { return r.bib === wsMain.bibArrive; }))
		{
			wsMain.vedette = wsMain.bibArrive;
			wsMain.vedetteFin = Date.now() + wsMain.vedetteDuree;
			// Un rendu de plus à l'expiration, pour retirer l'encadrement.
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

	/*
	 * Une queue plus courte que la fenêtre est complétée de lignes vides : le
	 * bloc garde sa silhouette. Une épreuve qui tient dans la tête n'a pas de
	 * queue, on n'invente pas de lignes sous trois bateaux.
	 */
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
	defile.style.height = avecQueue ? (fenetre * PasLigne() - 4) + 'px' : '0';


	Defiler();
}

/**
 * Met un bloc de lignes à jour sur place : tant que la ligne n° i existe, on
 * ne touche qu'à son contenu. Recréer les noeuds ferait clignoter le
 * classement à chaque pénalité saisie.
 */
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

/** Hauteur d'une ligne et de son intervalle, en pixels de la scène. */
function PasLigne()
{
	const h = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--res-ligne-h')) || 46;
	return h + 4;
}

/******************** défilement de la piste ********************/

/*
 * La piste avance à `vitesse` px/s. Un cycle : `pause` ms en haut, le
 * défilement jusqu'à la dernière ligne, `pause` ms en bas, puis un fondu qui
 * la ramène en haut. Animée par requestAnimationFrame : le mouvement reste
 * régulier quoi que fasse le flux de données.
 */
const FONDU_MS = 300;

function RemonterPiste()
{
	wsMain.def = { pos : 0, phase : 'haut', depuis : performance.now(), dernier : performance.now() };
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

	// Une arrivée ne fait pas sauter la piste : sa ligne est encadrée là où
	// elle est, et le défilement automatique continue.
	if (max <= 0)
	{
		d.pos = 0;
		d.phase = 'haut';
		d.depuis = t;
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

	piste.style.transform = 'translateY(' + (-d.pos).toFixed(1) + 'px)';
	window.requestAnimationFrame(PasDefilement);
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
		'<div class="c_tuile"><div class="c_corps">' +
			'<div class="c_bib"></div>' +
			'<div class="c_nom"><span class="c_etat"></span><span class="c_qui"></span></div>' +
			'<div class="c_chrono"></div>' +
			'<div class="c_droite"><div class="c_inter"></div><div class="c_pena"></div><div class="c_place"></div></div>' +
		'</div></div>';

	return el;
}

/**
 * Le dernier arrivé de l'épreuve affichée : la plus tardive des arrivées
 * (départ + chrono), lue dans le classement.
 */
function DernierArrive()
{
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking !== 'object' || tRanking === null || wsMain.epreuve === '')
		return null;

	const cp = canoe.GetCodeCoursePhase();
	let meilleur = null;
	let finMax = -1;

	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		if (tRanking.GetCell('Code_categorie', row) != wsMain.epreuve)
			continue;
		if (String(tRanking.GetCell('Tps' + cp, row)) === '')
			continue;

		const fin = tRanking.GetCellInt('Heure_depart' + cp, row, 0) + Math.max(0, tRanking.GetCellInt('Tps_chrono' + cp, row, 0));
		if (fin > finMax)
		{
			finMax = fin;
			const rank = parseInt(tRanking.GetCellRank('Cltc' + cp, row, 0));
			meilleur = {
				bib : String(tRanking.GetCell('Dossard', row)),
				name : tRanking.GetCell('Bateau', row),
				time : tRanking.GetCellInt('Tps' + cp, row, adv.chrono.KO),
				pena : GetPena(tRanking, row, cp),
				rank : rank > 0 ? rank : 0,
			};
		}
	}

	// Arrivée toute récente, pas encore dans le classement : on la montre déjà.
	const recent = wsMain.arriveRecent;
	if (recent && (!meilleur || meilleur.bib !== recent.bib))
	{
		const row = canoe.GetRankingBibIndex(tRanking, parseInt(recent.bib));
		if (row >= 0 && String(tRanking.GetCell('Tps' + cp, row)) === '')
		{
			return {
				bib : recent.bib,
				name : tRanking.GetCell('Bateau', row),
				time : recent.time,
				pena : GetPena(tRanking, row, cp),
				rank : 0,
			};
		}
	}

	return meilleur;
}

/**
 * Le dernier intermédiaire passé par un bateau : reçu par <bib_time>, à
 * défaut lu dans le classement. L'écart est celui de competFFCK s'il l'envoie,
 * sinon calculé sur le meilleur temps de l'épreuve à cet intermédiaire.
 */
function DernierInter(bib)
{
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking !== 'object' || tRanking === null)
		return null;

	const row = canoe.GetRankingBibIndex(tRanking, parseInt(bib));
	if (row < 0)
		return null;

	const cp = canoe.GetCodeCoursePhase();
	const epreuve = tRanking.GetCell('Code_categorie', row);
	const recus = wsMain.inters.get(bib) || {};

	for (let k = canoe.GetNbInter(); k >= 1; k--)
	{
		const col = 'Tps_chrono' + cp + '_inter' + k;
		const aCol = tRanking.GetIndexColumn(col) >= 0;
		const time = recus[k] ? recus[k].time : (aCol ? tRanking.GetCellInt(col, row, 0) : 0);
		if (!(time >= adv.chrono.OK))
			continue;

		let diff = recus[k] ? recus[k].diff : null;
		if ((diff === null || isNaN(diff)) && aCol)
		{
			let best = 0;
			for (let r = 0; r < tRanking.GetNbRows(); r++)
			{
				if (r === row || tRanking.GetCell('Code_categorie', r) != epreuve)
					continue;
				const t = tRanking.GetCellInt(col, r, 0);
				if (t >= adv.chrono.OK && (best === 0 || t < best))
					best = t;
			}
			diff = best > 0 ? time - best : null;
		}

		return { k : k, time : time, diff : diff };
	}

	return null;
}

/** Les prochains partants : ni résultat ni chrono, dans l'ordre des heures de départ. */
function Prochains(nb)
{
	const tRanking = canoe.GetTableRanking();
	if (nb <= 0 || typeof tRanking !== 'object' || tRanking === null)
		return [];

	const cp = canoe.GetCodeCoursePhase();
	const surLeau = new Set(wsMain.onCourse.map(function(r) { return r.bib; }));
	const out = [];

	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		if (String(tRanking.GetCell('Tps' + cp, row)) !== '')
			continue;

		const bib = String(tRanking.GetCell('Dossard', row));
		const heure = tRanking.GetCellInt('Heure_depart' + cp, row, 0);
		if (surLeau.has(bib) || heure <= 0)
			continue;

		// Heure passée de plus de 2 min sans départ : forfait pas encore saisi.
		if (wsMain.clock > 0 && heure < HeureCompet() - 120000)
			continue;

		out.push({ bib : bib, heure : heure, name : tRanking.GetCell('Bateau', row),
		           epreuve : tRanking.GetCell('Code_categorie', row) });
	}

	out.sort(function(a, b) { return a.heure - b.heure || parseInt(a.bib) - parseInt(b.bib); });
	return out.slice(0, nb);
}

/** L'heure de competFFCK maintenant (ms depuis minuit), extrapolée depuis la dernière trame. */
function HeureCompet()
{
	return wsMain.clock + (Date.now() - wsMain.clockRecu);
}

function FormatHeure(ms)
{
	const s = Math.floor(ms / 1000);
	const pad = function(n) { return (n < 10 ? '0' : '') + n; };
	return pad(Math.floor(s / 3600) % 24) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60);
}

/**
 * Le bandeau du bas : toujours `tuiles` emplacements de même taille.
 *   1. le dernier arrivé de l'épreuve, avec son temps, sa place et ses
 *      pénalités : on n'a pas à le chercher dans le classement qui défile ;
 *   2. les bateaux sur l'eau, le premier parti d'abord, chrono qui tourne et
 *      dernier intermédiaire ;
 *   3. les places restantes : les prochains partants, heure et compte à rebours.
 *
 * Une tuile par dossard, posée à son emplacement : quand la première s'en va,
 * elle sort par la gauche, les autres glissent d'un cran et la nouvelle entre
 * par la droite (transition CSS sur translateX). Un bateau qui arrive garde sa
 * tuile, qui passe d'« en course » à « arrivée » sur place ; le glissement
 * part `delai_glisse` ms plus tard (1 s par défaut).
 *
 * Appelée à chaque trame <on_course>, ~10 fois par seconde : seuls le contenu
 * et la position des tuiles changent.
 */
const TUILE_ECART = 16;

function RenderCourse()
{
	const bandeau = document.getElementById('encourse');
	const fmt = GetFmt();
	let tuiles = [];

	if (wsMain.showCourse)
	{
		const arrive = DernierArrive();
		const enCourse = wsMain.onCourse.slice().sort(function(a, b) { return b.time - a.time; });

		if (arrive && !enCourse.some(function(r) { return r.bib === arrive.bib; }))
			tuiles.push({ type : 'arrive', r : arrive });

		enCourse.slice(0, wsMain.nbTuiles - tuiles.length).forEach(function(r) {
			tuiles.push({ type : 'course', r : r });
		});

		Prochains(wsMain.nbTuiles - tuiles.length).forEach(function(r, k) {
			tuiles.push({ type : 'prochain', r : r, premier : k === 0 });
		});
	}

	/*
	 * Juste après une arrivée, on garde l'ordre précédent une seconde : chaque
	 * tuile reste à sa place avec son contenu à jour (l'arrivant affiche déjà
	 * son temps), puis le glissement part d'un bloc.
	 */
	if (Date.now() < wsMain.gelTuiles && wsMain.dernieresTuiles.length > 0)
	{
		const fraiches = tuiles;
		tuiles = wsMain.dernieresTuiles.map(function(ancienne) {
			return fraiches.find(function(t) { return t.r.bib === ancienne.r.bib; }) || ancienne;
		});
	}
	else
	{
		wsMain.dernieresTuiles = tuiles;
	}

	const largeur = (1728 - TUILE_ECART * (wsMain.nbTuiles - 1)) / wsMain.nbTuiles;
	const pas = largeur + TUILE_ECART;
	const vues = new Set();

	tuiles.forEach(function(t, i) {
		const r = t.r;
		vues.add(r.bib);

		let el = wsMain.tuiles.get(r.bib);
		if (!el)
		{
			// Nouvelle tuile : elle part de la droite du bandeau et glisse en place.
			el = CreerCarte();
			el.style.width = largeur + 'px';
			el.style.transform = 'translateX(' + (wsMain.nbTuiles * pas) + 'px)';
			bandeau.appendChild(el);
			wsMain.tuiles.set(r.bib, el);
			void el.offsetWidth;
		}

		const pos = 'translateX(' + (i * pas) + 'px)';
		if (el.style.transform !== pos)
			el.style.transform = pos;

		el.className = 'coureur ' + t.type + (t.premier ? ' premier' : '');
		SyncTuile(el, t, fmt);
	});

	// Les tuiles qui ne sont plus à montrer sortent par la gauche.
	wsMain.tuiles.forEach(function(el, bib) {
		if (vues.has(bib))
			return;

		wsMain.tuiles.delete(bib);
		el.classList.add('sort');
		el.style.transform = 'translateX(' + (-pas) + 'px)';
		window.setTimeout(function() { el.remove(); }, 1200);
	});

	RenderAttente();

	/*
	 * L'apparition du bandeau change la hauteur utile du tableau : on le
	 * redessine, mais uniquement sur la bascule, pas à chaque trame.
	 */
	const avant = document.body.classList.contains('en-course');
	const apres = tuiles.length > 0;
	if (avant !== apres)
	{
		document.body.classList.toggle('en-course', apres);
		Render(false);
	}
}

/** Contenu d'une tuile selon son type : arrivée, en course, prochain départ. */
function SyncTuile(el, t, fmt)
{
	const r = t.r;
	const elPena = el.querySelector('.c_pena');
	const elPlace = el.querySelector('.c_place');
	const elInter = el.querySelector('.c_inter');
	let etat = '';
	let chrono = '';
	let pena = 0;
	let place = '';
	let inter = null;

	if (t.type === 'arrive')
	{
		etat = 'Arrivée';
		chrono = adv.GetChrono(r.time, fmt);
		pena = r.pena;
		place = r.rank > 0 ? r.rank + (r.rank === 1 ? 'er' : 'e') : '';
		elPlace.className = 'c_place' + (r.rank > 0 && r.rank <= 3 ? ' p' + r.rank : '');
	}
	else if (t.type === 'course')
	{
		const info = GetCoureur(r.bib);
		etat = 'En course';
		chrono = adv.GetChrono(r.time, fmt);
		pena = info ? info.pena : 0;
		r.name = info ? info.name : '';
		inter = DernierInter(r.bib);
		elPlace.className = 'c_place';
	}
	else
	{
		// Le prochain : « Au départ » et son compte à rebours ; les suivants :
		// « À suivre » et leur heure de départ.
		if (t.premier)
		{
			const reste = wsMain.clock > 0 ? r.heure - HeureCompet() : 0;
			etat = 'Au départ';
			if (reste > 0)
			{
				const sec = Math.ceil(reste / 1000);
				chrono = 'dans ' + Math.floor(sec / 60) + ':' + (sec % 60 < 10 ? '0' : '') + (sec % 60);
			}
			else
			{
				chrono = FormatHeure(r.heure);
			}
		}
		else
		{
			etat = 'À suivre';
			chrono = FormatHeure(r.heure);
		}
		elPlace.className = 'c_place';
	}

	SetTexteSiChange(el.querySelector('.c_bib'), r.bib);
	SetTexteSiChange(el.querySelector('.c_etat'), etat);
	SetTexteSiChange(el.querySelector('.c_qui'), TronquerNom(r.name || ''));
	SetTexteSiChange(el.querySelector('.c_chrono'), chrono);

	// Dernier intermédiaire : son numéro et l'écart au meilleur de l'épreuve.
	if (inter)
	{
		const ecart = inter.diff !== null && !isNaN(inter.diff) && inter.diff !== 0
			? adv.GetChronoDiff(inter.diff, 'XSCC') : adv.GetChrono(inter.time, fmt);
		SetTexteSiChange(elInter, 'I' + inter.k + ' ' + ecart);
		elInter.className = 'c_inter' + (inter.diff < 0 ? ' avance' : inter.diff > 0 ? ' retard' : '');
	}
	else
	{
		SetTexteSiChange(elInter, '');
		elInter.className = 'c_inter';
	}

	SetTexteSiChange(elPena, '+' + pena);
	elPena.classList.toggle('vide', t.type === 'prochain' || pena <= 0);
	elPena.classList.toggle('eliminatoire', pena >= 50);
	SetTexteSiChange(elPlace, place);
}

function SetTexteSiChange(el, txt)
{
	if (el.textContent !== txt)
		el.textContent = txt;
}

/**
 * Écran d'accueil, tant qu'aucun classement n'est à montrer : le compte à
 * rebours jusqu'au premier départ, avec l'épreuve, le partant et l'heure.
 * Sans l'heure de competFFCK (aucune trame encore), l'heure du départ seule.
 * Une fois le premier parti : « en attente de l'arrivée du premier
 * compétiteur », sans compte à rebours pour le suivant.
 */
function RenderAttente()
{
	if (!document.body.classList.contains('vide'))
		return;

	const p = Prochains(1)[0];
	let titre = 'En attente des premiers résultats';
	let reste = '';
	let info = '';

	// Le premier est parti : on attend son arrivée, pas le départ du suivant.
	if (wsMain.onCourse.length > 0)
	{
		titre = 'En attente de l\'arrivée du premier compétiteur';
		const premier = wsMain.onCourse.slice().sort(function(a, b) { return b.time - a.time; })[0];
		const c = GetCoureur(premier.bib);
		info = c ? c.name + ' en course' : '';
	}
	else if (p)
	{
		const nomEpreuve = typeof Categorie_name === 'function' ? Categorie_name(p.epreuve) : p.epreuve;
		info = (nomEpreuve || p.epreuve) + ' — ' + p.name + ' · départ ' + FormatHeure(p.heure);

		const ms = wsMain.clock > 0 ? p.heure - HeureCompet() : null;
		if (ms === null)
		{
			titre = 'Premier départ à';
			reste = FormatHeure(p.heure);
		}
		else if (ms > 0)
		{
			const sec = Math.ceil(ms / 1000);
			const pad = function(n) { return (n < 10 ? '0' : '') + n; };
			const h = Math.floor(sec / 3600);
			titre = 'Premier départ dans';
			reste = (h > 0 ? pad(h) + ':' : '') + pad(Math.floor(sec / 60) % 60) + ':' + pad(sec % 60);
		}
		else
		{
			titre = 'Départ imminent';
		}
	}

	const set = function(id, txt) {
		const el = document.getElementById(id);
		if (el.textContent !== txt)
			el.textContent = txt;
	};
	set('attente_titre', titre);
	set('attente_reste', reste);
	set('attente_info', info);
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
	wsMain.lengthIdentity = num('length_identity', 26);
	wsMain.epreuveForcee = urlParams.has('epreuve') ? urlParams.get('epreuve') : '';
	wsMain.epreuve = '';
	wsMain.titre = urlParams.has('titre') ? urlParams.get('titre') : '';
	wsMain.lieu = urlParams.has('lieu') ? urlParams.get('lieu') : '';
	wsMain.noNation = urlParams.has('no_nation');
	wsMain.avecNation = urlParams.has('nation');
	if (!wsMain.avecNation)
		document.querySelector('#entete .c_nation').textContent = 'Club';
	wsMain.suivreEnCours = urlParams.get('encours') === '1';
	wsMain.preferTerminee = urlParams.get('terminee') === '1';
	wsMain.epreuveChrono = '';
	wsMain.vedetteDuree = num('vedette', 10000);
	wsMain.bibArrive = null;
	wsMain.vedette = null;
	wsMain.vedetteFin = 0;
	wsMain.showCourse = !urlParams.has('no_course');
	wsMain.nbTuiles = Math.max(1, Math.min(6, num('tuiles', num('max_course', 4))));
	wsMain.tuiles = new Map();		// dossard -> tuile du bandeau
	wsMain.dernieresTuiles = [];	// dernier ordre affiché, gardé pendant le gel
	wsMain.gelTuiles = 0;
	wsMain.delaiGlisse = num('delai_glisse', 1000);
	wsMain.inters = new Map();		// dossard -> { n : { time, diff } }
	wsMain.arriveRecent = null;
	wsMain.clock = 0;
	wsMain.clockRecu = 0;
	wsMain.onCourse = [];
	wsMain.fmtChrono = urlParams.has('fmt') ? urlParams.get('fmt') : '';

	wsMain.reloadTimer = null;
	wsMain.vitesse = Math.max(5, num('vitesse', 40));		// px/s de la piste
	wsMain.pause = num('pause', 4000);						// ms en haut et en bas
	wsMain.defBoucle = false;
	RemonterPiste();

	// Sans animation par défaut : l'écran change d'un coup. ?anim=1 les rend.
	if (urlParams.get('anim') !== '1')
		document.body.classList.add('no-anim');

	ChoisirHabillage(urlParams);

	// Écran d'attente dès l'ouverture : tant que competFFCK n'a rien envoyé,
	// on montre le kayakiste plutôt qu'un tableau vide sans en-tête.
	document.body.classList.add('vide');

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
 * Habillage photo (défaut) ou classique (?style=classique, la première
 * version, fond uni).
 *
 * La photo n'est déclarée qu'en mode photo : en classique, le navigateur ne
 * la télécharge pas du tout. ?fond= ne prend qu'un nom simple, jamais un
 * chemin ou une URL : la page ne va chercher que dans img/fonds/.
 */
function ChoisirHabillage(urlParams)
{
	if (urlParams.get('style') === 'classique')
		return;

	document.body.classList.add('theme-photo');

	const fond = urlParams.get('fond');
	if (fond !== null && /^[A-Za-z0-9_-]+$/.test(fond))
		document.getElementById('fond').style.backgroundImage = 'url("./img/fonds/' + fond + '.jpg")';
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
	// Habillage photo : en-tête remonté et pied descendu (tv_results.css,
	// « mise en page resserrée »), le tableau gagne 70 px.
	const photo = document.body.classList.contains('theme-photo');
	const HAUT = photo ? 186 : 226;	// haut du tableau (tv_results.css)
	const BAS = photo ? 876 : 846;	// bas du tableau quand le bandeau est là
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
