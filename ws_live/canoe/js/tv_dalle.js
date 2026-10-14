/*
 * Écran des dalles LED extérieures : 4 dalles de large pour 1 de haut.
 *
 * Dalles ADJ EVS3 : 128 x 128 pixels chacune (pas de 3,9 mm), pilotées par
 * une carte NovaStar. Le contrôleur NovaStar ne met rien à l'échelle : il
 * prélève une zone fixe de la sortie HDMI du PC, en général en haut à gauche,
 * et l'envoie aux dalles. La page se dessine donc par défaut à la taille
 * exacte de l'ensemble, 512 x 128, à partir du coin haut gauche.
 *
 * La résolution d'une dalle est très faible : tout est gros, en aplats francs
 * sur fond noir (une LED éteinte, le meilleur contraste), sans dégradé, sans
 * filet fin, sans petit texte. Les tailles sont calculées sur la hauteur de
 * l'écran : la page remplit n'importe quelle résolution au format 4:1.
 *
 * Deux lignes de 512 x 64, un bateau chacune, sur toute la largeur, dans
 * l'ordre des départs :
 *   - les bateaux sur l'eau, le premier parti en haut : dossard, nom de
 *     famille, pénalités, chrono au dixième (les centièmes clignoteraient) ;
 *   - à chaque intermédiaire, pendant `delay_inter` ms (2 s) : le temps de
 *     passage et l'écart au meilleur de l'épreuve, vert ou rouge ;
 *   - un arrivant garde sa ligne `delay_finish` ms (4 s) avec son temps et sa
 *     place, puis sort par le haut : tout monte d'un cran et le suivant
 *     entre par le bas ;
 *   - une ligne libre montre le prochain partant et son compte à rebours.
 *
 * Paramètres d'URL :
 *   epreuve=K1H        seulement les bateaux de cette épreuve
 *   delay_finish=4000  maintien minimal d'un arrivant en ms, avant que tout monte
 *   avant_depart=5000  passé ce maintien, il ne monte que si un bateau sur l'eau
 *                      a besoin de sa ligne, ou si le prochain départ est dans
 *                      moins de tant de ms ; sinon son résultat reste affiché
 *   delay_inter=2000   affichage d'un intermédiaire en ms
 *   length_identity=16 longueur max du nom
 *   zone=512x128+0+0   la zone des dalles dans la sortie du PC : largeur x
 *                      hauteur + x + y, en pixels (défaut : 4 dalles EVS3 en
 *                      haut à gauche) ; zone=auto : plein écran au format
 *                      `ratio`, pour un aperçu
 *   ratio=4            zone=auto : largeur / hauteur de l'ensemble (défaut 4)
 */

const wsMain = new ws.Context(wsParams.url, wsParams.port);

function OnOpenWebSocketCommand()
{
	wsMain.websocket.send(JSON.stringify({ key : '<race_load>', key_race : '*' }));
}

function OnCommandRaceLoad(objJSON)
{
	canoe.SetRace(objJSON);
	// Format de chrono de l'activité (secondes en slalom : « 174,74 »).
	canoe.SetFmtChrono('');
	wsMain.websocket.send(JSON.stringify({ key : '<epreuve_load>', epreuve : '' }));
}

function OnCommandEpreuveLoad(objJSON)
{
	canoe.SetRanking(objJSON);
	canoe.SetColumnNameRanking(canoe.GetTableRanking());

	// Temps et place définitifs des arrivants.
	const tRanking = canoe.GetTableRanking();
	const cp = canoe.GetCodeCoursePhase();
	wsMain.finished.forEach(function(f, bib) {
		const row = canoe.GetRankingBibIndex(tRanking, parseInt(bib));
		if (row < 0)
			return;
		const tps = tRanking.GetCellInt('Tps' + cp, row, 0);
		if (tps !== 0)
			f.time = tps;
		const rank = parseInt(tRanking.GetCellRank('Cltc' + cp, row, 0));
		f.rank = rank > 0 ? rank : 0;
	});

	Render();
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
	const rows = [];
	for (let i = 0; i < t.GetNbRows(); i++)
		rows.push({ bib : String(t.GetCell('bib', i)), time : t.GetCellInt('time', i, 0) });

	const clock = adv.toNumber(objJSON.clock);
	if (clock !== null && clock > 0)
	{
		wsMain.clock = clock;
		wsMain.clockRecu = Date.now();
	}

	wsMain.onCourse = rows;
	Render();
}

function OnBroadcastBibTime(objJSON)
{
	if (parseInt(objJSON.passage) >= 1)
	{
		// Intermédiaire : affiché `delay_inter` ms à la place du chrono.
		const b = String(objJSON.bib);
		const k = parseInt(objJSON.passage);
		const time = adv.toNumber(objJSON.time_chrono);
		let diff = objJSON.diff_categ !== undefined ? adv.toNumber(objJSON.diff_categ) : null;
		if (diff === null || isNaN(diff))
			diff = EcartInter(b, k, time);
		wsMain.inters.set(b, { k : k, time : time, diff : diff, at : Date.now() });
		window.setTimeout(Render, wsMain.delayInter + 50);
		Render();
		return;
	}

	const bib = String(objJSON.bib);
	wsMain.finished.set(bib, { at : Date.now(), time : adv.toNumber(objJSON.time_chrono), rank : 0 });
	wsMain.onCourse = wsMain.onCourse.filter(function(r) { return r.bib !== bib; });
	window.setTimeout(Render, wsMain.delayFinish + 50);
	Render();
	ReloadEpreuve();
}

function OnBroadcastPenaltyAdd(objJSON)
{
	// Tout de suite à l'écran, sans attendre le classement.
	const tRanking = canoe.GetTableRanking();
	const row = (typeof tRanking === 'object' && tRanking !== null)
		? canoe.GetRankingBibIndex(tRanking, parseInt(objJSON.bib)) : -1;
	if (row >= 0 && parseInt(objJSON.gate) >= 1)
		tRanking.SetCell('Pena_' + parseInt(objJSON.gate), row, String(objJSON.penalty));

	Render();
	ReloadEpreuve();
}

/******************** lecture du classement ********************/

function Bateau(bib)
{
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking !== 'object' || tRanking === null)
		return null;

	const row = canoe.GetRankingBibIndex(tRanking, parseInt(bib));
	if (row < 0)
		return null;

	const cp = canoe.GetCodeCoursePhase();
	let pena = 0;
	if (canoe.GetNbPorte() > 0)
	{
		const total = tRanking.GetIndexColumn('Total_pena' + cp) >= 0 ? tRanking.GetCellInt('Total_pena' + cp, row, -1) : -1;
		pena = Math.max(total, canoe.GetCurrentSlalomTotalPena(tRanking, row));
	}

	return {
		row : row,
		name : tRanking.GetCell('Bateau', row),
		epreuve : tRanking.GetCell('Code_categorie', row),
		pena : pena,
	};
}

function Garder(bib)
{
	if (wsMain.epreuve === '')
		return true;
	const b = Bateau(bib);
	return b !== null && b.epreuve === wsMain.epreuve;
}

/** Le prochain partant : ni résultat ni chrono, l'heure de départ la plus proche. */
function Prochain(exclus)
{
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking !== 'object' || tRanking === null)
		return null;

	const cp = canoe.GetCodeCoursePhase();
	let best = null;

	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		if (String(tRanking.GetCell('Tps' + cp, row)) !== '')
			continue;
		const bib = String(tRanking.GetCell('Dossard', row));
		if (exclus.has(bib) || !Garder(bib))
			continue;
		const heure = tRanking.GetCellInt('Heure_depart' + cp, row, 0);
		if (heure <= 0 || (wsMain.clock > 0 && heure < HeureCompet() - 120000))
			continue;
		if (best === null || heure < best.heure)
			best = { bib : bib, heure : heure };
	}
	return best;
}

/** Écart au meilleur temps de l'épreuve à cet intermédiaire, d'après le classement. */
function EcartInter(bib, k, time)
{
	const tRanking = canoe.GetTableRanking();
	const b = Bateau(bib);
	if (!b || !(time > 0))
		return null;

	const col = 'Tps_chrono' + canoe.GetCodeCoursePhase() + '_inter' + k;
	if (tRanking.GetIndexColumn(col) < 0)
		return null;

	let best = 0;
	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		if (row === b.row || tRanking.GetCell('Code_categorie', row) != b.epreuve)
			continue;
		const t = tRanking.GetCellInt(col, row, 0);
		if (t >= adv.chrono.OK && (best === 0 || t < best))
			best = t;
	}
	return best > 0 ? time - best : null;
}

function HeureCompet()
{
	return wsMain.clock + (Date.now() - wsMain.clockRecu);
}

/******************** formats pour la dalle ********************/

/** Nom de famille seul : les mots tout en capitales (« CHEVALIER Arthur » -> « CHEVALIER »). */
function NomCourt(nom)
{
	const mots = String(nom || '').trim().split(/\s+/);
	const capitales = mots.filter(function(m) { return m.length > 1 && m === m.toUpperCase() && /[A-Z]/i.test(m); });
	let n = (capitales.length ? capitales : mots.slice(0, 1)).join(' ');
	if (n.length > wsMain.lengthIdentity)
		n = n.substring(0, wsMain.lengthIdentity);
	return n.toUpperCase();
}

/** Chrono qui tourne, au dixième : « 66,3 ». */
function ChronoDixieme(ms)
{
	if (!(ms > 0))
		return '0,0';
	const d = Math.floor(ms / 100);
	return Math.floor(d / 10) + ',' + (d % 10);
}

function FormatHeure(ms)
{
	const s = Math.floor(ms / 1000);
	const pad = function(n) { return (n < 10 ? '0' : '') + n; };
	return pad(Math.floor(s / 3600) % 24) + 'h' + pad(Math.floor(s / 60) % 60);
}

/******************** rendu ********************/

/**
 * Ordre de départ d'un bateau : l'heure de départ du classement, à défaut
 * déduite du chrono qui tourne. Le premier parti est en haut.
 */
function OrdreDepart(bib)
{
	const b = Bateau(bib);
	const tRanking = canoe.GetTableRanking();
	let h = b ? tRanking.GetCellInt('Heure_depart' + canoe.GetCodeCoursePhase(), b.row, 0) : 0;
	if (!(h > 0))
	{
		const r = wsMain.onCourse.find(function(x) { return x.bib === bib; });
		h = r && wsMain.clock > 0 ? HeureCompet() - r.time : 0;
	}
	return h;
}

/**
 * Les deux lignes, dans l'ordre des départs : les bateaux sur l'eau et les
 * arrivants encore à l'écran (`delay_finish`, 4 s), puis, s'il reste de la
 * place, les prochains partants. Un arrivant garde sa ligne avec son temps et
 * sa place ; à l'expiration il sort par le haut, et tout monte d'un cran.
 */
function Liste()
{
	const now = Date.now();
	const fmt = canoe.GetFmtChrono ? canoe.GetFmtChrono() : 'XSCC';
	const items = [];
	const vus = new Set();

	wsMain.onCourse.forEach(function(r) {
		if (!Garder(r.bib) || wsMain.finished.has(r.bib))
			return;
		const b = Bateau(r.bib);
		if (!b)
			return;
		vus.add(r.bib);

		const v = { type : 'course', bib : r.bib, nom : b.name, chrono : ChronoDixieme(r.time), pena : b.pena, ordre : OrdreDepart(r.bib) };

		// Intermédiaire tout juste passé : son temps et l'écart, 2 s.
		const it = wsMain.inters.get(r.bib);
		if (it && now - it.at < wsMain.delayInter)
		{
			// L'écart seul (le chrono figé montre déjà le temps de passage) ;
			// le numéro de l'intermédiaire quand l'écart est inconnu.
			v.inter = it.diff !== null && !isNaN(it.diff) && it.diff !== 0
				? adv.GetChronoDiff(it.diff, 'XSCC') : 'I' + it.k;
			v.interSens = it.diff < 0 ? 'avance' : it.diff > 0 ? 'retard' : '';
			v.chrono = adv.GetChrono(it.time, fmt);
		}
		items.push(v);
	});

	wsMain.finished.forEach(function(f, bib) {
		const b = Bateau(bib);
		if (!b || vus.has(bib) || !Garder(bib))
			return;
		vus.add(bib);
		items.push({ type : 'arrive', bib : bib, nom : b.name, chrono : adv.GetChrono(f.time, fmt), pena : b.pena, rank : f.rank, ordre : OrdreDepart(bib) });
	});

	items.sort(function(a, b) { return a.ordre - b.ordre; });

	/*
	 * Un arrivant reste au moins `delay_finish` ms. Ensuite il ne sort que si
	 * sa ligne sert : un bateau sur l'eau qui n'aurait pas de place, ou le
	 * prochain départ dans moins de 5 s. Sinon son résultat reste affiché
	 * (départs espacés, fin de catégorie) jusqu'au départ suivant.
	 */
	const prochain = Prochain(vus);
	const departProche = prochain !== null
		&& (!(wsMain.clock > 0) || prochain.heure - HeureCompet() <= wsMain.avantDepart);
	for (let i = 0; i < items.length; i++)
	{
		const v = items[i];
		if (v.type !== 'arrive')
			continue;
		const f = wsMain.finished.get(v.bib);
		const lignesPrises = items.filter(function(x) { return x !== v && !x.retire; }).length;
		if (now - f.at > wsMain.delayFinish && (lignesPrises >= 2 || departProche))
		{
			v.retire = true;
			wsMain.finished.delete(v.bib);
		}
	}
	const liste = items.filter(function(v) { return !v.retire; }).slice(0, 2);

	// Places libres : les prochains partants, avec leur compte à rebours.
	while (liste.length < 2)
	{
		const p = Prochain(vus);
		if (!p)
			break;
		vus.add(p.bib);
		const b = Bateau(p.bib);
		const reste = wsMain.clock > 0 ? p.heure - HeureCompet() : 0;
		let chrono = FormatHeure(p.heure);
		if (reste > 0 && reste < 600000)
		{
			const sec = Math.ceil(reste / 1000);
			chrono = Math.floor(sec / 60) + ':' + (sec % 60 < 10 ? '0' : '') + (sec % 60);
		}
		liste.push({ type : 'prochain', bib : p.bib, nom : b ? b.name : '', chrono : chrono, pena : 0 });
	}

	return liste;
}

/**
 * Dessine la pile : une ligne par dossard, posée par translateY. Une ligne qui
 * n'est plus à montrer sort par le haut, les autres montent, une nouvelle
 * entre par le bas (transition CSS).
 */
function Render()
{
	const dalle = document.getElementById('dalle');
	const liste = Liste();
	const garder = new Set(liste.map(function(v) { return v.bib; }));

	wsMain.lignes.forEach(function(el, bib) {
		if (garder.has(bib))
			return;
		wsMain.lignes.delete(bib);
		el.style.transform = 'translateY(-100%)';
		el.classList.add('sort');
		window.setTimeout(function() { el.remove(); }, 900);
	});

	liste.forEach(function(v, i) {
		let el = wsMain.lignes.get(v.bib);
		if (!el)
		{
			el = document.createElement('div');
			el.className = 'ligne';
			el.style.transform = 'translateY(' + (2 * 100) + '%)';
			dalle.appendChild(el);
			wsMain.lignes.set(v.bib, el);
			void el.offsetWidth;
		}

		const pos = 'translateY(' + (i * 100) + '%)';
		if (el.style.transform !== pos)
			el.style.transform = pos;

		SyncMoitie(el, v);
		el.classList.toggle('bas', i > 0);
	});
}

function SyncMoitie(el, v)
{
	if (!el.firstChild)
	{
		el.innerHTML =
			'<div class="l_bib"></div><div class="l_nom"></div><div class="l_pena"></div>' +
			'<div class="l_inter"></div><div class="l_chrono"></div><div class="l_place"></div>';
	}

	const classe = 'ligne ' + (v ? v.type : 'vide')
		+ (v && v.inter ? ' en-inter' + (v.interSens ? ' inter-' + v.interSens : '') : '')
		+ (el.classList.contains('bas') ? ' bas' : '');
	if (el.className !== classe)
		el.className = classe;
	if (!v)
		return;

	Texte(el.querySelector('.l_bib'), v.bib);

	const elNom = el.querySelector('.l_nom');
	if (elNom.textContent !== NomCourt(v.nom))
	{
		elNom.textContent = NomCourt(v.nom);
		Ajuster(elNom);
	}

	// Pénalités dès qu'il y en a : jaune pour des touches, rouge pour un 50.
	const elPena = el.querySelector('.l_pena');
	Texte(elPena, v.type !== 'prochain' && v.pena > 0 ? '+' + v.pena : '');
	elPena.className = 'l_pena' + (v.pena >= 50 ? ' rouge' : ' jaune');

	const elInter = el.querySelector('.l_inter');
	Texte(elInter, v.inter || '');
	elInter.className = 'l_inter' + (v.interSens ? ' ' + v.interSens : '');

	Texte(el.querySelector('.l_chrono'), v.chrono);

	const elPlace = el.querySelector('.l_place');
	Texte(elPlace, v.type === 'arrive' && v.rank > 0 ? v.rank + (v.rank === 1 ? 'er' : 'e') : '');
	elPlace.className = 'l_place' + (v.rank > 0 && v.rank <= 3 ? ' p' + v.rank : '');

	// Le nom cède la place si la ligne est trop chargée (pénalités + inter +
	// place) : il rétrécit, et un nom composé qui ne tient toujours pas garde
	// sa première partie (« DELAUNAY-MERCIER » -> « DELAUNAY »).
	const longueur = (v.inter || '').length + v.chrono.length + String(v.pena).length + (v.rank || 0);
	if (elNom.dataset.charge !== String(longueur))
	{
		elNom.dataset.charge = String(longueur);
		elNom.textContent = NomCourt(v.nom);
		Ajuster(elNom);
		if (elNom.scrollWidth > elNom.clientWidth && /[-\s]/.test(elNom.textContent))
		{
			elNom.textContent = elNom.textContent.split(/[-\s]/)[0];
			Ajuster(elNom);
		}
	}
}

/** Un texte trop long rétrécit jusqu'à tenir dans sa place (jamais sous 45 %). */
function Ajuster(el)
{
	el.style.fontSize = '';
	const base = parseFloat(getComputedStyle(el).fontSize);
	let k = 1;
	while (k > 0.45 && el.scrollWidth > el.clientWidth)
	{
		k -= 0.05;
		el.style.fontSize = (base * k) + 'px';
	}
}

function Texte(el, txt)
{
	if (el.textContent !== txt)
		el.textContent = txt;
}

/******************** taille ********************/

/**
 * L'ensemble des dalles au format `ratio`:1, le plus grand possible dans la
 * fenêtre. Toutes les tailles de la feuille de style sont en --u, le centième
 * de la hauteur : la page s'adapte à n'importe quelle résolution de dalle.
 */
function Redimensionner()
{
	const el = document.getElementById('dalle');
	let w, h;

	if (wsMain.zone)
	{
		// Zone fixe, au pixel près : c'est elle que prélève le contrôleur NovaStar.
		w = wsMain.zone.w;
		h = wsMain.zone.h;
		el.style.left = wsMain.zone.x + 'px';
		el.style.top = wsMain.zone.y + 'px';
		el.style.transform = 'none';
	}
	else
	{
		h = Math.min(window.innerHeight, window.innerWidth / wsMain.ratio);
		w = h * wsMain.ratio;
	}

	el.style.width = w + 'px';
	el.style.height = h + 'px';
	document.documentElement.style.setProperty('--u', (h / 100) + 'px');
	document.querySelectorAll('.l_nom').forEach(Ajuster);
}

function Init()
{
	const urlParams = new URLSearchParams(window.location.search);
	const num = function(key, def) {
		const v = parseFloat(urlParams.get(key));
		return isNaN(v) ? def : v;
	};

	wsMain.epreuve = urlParams.has('epreuve') ? urlParams.get('epreuve') : '';
	wsMain.delayFinish = num('delay_finish', 4000);
	wsMain.avantDepart = num('avant_depart', 5000);
	wsMain.delayInter = num('delay_inter', 2000);
	wsMain.inters = new Map();
	wsMain.lengthIdentity = num('length_identity', 16);
	wsMain.ratio = Math.max(1, num('ratio', 4));

	// Zone des dalles : 512x128+0+0 par défaut (4 EVS3 en haut à gauche).
	const zone = urlParams.has('zone') ? urlParams.get('zone') : '512x128+0+0';
	const m = /^(\d+)x(\d+)(?:\+(\d+)\+(\d+))?$/.exec(zone);
	wsMain.zone = m ? { w : +m[1], h : +m[2], x : +(m[3] || 0), y : +(m[4] || 0) } : null;
	wsMain.onCourse = [];
	wsMain.finished = new Map();
	wsMain.lignes = new Map();		// dossard -> ligne de la pile
	wsMain.clock = 0;
	wsMain.clockRecu = 0;
	wsMain.reloadTimer = null;

	Redimensionner();
	window.addEventListener('resize', Redimensionner);

	wsMain.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsMain.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.mapCommand.set('<on_course>', OnFlowOnCourse);
	wsMain.mapCommand.set('<bib_time>', OnBroadcastBibTime);
	wsMain.mapCommand.set('<penalty_add>', OnBroadcastPenaltyAdd);
	wsMain.mapCommand.set('<run_erase>', function() { wsMain.onCourse = []; wsMain.finished.clear(); ReloadEpreuve(); });
	wsMain.mapCommand.set('<mode_chrono>', function() { ReloadEpreuve(); });

	// Le compte à rebours du prochain partant avance même sans trame.
	setInterval(Render, 500);

	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}
