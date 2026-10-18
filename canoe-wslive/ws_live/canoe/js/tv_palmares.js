/*
 * Palmarès plein écran, pour l'écran derrière le podium (tv_palmares.html).
 *
 * Une catégorie à la fois : les trois premiers sur leurs marches, dans l'ordre
 * visuel 2 - 1 - 3, puis les places suivantes (`max` au total). Page opaque,
 * faite pour un écran public, pas pour une incrustation.
 *
 * Les catégories montrées : ?epreuves=XK1H,XK1D dans cet ordre, sinon celles du
 * scénario ?scenario= (regie_scenarios.js), sinon toutes celles du classement
 * qui ont au moins un résultat. Une seule ? Elle reste. Plusieurs : chacune
 * `duree` s, puis la suivante. ?epreuve=XK1H fige une catégorie.
 *
 * Le classement est celui de la phase chargée dans competFFCK : il se met à
 * jour seul à chaque arrivée ou pénalité, et toutes les 30 s par sécurité.
 * Avec ?fichier, il vient d'un fichier édité à la main (voir plus bas) :
 * aucun besoin du serveur WebSocket.
 *
 * Paramètres d'URL :
 *   ws=192.168.1.52:8080       serveur competFFCK
 *   epreuve=XK1H               une seule catégorie, sans rotation
 *   epreuves=XK1H,XK1D         les catégories, dans l'ordre de passage
 *   scenario=samedi-matin      les catégories de ce scénario (hors invités
 *                              avec sans_inv)
 *   sans_inv                   saute les catégories d'invités (INV, XK1INV…)
 *   duree=20                   secondes par catégorie quand elles tournent (au moins
 *                              le temps de la révélation, 2 x revele + 4 s)
 *   max=10                     places montrées (3 sur les marches + la suite)
 *   titre=... phase=...        remplacent ceux de competFFCK
 *   fmt=XSCC                   format du chrono
 *   length_identity=28         longueur max des noms
 *   revele=4                   secondes entre l'apparition du 3e, du 2e et du 1er
 *   pilote=1                   révélation à la main : les marches restent vides,
 *                              le 3e, le 2e puis le 1er n'apparaissent qu'à l'ordre
 *                              du pilote (voir plus bas), qui choisit aussi la catégorie
 *   anim=0                     sans animation (ni entrée, ni reflets, ni paillettes)
 *   (fichier) "type": "merci"  sur une catégorie : pas de podium mais l'écran des
 *                              bénévoles, MERCI, ballons (une mission ou un nom par
 *                              ligne du classement), confettis, parade de bateaux
 *   fichier                    le palmarès vient de podium/podium.json, pas de
 *                              competFFCK ; fichier=autre.json pour un autre
 *                              fichier (chemin relatif à la page)
 */

const wsMain = new ws.Context(wsParams.url, wsParams.port);

/*
 * Pilote (?pilote=1). L'état vient du serveur local (tools/serve.js,
 * /pilote/podium/flux), envoyé par tv_podium_pilote.html : { epreuve, etape }.
 * etape 0 : marches vides ; 1 : le 3e ; 2 : + le 2e ; 3 : + le 1er et la suite.
 * Au clavier aussi (OBS : clic droit sur la source, Interagir) : 3, 2, 1 pour
 * révéler, 0 pour tout cacher, espace pour l'étape suivante.
 */
function AppliquerEtape()
{
	if (!wsMain.pilote)
		return;
	const e = wsMain.etape;
	if (document.body.classList.contains('merci'))
	{
		if (wsMain.etapeVue !== undefined && e !== wsMain.etapeVue && e > 0)
			MerciGerbe();
		wsMain.etapeVue = e;
		return;
	}
	document.getElementById('m3').classList.toggle('montre', e >= 1);
	document.getElementById('m2').classList.toggle('montre', e >= 2);
	document.getElementById('m1').classList.toggle('montre', e >= 3);
	document.body.classList.toggle('tout', e >= 3);

	// Le 1er vient d'être révélé : la fête.
	if (e >= 3 && !(wsMain.etapeVue >= 3))
		Celebrer();
	if (e < 3)
		ArreterFete();
	wsMain.etapeVue = e;
}

/******************** la fête du vainqueur ********************/

/*
 * À l'apparition du 1er : un éclat doré derrière lui, une gerbe d'étoiles qui
 * jaillit de son nom, puis deux bouteilles de champagne montent de part et
 * d'autre de sa marche, les bouchons sautent et la mousse jaillit en arcs
 * au-dessus de lui (chaque goutte : un pas horizontal régulier, une montée
 * puis une chute, d'où la parabole). Des étoiles scintillent ensuite autour
 * de lui. Tout est dessiné ici (rien à charger) et retiré au bout de 10 s.
 * Jamais avec ?anim=0.
 *
 * Coordonnées de la scène 1920 x 1080 : la marche du 1er est au centre
 * (x 722 à 1198), son bloc va de y 560 à 770, son nom est vers y 420. Les
 * bouteilles se tiennent devant le bloc doré, goulot vers le vainqueur.
 */
const FETE = { cx : 960, nomY : 430, piedY : 712, gaucheX : 790, droiteX : 1130 };

function Hasard(a, b) { return a + Math.random() * (b - a); }

function ArreterFete()
{
	clearTimeout(wsMain.feteTimer);
	wsMain.feteTimer = null;
	const f = document.getElementById('fete');
	if (f)
		f.remove();
}

function Celebrer()
{
	ArreterFete();
	if (document.body.classList.contains('no-anim'))
		return;
	const m1 = document.getElementById('m1');
	if (!m1 || m1.classList.contains('libre') || document.body.classList.contains('merci'))
		return;

	const fete = document.createElement('div');
	fete.id = 'fete';
	fete.setAttribute('aria-hidden', 'true');
	let html = '<div class="eclat"></div>';

	// La gerbe d'étoiles, depuis le nom.
	for (let i = 0; i < 26; i++)
	{
		const a = (i / 26) * 2 * Math.PI + Hasard(-0.12, 0.12);
		const r = Hasard(240, 560);
		html += '<i class="etoile gerbe" style="left:' + FETE.cx + 'px;top:' + FETE.nomY + 'px;'
			+ '--dx:' + Math.round(Math.cos(a) * r) + 'px;--dy:' + Math.round(Math.sin(a) * r * 0.7) + 'px;'
			+ '--t:' + Math.round(Hasard(18, 46)) + 'px;--rot:' + Math.round(Hasard(-260, 260)) + 'deg;'
			+ 'animation-delay:' + Hasard(0, 0.25).toFixed(2) + 's;'
			+ (i % 3 === 0 ? '--c:#fff' : '--c:#f7dc63') + '"></i>';
	}

	// Les étoiles qui restent et scintillent autour du vainqueur.
	for (let i = 0; i < 14; i++)
	{
		const x = FETE.cx + Hasard(-330, 330);
		const y = FETE.nomY + Hasard(-170, 90);
		html += '<i class="etoile scintille" style="left:' + Math.round(x) + 'px;top:' + Math.round(y) + 'px;'
			+ '--t:' + Math.round(Hasard(14, 30)) + 'px;--c:' + (i % 2 ? '#fff6c8' : '#f7dc63') + ';'
			+ 'animation-delay:' + Hasard(1.2, 3.2).toFixed(2) + 's,' + Hasard(1.2, 3.2).toFixed(2) + 's;'
			+ 'animation-duration:' + Hasard(1.1, 2).toFixed(2) + 's,7s"></i>';
	}

	// Les deux bouteilles, inclinées vers le vainqueur, et leur mousse.
	[{ x : FETE.gaucheX, angle : 28 }, { x : FETE.droiteX, angle : -28 }].forEach(function(b, n) {
		html += '<div class="bouteille" style="left:' + b.x + 'px;top:' + FETE.piedY + 'px;--angle:' + b.angle + 'deg">'
			+ BOUTEILLE_SVG + '</div>';

		// Le goulot, une fois la bouteille inclinée (190 px du pied au bouchon).
		const rad = b.angle * Math.PI / 180;
		const gx = b.x + Math.sin(rad) * 190;
		const gy = FETE.piedY - Math.cos(rad) * 190;
		const sens = b.angle > 0 ? 1 : -1;

		html += '<i class="bouchon" style="left:' + Math.round(gx) + 'px;top:' + Math.round(gy) + 'px;'
			+ '--dx:' + (sens * 260) + 'px;--dy:-520px;--rot:' + (sens * 900) + 'deg"></i>';

		for (let i = 0; i < 90; i++)
		{
			// Lancée vers le haut et vers le centre, un peu au hasard.
			const portee = sens * Hasard(90, 380);
			const hauteur = Hasard(130, 300);
			const chute = Hasard(220, 420);
			const taille = Hasard(5, 13);
			html += '<i class="goutte" style="left:' + Math.round(gx) + 'px;top:' + Math.round(gy) + 'px;'
				+ '--dx:' + Math.round(portee) + 'px;animation-delay:' + (1.55 + Hasard(0, 2.2) + n * 0.12).toFixed(2) + 's;'
				+ 'animation-duration:' + Hasard(1.5, 2.3).toFixed(2) + 's">'
				+ '<b style="--h:' + Math.round(-hauteur) + 'px;--f:' + Math.round(chute) + 'px;'
				+ 'width:' + taille.toFixed(1) + 'px;height:' + taille.toFixed(1) + 'px;'
				+ 'animation-duration:inherit;animation-delay:inherit;'
				+ (i % 4 === 0 ? 'background:#f7dc63' : '') + '"></b></i>';
		}
	});

	fete.innerHTML = html;
	document.getElementById('scene').appendChild(fete);
	wsMain.feteTimer = setTimeout(ArreterFete, 10000);
}

/* Bouteille de champagne, 60 x 200, le pied en bas au centre. */
const BOUTEILLE_SVG =
	'<svg viewBox="0 0 60 200" width="60" height="200">'
	+ '<defs><linearGradient id="verre" x1="0" x2="1">'
	+ '<stop offset="0" stop-color="#0b3d22"/><stop offset="0.35" stop-color="#2f7a4c"/>'
	+ '<stop offset="0.55" stop-color="#14532e"/><stop offset="1" stop-color="#062414"/></linearGradient>'
	+ '<linearGradient id="dore" x1="0" x2="1">'
	+ '<stop offset="0" stop-color="#9c7a22"/><stop offset="0.45" stop-color="#f7dc63"/><stop offset="1" stop-color="#8a6a1c"/></linearGradient></defs>'
	+ '<path d="M22 8 h16 v52 c0 14 18 22 18 44 v86 a10 10 0 0 1 -10 10 h-32 a10 10 0 0 1 -10 -10 v-86 c0 -22 18 -30 18 -44 z" fill="url(#verre)"/>'
	+ '<path d="M21 4 h18 v54 c0 6 4 10 8 14 h-34 c4 -4 8 -8 8 -14 z" fill="url(#dore)"/>'
	+ '<rect x="7" y="118" width="46" height="40" rx="3" fill="url(#dore)"/>'
	+ '<rect x="12" y="124" width="36" height="28" rx="2" fill="#0b1f4f"/>'
	+ '<text x="30" y="143" text-anchor="middle" font-size="11" font-weight="bold" fill="#f7dc63" font-family="Calibri, Arial">FFCK</text>'
	+ '<path d="M12 40 q-2 60 2 140" stroke="rgba(255,255,255,0.35)" stroke-width="3" fill="none"/>'
	+ '</svg>';

/**
 * Publie à la télécommande les catégories que cet écran a vraiment (celles
 * qui ont des résultats, ou celles du fichier) : elle propose ainsi la bonne
 * compétition, slalom ou kayak-cross, sans réglage. Seulement quand la liste change.
 */
function PublierCategories()
{
	if (!wsMain.pilote || !wsMain.pret)
		return;
	const cats = CategoriesAvecResultat().map(function(c) {
		const cat = { code : c, libelle : NomCategorie(c) };
		// Fichier : de quoi présenter une cérémonie entière à la télécommande.
		const f = wsMain.fichier ? CategorieFichier(c) : null;
		if (f)
		{
			cat.groupe = f.section || [Titre(c), Phase(c)].filter(Boolean).join(' — ');
			cat.remis_par = f.remis_par || '';
			cat.noms = ClassementFichier(c).slice(0, 3).map(function(r) { return r.name; });
		}
		return cat;
	});
	const cle = JSON.stringify(cats);
	// Rien à proposer : la télécommande garde son scénario (et pas de ping-pong
	// avec le serveur, qui renverrait une liste vide).
	if (cats.length === 0 || cle === wsMain.publiees)
		return;
	wsMain.publiees = cle;
	fetch('/pilote/podium', {
		method : 'POST',
		headers : { 'Content-Type' : 'application/json' },
		body : JSON.stringify({ categories : cats }),
	}).catch(function() { wsMain.publiees = null; });
}

function OnPilote(etat)
{
	if (!etat || typeof etat !== 'object')
		return;
	if (typeof etat.epreuve === 'string' && etat.epreuve !== '' && etat.epreuve !== wsMain.epreuveForcee)
		wsMain.epreuveForcee = etat.epreuve;
	if (Number.isInteger(etat.etape))
		wsMain.etape = etat.etape;
	// Serveur redémarré : il a perdu la liste, on la lui renvoie.
	if (!Array.isArray(etat.categories) || etat.categories.length === 0)
		wsMain.publiees = null;
	Render();
}

/** Envoie l'étape au serveur (les autres écrans et la page de pilotage suivent) ; en local si le serveur ne répond pas. */
function EnvoyerEtape(etape)
{
	wsMain.etape = etape;
	AppliquerEtape();
	fetch('/pilote/podium', {
		method : 'POST',
		headers : { 'Content-Type' : 'application/json' },
		body : JSON.stringify({ etape : etape }),
	}).catch(function() {});
}

function EcouterPilote()
{
	if (typeof EventSource === 'function')
	{
		// EventSource se reconnecte seul ; l'état complet revient à chaque connexion.
		const flux = new EventSource('/pilote/podium/flux');
		flux.onmessage = function(ev) {
			try { OnPilote(JSON.parse(ev.data)); } catch (e) { console.error(e); }
		};
	}

	document.addEventListener('keydown', function(ev) {
		const touches = { '3' : 1, '2' : 2, '1' : 3, '0' : 0, '&' : 3, 'é' : 2, '"' : 1, 'à' : 0 };
		if (ev.key in touches)
			EnvoyerEtape(touches[ev.key]);
		else if (ev.key === ' ' || ev.key === 'ArrowRight')
			EnvoyerEtape(Math.min(3, wsMain.etape + 1));
		else if (ev.key === 'ArrowLeft')
			EnvoyerEtape(Math.max(0, wsMain.etape - 1));
	});
}

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
	wsMain.wsPret = true;
	// En mode fichier, `pret` dit que le fichier est lu ; competFFCK ne sert
	// qu'aux catégories qui y renvoient (« competffck »).
	if (!wsMain.fichier)
		wsMain.pret = true;
	Render();
}

/** La liaison competFFCK, ouverte une seule fois. */
function OuvrirCompet()
{
	if (wsMain.wsOuvert)
		return;
	wsMain.wsOuvert = true;
	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}

/** Redemande le classement, groupé : une arrivée envoie plusieurs trames coup sur coup. */
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

/******************** palmarès depuis un fichier (?fichier) ********************/

/*
 * Le fichier, relu toutes les 2 s : une modification enregistrée passe à
 * l'écran aussitôt. Un fichier mal formé (une virgule oubliée en cours
 * d'édition) est ignoré : l'écran garde la dernière version lisible.
 *
 *   {
 *     "titre": "Championnats de France Elite Kayak-Cross",
 *     "phase": "Kayak-Cross — contre-la-montre",
 *     "categories": [
 *       { "epreuve": "XK1H", "libelle": "Kayak Homme", "classement": [
 *           { "nom": "DUPONT Jean", "club": "Club", "temps": "1:05.32" },
 *           …
 *       ] }
 *     ]
 *   }
 *
 * Le classement est dans l'ordre des places. « rang » (facultatif) pour un ex
 * aequo ; « temps » facultatif, en 65.32, 1:05.32 ou tel quel (« 1er série ») ;
 * « ecart » facultatif, sinon calculé quand les temps se lisent.
 * Une catégorie peut porter son « titre » et sa « phase », qui remplacent
 * ceux du fichier : une cérémonie enchaîne des podiums de nature différente.
 * « remis_par » et « section » (facultatifs) : pour la télécommande, non affichés.
 * « competffck » : "K1H" prend le classement en direct de cette épreuve dans
 * competFFCK (la page s'y connecte alors), « places » : 1 pour le seul
 * vainqueur ; « classement » sert tant que competFFCK n'a rien.
 */

/** « 1:05.32 », « 65,32 » -> ms ; null si ce n'est pas un temps. */
function LireTemps(txt)
{
	const m = String(txt).trim().match(/^(?:(\d+):)?(\d{1,2}|\d+)(?:[.,](\d{1,3}))?$/);
	if (!m)
		return null;
	const frac = m[3] ? parseInt((m[3] + '00').substring(0, 3), 10) : 0;
	return ((m[1] ? parseInt(m[1], 10) * 60 : 0) + parseInt(m[2], 10)) * 1000 + frac;
}

function LireFichier()
{
	fetch(wsMain.fichier + (wsMain.fichier.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now(), { cache : 'no-store' })
		.then(function(r) { if (!r.ok) throw new Error(wsMain.fichier + ' : HTTP ' + r.status); return r.text(); })
		.then(function(txt) {
			if (txt === wsMain.fichierTexte)
				return;
			let data;
			try { data = JSON.parse(txt); }
			catch (e) { console.warn(wsMain.fichier + ' illisible, version précédente gardée : ' + e.message); return; }
			wsMain.fichierTexte = txt;
			wsMain.donnees = data && typeof data === 'object' ? data : {};
			wsMain.pret = true;
			if (CategoriesFichier().some(function(c) { return c.competffck; }))
				OuvrirCompet();
			Render();
		})
		.catch(function(e) { console.warn(e.message); });
}

/** Les catégories du fichier : [{ epreuve, libelle, classement }]. */
function CategoriesFichier()
{
	const d = wsMain.donnees;
	return d && Array.isArray(d.categories) ? d.categories.filter(function(c) { return c && c.epreuve; }) : [];
}

function ClassementFichier(epreuve)
{
	const cat = CategoriesFichier().find(function(c) { return String(c.epreuve) === epreuve; });
	// « competffck » : le classement en direct de cette épreuve dans competFFCK
	// (la phase chargée, la finale le soir), « places » premiers seulement ;
	// tant que competFFCK n'a rien, celui du fichier.
	if (cat && cat.competffck)
	{
		const live = GetClassementCompet(String(cat.competffck));
		if (live.length > 0)
			return live.slice(0, parseInt(cat.places, 10) > 0 ? parseInt(cat.places, 10) : wsMain.max);
	}
	if (!cat || !Array.isArray(cat.classement))
		return [];
	return cat.classement.filter(function(r) { return r && r.nom; }).map(function(r, i) {
		const texte = r.temps === undefined || r.temps === null ? '' : String(r.temps);
		return {
			rank : parseInt(r.rang, 10) > 0 ? parseInt(r.rang, 10) : i + 1,
			bib : String(r.nom),
			name : String(r.nom),
			club : r.club ? String(r.club) : '',
			time : texte === '' ? null : LireTemps(texte),
			texte : texte,
			ecart : r.ecart === undefined || r.ecart === null ? null : String(r.ecart),
		};
	});
}

/******************** lecture du classement ********************/

function GetFmt()
{
	return wsMain.fmtChrono ? wsMain.fmtChrono : canoe.GetFmtChrono();
}

/** Les classés d'une catégorie, triés : { rank, bib, name, club, time }. */
function GetClassement(epreuve)
{
	if (wsMain.fichier)
		return wsMain.pret ? ClassementFichier(epreuve) : [];
	return wsMain.pret ? GetClassementCompet(epreuve) : [];
}

/** Le classement d'une épreuve dans la phase chargée de competFFCK. */
function GetClassementCompet(epreuve)
{
	const tRanking = canoe.GetTableRanking();
	if (!wsMain.wsPret || typeof tRanking !== 'object' || tRanking === null)
		return [];

	const cp = canoe.GetCodeCoursePhase();
	const classes = [];
	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		if (tRanking.GetCell('Code_categorie', row) != epreuve)
			continue;
		if (String(tRanking.GetCell('Tps' + cp, row)) === '')
			continue;

		const tps = tRanking.GetCellInt('Tps' + cp, row, adv.chrono.KO);
		if (tps < adv.chrono.OK)
			continue;		// DNF, DNS, DSQ : pas au palmarès

		// Cltc : le rang de competFFCK, repris tel quel (ex aequo compris).
		const rank = parseInt(tRanking.GetCellRank('Cltc' + cp, row, 0));
		classes.push({
			rank : rank > 0 ? rank : 0,
			bib : String(tRanking.GetCell('Dossard', row)),
			name : String(tRanking.GetCell('Bateau', row)),
			club : String(tRanking.GetCell('Club', row)),
			time : tps,
		});
	}

	classes.sort(function(a, b) { return a.time - b.time; });
	classes.forEach(function(r, i) { if (r.rank === 0) r.rank = i + 1; });
	return classes;
}

/** Les catégories du classement qui ont au moins un résultat, dans l'ordre d'apparition. */
function CategoriesAvecResultat()
{
	if (wsMain.fichier)
		return CategoriesFichier().map(function(c) { return String(c.epreuve); });

	const tRanking = canoe.GetTableRanking();
	if (!wsMain.pret || typeof tRanking !== 'object' || tRanking === null)
		return [];

	const cp = canoe.GetCodeCoursePhase();
	const vues = [];
	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		const c = String(tRanking.GetCell('Code_categorie', row));
		if (vues.indexOf(c) < 0 && tRanking.GetCellInt('Tps' + cp, row, adv.chrono.KO) >= adv.chrono.OK)
			vues.push(c);
	}
	return vues;
}

function EstInvites(code)
{
	return /INV/i.test(code);
}

/** Les catégories à faire tourner, celles qui ont des résultats d'abord. */
function Categories()
{
	if (wsMain.epreuveForcee !== '')
		return [wsMain.epreuveForcee];

	let liste;
	if (wsMain.epreuves.length > 0)
		liste = wsMain.epreuves.slice();
	else if (wsMain.fichier)
		liste = CategoriesAvecResultat();
	else if (wsMain.scenario && typeof REGIE_SCENARIOS === 'object' && REGIE_SCENARIOS[wsMain.scenario])
		liste = REGIE_SCENARIOS[wsMain.scenario].categories.map(function(c) { return c.epreuve; });
	else
		liste = CategoriesAvecResultat();

	if (wsMain.sansInv)
		liste = liste.filter(function(c) { return !EstInvites(c); });

	// Une catégorie sans aucun résultat ne passe pas à l'écran (sauf seule).
	const avec = liste.filter(function(c) { return GetClassement(c).length > 0; });
	return avec.length > 0 ? avec : liste.slice(0, 1);
}

/** Le nom de la catégorie : celui des scénarios, sinon categories.js, sinon le code. */
function NomCategorie(code)
{
	const f = CategoriesFichier().find(function(c) { return String(c.epreuve) === code; });
	if (f && f.libelle)
		return String(f.libelle);
	if (typeof REGIE_SCENARIOS === 'object')
	{
		for (const id in REGIE_SCENARIOS)
		{
			const c = REGIE_SCENARIOS[id].categories.find(function(x) { return x.epreuve === code; });
			if (c && c.libelle)
				return c.libelle;
		}
	}
	return typeof Categorie_name === 'function' ? Categorie_name(code) : code;
}

/** La catégorie du fichier, pour ses champs propres (titre, phase). */
function CategorieFichier(code)
{
	return code ? CategoriesFichier().find(function(c) { return String(c.epreuve) === code; }) || null : null;
}

function Titre(cat)
{
	if (wsMain.titre !== '')
		return wsMain.titre;
	if (wsMain.fichier)
	{
		// Une cérémonie mêle plusieurs podiums (élite, Coupe de France, clubs…) :
		// chaque catégorie peut porter son titre, sinon celui du fichier.
		const c = CategorieFichier(cat);
		if (c && c.titre)
			return String(c.titre);
		return wsMain.donnees && wsMain.donnees.titre ? String(wsMain.donnees.titre) : '';
	}
	const t = canoe.GetTable('Competition');
	return t && t.GetNbRows() > 0 ? String(t.GetCell('Nom', 0)) : '';
}

/** Le libellé de la phase chargée dans competFFCK (« Qualification Manche 2 »…). */
function Phase(cat)
{
	if (wsMain.phase !== '')
		return wsMain.phase;
	if (wsMain.fichier)
	{
		const c = CategorieFichier(cat);
		if (c && c.phase)
			return String(c.phase);
		return wsMain.donnees && wsMain.donnees.phase ? String(wsMain.donnees.phase) : '';
	}
	const t = canoe.GetTable('Competition_Course_Phase');
	if (!t || t.GetNbRows() === 0)
		return '';
	const code = String(canoe.GetCodePhase());
	for (let row = 0; row < t.GetNbRows(); row++)
	{
		if (String(t.GetCell('Code_phase', row)) === code)
			return String(t.GetCell('Libelle', row));
	}
	return '';
}

/******************** rendu ********************/

function SetTexte(el, txt)
{
	if (el.textContent !== txt)
		el.textContent = txt;
}

function Tronquer(nom)
{
	return wsMain.lengthIdentity > 0 && nom.length > wsMain.lengthIdentity
		? nom.substring(0, wsMain.lengthIdentity) + '…' : nom;
}

/**
 * L'écart au premier : en secondes sous la minute (« +1,86 »), en minutes
 * au-delà (« +1:02.40 »), avec le séparateur du temps affiché (adv.js écrit
 * la virgule en secondes, le point en minutes). Ex aequo : rien.
 */
/** Le temps affiché : celui du fichier tel qu'écrit, sinon le chrono competFFCK. */
function Temps(r, fmt)
{
	return r.texte !== undefined ? r.texte : adv.GetChrono(r.time, fmt);
}

function Ecart(r, premier, fmt)
{
	if (r.ecart !== undefined && r.ecart !== null)
		return r.ecart;
	if (r.time === null || premier.time === null)
		return '';
	const diff = r.time - premier.time;
	if (diff <= 0)
		return '';

	const txt = adv.GetChronoDiff(diff, diff >= 60000 ? 'MMSSCC' : 'XSCC');
	return String(adv.GetChrono(premier.time, fmt)).indexOf(',') >= 0
		? txt.replace('.', ',') : txt.replace(',', '.');
}

function Render()
{
	try
	{
		const cats = Categories();
		if (wsMain.index >= cats.length)
			wsMain.index = 0;

		const code = cats[wsMain.index] || '';

		SetTexte(document.getElementById('titre'), Titre(code));
		SetTexte(document.getElementById('phase'), Phase(code));
		SetTexte(document.getElementById('cat'), code ? NomCategorie(code) : '');

		const cl = code ? GetClassement(code) : [];
		document.body.classList.toggle('vide', cl.length === 0);
		const fc = CategorieFichier(code);
		Merci(fc && fc.type === 'merci' ? code : '', cl);

		// L'entrée se joue quand une catégorie arrive à l'écran avec ses
		// résultats : pas pendant l'attente des données, où tout est caché.
		const cle = cl.length > 0 ? code : '';
		const changement = cle !== '' && cle !== wsMain.affichee;
		if (cl.length > 0 || code !== wsMain.affichee)
			wsMain.affichee = cle;

		const fmt = GetFmt();
		[1, 2, 3].forEach(function(n) {
			const el = document.getElementById('m' + n);
			const r = cl[n - 1];
			el.classList.toggle('libre', !r);
			// Le podium change sous nos yeux (une arrivée) : la carte s'illumine.
			const qui = r ? r.bib : '';
			if (!changement && el.dataset.bib !== undefined && el.dataset.bib !== qui && qui !== '')
			{
				el.classList.remove('maj');
				void el.offsetWidth;
				el.classList.add('maj');
			}
			el.dataset.bib = qui;
			SetTexte(el.querySelector('.nom'), r ? Tronquer(r.name) : '');
			SetTexte(el.querySelector('.club'), r ? r.club : '');
			SetTexte(el.querySelector('.temps'), r ? Temps(r, fmt) : '');
			SetTexte(el.querySelector('.ecart'), r && n > 1 ? Ecart(r, cl[0], fmt) : '');
			// Ex aequo : la marche affiche le rang réel.
			SetTexte(el.querySelector('.place'), r ? String(r.rank) : String(n));
		});

		const suite = document.getElementById('suite');
		const lignes = cl.slice(3, Math.max(3, wsMain.max));
		let html = '';
		lignes.forEach(function(r) {
			html += '<div class="ligne"><span class="rang"></span><span class="nom"></span>'
			      + '<span class="club"></span><span class="temps"></span><span class="ecart"></span></div>';
		});
		if (suite.children.length !== lignes.length)
			suite.innerHTML = html;
		lignes.forEach(function(r, i) {
			const el = suite.children[i];
			SetTexte(el.querySelector('.rang'), String(r.rank));
			SetTexte(el.querySelector('.nom'), Tronquer(r.name));
			SetTexte(el.querySelector('.club'), r.club);
			SetTexte(el.querySelector('.temps'), Temps(r, fmt));
			SetTexte(el.querySelector('.ecart'), Ecart(r, cl[0], fmt));
		});
		// Deux colonnes au-delà de 4 lignes : tout tient sous les marches.
		suite.classList.toggle('deux', lignes.length > 4);

		// Les points en bas : une catégorie par point, l'affichée en plein.
		const points = document.getElementById('points');
		const ph = cats.length > 1 ? cats.map(function(c, i) {
			return '<span class="' + (i === wsMain.index ? 'actif' : '') + '"></span>';
		}).join('') : '';
		if (points.innerHTML !== ph)
			points.innerHTML = ph;

		AppliquerEtape();
		PublierCategories();

		if (changement)
		{
			// Sans pilote, le 1er arrive au bout de la révélation : la fête à ce moment-là.
			ArreterFete();
			if (!wsMain.pilote && cl.length > 0)
				wsMain.feteTimer = setTimeout(Celebrer, (1.4 + 2 * wsMain.revele) * 1000 + 300);

			// Rejoue l'entrée : la catégorie, puis les marches, puis la suite.
			document.querySelectorAll('.marche.maj').forEach(function(m) { m.classList.remove('maj'); });
			document.body.classList.remove('entre');
			void document.body.offsetWidth;
			document.body.classList.add('entre');
		}
	}
	catch (e)
	{
		// Une erreur garde l'écran en cours plutôt que de casser.
		console.error(e);
	}
}

/******************** merci aux bénévoles ********************/

const MERCI_COULEURS = ['#097AFF', '#E8C33A', '#E0262B', '#1FA84A', '#629BF1', '#ffffff', '#F07C1E', '#B04FD8'];

function Couleur(i) { return MERCI_COULEURS[((i % MERCI_COULEURS.length) + MERCI_COULEURS.length) % MERCI_COULEURS.length]; }

/**
 * L'écran des bénévoles pour la catégorie `code` ('' : on le quitte). Monté une
 * fois à l'arrivée ; les ballons et les bateaux partent ensuite au fil du temps.
 */
function Merci(code, cl)
{
	wsMain.merciNoms = cl.map(function(r) { return r.name; }).filter(function(n) { return n && n.indexOf('À COMPLÉTER') < 0; });
	if (code === (wsMain.merci || ''))
		return;
	wsMain.merci = code;
	document.body.classList.toggle('merci', code !== '');
	clearInterval(wsMain.merciBallons);
	clearInterval(wsMain.merciBateaux);
	document.querySelectorAll('#merci_ciel .confettis, #merci_ciel .ballons, #merci_gerbe').forEach(function(z) { z.innerHTML = ''; });
	const vieille = document.querySelector('#riviere .flotte');
	if (vieille)
		vieille.remove();
	if (code === '')
		return;

	const mot = document.querySelector('#merci_texte .mot');
	mot.innerHTML = 'MERCI!'.split('').map(function(l) { return '<span class="lettre">' + l + '</span>'; }).join('');
	const sous = document.querySelector('#merci_texte .sous');
	sous.style.animation = 'none';
	void sous.offsetWidth;
	sous.style.animation = '';

	if (document.body.classList.contains('no-anim'))
		return;

	// La pluie de confettis.
	let html = '';
	for (let i = 0; i < 110; i++)
	{
		html += '<i class="confetti' + (i % 4 === 0 ? ' rond' : '') + '" style="left:' + Hasard(0, 100).toFixed(1) + '%;'
			+ '--c:' + Couleur(i) + ';--d:' + Hasard(5, 10).toFixed(1) + 's;--del:-' + Hasard(0, 10).toFixed(1) + 's;'
			+ '--derive:' + Math.round(Hasard(-160, 160)) + 'px;--rot:' + Math.round(Hasard(-900, 900)) + 'deg"></i>';
	}
	document.querySelector('#merci_ciel .confettis').innerHTML = html;

	// La parade, entre les vagues.
	const flotte = document.createElement('div');
	flotte.className = 'flotte';
	const riviere = document.getElementById('riviere');
	riviere.insertBefore(flotte, riviere.querySelector('.vague.v2'));

	wsMain.merciN = 0;
	wsMain.merciB = 0;
	for (let i = 0; i < 4; i++)
		setTimeout(Ballon, i * 350);
	wsMain.merciBallons = setInterval(Ballon, 1100);
	Bateau();
	wsMain.merciBateaux = setInterval(Bateau, 3800);
	setTimeout(MerciGerbe, 700);
}

/** Un ballon qui monte, avec la mission (ou le nom) suivante. */
function Ballon()
{
	const zone = document.querySelector('#merci_ciel .ballons');
	const noms = wsMain.merciNoms || [];
	if (!zone || noms.length === 0 || zone.children.length > 24)
		return;
	const i = wsMain.merciN++;
	const b = document.createElement('div');
	b.className = 'ballon';
	const c = Couleur(i * 3 + 1);
	b.style.left = Math.round(Hasard(40, 1600)) + 'px';
	b.style.setProperty('--d', Hasard(10, 15).toFixed(1) + 's');
	b.style.setProperty('--b', Hasard(1.6, 2.8).toFixed(1) + 's');
	b.style.setProperty('--c', c);
	if (c === '#ffffff' || c === '#E8C33A')
		b.style.setProperty('--t', '#09006D');
	b.innerHTML = '<div class="corps"></div>';
	b.firstChild.textContent = noms[i % noms.length];
	b.addEventListener('animationend', function(ev) { if (ev.target === b) b.remove(); });
	zone.appendChild(b);
}

/** Un bateau de la parade : kayak ou canoë, à la couleur suivante, un sur trois avec sa banderole. */
function Bateau()
{
	const flotte = document.querySelector('#riviere .flotte');
	if (!flotte || flotte.children.length > 6)
		return;
	const i = wsMain.merciB++;
	const canoe = i % 2 === 1;
	const coque = Couleur(i * 5);
	const casque = Couleur(i * 5 + 3);
	const b = document.createElement('div');
	b.className = 'bateau' + (canoe ? ' canoe' : '');
	b.style.setProperty('--d', Hasard(13, 17).toFixed(1) + 's');
	b.style.bottom = Math.round(Hasard(40, 70)) + 'px';
	// Le pagayeur : buste, tête casquée, gilet ; la pagaie à une pale (canoë) ou deux (kayak).
	const pagaie = canoe
		? '<g class="pagaie"><line x1="150" y1="22" x2="196" y2="128" stroke="#5b3a1a" stroke-width="7" stroke-linecap="round"/>'
		  + '<rect x="186" y="112" width="20" height="40" rx="8" fill="#F2C200" transform="rotate(-24 196 128)"/>'
		  + '<rect x="140" y="14" width="22" height="8" rx="4" fill="#5b3a1a"/></g>'
		: '<g class="pagaie"><line x1="70" y1="90" x2="230" y2="34" stroke="#333" stroke-width="7" stroke-linecap="round"/>'
		  + '<ellipse cx="66" cy="92" rx="11" ry="24" fill="#F2C200" transform="rotate(-20 66 92)"/>'
		  + '<ellipse cx="234" cy="32" rx="11" ry="24" fill="#F2C200" transform="rotate(-20 234 32)"/></g>';
	b.innerHTML = '<svg viewBox="0 0 300 150">'
		+ '<path d="M8 108 Q150 142 292 104 Q150 92 8 108 Z" fill="' + coque + '" stroke="rgba(0,0,0,0.25)" stroke-width="3"/>'
		+ '<ellipse cx="150" cy="104" rx="30" ry="6" fill="rgba(0,0,0,0.35)"/>'
		+ '<path d="M128 104 Q130 66 150 60 Q170 66 172 104 Z" fill="#E0262B"/>'
		+ '<circle cx="150" cy="44" r="17" fill="#f2c9a0"/>'
		+ '<path d="M131 42 Q150 14 169 42 Z" fill="' + casque + '"/>'
		+ '<circle cx="156" cy="46" r="2.6" fill="#222"/>'
		+ '<path d="M150 53 Q156 57 161 52" stroke="#222" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
		+ pagaie + '</svg>'
		+ (i % 3 === 0 ? '<div class="banniere">MERCI !</div>' : '');
	b.addEventListener('animationend', function(ev) { if (ev.target === b) b.remove(); });
	flotte.appendChild(b);
}

/** Une gerbe de confettis, des deux coins du bas. */
function MerciGerbe()
{
	const zone = document.getElementById('merci_gerbe');
	if (!zone || document.body.classList.contains('no-anim'))
		return;
	let html = '';
	[[120, 1], [1800, -1]].forEach(function(coin) {
		for (let i = 0; i < 60; i++)
		{
			html += '<i class="gerbe-c" style="left:' + coin[0] + 'px;top:1060px;--c:' + Couleur(i) + ';'
				+ '--dx:' + Math.round(coin[1] * Hasard(150, 1100)) + 'px;--dy:' + Math.round(-Hasard(600, 1050)) + 'px;'
				+ '--rot:' + Math.round(Hasard(-1080, 1080)) + 'deg;--del:' + Hasard(0, 0.35).toFixed(2) + 's"></i>';
		}
	});
	zone.innerHTML = html;
	clearTimeout(wsMain.gerbeTimer);
	wsMain.gerbeTimer = setTimeout(function() { zone.innerHTML = ''; }, 3600);
}

/** Passe à la catégorie suivante, s'il y en a plusieurs. */
function Tourner()
{
	// Piloté : la catégorie ne change que sur ordre du pilote.
	if (wsMain.pilote)
		return;
	const cats = Categories();
	if (cats.length > 1)
	{
		wsMain.index = (wsMain.index + 1) % cats.length;
		Render();
	}
}

/** Quelques paillettes dorées qui montent lentement derrière le podium. */
function Paillettes()
{
	const zone = document.getElementById('paillettes');
	for (let i = 0; i < 26; i++)
	{
		const p = document.createElement('span');
		const taille = 3 + Math.random() * 5;
		p.style.left = (Math.random() * 100).toFixed(1) + '%';
		p.style.width = p.style.height = taille.toFixed(1) + 'px';
		p.style.animationDuration = (9 + Math.random() * 9).toFixed(1) + 's';
		p.style.animationDelay = (-Math.random() * 18).toFixed(1) + 's';
		p.style.setProperty('--derive', ((Math.random() - 0.5) * 120).toFixed(0) + 'px');
		zone.appendChild(p);
	}
}

function Redimensionner()
{
	const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
	document.documentElement.style.setProperty('--scale', k);
}

function Init()
{
	const urlParams = new URLSearchParams(window.location.search);
	const num = function(key, def) {
		const v = parseFloat(urlParams.get(key));
		return isNaN(v) ? def : v;
	};

	wsMain.lang = 'fr';
	wsMain.pret = false;
	wsMain.reloadTimer = null;
	wsMain.index = 0;
	wsMain.affichee = null;
	wsMain.epreuveForcee = urlParams.get('epreuve') || '';
	wsMain.epreuves = (urlParams.get('epreuves') || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
	wsMain.scenario = urlParams.get('scenario') || '';
	wsMain.sansInv = urlParams.has('sans_inv');
	wsMain.pilote = urlParams.get('pilote') === '1';
	wsMain.etape = 0;
	wsMain.publiees = null;
	if (wsMain.pilote)
		document.body.classList.add('pilote');
	wsMain.revele = Math.max(0, Math.min(30, num('revele', 4)));
	document.documentElement.style.setProperty('--pas', wsMain.revele + 's');
	// La rotation laisse toujours finir la révélation du podium.
	wsMain.duree = Math.max(5, 2 * wsMain.revele + 4, num('duree', 20));
	wsMain.max = Math.max(3, Math.min(11, num('max', 10)));
	wsMain.titre = urlParams.get('titre') || '';
	wsMain.phase = urlParams.get('phase') || '';
	wsMain.fmtChrono = urlParams.get('fmt') || '';
	wsMain.lengthIdentity = num('length_identity', 28);
	wsMain.fichier = urlParams.has('fichier') ? (urlParams.get('fichier') || 'podium/podium.json') : '';
	wsMain.donnees = null;
	wsMain.fichierTexte = null;

	Redimensionner();
	window.addEventListener('resize', Redimensionner);
	if (urlParams.get('anim') === '0')
		document.body.classList.add('no-anim');
	else
		Paillettes();
	Render();

	wsMain.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsMain.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.mapCommand.set('<bib_time>', function() { ReloadEpreuve(); });
	wsMain.mapCommand.set('<penalty_add>', function() { ReloadEpreuve(); });
	wsMain.mapCommand.set('<run_erase>', function() { ReloadEpreuve(); });
	wsMain.mapCommand.set('<mode_chrono>', function() { ReloadEpreuve(); });

	wsMain.wsPret = false;
	wsMain.wsOuvert = false;
	if (wsMain.fichier)
	{
		LireFichier();
		setInterval(LireFichier, 2000);
	}
	else
		OuvrirCompet();
	if (wsMain.pilote)
		EcouterPilote();

	setInterval(Tourner, wsMain.duree * 1000);
	setInterval(ReloadEpreuve, 30000);
}
