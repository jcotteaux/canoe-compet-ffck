/*
 * Liste de tous les bateaux actuellement en course, en surimpression en haut à
 * gauche.
 *
 * tv_inrace.html n'affiche qu'un seul bateau (celui choisi par GetBibSelect).
 * Cette page montre tout le monde, trié du plus proche de l'arrivée au plus
 * récemment parti, puis garde chaque arrivant un moment avec son temps et sa
 * place.
 *
 * Source des données :
 *   <on_course>    bateaux en course et temps tournant (10 Hz)
 *   <epreuve_load> le classement, d'où l'on tire identité, place et pénalités
 *   <bib_time>     les passages ; passage < 1 = arrivée
 *
 * Paramètres d'URL :
 *   epreuve=K1H       n'afficher que cette épreuve (défaut : toutes)
 *   max=8             nombre de lignes maximum (défaut : 10)
 *   scale=1.2         facteur de taille (défaut : 1)
 *   top=40 left=40    position en pixels (ancrage haut-gauche)
 *   right=40          ancre le bloc à droite plutôt qu'à gauche
 *   width=560         largeur du bandeau en pixels
 *   delay_finish=6000 durée d'affichage après l'arrivée en ms (défaut : 10000)
 *   no_pena           masque le cumul de pénalités
 *   time_pena=0       slalom : temps tournant sans les pénalités (défaut : avec)
 *                     alias du time_running_pena de tv_inrace
 *   fmt=XSCC          format du chrono (défaut : selon l'activité)
 *   bg=1              fond magenta au lieu de transparent (régie chroma-key)
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

	// épreuve vide = toutes : un bateau de n'importe quelle épreuve peut être
	// en course, on a besoin de toutes les identités.
	wsMain.websocket.send(JSON.stringify({ key : '<epreuve_load>', epreuve : '' }));
}

function OnCommandEpreuveLoad(objJSON)
{
	canoe.SetRanking(objJSON);
	canoe.SetColumnNameRanking(canoe.GetTableRanking());
	RefreshFinished();
	Render();
}

/** Recharge le classement : identités, places et pénalités ont pu changer. */
function ReloadEpreuve()
{
	if (wsMain.websocket && wsMain.websocket.readyState === WebSocket.OPEN)
		wsMain.websocket.send(JSON.stringify({ key : '<epreuve_load>', epreuve : '' }));
}

function OnBroadcastBibTime(objJSON)
{
	// passage >= 1 : temps intermédiaire, rien à faire ici.
	if (parseInt(objJSON.passage) >= 1)
		return;

	// Arrivée : le bateau va disparaître du flux <on_course>. On le garde
	// affiché le temps que le spectateur lise son temps et sa place. Le temps
	// et la place définitifs arrivent avec le <epreuve_load> qui suit ; en
	// attendant on affiche le chrono brut de la trame.
	wsMain.finished.set(String(objJSON.bib), {
		at : Date.now(),
		time : adv.toNumber(objJSON.time_chrono),
		rank : 0,
	});

	// Un rendu de plus à l'expiration : si plus aucun bateau n'est en course,
	// le flux <on_course> ne rythme plus l'affichage.
	window.setTimeout(Render, wsMain.delayFinish + 100);

	ReloadEpreuve();
	Render();
}

function OnBroadcastPenaltyAdd(objJSON)
{
	if (canoe.GetNbPorte() > 0)
		ReloadEpreuve();
}

function OnBroadcastRunErase(objJSON)
{
	wsMain.onCourse = [];
	wsMain.finished.clear();
	ReloadEpreuve();
	Render();
}

function OnFlowOnCourse(objJSON)
{
	const tOnCourse = adv.GetTableUnique(objJSON, 'table');
	const rows = [];

	for (let i = 0; i < tOnCourse.GetNbRows(); i++)
	{
		rows.push({
			bib : tOnCourse.GetCell('bib', i),
			time : tOnCourse.GetCellInt('time', i, 0),
		});
	}

	wsMain.onCourse = rows;
	Render();
}

/** Identité, épreuve et pénalités d'un dossard, lues dans le classement. */
function GetRacer(bib)
{
	const tRanking = canoe.GetTableRanking();
	const row = canoe.GetRankingBibIndex(tRanking, bib);
	if (row < 0)
		return null;

	return {
		row : row,
		name : tRanking.GetCell('Bateau', row),
		epreuve : tRanking.GetCell('Code_categorie', row),
		pena : canoe.GetNbPorte() > 0 ? canoe.GetCurrentSlalomTotalPena(tRanking, row) : 0,
	};
}

/** Reprend temps classant et place des arrivants dans le classement à jour. */
function RefreshFinished()
{
	if (wsMain.finished.size == 0)
		return;

	const tRanking = canoe.GetTableRanking();
	const course_phase = canoe.GetCodeCoursePhase();

	wsMain.finished.forEach(function(f, bib) {
		const row = canoe.GetRankingBibIndex(tRanking, bib);
		if (row < 0)
			return;

		// Tps inclut les pénalités : c'est le temps qui classe.
		const tps = tRanking.GetCellInt('Tps' + course_phase, row, 0);
		if (tps != 0)
			f.time = tps;

		// GetCellRank rend '' quand le bateau n'est pas classé (DNF, DSQ…).
		const rank = tRanking.GetCellRank('Cltc' + course_phase, row, 0);
		f.rank = parseInt(rank) > 0 ? parseInt(rank) : 0;
	});
}

function Render()
{
	const elList = document.getElementById('oncourse_list');
	const elBlock = document.getElementById('oncourse');
	if (elList == null || elBlock == null)
		return;

	const fmt = wsMain.fmtChrono ? wsMain.fmtChrono : canoe.GetFmtChrono();
	const now = Date.now();
	const slalom = canoe.GetNbPorte() > 0;

	// Les arrivants sortent de la liste passé le délai.
	wsMain.finished.forEach(function(f, bib) {
		if (now - f.at > wsMain.delayFinish)
			wsMain.finished.delete(bib);
	});

	const keep = function(racer) {
		return racer != null && (wsMain.epreuve === '' || racer.epreuve == wsMain.epreuve);
	};

	// Les arrivants d'abord, du plus récent au plus ancien : c'est l'information
	// neuve, et ils viennent de toute façon de franchir la ligne.
	const arrived = [];
	wsMain.finished.forEach(function(f, bib) {
		const racer = GetRacer(bib);
		if (!keep(racer))
			return;

		arrived.push({
			bib : bib, name : racer.name, time : f.time,
			rank : f.rank, pena : racer.pena, finished : true, at : f.at,
		});
	});
	arrived.sort(function(a, b) { return b.at - a.at; });

	// On n'affiche que les bateaux dont on connaît l'identité : un dossard nu
	// n'apprend rien au spectateur, et signale plutôt un classement pas encore
	// chargé.
	const running = [];
	for (const r of (wsMain.onCourse || []))
	{
		if (wsMain.finished.has(String(r.bib)))
			continue;			// déjà arrivé, affiché au-dessus

		const racer = GetRacer(r.bib);
		if (!keep(racer))
			continue;

		running.push({
			bib : r.bib, name : racer.name,
			time : wsMain.timePena ? r.time + racer.pena * 1000 : r.time,
			// `elapsed` (temps brut) sert au tri, `time` a l'affichage : en
			// slalom un bateau avec 50 s de pénalité n'est pas plus avancé sur
			// le parcours pour autant, il ne doit pas remonter en tête.
			elapsed : r.time,
			rank : 0, pena : racer.pena, finished : false,
		});
	}
	running.sort(function(a, b) { return b.elapsed - a.elapsed; });

	const shown = arrived.concat(running).slice(0, wsMain.max);

	elBlock.classList.toggle('empty', shown.length == 0);

	// Mise à jour en place : recréer le HTML à chaque trame (10 Hz) relancerait
	// l'animation d'entrée en boucle et ferait clignoter le bandeau.
	const seen = {};
	for (let rank = 0; rank < shown.length; rank++)
	{
		const r = shown[rank];
		const id = 'racer_' + r.bib;
		seen[id] = true;

		let el = document.getElementById(id);
		if (el == null)
		{
			el = document.createElement('div');
			el.id = id;
			el.className = 'racer';
			el.innerHTML = '<div class="bib"></div><div class="name"></div>'
				+ '<div class="pena"></div><div class="rank"></div><div class="time"></div>';
			elList.appendChild(el);
			// textContent : les identités viennent du serveur, on ne les
			// interprète pas comme du HTML.
			el.querySelector('.bib').textContent = r.bib;
			el.querySelector('.name').textContent = r.name;
		}

		el.classList.remove('leaving');
		el.classList.toggle('finished', r.finished);
		// L'ordre passe par la propriété flex `order` : déplacer réellement le
		// nœud (appendChild) le retire puis le réinsère, ce qui relance ses
		// animations CSS à chaque trame.
		el.style.order = rank;

		el.querySelector('.time').textContent = adv.GetChrono(r.time, fmt);

		// Cumul de pénalités, en slalom seulement et tant qu'il est non nul.
		const elPena = el.querySelector('.pena');
		if (wsMain.showPena && slalom && r.pena > 0)
		{
			elPena.textContent = '+' + r.pena;
			elPena.style.display = '';
		}
		else
		{
			elPena.style.display = 'none';
		}

		// Place, uniquement pour un arrivant classé.
		const elRank = el.querySelector('.rank');
		if (r.finished && r.rank > 0)
		{
			elRank.textContent = r.rank;
			elRank.style.display = '';
		}
		else
		{
			elRank.style.display = 'none';
		}
	}

	// Les bateaux qui ne sont plus affichés sortent en fondu.
	const existing = elList.querySelectorAll('.racer');
	for (let i = 0; i < existing.length; i++)
	{
		const el = existing[i];
		if (seen[el.id])
			continue;

		if (!el.classList.contains('leaving'))
		{
			el.classList.add('leaving');
			window.setTimeout(function() {
				// il a pu revenir en course entre-temps
				if (el.classList.contains('leaving') && el.parentNode)
					el.parentNode.removeChild(el);
			}, 900);
		}
	}
}

function Init()
{
	const urlParams = new URLSearchParams(window.location.search);
	const num = function(key, def) {
		const v = parseFloat(urlParams.get(key));
		return isNaN(v) ? def : v;
	};

	wsMain.onCourse = [];
	wsMain.finished = new Map();
	wsMain.epreuve = urlParams.has('epreuve') ? urlParams.get('epreuve') : '';
	wsMain.max = num('max', 10);
	wsMain.delayFinish = num('delay_finish', 10000);
	wsMain.showPena = !urlParams.has('no_pena');
	wsMain.fmtChrono = urlParams.has('fmt') ? urlParams.get('fmt') : '';

	// tv_inrace nomme ce réglage time_running_pena, le wiki le documente sous
	// time_pena : on accepte les deux.
	wsMain.timePena = urlParams.get('time_pena') !== '0'
		&& urlParams.get('time_running_pena') !== '0';

	const root = document.documentElement.style;
	root.setProperty('--oncourse-top', num('top', 40) + 'px');

	// Ancrage à gauche par défaut ; ?right=... bascule à droite.
	if (urlParams.has('right'))
	{
		document.body.classList.add('ancre-droite');
		root.setProperty('--oncourse-right', num('right', 40) + 'px');
	}
	else
	{
		root.setProperty('--oncourse-left', num('left', 40) + 'px');
	}
	root.setProperty('--oncourse-width', num('width', 560) + 'px');
	root.setProperty('--oncourse-scale', num('scale', 1));

	if (urlParams.get('bg') === '1')
		document.body.classList.add('chroma');
	if (urlParams.get('anim') === '0')
		document.body.classList.add('no-anim');

	wsMain.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsMain.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.mapCommand.set('<on_course>', OnFlowOnCourse);
	wsMain.mapCommand.set('<bib_time>', OnBroadcastBibTime);
	wsMain.mapCommand.set('<penalty_add>', OnBroadcastPenaltyAdd);
	wsMain.mapCommand.set('<run_erase>', OnBroadcastRunErase);

	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}
