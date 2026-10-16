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
	document.getElementById('m3').classList.toggle('montre', e >= 1);
	document.getElementById('m2').classList.toggle('montre', e >= 2);
	document.getElementById('m1').classList.toggle('montre', e >= 3);
	document.body.classList.toggle('tout', e >= 3);
}

/**
 * Publie à la télécommande les catégories que cet écran a vraiment (celles
 * qui ont des résultats, ou celles du fichier) : elle propose ainsi la bonne
 * compétition, slalom ou kayak-cross, sans réglage. Seulement quand la liste change.
 */
function PublierCategories()
{
	if (!wsMain.pilote || !wsMain.pret)
		return;
	const cats = CategoriesAvecResultat().map(function(c) { return { code : c, libelle : NomCategorie(c) }; });
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
	wsMain.pret = true;
	Render();
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

	const tRanking = canoe.GetTableRanking();
	if (!wsMain.pret || typeof tRanking !== 'object' || tRanking === null)
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

function Titre()
{
	if (wsMain.titre !== '')
		return wsMain.titre;
	if (wsMain.fichier)
		return wsMain.donnees && wsMain.donnees.titre ? String(wsMain.donnees.titre) : '';
	const t = canoe.GetTable('Competition');
	return t && t.GetNbRows() > 0 ? String(t.GetCell('Nom', 0)) : '';
}

/** Le libellé de la phase chargée dans competFFCK (« Qualification Manche 2 »…). */
function Phase()
{
	if (wsMain.phase !== '')
		return wsMain.phase;
	if (wsMain.fichier)
		return wsMain.donnees && wsMain.donnees.phase ? String(wsMain.donnees.phase) : '';
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

		SetTexte(document.getElementById('titre'), Titre());
		SetTexte(document.getElementById('phase'), Phase());
		SetTexte(document.getElementById('cat'), code ? NomCategorie(code) : '');

		const cl = code ? GetClassement(code) : [];
		document.body.classList.toggle('vide', cl.length === 0);

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

	if (wsMain.fichier)
	{
		LireFichier();
		setInterval(LireFichier, 2000);
	}
	else
		wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
	if (wsMain.pilote)
		EcouterPilote();

	setInterval(Tourner, wsMain.duree * 1000);
	setInterval(ReloadEpreuve, 30000);
}
