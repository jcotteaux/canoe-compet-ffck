/*
 * Podium des trois premiers, déclenché à la fin d'une épreuve.
 *
 * Incrustation plein écran, vide le reste du temps. Elle se réveille quand la
 * dernière épreuve arrivée devient complète, joue sa séquence, puis disparaît.
 *
 * Fin d'épreuve : tous les bateaux de l'épreuve ont une valeur dans Tps.
 * competFFCK laisse cette colonne vide tant qu'un bateau n'a pas de résultat,
 * et y met une valeur négative pour DNF / DNS / DSQ (adv/adv.js:3) — un
 * abandon compte donc comme un bateau traité, pas comme un bateau attendu.
 *
 * Source des données :
 *   <bib_time>     les arrivées, qui désignent l'épreuve à surveiller
 *   <epreuve_load> le classement complet, d'où l'on tire le podium
 *
 * Paramètres d'URL :
 *   delay=15000     durée d'affichage en ms (défaut : 15000)
 *   scale=0.8       facteur de taille (défaut : 1)
 *   epreuve=K1H     avec force=1, joue le podium de cette épreuve tout de
 *                   suite et sans fin — pour régler le cadrage en répétition
 *   no_scrim        retire le voile assombrissant
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
	wsMain.websocket.send(JSON.stringify({ key : '<epreuve_load>', epreuve : '' }));
}

function OnCommandEpreuveLoad(objJSON)
{
	canoe.SetRanking(objJSON);
	canoe.SetColumnNameRanking(canoe.GetTableRanking());

	if (wsMain.force)
	{
		// Répétition : on joue le podium demandé sans attendre quoi que ce soit.
		if (!wsMain.dejaJouees.has(wsMain.epreuveForcee))
		{
			wsMain.dejaJouees.add(wsMain.epreuveForcee);
			Jouer(wsMain.epreuveForcee, false);
		}
		return;
	}

	// L'épreuve à surveiller est celle du dernier arrivé.
	if (wsMain.lastBib !== null)
	{
		const tRanking = canoe.GetTableRanking();
		const row = canoe.GetRankingBibIndex(tRanking, wsMain.lastBib);
		if (row >= 0)
			wsMain.epreuve = tRanking.GetCell('Code_categorie', row);
	}

	if (wsMain.epreuve === '' || wsMain.dejaJouees.has(wsMain.epreuve))
		return;

	if (EpreuveTerminee(wsMain.epreuve))
	{
		wsMain.dejaJouees.add(wsMain.epreuve);
		Jouer(wsMain.epreuve, true);
	}
}

function ReloadEpreuve()
{
	if (wsMain.websocket && wsMain.websocket.readyState === WebSocket.OPEN)
		wsMain.websocket.send(JSON.stringify({ key : '<epreuve_load>', epreuve : '' }));
}

function OnBroadcastBibTime(objJSON)
{
	if (parseInt(objJSON.passage) >= 1)
		return;

	wsMain.lastBib = String(objJSON.bib);
	ReloadEpreuve();
}

function OnBroadcastRunErase(objJSON)
{
	// La manche est refaite : son podium redevient jouable.
	wsMain.dejaJouees.clear();
	wsMain.lastBib = null;
	Masquer();
	ReloadEpreuve();
}

/** Tous les bateaux de l'épreuve ont-ils un résultat ou un statut ? */
function EpreuveTerminee(categ)
{
	const tRanking = canoe.GetTableRanking();
	const course_phase = canoe.GetCodeCoursePhase();
	let nb = 0;

	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		if (tRanking.GetCell('Code_categorie', row) != categ)
			continue;

		nb++;
		// '' = pas encore de résultat. Une valeur, même négative (DNF, DSQ),
		// signifie que le bateau est traité.
		if (String(tRanking.GetCell('Tps' + course_phase, row)) === '')
			return false;
	}

	return nb > 0;
}

/** Les trois premiers de l'épreuve, dans l'ordre du classement. */
function GetPodium(categ)
{
	const tRanking = canoe.GetTableRanking();
	const course_phase = canoe.GetCodeCoursePhase();
	const out = [];

	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		if (tRanking.GetCell('Code_categorie', row) != categ)
			continue;

		const tps = tRanking.GetCellInt('Tps' + course_phase, row, adv.chrono.KO);
		if (tps < adv.chrono.OK)
			continue;			// non classé : DNF, DNS, DSQ

		out.push({
			bib : tRanking.GetCell('Dossard', row),
			name : tRanking.GetCell('Bateau', row),
			time : tps,
		});
	}

	out.sort(function(a, b) { return a.time - b.time; });
	return out.slice(0, 3);
}

function Jouer(categ, avecSortie)
{
	const podium = GetPodium(categ);
	if (podium.length === 0)
		return;				// épreuve entièrement non classée : rien à montrer

	const el = document.getElementById('podium');
	const fmt = wsMain.fmtChrono ? wsMain.fmtChrono : canoe.GetFmtChrono();

	document.getElementById('podium_categ').textContent = categ;

	for (let place = 1; place <= 3; place++)
	{
		const step = document.getElementById('step_' + place);
		const r = podium[place - 1];

		// Moins de trois classés : la marche vide disparaît plutôt que de
		// montrer un bloc sans nom.
		step.classList.toggle('vide', r === undefined);
		if (r === undefined)
			continue;

		// textContent : les identités viennent du serveur, on ne les
		// interprète pas comme du HTML.
		step.querySelector('.bib').textContent = r.bib;
		step.querySelector('.name').textContent = r.name;
		step.querySelector('.time').textContent = adv.GetChrono(r.time, fmt);
	}

	// Retrait puis remise des classes : sans cela, un second podium ne
	// rejouerait pas les animations, déjà consommées sur ces éléments.
	el.classList.remove('entre', 'sort', 'cache');
	void el.offsetWidth;
	el.classList.add('entre');

	window.clearTimeout(wsMain.timerSortie);
	if (avecSortie)
		wsMain.timerSortie = window.setTimeout(Sortir, wsMain.dureeAffichage);
}

function Sortir()
{
	const el = document.getElementById('podium');
	el.classList.remove('entre');
	el.classList.add('sort');
	window.setTimeout(Masquer, 600);
}

function Masquer()
{
	const el = document.getElementById('podium');
	window.clearTimeout(wsMain.timerSortie);
	el.classList.remove('entre', 'sort');
	el.classList.add('cache');
}

function Init()
{
	const urlParams = new URLSearchParams(window.location.search);
	const num = function(key, def) {
		const v = parseFloat(urlParams.get(key));
		return isNaN(v) ? def : v;
	};

	wsMain.epreuve = '';
	wsMain.epreuveForcee = urlParams.has('epreuve') ? urlParams.get('epreuve') : '';
	wsMain.force = urlParams.get('force') === '1' && wsMain.epreuveForcee !== '';
	wsMain.lastBib = null;
	wsMain.dejaJouees = new Set();
	// Surtout pas `wsMain.delay` : ws.Context s'en sert pour differer la
	// distribution de TOUTES les trames (ws.js, onmessage_command_delay).
	// L'y ecrire retarderait chaque message de 15 secondes.
	wsMain.dureeAffichage = num('delay', 15000);
	wsMain.timerSortie = null;
	wsMain.fmtChrono = urlParams.has('fmt') ? urlParams.get('fmt') : '';

	document.documentElement.style.setProperty('--podium-scale', num('scale', 1));

	if (urlParams.get('bg') === '1')
		document.body.classList.add('chroma');
	if (urlParams.get('anim') === '0')
		document.body.classList.add('no-anim');
	if (urlParams.has('no_scrim'))
		document.body.classList.add('no-scrim');

	wsMain.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsMain.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.mapCommand.set('<bib_time>', OnBroadcastBibTime);
	wsMain.mapCommand.set('<penalty_add>', function() { ReloadEpreuve(); });
	wsMain.mapCommand.set('<run_erase>', OnBroadcastRunErase);

	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}
