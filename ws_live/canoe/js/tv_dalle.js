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
 *     famille, pénalités, chrono au dixième (les centièmes clignoteraient),
 *     et dessous la bande de toutes les portes (18 à 25) : vert jugée sans
 *     touche, jaune 2, rouge 50, gris pas encore jugée ;
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
 *   delay_inter        affichage d'un intermédiaire en ms (2 s en vue « deux »,
 *                      4 s en vue « dernier », à la place du chrono)
 *   length_identity=16 longueur max du nom
 *   zone=512x128+0+0   la zone d'une rangée de dalles dans la sortie du PC :
 *                      largeur x hauteur + x + y, en pixels (défaut : 4 dalles
 *                      EVS3 en haut à gauche) ; zone=auto : plein écran au
 *                      format `ratio`, pour un aperçu
 *   vue=deux           deux bateaux, une ligne chacun (défaut : un seul bateau
 *                      sur toute la rangée, celui qui va arriver, avec ses
 *                      intermédiaires, puis son résultat 15 s)
 *   resultat=15000     vue « dernier » : le résultat d'un arrivant (place,
 *                      pénalités, écart au premier) reste tant de ms, même si
 *                      un autre est parti entre-temps
 *   copies=2           rangées de dalles qui montrent la même chose, empilées
 *                      sous la zone (défaut 2 : 512 x 256 en tout)
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
		f.ecart = EcartPremier(row, f.time);
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

		// Vue « dernier » : tous les intermédiaires du bateau restent affichés.
		const tous = wsMain.intersTous.get(b) || {};
		tous[k] = { time : time, diff : diff };
		wsMain.intersTous.set(b, tous);
		window.setTimeout(Render, Math.max(wsMain.delayInter, wsMain.delayInterSeul) + 50);
		Render();
		return;
	}

	const bib = String(objJSON.bib);
	wsMain.finished.set(bib, { at : Date.now(), time : adv.toNumber(objJSON.time_chrono), rank : 0, ecart : null });
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

	// Une valeur par porte, dans l'ordre du parcours : '0', '2', '50' ou ''
	// tant qu'elle n'est pas jugée.
	const portes = [];
	for (let p = 1; p <= canoe.GetNbPorte(); p++)
		portes.push(String(tRanking.GetCell('Pena_' + p, row)));

	return {
		row : row,
		name : tRanking.GetCell('Bateau', row),
		epreuve : tRanking.GetCell('Code_categorie', row),
		pena : pena,
		portes : portes,
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

/**
 * Écart au meilleur des AUTRES classés de l'épreuve pour un temps d'arrivée :
 * positif derrière le leader, négatif pour un nouveau leader (son avance sur
 * l'ancien), 0 pour le premier classé, null si le temps n'est pas valide.
 */
function EcartPremier(row, time)
{
	const tRanking = canoe.GetTableRanking();
	const cp = canoe.GetCodeCoursePhase();
	if (!(time >= adv.chrono.OK))
		return null;

	const epreuve = tRanking.GetCell('Code_categorie', row);
	let best = 0;
	for (let r = 0; r < tRanking.GetNbRows(); r++)
	{
		if (r === row || tRanking.GetCell('Code_categorie', r) != epreuve)
			continue;
		const t = tRanking.GetCellInt('Tps' + cp, r, 0);
		if (t >= adv.chrono.OK && (best === 0 || t < best))
			best = t;
	}
	return best > 0 ? time - best : 0;
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
	// Une seule liste, peinte dans chaque copie : elles restent synchrones.
	const liste = wsMain.vue === 'deux' ? Liste() : ListeSeul();
	wsMain.copies.forEach(function(copie) { Peindre(copie, liste); });
}

/******************** vue « dernier » : un seul bateau ********************/

/**
 * Un seul bateau sur toute la rangée, dans cet ordre de priorité :
 *   1. une arrivée de moins de `resultat` ms (15 s) : place, pénalités,
 *      écart au premier ;
 *   2. celui qui va arriver : sur l'eau, parti le plus tôt (chrono,
 *      intermédiaires, portes) ;
 *   3. rivière vide : le dernier résultat, jusqu'au départ suivant ;
 *   4. personne encore parti : le prochain partant et son compte à rebours.
 * Au changement de bateau, l'ancien monte et le nouveau entre par le bas.
 */
function ListeSeul()
{
	const now = Date.now();
	const fmt = canoe.GetFmtChrono ? canoe.GetFmtChrono() : 'XSCC';
	let meilleur = null;

	// Une arrivée de moins de `resultat` ms (15 s) passe avant tout : place,
	// pénalités et écart au premier, lisibles de loin.
	wsMain.finished.forEach(function(f, bib) {
		if (!Garder(bib) || now - f.at >= wsMain.maintienResultat)
			return;
		if (!meilleur || f.at > meilleur.f.at)
			meilleur = { bib : bib, ordre : OrdreDepart(bib), f : f, prioritaire : true };
	});

	// Sinon, celui qui va arriver : sur l'eau, parti le plus tôt.
	if (!meilleur) wsMain.onCourse.forEach(function(r) {
		if (!Garder(r.bib) || wsMain.finished.has(r.bib))
			return;
		const o = OrdreDepart(r.bib);
		if (!meilleur || o < meilleur.ordre)
			meilleur = { bib : r.bib, ordre : o, r : r };
	});
	// Rivière vide : le dernier résultat reste affiché jusqu'au départ suivant.
	if (!meilleur) wsMain.finished.forEach(function(f, bib) {
		if (!Garder(bib))
			return;
		const o = OrdreDepart(bib);
		if (!meilleur || o > meilleur.ordre)
			meilleur = { bib : bib, ordre : o, f : f };
	});

	// Les arrivants plus anciens que celui affiché, et hors de leurs 15 s, ne
	// servent plus.
	wsMain.finished.forEach(function(f, bib) {
		if ((!meilleur || bib !== meilleur.bib) && now - f.at >= wsMain.maintienResultat)
			wsMain.finished.delete(bib);
	});

	if (meilleur)
	{
		const b = Bateau(meilleur.bib);
		if (b)
		{
			const v = { bib : meilleur.bib, nom : b.name, pena : b.pena, portes : b.portes, inters : IntersDe(meilleur.bib, b) };
			if (meilleur.f)
			{
				v.type = 'arrive';
				v.chrono = adv.GetChrono(meilleur.f.time, fmt);
				v.rank = meilleur.f.rank;
				v.ecart = meilleur.f.ecart;
			}
			else
			{
				v.type = 'course';
				v.chrono = ChronoDixieme(meilleur.r.time);

				// Intermédiaire tout juste passé : à la place du chrono, quelques
				// secondes, son temps de passage teinté et l'écart en pastille.
				const it = wsMain.inters.get(meilleur.bib);
				if (it && now - it.at < wsMain.delayInterSeul)
				{
					v.chrono = adv.GetChrono(it.time, fmt);
					v.interSens = it.diff < 0 ? 'avance' : it.diff > 0 ? 'retard' : 'neutre';
					v.interDiff = it.diff !== null && !isNaN(it.diff) && it.diff !== 0
						? adv.GetChronoDiff(it.diff, 'XSCC') : 'I' + it.k;
				}
			}
			return [v];
		}
	}

	const p = Prochain(new Set());
	if (!p)
		return [];
	const b = Bateau(p.bib);
	const reste = wsMain.clock > 0 ? p.heure - HeureCompet() : 0;
	let chrono = FormatHeure(p.heure);
	if (reste > 0 && reste < 600000)
	{
		const sec = Math.ceil(reste / 1000);
		chrono = Math.floor(sec / 60) + ':' + (sec % 60 < 10 ? '0' : '') + (sec % 60);
	}
	return [{ type : 'prochain', bib : p.bib, nom : b ? b.name : '', chrono : chrono, pena : 0, portes : [], inters : [] }];
}

/** Les intermédiaires passés par un bateau : reçus, à défaut lus dans le classement. */
function IntersDe(bib, b)
{
	const tRanking = canoe.GetTableRanking();
	const cp = canoe.GetCodeCoursePhase();
	const recus = wsMain.intersTous.get(bib) || {};
	const out = [];

	for (let k = 1; k <= canoe.GetNbInter(); k++)
	{
		let it = recus[k];
		if (!it)
		{
			const col = 'Tps_chrono' + cp + '_inter' + k;
			const t = tRanking.GetIndexColumn(col) >= 0 ? tRanking.GetCellInt(col, b.row, 0) : 0;
			if (t >= adv.chrono.OK)
				it = { time : t, diff : EcartInter(bib, k, t) };
		}
		if (it)
			out.push({ k : k, time : it.time, diff : it.diff });
	}
	return out;
}

/**
 * Une rangée entière pour un bateau.
 *   En course :  dossard | nom | pénalités | [écart inter] | chrono
 *                portes, sur toute la largeur, en grand
 *   À l'inter :  le chrono laisse place, quelques secondes, au temps de passage
 *                (teinté vert ou rouge) et à l'écart en grosse pastille
 *   Arrivé :     dossard | nom                     | pénalités
 *                dossard | temps | écart (en grand) | place (tout à droite)
 *                portes, en petits carrés
 */
function SyncSeul(el, v)
{
	if (!el.firstChild)
	{
		el.innerHTML =
			'<div class="s_bib"></div><div class="s_nom"></div><div class="s_pena"></div>' +
			'<div class="s_diff"></div><div class="s_chrono"></div>' +
			'<div class="s_ecart"></div><div class="s_place"></div><div class="s_portes"></div>';
	}

	const classe = 'ligne seul ' + v.type + (v.interSens ? ' inter-' + v.interSens : '');
	if (el.className !== classe)
		el.className = classe;

	Texte(el.querySelector('.s_bib'), v.bib);
	Texte(el.querySelector('.s_chrono'), v.chrono);

	const elPena = el.querySelector('.s_pena');
	Texte(elPena, v.type !== 'prochain' && v.pena > 0 ? '+' + v.pena : '');
	elPena.className = 's_pena' + (v.pena >= 50 ? ' rouge' : ' jaune');

	// Intermédiaire : l'écart au meilleur de l'épreuve, à côté du temps de passage.
	Texte(el.querySelector('.s_diff'), v.interDiff || '');

	// Arrivée : l'écart au premier en grand, et la place tout à droite.
	const elEcart = el.querySelector('.s_ecart');
	let ecart = '';
	if (v.type === 'arrive' && v.ecart !== null && v.ecart !== undefined)
		ecart = v.ecart === 0 ? 'Leader' : adv.GetChronoDiff(v.ecart, 'XSCC');
	Texte(elEcart, ecart);
	elEcart.className = 's_ecart' + (v.ecart === 0 ? ' leader' : v.ecart < 0 ? ' moins' : v.ecart > 0 ? ' plus' : '');

	const elPlace = el.querySelector('.s_place');
	Texte(elPlace, v.type === 'arrive' && v.rank > 0 ? v.rank + (v.rank === 1 ? 'er' : 'e') : '');
	elPlace.className = 's_place' + (v.rank > 0 && v.rank <= 3 ? ' p' + v.rank : '');

	// Les portes : en grand en course, en petits carrés sous le résultat.
	const bande = el.querySelector('.s_portes');
	SyncPortes(bande, v.type !== 'prochain' ? (v.portes || []) : []);
	if (bande.firstChild)
	{
		// Le chiffre prend toute la place de la case : on lui donne sa taille.
		const c = bande.firstChild;
		bande.style.setProperty('--pw', c.offsetWidth + 'px');
		bande.style.setProperty('--ph', c.offsetHeight + 'px');
	}

	// Le nom rétrécit si la ligne est chargée ; un nom composé garde sa
	// première partie.
	const elNom = el.querySelector('.s_nom');
	const charge = v.type + '|' + v.chrono.length + '|' + v.pena + '|' + (v.interDiff || '') + '|' + (v.rank || 0) + '|' + v.nom;
	if (el.dataset.charge !== charge)
	{
		el.dataset.charge = charge;
		elNom.textContent = NomCourt(v.nom);
		Ajuster(elNom);
		if (elNom.scrollWidth > elNom.clientWidth && /[-\s]/.test(elNom.textContent))
		{
			elNom.textContent = elNom.textContent.split(/[-\s]/)[0];
			Ajuster(elNom);
		}
	}
}

/** Peint la liste dans une copie des dalles (son conteneur et ses lignes). */
function Peindre(copie, liste)
{
	const dalle = copie.el;
	const garder = new Set(liste.map(function(v) { return v.bib; }));

	// Sorties : vers le haut, puis retrait du DOM.
	copie.lignes.forEach(function(el, bib) {
		if (garder.has(bib))
			return;
		copie.lignes.delete(bib);
		el.style.transform = 'translateY(-100%)';
		el.classList.add('sort');
		window.setTimeout(function() { el.remove(); }, 900);
	});

	liste.forEach(function(v, i) {
		let el = copie.lignes.get(v.bib);
		if (!el)
		{
			// Nouvelle ligne : elle entre par le bas.
			el = document.createElement('div');
			el.className = 'ligne';
			el.style.transform = 'translateY(' + (2 * 100) + '%)';
			dalle.appendChild(el);
			copie.lignes.set(v.bib, el);
			void el.offsetWidth;
		}

		const pos = 'translateY(' + (i * 100) + '%)';
		if (el.style.transform !== pos)
			el.style.transform = pos;

		if (wsMain.vue === 'deux')
		{
			SyncMoitie(el, v);
			el.classList.toggle('bas', i > 0);
		}
		else
		{
			SyncSeul(el, v);
		}
	});
}

/**
 * Vue « deux » : une ligne par bateau. Dossard | nom | pénalités |
 * intermédiaire | chrono | place, et la bande des portes dessous.
 */
function SyncMoitie(el, v)
{
	if (!el.firstChild)
	{
		el.innerHTML =
			'<div class="l_bib"></div>' +
			'<div class="l_droite">' +
				'<div class="l_info"><div class="l_nom"></div><div class="l_pena"></div>' +
				'<div class="l_inter"></div><div class="l_chrono"></div><div class="l_place"></div></div>' +
				'<div class="l_portes"></div>' +
			'</div>';
	}

	const classe = 'ligne ' + v.type
		+ (v.inter ? ' en-inter' + (v.interSens ? ' inter-' + v.interSens : '') : '')
		+ (el.classList.contains('bas') ? ' bas' : '');
	if (el.className !== classe)
		el.className = classe;

	Texte(el.querySelector('.l_bib'), v.bib);

	// Pénalités dès qu'il y en a : jaune pour des touches, rouge pour un 50.
	const elPena = el.querySelector('.l_pena');
	Texte(elPena, v.type !== 'prochain' && v.pena > 0 ? '+' + v.pena : '');
	elPena.className = 'l_pena' + (v.pena >= 50 ? ' rouge' : ' jaune');

	const elInter = el.querySelector('.l_inter');
	Texte(elInter, v.inter || '');
	elInter.className = 'l_inter' + (v.interSens ? ' ' + v.interSens : '');

	Texte(el.querySelector('.l_chrono'), v.chrono);

	// Toutes les portes, en bande sous la ligne (pas pour un bateau pas parti).
	const b = v.type !== 'prochain' ? Bateau(v.bib) : null;
	SyncPortes(el.querySelector('.l_portes'), b ? b.portes : []);

	const elPlace = el.querySelector('.l_place');
	Texte(elPlace, v.type === 'arrive' && v.rank > 0 ? v.rank + (v.rank === 1 ? 'er' : 'e') : '');
	elPlace.className = 'l_place' + (v.rank > 0 && v.rank <= 3 ? ' p' + v.rank : '');

	// Le nom cède la place si la ligne est trop chargée : il rétrécit, et un
	// nom composé qui ne tient toujours pas garde sa première partie.
	const elNom = el.querySelector('.l_nom');
	const charge = v.type + '|' + (v.inter || '') + '|' + v.chrono.length + '|' + v.pena + '|' + (v.rank || 0) + '|' + v.nom;
	if (elNom.dataset.charge !== charge)
	{
		elNom.dataset.charge = charge;
		elNom.textContent = NomCourt(v.nom);
		Ajuster(elNom);
		if (elNom.scrollWidth > elNom.clientWidth && /[-\s]/.test(elNom.textContent))
		{
			elNom.textContent = elNom.textContent.split(/[-\s]/)[0];
			Ajuster(elNom);
		}
	}
}

/**
 * La bande des portes : une case par porte, vert si elle est jugée sans
 * touche, jaune « 2 », rouge « 50 », gris tant qu'elle n'est pas jugée.
 * Les cases ne sont recréées que si le nombre de portes change.
 */
function SyncPortes(bande, portes)
{
	if (bande.children.length !== portes.length)
	{
		bande.innerHTML = '';
		portes.forEach(function() {
			const c = document.createElement('div');
			c.className = 'porte';
			bande.appendChild(c);
		});
	}

	portes.forEach(function(val, i) {
		const c = bande.children[i];
		const classe = 'porte' + (val === '0' ? ' ok' : val === '2' ? ' p2' : val === '50' ? ' p50' : '');
		if (c.className !== classe)
			c.className = classe;
		// Le chiffre dans un span : la feuille de style peut le comprimer en
		// largeur pour qu'il soit le plus haut possible dans une case étroite.
		const txt = val === '2' || val === '50' ? val : '';
		if (c.textContent !== txt)
			c.innerHTML = txt ? '<span>' + txt + '</span>' : '';
	});
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
	const n = wsMain.copies.length;
	let w, h, x, y;

	if (wsMain.zone)
	{
		// Zone fixe, au pixel près : c'est elle que prélève le contrôleur
		// NovaStar. Les copies s'empilent dessous (2 rangées de dalles).
		w = wsMain.zone.w;
		h = wsMain.zone.h;
		x = wsMain.zone.x;
		y = wsMain.zone.y;
	}
	else
	{
		// Aperçu : les copies empilées, le tout le plus grand possible.
		h = Math.min(window.innerHeight / n, window.innerWidth / wsMain.ratio);
		w = h * wsMain.ratio;
		x = (window.innerWidth - w) / 2;
		y = (window.innerHeight - h * n) / 2;
	}

	wsMain.copies.forEach(function(copie, k) {
		const el = copie.el;
		el.style.left = x + 'px';
		el.style.top = (y + k * h) + 'px';
		el.style.width = w + 'px';
		el.style.height = h + 'px';
	});
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
	wsMain.maintienResultat = num('resultat', 15000);
	wsMain.avantDepart = num('avant_depart', 5000);
	wsMain.delayInter = num('delay_inter', 2000);
	wsMain.delayInterSeul = num('delay_inter', 4000);
	wsMain.inters = new Map();
	wsMain.intersTous = new Map();		// dossard -> { k : { time, diff } }
	wsMain.vue = urlParams.get('vue') === 'deux' ? 'deux' : 'dernier';
	wsMain.lengthIdentity = num('length_identity', 16);
	wsMain.ratio = Math.max(1, num('ratio', 4));

	// Zone des dalles : 512x128+0+0 par défaut (4 EVS3 en haut à gauche).
	const zone = urlParams.has('zone') ? urlParams.get('zone') : '512x128+0+0';
	const m = /^(\d+)x(\d+)(?:\+(\d+)\+(\d+))?$/.exec(zone);
	wsMain.zone = m ? { w : +m[1], h : +m[2], x : +(m[3] || 0), y : +(m[4] || 0) } : null;
	wsMain.onCourse = [];
	wsMain.finished = new Map();
	// Copies des dalles, empilées : 2 par défaut (deux rangées de 4 dalles qui
	// montrent la même chose). Chacune a ses lignes, peintes de la même liste.
	const nbCopies = Math.max(1, Math.min(4, num('copies', 2)));
	wsMain.copies = [];
	for (let k = 0; k < nbCopies; k++)
	{
		const el = document.createElement('div');
		el.className = 'dalle' + (wsMain.vue === 'deux' ? '' : ' seul');
		document.body.appendChild(el);
		wsMain.copies.push({ el : el, lignes : new Map() });
	}
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
	wsMain.mapCommand.set('<run_erase>', function() { wsMain.onCourse = []; wsMain.finished.clear(); wsMain.intersTous.clear(); ReloadEpreuve(); });
	wsMain.mapCommand.set('<mode_chrono>', function() { ReloadEpreuve(); });

	// Le compte à rebours du prochain partant avance même sans trame.
	setInterval(Render, 500);

	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}
