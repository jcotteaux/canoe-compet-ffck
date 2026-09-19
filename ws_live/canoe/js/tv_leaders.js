/*
 * Classement des premiers de l'épreuve en cours, en surimpression en bas à
 * gauche, avec le dernier arrivé en pied de bloc.
 *
 * L'épreuve affichée est celle du DERNIER ARRIVÉ : le classement ne bascule
 * qu'au moment où le premier bateau de la nouvelle épreuve franchit la ligne.
 * Basculer au départ viderait le bloc, puisque la nouvelle épreuve n'a alors
 * encore aucun classé.
 *
 * Au tout premier affichage, faute d'arrivée observée, on prend l'épreuve
 * chronométrée que porte le flux <on_course> (le même champ que le mode
 * scrolling de live.js, live.js:9-20) — mais seulement si elle a déjà des
 * classés. Sinon on remonte le programme à l'envers jusqu'à la dernière
 * épreuve qui en a : ouvrir la page pendant les K1D alors que seuls les K1H
 * ont des résultats doit montrer les K1H, pas un bloc vide.
 *
 * Source des données :
 *   <on_course>    épreuve en cours de chronométrage
 *   <epreuve_load> le classement complet (toutes épreuves, filtré ici)
 *   <bib_time>     les passages ; passage < 1 = arrivée
 *
 * Paramètres d'URL :
 *   max=8             nombre de places affichées (défaut : 8)
 *   epreuve=K1H       fige l'épreuve au lieu de suivre le chronométrage
 *   top=40 left=40    position en pixels (ancrage haut-gauche)
 *   bottom=40         ancre le bloc en bas plutôt qu'en haut
 *   width=620         largeur du bloc en pixels
 *   scale=1.2         facteur de taille (défaut : 1)
 *   libelle=1         libellé complet de l'épreuve au lieu du code court
 *   no_last           masque la ligne du dernier arrivé
 *   no_pena           masque le cumul de pénalités (slalom)
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

	// C'est ici que la bascule d'épreuve a lieu : il faut le classement à jour
	// pour connaître la catégorie du dossard qui vient d'arriver.
	if (wsMain.epreuveForcee === '' && wsMain.lastBib !== null)
	{
		const tRanking = canoe.GetTableRanking();
		const row = canoe.GetRankingBibIndex(tRanking, wsMain.lastBib);
		if (row >= 0)
		{
			const categ = tRanking.GetCell('Code_categorie', row);
			if (categ !== '' && categ !== wsMain.epreuve)
				wsMain.epreuve = categ;
		}
	}

	Render();
}

function ReloadEpreuve()
{
	if (wsMain.websocket && wsMain.websocket.readyState === WebSocket.OPEN)
		wsMain.websocket.send(JSON.stringify({ key : '<epreuve_load>', epreuve : '' }));
}

function OnFlowOnCourse(objJSON)
{
	if (typeof objJSON.epreuve === 'string')
		wsMain.epreuveChrono = objJSON.epreuve;

	// Tant qu'aucune épreuve n'est retenue, chaque trame est une occasion
	// d'amorcer. Une fois retenue, seules les arrivées la font changer : on ne
	// re-rend donc pas à 10 Hz, ce qui relancerait les animations des lignes.
	if (wsMain.epreuveForcee === '' && wsMain.epreuve === '')
		Render();
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

/** Y a-t-il au moins un bateau classé dans cette épreuve ? */
function HasClasses(categ)
{
	if (categ === '')
		return false;

	const tRanking = canoe.GetTableRanking();
	const course_phase = canoe.GetCodeCoursePhase();

	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		if (tRanking.GetCell('Code_categorie', row) != categ)
			continue;
		if (tRanking.GetCellInt('Tps' + course_phase, row, adv.chrono.KO) >= adv.chrono.OK)
			return true;
	}

	return false;
}

/**
 * Choix de l'épreuve au premier affichage, faute d'arrivée observée.
 * Ensuite, seule une arrivée fait basculer le classement.
 */
function EnsureEpreuve()
{
	if (wsMain.epreuveForcee !== '')
	{
		wsMain.epreuve = wsMain.epreuveForcee;
		return;
	}

	if (wsMain.epreuve !== '')
		return;

	if (HasClasses(wsMain.epreuveChrono))
	{
		wsMain.epreuve = wsMain.epreuveChrono;
		return;
	}

	// Le programme est dans l'ordre de déroulement : on le remonte à l'envers
	// pour tomber sur l'épreuve la plus avancée ayant des résultats.
	const tEpreuves = canoe.GetTable('Competition_Course_Phase_Manche_Epreuve');
	for (let r = tEpreuves.GetNbRows() - 1; r >= 0; r--)
	{
		const code = tEpreuves.GetCell('Libelle_court', r);
		if (HasClasses(code))
		{
			wsMain.epreuve = code;
			return;
		}
	}
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
			// Tps inclut déjà ces secondes : le pavé explique donc l'écart
			// entre le chrono du bateau et son temps au classement.
			pena : canoe.GetNbPorte() > 0 ? canoe.GetCurrentSlalomTotalPena(tRanking, row) : 0,
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

function RowId(bib)
{
	return 'leader_' + bib;
}

function GetFmt()
{
	return wsMain.fmtChrono ? wsMain.fmtChrono : canoe.GetFmtChrono();
}

/**
 * Crée la ligne si elle n'existe pas, sinon met simplement son contenu à jour.
 *
 * Une ligne déjà à l'écran n'est jamais recréée ni déplacée dans le DOM :
 * l'ordre passe par la propriété flex `order`. Réinsérer un nœud relance ses
 * animations CSS, ce qui ferait clignoter tout le classement à chaque arrivée.
 */
function SyncRow(container, r, ordre, estDernier)
{
	const id = RowId(r.bib);
	let el = document.getElementById(id);

	if (el == null)
	{
		el = document.createElement('div');
		el.id = id;
		el.className = 'leader';
		el.innerHTML = '<div class="rank"></div><div class="bib"></div>'
			+ '<div class="name"></div><div class="pena"></div><div class="time"></div>';
		container.appendChild(el);

		// textContent : les identités viennent du serveur, on ne les
		// interprète pas comme du HTML.
		el.querySelector('.bib').textContent = r.bib;
		el.querySelector('.name').textContent = r.name;
	}
	else if (el.parentNode !== container)
	{
		// Changement de zone (classement <-> pied de bloc) : rare, mais il
		// faut bien déplacer le nœud.
		container.appendChild(el);
	}

	el.style.order = ordre;
	el.classList.toggle('last', estDernier);
	el.querySelector('.rank').textContent = r.rank;
	el.querySelector('.time').textContent = adv.GetChrono(r.time, GetFmt());

	// Cumul de pénalités, en slalom seulement et tant qu'il est non nul :
	// afficher « +0 » sur chaque ligne n'apprendrait rien.
	const elPena = el.querySelector('.pena');
	if (wsMain.showPena && r.pena > 0)
	{
		elPena.textContent = '+' + r.pena;
		elPena.style.display = '';
	}
	else
	{
		elPena.style.display = 'none';
	}

	return el;
}

/** Position verticale de chaque ligne affichée, pour l'animation FLIP. */
function MesurerLignes(elBlock)
{
	const positions = new Map();
	const lignes = elBlock.querySelectorAll('.leader');
	for (let i = 0; i < lignes.length; i++)
		positions.set(lignes[i].id, lignes[i].getBoundingClientRect().top);

	return positions;
}

/**
 * Animation FLIP : on a relevé la position des lignes avant la mise à jour,
 * on relève la nouvelle, et on repart de l'ancienne pour glisser jusqu'à la
 * nouvelle. Les lignes déjà présentes descendent donc d'un cran au lieu de
 * réapparaître au nouvel endroit.
 */
function GlisserVersLaNouvellePosition(elBlock, avant)
{
	const lignes = elBlock.querySelectorAll('.leader');
	const aAnimer = [];

	for (let i = 0; i < lignes.length; i++)
	{
		const el = lignes[i];
		const y0 = avant.get(el.id);
		if (y0 === undefined)
			continue;			// ligne neuve : elle a son animation d'entrée

		const dy = y0 - el.getBoundingClientRect().top;
		if (Math.abs(dy) < 1)
			continue;

		el.style.transition = 'none';
		el.style.transform = 'translateY(' + dy + 'px)';
		aAnimer.push(el);
	}

	if (aAnimer.length === 0)
		return;

	// Deux trames : la première applique le décalage, la seconde lance la
	// transition. Sans cela le navigateur fusionne les deux écritures et rien
	// ne bouge.
	window.requestAnimationFrame(function() {
		window.requestAnimationFrame(function() {
			for (const el of aAnimer)
			{
				el.style.transition = 'transform 350ms ease-out';
				el.style.transform = '';
			}
		});
	});
}

function Render()
{
	const elBlock = document.getElementById('leaders');
	const elList = document.getElementById('leaders_list');
	const elCateg = document.getElementById('leaders_categ');
	const elLast = document.getElementById('leaders_last');
	if (elBlock == null || elList == null)
		return;

	EnsureEpreuve();
	const classement = wsMain.epreuve === '' ? [] : GetClassement();
	const tete = classement.slice(0, wsMain.max);

	// Rien à montrer tant qu'aucun bateau de l'épreuve n'est classé : un cadre
	// vide à l'écran est pire que pas de cadre.
	elBlock.classList.toggle('empty', tete.length == 0);

	if (wsMain.showCateg)
		elCateg.textContent = GetLibelleEpreuve();

	// Pied de bloc : le dernier arrivé, seulement s'il n'est pas déjà dans les
	// premiers. Le trait de séparation est porté par le CSS.
	let pied = null;
	if (wsMain.showLast && wsMain.lastBib !== null)
	{
		const dansLaTete = tete.some(function(r) { return String(r.bib) === wsMain.lastBib; });
		if (!dansLaTete)
		{
			const hors = classement.find(function(r) { return String(r.bib) === wsMain.lastBib; });
			if (hors !== undefined)
				pied = hors;
		}
	}

	const avant = MesurerLignes(elBlock);

	const vus = {};
	for (let i = 0; i < tete.length; i++)
	{
		const r = tete[i];
		vus[RowId(r.bib)] = true;
		SyncRow(elList, r, i, wsMain.lastBib !== null && String(r.bib) === wsMain.lastBib);
	}

	if (pied !== null)
	{
		vus[RowId(pied.bib)] = true;
		SyncRow(elLast, pied, 0, true);
	}
	elLast.style.display = pied === null ? 'none' : '';

	// Les lignes qui sortent du classement affiché sont retirées tout de suite :
	// les laisser s'estomper les ferait occuper leur place pendant l'animation,
	// et les autres ne pourraient pas glisser.
	const lignes = elBlock.querySelectorAll('.leader');
	for (let i = lignes.length - 1; i >= 0; i--)
	{
		if (!vus[lignes[i].id])
			lignes[i].parentNode.removeChild(lignes[i]);
	}

	GlisserVersLaNouvellePosition(elBlock, avant);
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
	wsMain.epreuveChrono = '';
	wsMain.lastBib = null;
	wsMain.showLast = !urlParams.has('no_last');
	wsMain.showPena = !urlParams.has('no_pena');
	wsMain.showCateg = !urlParams.has('no_categ');
	wsMain.libelle = urlParams.get('libelle') === '1';
	wsMain.fmtChrono = urlParams.has('fmt') ? urlParams.get('fmt') : '';

	const root = document.documentElement.style;
	root.setProperty('--leaders-left', num('left', 40) + 'px');

	// Ancrage en haut par défaut ; ?bottom=... bascule en bas.
	if (urlParams.has('bottom'))
	{
		document.body.classList.add('ancre-bas');
		root.setProperty('--leaders-bottom', num('bottom', 40) + 'px');
	}
	else
	{
		root.setProperty('--leaders-top', num('top', 40) + 'px');
	}
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
