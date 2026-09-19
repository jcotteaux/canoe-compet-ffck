/*
 * Classement des premiers de l'épreuve en cours, en surimpression en bas à
 * gauche, avec le dernier arrivé en pied de bloc.
 *
 * L'épreuve affichée suit celle qui est chronométrée : quand un K1H part, le
 * classement bascule sur les K1H. C'est le champ `epreuve` du flux
 * <on_course> qui porte cette information, comme pour le mode scrolling de
 * live.js (live.js:9-20).
 *
 * Source des données :
 *   <on_course>    épreuve en cours de chronométrage
 *   <epreuve_load> le classement complet (toutes épreuves, filtré ici)
 *   <bib_time>     les passages ; passage < 1 = arrivée
 *
 * Paramètres d'URL :
 *   max=8             nombre de places affichées (défaut : 8)
 *   epreuve=K1H       fige l'épreuve au lieu de suivre le chronométrage
 *   bottom=40 left=40 position en pixels
 *   width=620         largeur du bloc en pixels
 *   scale=1.2         facteur de taille (défaut : 1)
 *   libelle=1         libellé complet de l'épreuve au lieu du code court
 *   no_last           masque la ligne du dernier arrivé
 *   no_categ          masque l'en-tête d'épreuve
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

	// épreuve vide = toutes : on filtre ensuite côté client, ce qui évite un
	// aller-retour à chaque changement d'épreuve chronométrée.
	wsMain.websocket.send(JSON.stringify({ key : '<epreuve_load>', epreuve : '' }));
}

function OnCommandEpreuveLoad(objJSON)
{
	canoe.SetRanking(objJSON);
	canoe.SetColumnNameRanking(canoe.GetTableRanking());
	Render();
}

function ReloadEpreuve()
{
	if (wsMain.websocket && wsMain.websocket.readyState === WebSocket.OPEN)
		wsMain.websocket.send(JSON.stringify({ key : '<epreuve_load>', epreuve : '' }));
}

function OnFlowOnCourse(objJSON)
{
	// L'épreuve chronométrée pilote le classement affiché, sauf si l'URL en
	// impose une.
	if (wsMain.epreuveForcee === '' && typeof objJSON.epreuve === 'string' && objJSON.epreuve !== '')
	{
		if (objJSON.epreuve !== wsMain.epreuve)
		{
			wsMain.epreuve = objJSON.epreuve;
			Render();
		}
	}
}

function OnBroadcastBibTime(objJSON)
{
	if (parseInt(objJSON.passage) >= 1)
		return;

	wsMain.lastBib = String(objJSON.bib);
	ReloadEpreuve();		// temps classant et places viennent du classement
}

function OnBroadcastPenaltyAdd(objJSON)
{
	if (canoe.GetNbPorte() > 0)
		ReloadEpreuve();
}

function OnBroadcastRunErase(objJSON)
{
	wsMain.lastBib = null;
	ReloadEpreuve();
	Render();
}

/**
 * Classement de l'épreuve affichée : les bateaux ayant un temps valide, triés
 * par ce temps. Les statuts (DNF, DNS, DSQ) sont des valeurs négatives et
 * sortent donc naturellement du classement (adv/adv.js:3).
 */
function GetClassement()
{
	const tRanking = canoe.GetTableRanking();
	const course_phase = canoe.GetCodeCoursePhase();
	const out = [];

	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		if (tRanking.GetCell('Code_categorie', row) != wsMain.epreuve)
			continue;

		const tps = tRanking.GetCellInt('Tps' + course_phase, row, adv.chrono.KO);
		if (tps < adv.chrono.OK)
			continue;

		// Cltc est le rang dans la catégorie, calculé par competFFCK. On le
		// reprend tel quel pour ne pas diverger de lui en cas d'ex aequo ;
		// à défaut on retombe sur la position dans la liste triée.
		const rank = parseInt(tRanking.GetCellRank('Cltc' + course_phase, row, 0));

		out.push({
			bib : tRanking.GetCell('Dossard', row),
			name : tRanking.GetCell('Bateau', row),
			time : tps,
			rank : rank > 0 ? rank : 0,
		});
	}

	out.sort(function(a, b) { return a.time - b.time; });
	for (let i = 0; i < out.length; i++)
	{
		if (out[i].rank === 0)
			out[i].rank = i + 1;
	}

	return out;
}

/** Construit (ou met à jour) une ligne de classement. */
function BuildRow(el, r)
{
	if (el == null)
	{
		el = document.createElement('div');
		el.className = 'leader';
		el.innerHTML = '<div class="rank"></div><div class="bib"></div>'
			+ '<div class="name"></div><div class="time"></div>';
	}

	// textContent : les identités viennent du serveur, on ne les interprète
	// pas comme du HTML.
	el.querySelector('.rank').textContent = r.rank;
	el.querySelector('.bib').textContent = r.bib;
	el.querySelector('.name').textContent = r.name;
	el.querySelector('.time').textContent = adv.GetChrono(r.time, GetFmt());
	return el;
}

function GetFmt()
{
	return wsMain.fmtChrono ? wsMain.fmtChrono : canoe.GetFmtChrono();
}

function Render()
{
	const elBlock = document.getElementById('leaders');
	const elList = document.getElementById('leaders_list');
	const elCateg = document.getElementById('leaders_categ');
	const elLast = document.getElementById('leaders_last');
	if (elBlock == null || elList == null)
		return;

	const classement = wsMain.epreuve === '' ? [] : GetClassement();
	const tete = classement.slice(0, wsMain.max);

	// Rien à montrer tant qu'aucun bateau de l'épreuve n'est classé : un cadre
	// vide à l'écran est pire que pas de cadre.
	elBlock.classList.toggle('empty', tete.length == 0);

	if (wsMain.showCateg)
		elCateg.textContent = GetLibelleEpreuve();

	// Liste des premiers. On reconstruit : contrairement au temps tournant,
	// un classement ne bouge qu'à chaque arrivée, pas dix fois par seconde.
	elList.innerHTML = '';
	for (const r of tete)
	{
		const el = BuildRow(null, r);
		if (wsMain.lastBib !== null && String(r.bib) === wsMain.lastBib)
			el.classList.add('last');		// le dernier arrivé est déjà dans les premiers
		elList.appendChild(el);
	}

	// Pied de bloc : le dernier arrivé, seulement s'il n'est pas déjà affiché
	// au-dessus. Le trait de séparation est porté par le CSS.
	elLast.innerHTML = '';
	elLast.style.display = 'none';

	if (wsMain.showLast && wsMain.lastBib !== null)
	{
		const dansLaTete = tete.some(function(r) { return String(r.bib) === wsMain.lastBib; });
		if (!dansLaTete)
		{
			const hors = classement.find(function(r) { return String(r.bib) === wsMain.lastBib; });
			if (hors !== undefined)
			{
				const el = BuildRow(null, hors);
				el.classList.add('last');
				elLast.appendChild(el);
				elLast.style.display = '';
			}
		}
	}
}

/** Code court de l'épreuve, ou son libellé complet avec ?libelle=1. */
function GetLibelleEpreuve()
{
	if (!wsMain.libelle)
		return wsMain.epreuve;

	const tEpreuves = canoe.GetTable('Competition_Course_Phase_Manche_Epreuve');
	const row = tEpreuves.GetIndexRow('Libelle_court', wsMain.epreuve);
	if (row >= 0)
		return tEpreuves.GetCell('Libelle', row, wsMain.epreuve);

	return wsMain.epreuve;
}

function Init()
{
	const urlParams = new URLSearchParams(window.location.search);
	const num = function(key, def) {
		const v = parseFloat(urlParams.get(key));
		return isNaN(v) ? def : v;
	};

	wsMain.max = num('max', 8);
	wsMain.epreuveForcee = urlParams.has('epreuve') ? urlParams.get('epreuve') : '';
	wsMain.epreuve = wsMain.epreuveForcee;
	wsMain.lastBib = null;
	wsMain.showLast = !urlParams.has('no_last');
	wsMain.showCateg = !urlParams.has('no_categ');
	wsMain.libelle = urlParams.get('libelle') === '1';
	wsMain.fmtChrono = urlParams.has('fmt') ? urlParams.get('fmt') : '';

	const root = document.documentElement.style;
	root.setProperty('--leaders-bottom', num('bottom', 40) + 'px');
	root.setProperty('--leaders-left', num('left', 40) + 'px');
	root.setProperty('--leaders-width', num('width', 620) + 'px');
	root.setProperty('--leaders-scale', num('scale', 1));

	if (urlParams.get('bg') === '1')
		document.body.classList.add('chroma');
	if (urlParams.get('anim') === '0')
		document.body.classList.add('no-anim');
	if (!wsMain.showCateg)
		document.getElementById('leaders_categ').style.display = 'none';

	wsMain.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsMain.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.mapCommand.set('<on_course>', OnFlowOnCourse);
	wsMain.mapCommand.set('<bib_time>', OnBroadcastBibTime);
	wsMain.mapCommand.set('<penalty_add>', OnBroadcastPenaltyAdd);
	wsMain.mapCommand.set('<run_erase>', OnBroadcastRunErase);

	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}
