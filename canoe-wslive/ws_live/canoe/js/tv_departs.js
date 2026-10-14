/*
 * Liste de départ plein écran d'une épreuve, dans la charte de tv_results.
 *
 * Épreuve montrée
 *   ?epreuve= la fige. Sinon : celle du bateau sur l'eau, à défaut celle du
 *   prochain partant (le plus tôt parti parmi ceux qui n'ont ni chrono ni
 *   résultat). La régie (tv_regie.html) passe toujours ?epreuve=.
 *
 * Lignes
 *   Dans l'ordre des heures de départ. Le prochain à partir est encadré, un
 *   bateau sur l'eau porte « En course », un bateau qui a un résultat est
 *   estompé. La liste défile par pages de `max` lignes ; elle s'ouvre sur la
 *   page du prochain partant.
 *
 * Source des données :
 *   <race_load>    nom de la compétition, lieu, phase
 *   <epreuve_load> le classement complet, d'où l'on tire la liste
 *   <on_course>    les bateaux sur l'eau
 *   <bib_time>     les arrivées : la liste est rechargée
 *
 * Paramètres d'URL :
 *   epreuve=K1H       fige l'épreuve
 *   max=10            lignes par page (défaut : 10)
 *   delay=8000        durée d'une page en ms
 *   titre=... lieu=... remplacent ceux de competFFCK
 *   length_identity=30 longueur max du nom
 *   no_nation         masque la colonne nation
 *   nation            la montre même quand tout le monde a la même nation
 *                     (par défaut elle n'apparaît que si elle distingue quelqu'un)
 *   style=classique   fond uni (défaut : photo, comme tv_results)
 *   fond=mewen        photo de fond, img/fonds/<nom>.jpg
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
	SetEnTete();
	wsMain.websocket.send(JSON.stringify({ key : '<epreuve_load>', epreuve : '' }));
}

function OnCommandEpreuveLoad(objJSON)
{
	canoe.SetRanking(objJSON);
	canoe.SetColumnNameRanking(canoe.GetTableRanking());
	SetEnTete();
	Rafraichir();
}

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
	const bibs = [];
	for (let i = 0; i < t.GetNbRows(); i++)
		bibs.push(String(t.GetCell('bib', i)));

	// On ne redessine que si la rivière change : la trame arrive 10 fois par seconde.
	const cle = bibs.join(',');
	if (cle !== wsMain.onCourse.join(','))
	{
		wsMain.onCourse = bibs;
		Rafraichir();
	}
}

/******************** la liste ********************/

/** Les bateaux de l'épreuve, dans l'ordre des départs. */
function Liste(epreuve)
{
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking !== 'object' || tRanking === null)
		return [];

	const cp = canoe.GetCodeCoursePhase();
	const out = [];

	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		if (tRanking.GetCell('Code_categorie', row) != epreuve)
			continue;

		const bib = String(tRanking.GetCell('Dossard', row));
		out.push({
			bib : bib,
			heure : tRanking.GetCellInt('Heure_depart' + cp, row, 0),
			name : tRanking.GetCell('Bateau', row),
			club : tRanking.GetCell('Club', row),
			nation : tRanking.GetCell('Code_nation', row),
			fait : String(tRanking.GetCell('Tps' + cp, row)) !== '',
			surLeau : wsMain.onCourse.indexOf(bib) >= 0,
		});
	}

	out.sort(function(a, b) { return a.heure - b.heure || parseInt(a.bib) - parseInt(b.bib); });
	return out;
}

/** L'épreuve à montrer : figée, sinon celle du bateau sur l'eau, sinon celle du prochain partant. */
function ChoisirEpreuve()
{
	if (wsMain.epreuveForcee !== '')
		return wsMain.epreuveForcee;

	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking !== 'object' || tRanking === null)
		return '';

	const cp = canoe.GetCodeCoursePhase();
	let prochaine = '';
	let prochaineH = Infinity;

	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		const bib = String(tRanking.GetCell('Dossard', row));
		if (wsMain.onCourse.indexOf(bib) >= 0)
			return tRanking.GetCell('Code_categorie', row);

		if (String(tRanking.GetCell('Tps' + cp, row)) !== '')
			continue;

		const h = tRanking.GetCellInt('Heure_depart' + cp, row, 0);
		if (h > 0 && h < prochaineH)
		{
			prochaineH = h;
			prochaine = tRanking.GetCell('Code_categorie', row);
		}
	}

	return prochaine;
}

/** « 09:18:00 » depuis des ms depuis minuit. */
function FormatHeure(ms)
{
	if (!(ms > 0))
		return '';

	const s = Math.floor(ms / 1000);
	const pad = function(n) { return (n < 10 ? '0' : '') + n; };
	return pad(Math.floor(s / 3600) % 24) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60);
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
	const tPhase = canoe.GetTable('Competition_Course_Phase');

	const titre = wsMain.titre !== '' ? wsMain.titre
	            : (tCompetition && tCompetition.GetNbRows() > 0 ? tCompetition.GetCell('Nom', 0) : '');
	const lieu = wsMain.lieu !== '' ? wsMain.lieu
	           : (tCourse && tCourse.GetNbRows() > 0 ? tCourse.GetCell('Libelle', 0) : '');

	let phase = '';
	if (tPhase && tPhase.GetNbRows() > 0)
	{
		const p = canoe.GetCodePhase();
		phase = tPhase.GetCell('Libelle', p > 0 && p <= tPhase.GetNbRows() ? p - 1 : 0);
	}

	document.getElementById('titre').textContent = titre;
	document.getElementById('lieu').textContent = lieu;
	document.getElementById('mention').textContent = 'Liste de départ' + (phase ? ' — ' + phase : '');
}

/******************** rendu ********************/

function CreerLigne()
{
	const el = document.createElement('div');
	el.className = 'ligne res';
	el.innerHTML =
		'<div class="c_rang"></div>' +
		'<div class="c_heure"></div>' +
		'<div class="c_dossard"></div>' +
		'<div class="c_nom"></div>' +
		'<div class="c_club"></div>' +
		'<div class="c_nation"></div>';
	return el;
}

/** Remplit une ligne ; `r` à null donne une ligne de remplissage. */
function SyncLigne(el, r, ordre, prochain)
{
	if (r === null)
	{
		el.className = 'ligne res place-vide';
		el.querySelectorAll('div').forEach(function(d) { d.textContent = ''; });
		return;
	}

	el.className = 'ligne res'
		+ (r.fait ? ' fait' : '')
		+ (r.surLeau ? ' sur-leau' : '')
		+ (prochain ? ' prochain' : '');

	el.querySelector('.c_rang').textContent = String(ordre);
	el.querySelector('.c_heure').textContent = r.surLeau ? 'En course' : FormatHeure(r.heure);
	el.querySelector('.c_dossard').textContent = r.bib;
	el.querySelector('.c_nom').textContent = TronquerNom(r.name);
	el.querySelector('.c_club').textContent = r.club;

	const elNation = el.querySelector('.c_nation');
	if (r.nation !== '')
		elNation.innerHTML = "<img src='./img/Flags/" + encodeURIComponent(r.nation) + ".png' alt='' />"
			+ '<span></span>';
	else
		elNation.innerHTML = '';
	if (r.nation !== '')
		elNation.querySelector('span').textContent = r.nation;
}

/** Recalcule l'épreuve et redessine ; repart sur la page du prochain partant si l'épreuve change. */
function Rafraichir()
{
	const avant = wsMain.epreuve;
	wsMain.epreuve = ChoisirEpreuve();
	Render(avant !== wsMain.epreuve);
}

function Render(changement)
{
	const liste = wsMain.epreuve === '' ? [] : Liste(wsMain.epreuve);

	document.body.classList.toggle('vide', liste.length === 0);
	document.getElementById('epreuve_nom').textContent =
		typeof Categorie_name === 'function' ? Categorie_name(wsMain.epreuve) : wsMain.epreuve;

	const corps = document.getElementById('corps');
	if (liste.length === 0)
	{
		corps.innerHTML = '';
		document.body.classList.remove('pagine');
		return;
	}

	// Nation : seulement si elle distingue quelqu'un. Un championnat de France
	// tout en FRA n'a pas besoin d'une colonne de drapeaux identiques.
	const nations = new Set(liste.map(function(r) { return r.nation; }));
	const avecNation = !wsMain.noNation && (nations.size > 1 || (nations.size === 1 && !nations.has('') && wsMain.nationSeule));
	document.body.classList.toggle('sans-nation', !avecNation);

	const iProchain = liste.findIndex(function(r) { return !r.fait && !r.surLeau; });
	const nbPages = Math.max(1, Math.ceil(liste.length / wsMain.max));

	if (changement)
		wsMain.page = iProchain >= 0 ? Math.floor(iProchain / wsMain.max) : 0;
	if (wsMain.page >= nbPages)
		wsMain.page = 0;

	const debut = wsMain.page * wsMain.max;
	const page = liste.slice(debut, debut + wsMain.max);

	// Pages pleines : la dernière est complétée, le bloc garde sa silhouette.
	if (nbPages > 1)
	{
		while (page.length < wsMain.max)
			page.push(null);
	}

	document.body.classList.toggle('pagine', nbPages > 1);
	document.getElementById('pagination').textContent =
		(wsMain.page + 1) + ' / ' + nbPages + ' — ' + liste.length + ' bateaux';

	// Mise à jour sur place : recréer les lignes relancerait leur animation.
	for (let i = 0; i < page.length; i++)
	{
		let el = corps.children[i];
		if (el === undefined)
		{
			el = CreerLigne();
			corps.appendChild(el);
		}
		SyncLigne(el, page[i], debut + i + 1, debut + i === iProchain);
	}

	while (corps.children.length > page.length)
		corps.removeChild(corps.lastChild);

	Programmer(nbPages);
}

function Programmer(nbPages)
{
	if (wsMain.pageTimer !== null || nbPages <= 1)
		return;

	wsMain.pageTimer = setTimeout(function() {
		wsMain.pageTimer = null;
		wsMain.page++;

		// Une nouvelle page : les lignes rejouent leur entrée.
		document.getElementById('corps').innerHTML = '';
		Render(false);
	}, wsMain.pageDelay);
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
	wsMain.max = Math.max(1, num('max', 10));
	// Surtout pas wsMain.delay : ws.Context s'en sert pour la diffusion différée.
	wsMain.pageDelay = num('delay', 8000);
	wsMain.lengthIdentity = num('length_identity', 30);
	wsMain.epreuveForcee = urlParams.has('epreuve') ? urlParams.get('epreuve') : '';
	wsMain.epreuve = '';
	wsMain.titre = urlParams.has('titre') ? urlParams.get('titre') : '';
	wsMain.lieu = urlParams.has('lieu') ? urlParams.get('lieu') : '';
	wsMain.noNation = urlParams.has('no_nation');
	wsMain.nationSeule = urlParams.has('nation');
	wsMain.onCourse = [];
	wsMain.page = 0;
	wsMain.pageTimer = null;
	wsMain.reloadTimer = null;

	if (urlParams.get('anim') === '0')
		document.body.classList.add('no-anim');

	// Habillage photo par défaut, comme tv_results ; ?style=classique pour le fond uni.
	if (urlParams.get('style') !== 'classique')
	{
		document.body.classList.add('theme-photo');
		const fond = urlParams.get('fond');
		if (fond !== null && /^[A-Za-z0-9_-]+$/.test(fond))
			document.getElementById('fond').style.backgroundImage = 'url("./img/fonds/' + fond + '.jpg")';
	}

	CalerHauteurLignes();
	document.body.classList.add('vide');

	Redimensionner();
	window.addEventListener('resize', Redimensionner);

	wsMain.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsMain.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.mapCommand.set('<on_course>', OnFlowOnCourse);
	wsMain.mapCommand.set('<bib_time>', function() { ReloadEpreuve(); });
	wsMain.mapCommand.set('<run_erase>', function() { wsMain.onCourse = []; ReloadEpreuve(); });
	wsMain.mapCommand.set('<mode_chrono>', function() { ReloadEpreuve(); });

	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}

/**
 * Hauteur de ligne, une fois pour toutes, depuis ?max= : le tableau va du
 * haut de la zone (186 en photo, 226 en classique, voir tv_results.css)
 * jusqu'au-dessus de la pagination. Plafonnée : une liste courte ne doit pas
 * s'afficher en lignes géantes.
 */
function CalerHauteurLignes()
{
	const photo = document.body.classList.contains('theme-photo');
	const HAUT = photo ? 186 : 226;
	const BAS = photo ? 1016 : 986;
	const ENTETE = 46;
	const MARGE = 4;

	const h = Math.floor((BAS - HAUT - ENTETE) / wsMain.max) - MARGE;
	document.documentElement.style.setProperty('--res-ligne-h', Math.max(22, Math.min(64, h)) + 'px');
}

function Redimensionner()
{
	const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
	document.documentElement.style.setProperty('--res-scale', k);
}
