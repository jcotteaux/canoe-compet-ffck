/*
 * Liste de tous les bateaux actuellement en course, en surimpression.
 *
 * tv_inrace.html n'affiche qu'un seul bateau (celui choisi par GetBibSelect).
 * Cette page montre tout le monde, trié du plus proche de l'arrivée au plus
 * récemment parti.
 *
 * Source des données :
 *   <on_course>    bateaux en course et temps tournant (10 Hz)
 *   <epreuve_load> le classement, d'où l'on tire l'identité d'un dossard
 *
 * Paramètres d'URL :
 *   epreuve=K1H     n'afficher que cette épreuve (défaut : toutes)
 *   max=8           nombre de lignes maximum (défaut : 10)
 *   scale=1.2       facteur de taille (défaut : 1)
 *   top=40 right=40 position en pixels
 *   width=520       largeur du bandeau en pixels
 *   titre=Sur l'eau libellé de l'en-tête ; titre= (vide) le masque
 *   time_pena=0     slalom : temps tournant sans les pénalités (défaut : avec)
 *   fmt=XSCC        format du chrono (défaut : selon l'activité)
 *   bg=1            fond magenta au lieu de transparent (régie chroma-key)
 *   anim=0          désactive les animations
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
	Render();
}

/** Recharge le classement : les identités et pénalités ont pu changer. */
function ReloadEpreuve()
{
	if (wsMain.websocket && wsMain.websocket.readyState === WebSocket.OPEN)
		wsMain.websocket.send(JSON.stringify({ key : '<epreuve_load>', epreuve : '' }));
}

function OnBroadcastBibTime(objJSON)
{
	// Une arrivée (passage < 1) modifie le classement : on le rafraîchit.
	if (parseInt(objJSON.passage) < 1)
		ReloadEpreuve();
}

function OnBroadcastPenaltyAdd(objJSON)
{
	if (canoe.GetNbPorte() > 0)
		ReloadEpreuve();
}

function OnBroadcastRunErase(objJSON)
{
	wsMain.onCourse = [];
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

/** Identité et épreuve d'un dossard, lues dans le classement. */
function GetRacer(bib)
{
	const tRanking = canoe.GetTableRanking();
	const row = canoe.GetRankingBibIndex(tRanking, bib);
	if (row < 0)
		return null;

	return {
		name : tRanking.GetCell('Bateau', row),
		epreuve : tRanking.GetCell('Code_categorie', row),
		pena : canoe.GetNbPorte() > 0 ? canoe.GetCurrentSlalomTotalPena(tRanking, row) : 0,
	};
}

function Render()
{
	const elList = document.getElementById('oncourse_list');
	const elBlock = document.getElementById('oncourse');
	if (elList == null || elBlock == null)
		return;

	const fmt = wsMain.fmtChrono ? wsMain.fmtChrono : canoe.GetFmtChrono();

	// On n'affiche que les bateaux dont on connaît l'identité : un dossard nu
	// n'apprend rien au spectateur, et signale plutôt un classement pas encore
	// chargé.
	const racers = [];
	for (const r of (wsMain.onCourse || []))
	{
		const racer = GetRacer(r.bib);
		if (racer == null)
			continue;
		if (wsMain.epreuve !== '' && racer.epreuve != wsMain.epreuve)
			continue;

		const time = wsMain.timePena ? r.time + racer.pena * 1000 : r.time;
		// `elapsed` (temps brut) sert au tri, `time` a l'affichage : en slalom
		// un bateau avec 50 s de penalite n'est pas plus avance sur le parcours
		// pour autant, il ne doit pas remonter en tete de liste.
		racers.push({ bib : r.bib, name : racer.name, time : time, elapsed : r.time });
	}

	// Le plus proche de l'arrivée en premier : c'est celui qu'on regarde.
	racers.sort(function(a, b) { return b.elapsed - a.elapsed; });
	const shown = racers.slice(0, wsMain.max);

	elBlock.classList.toggle('empty', shown.length == 0);

	const elCount = document.getElementById('oncourse_count');
	if (elCount != null)
		elCount.textContent = racers.length.toString();

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
			el.innerHTML = '<div class="bib"></div><div class="name"></div><div class="time"></div>';
			elList.appendChild(el);
			// textContent : les identites viennent du serveur, on ne les
			// interprete pas comme du HTML.
			el.querySelector('.bib').textContent = r.bib;
			el.querySelector('.name').textContent = r.name;
		}

		el.classList.remove('leaving');
		// L'ordre passe par la propriete flex `order` : deplacer reellement le
		// noeud (appendChild) le retire puis le reinsere, ce qui relance ses
		// animations CSS a chaque trame.
		el.style.order = rank;
		el.querySelector('.time').textContent = adv.GetChrono(r.time, fmt);
	}

	// Les bateaux qui ne sont plus en course sortent en fondu.
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
	wsMain.epreuve = urlParams.has('epreuve') ? urlParams.get('epreuve') : '';
	wsMain.max = num('max', 10);
	wsMain.timePena = urlParams.get('time_pena') !== '0';
	wsMain.fmtChrono = urlParams.has('fmt') ? urlParams.get('fmt') : '';

	const root = document.documentElement.style;
	root.setProperty('--oncourse-top', num('top', 40) + 'px');
	root.setProperty('--oncourse-right', num('right', 40) + 'px');
	root.setProperty('--oncourse-width', num('width', 520) + 'px');
	root.setProperty('--oncourse-scale', num('scale', 1));

	if (urlParams.get('bg') === '1')
		document.body.classList.add('chroma');
	if (urlParams.get('anim') === '0')
		document.body.classList.add('no-anim');

	const elTitle = document.getElementById('oncourse_title');
	const titre = urlParams.has('titre') ? urlParams.get('titre') : 'En course';
	if (titre === '')
		elTitle.style.display = 'none';
	else
		elTitle.innerHTML = titre + '<span class="count" id="oncourse_count">0</span>';

	wsMain.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsMain.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.mapCommand.set('<on_course>', OnFlowOnCourse);
	wsMain.mapCommand.set('<bib_time>', OnBroadcastBibTime);
	wsMain.mapCommand.set('<penalty_add>', OnBroadcastPenaltyAdd);
	wsMain.mapCommand.set('<run_erase>', OnBroadcastRunErase);

	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}
