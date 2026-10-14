/*
 * Régie automatique d'une demi-journée : tv_regie.html?scenario=<id>.
 *
 * La page enchaîne seule les écrans de la session, sans que personne n'y
 * touche. Elle ne garde AUCUN état : à chaque instant, l'écran à montrer est
 * recalculé depuis l'heure et les données de course. Recharger la page la
 * remet donc d'elle-même au bon endroit.
 *
 * Déroulé
 *   rose       quelques secondes de couleur de clé au lancement : à l'antenne
 *              on ne voit que les caméras, c'est la preuve que l'incrustation
 *              marche ;
 *   compte     compte à rebours plein écran jusqu'au premier départ ;
 *   generique  5 min avant le premier départ, le générique vidéo ; recharger
 *              la page pendant qu'il passe le reprend où il en est ; une vidéo
 *              absente ou illisible est sautée ;
 *   speaker    puis les caméras, pour le présentateur : son nom en bas à
 *              gauche quelques secondes, le compte à rebours en bas à droite ;
 *              il parle jusqu'à 30 s avant le départ ;
 *   titre      à 30 s du départ, le nom de la catégorie en plein écran ;
 *   depart     puis sa liste de départ (tv_departs), jusqu'au premier départ ;
 *   course     l'écran de course : tv_duo si les départs sont rapprochés,
 *              tv_inrace sinon (voir regie_scenarios.js) ;
 *   (catégories suivantes : titre, liste de départ, course 1 min avant)
 *   resultats  la catégorie finie : son classement (tv_results), puis titre
 *              de la suivante, sa liste de départ, et retour à la course ;
 *   fin        après la dernière catégorie : la couleur de clé, les caméras.
 *
 * Blindage
 *   - Un bateau sur l'eau impose l'écran de course, quoi qu'en dise l'horaire.
 *   - Une catégorie commencée garde l'écran de course entre deux bateaux.
 *   - Une catégorie est finie quand tous ses bateaux ont un résultat, ou que
 *     personne n'est sur l'eau 3 min après son dernier départ (un forfait pas
 *     encore saisi ne bloque pas la suite).
 *   - L'heure est celle de competFFCK quand elle arrive (flux <on_course>),
 *     sinon celle du poste.
 *   - Les écrans sont chargés une fois pour toutes dans des cadres et ne font
 *     que s'afficher ou se masquer : un changement de vue est instantané, et
 *     chacun garde sa connexion et sa reprise après coupure.
 *   - Une erreur de calcul garde l'écran en cours plutôt que de casser.
 *   - Une icône en haut à droite dit l'état de la liaison avec le serveur
 *     WebSocket : rouge tant qu'elle est coupée, verte 5 s quand elle
 *     (re)prend, puis plus rien.
 *
 * Paramètres d'URL :
 *   scenario=vendredi-matin   le scénario (regie_scenarios.js)
 *   rose=5                    durée du rose au lancement, en s
 *   resultats=45 titre=10     durée des résultats et du titre de catégorie, en s
 *   avance=60                 catégories suivantes : l'écran de course arrive tant
 *                             de s avant leur premier départ
 *   generique_avant=300       le générique part tant de s avant le premier départ
 *   speaker_delai=3 speaker_duree=10     nom du présentateur : il entre tant de s
 *                             après le générique, et reste tant de s
 *   departs_avant=30          la liste de départ arrive tant de s avant le premier
 *                             départ : le présentateur parle jusque-là
 *   generique=video/generique.mp4        le générique ; 0 = sans générique
 *   son=0                     générique muet (par défaut avec le son, que
 *                             le navigateur peut refuser : il passe alors muet)
 *   maintenant=2026-10-16T08:54:00       simule l'heure du poste (répétition)
 *   repetition=1              le jour du scénario devient aujourd'hui : avec le
 *                             bouchon (fixtures regie-<id>), la régie suit son
 *                             horloge, accélérée ou non. Les durées des scènes
 *                             (présentateur, titre, résultats) sont alors
 *                             rallongées de la vitesse mesurée du bouchon : à
 *                             ×10, le présentateur reste ses 15 s réelles.
 *   bg=0                      fond transparent au lieu de la couleur de clé
 *   debug=1                   affiche l'état calculé (jamais à l'antenne)
 */

const wsMain = new ws.Context(wsParams.url, wsParams.port);

const regie = {
	scenario : null,
	charge : Date.now(),
	repetition : false,
	decalage : 0,			// ?maintenant= : écart simulé avec l'heure du poste
	clock : 0,				// heure competFFCK, ms depuis minuit
	clockRecu : 0,			// réception de cette heure (heure du poste)
	vitesse : 1,			// répétition : vitesse mesurée de l'horloge competFFCK
	echantillons : [],		// { clock, recu } des 5 dernières secondes
	onCourse : [],
	pret : false,			// classement reçu au moins une fois
	scene : null,			// clé de la scène affichée
	cible : null,			// scène calculée en attente du rideau
	rideau : false,
	genKO : false,			// générique absent ou illisible : sauté
	genDuree : 18,			// durée du générique en s (relue sur la vidéo)
	cadres : {},
	reglages : {},
};

/******************** heure ********************/

function JourScenario()
{
	if (regie.scenario.date && !regie.repetition)
		return regie.scenario.date;

	const d = new Date(Date.now() + regie.decalage);
	const pad = function(n) { return (n < 10 ? '0' : '') + n; };
	return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** Minuit local du jour du scénario, en ms epoch. */
function MinuitScenario()
{
	const p = JourScenario().split('-').map(Number);
	return new Date(p[0], p[1] - 1, p[2]).getTime();
}

/** « 09:18:00 » -> ms depuis minuit. */
function Heure(txt)
{
	const p = String(txt).split(':').map(Number);
	return ((p[0] * 60 + p[1]) * 60 + (p[2] || 0)) * 1000;
}

/**
 * Maintenant, en ms epoch. L'heure de competFFCK fait foi le jour du
 * scénario, tant qu'elle arrive (moins de 10 s) : c'est elle qui donne les
 * départs. Sinon l'heure du poste, décalée par ?maintenant= en répétition.
 */
function Maintenant()
{
	const local = Date.now() + regie.decalage;
	const minuit = MinuitScenario();

	if (regie.clock > 0 && Date.now() - regie.clockRecu < 10000
		&& local >= minuit && local < minuit + 86400000)
		return minuit + regie.clock + (Date.now() - regie.clockRecu);

	return local;
}

/******************** données de course ********************/

function OnOpenWebSocketCommand()
{
	wsMain.websocket.send(JSON.stringify({ key : '<race_load>', key_race : '*' }));
}

function OnCommandRaceLoad(objJSON)
{
	canoe.SetRace(objJSON);
	wsMain.websocket.send(JSON.stringify({ key : '<epreuve_load>', epreuve : '' }));
}

function OnCommandEpreuveLoad(objJSON)
{
	canoe.SetRanking(objJSON);
	canoe.SetColumnNameRanking(canoe.GetTableRanking());
	regie.pret = true;
	Piloter();
}

function ReloadEpreuve()
{
	if (regie.reloadTimer)
		return;

	regie.reloadTimer = setTimeout(function() {
		regie.reloadTimer = null;
		if (wsMain.websocket && wsMain.websocket.readyState === WebSocket.OPEN)
			wsMain.websocket.send(JSON.stringify({ key : '<epreuve_load>', epreuve : '' }));
	}, 400);
}

function OnFlowOnCourse(objJSON)
{
	const t = adv.GetTableUnique(objJSON, 'table');
	const rows = [];
	for (let i = 0; i < t.GetNbRows(); i++)
		rows.push(String(t.GetCell('bib', i)));

	regie.onCourse = rows;

	const clock = adv.toNumber(objJSON.clock);
	if (clock !== null && clock > 0)
	{
		regie.clock = clock;
		regie.clockRecu = Date.now();
		MesurerVitesse(clock, regie.clockRecu);
	}

	Piloter();
}

/**
 * Répétition : à quelle vitesse tourne l'horloge de competFFCK (le bouchon
 * accéléré), mesurée sur les 5 dernières secondes. En vrai elle vaut 1.
 */
function MesurerVitesse(clock, recu)
{
	const e = regie.echantillons;
	e.push({ clock : clock, recu : recu });
	while (e.length > 2 && recu - e[0].recu > 5000)
		e.shift();

	const d = recu - e[0].recu;
	if (d >= 1500)
	{
		const v = (clock - e[0].clock) / d;
		regie.vitesse = Math.max(1, Math.min(60, Math.round(v * 10) / 10));
	}
}

/** Durée d'une scène en ms d'horloge competFFCK : rallongée de la vitesse en répétition. */
function Duree(sec)
{
	return sec * 1000 * (regie.repetition ? regie.vitesse : 1);
}

/** Les bateaux d'une catégorie dans le classement. */
function Bateaux(epreuve)
{
	const tRanking = canoe.GetTableRanking();
	if (!regie.pret || typeof tRanking !== 'object' || tRanking === null)
		return [];

	const cp = canoe.GetCodeCoursePhase();
	const out = [];
	for (let row = 0; row < tRanking.GetNbRows(); row++)
	{
		if (tRanking.GetCell('Code_categorie', row) != epreuve)
			continue;

		out.push({
			bib : String(tRanking.GetCell('Dossard', row)),
			resultat : String(tRanking.GetCell('Tps' + cp, row)) !== '',
			depart : tRanking.GetCellInt('Heure_depart' + cp, row, 0),
			chrono : tRanking.GetCellInt('Tps_chrono' + cp, row, 0),
		});
	}
	return out;
}

/**
 * Où en est une catégorie. `heure` en ms depuis minuit.
 *   commencee  un bateau a un résultat ou est sur l'eau
 *   finie      tous ont un résultat, ou personne sur l'eau 3 min après le
 *              dernier départ prévu
 *   finA       heure de la dernière arrivée (ms depuis minuit), 0 si inconnue
 */
function Etat(cat, heure)
{
	const bateaux = Bateaux(cat.epreuve);
	const surLeau = bateaux.some(function(b) { return regie.onCourse.indexOf(b.bib) >= 0; });
	const avecResultat = bateaux.filter(function(b) { return b.resultat; });

	const dernierDepart = Math.max(Heure(cat.fin),
		bateaux.reduce(function(m, b) { return Math.max(m, b.depart); }, 0));

	const commencee = surLeau || avecResultat.length > 0;
	const finie = commencee && !surLeau
		&& (avecResultat.length === bateaux.length || heure > dernierDepart + 180000);

	let finA = 0;
	avecResultat.forEach(function(b) {
		if (b.chrono >= adv.chrono.OK && b.depart > 0)
			finA = Math.max(finA, b.depart + b.chrono);
	});

	return { commencee : commencee, finie : finie, finA : finA, surLeau : surLeau };
}

/** tv_duo ou tv_inrace, selon l'intervalle entre deux départs. */
function Vue(cat)
{
	if (cat.vue)
		return cat.vue;

	const intervalle = cat.nb > 1 ? (Heure(cat.fin) - Heure(cat.depart)) / (cat.nb - 1) : 120000;
	return intervalle < 120000 ? 'duo' : 'inrace';
}

/******************** le calcul de la scène ********************/

/**
 * La scène à montrer maintenant : { nom, cat, vue }. Fonction pure de
 * l'heure et des données : c'est ce qui permet de reprendre au bon endroit
 * après un rechargement.
 */
function Calculer()
{
	const R = regie.reglages;
	const now = Maintenant();
	const minuit = MinuitScenario();
	const heure = now - minuit;
	const cats = regie.scenario.categories;

	if (Date.now() - regie.charge < R.rose * 1000)
		return { nom : 'rose' };

	const etats = cats.map(function(c) { return Etat(c, heure); });

	// 1. Un bateau sur l'eau : l'écran de course, rien d'autre.
	const enCourse = cats.findIndex(function(c, i) { return etats[i].surLeau; });
	if (enCourse >= 0)
		return { nom : 'course', cat : cats[enCourse], vue : Vue(cats[enCourse]) };

	// Un bateau sur l'eau hors scénario (catégorie inconnue) : course aussi.
	if (regie.onCourse.length > 0)
	{
		const c = cats.find(function(c, i) { return !etats[i].finie; }) || cats[cats.length - 1];
		return { nom : 'course', cat : c, vue : Vue(c) };
	}

	// 2. La catégorie courante : la première qui n'est pas finie.
	const i = etats.findIndex(function(e) { return !e.finie; });

	if (i < 0)
	{
		// Tout est couru : le dernier classement, puis les caméras.
		const derniere = cats[cats.length - 1];
		const fin = etats[cats.length - 1].finA || heure;
		if (heure < fin + Duree(R.resultats))
			return { nom : 'resultats', cat : derniere };
		return { nom : 'fin' };
	}

	const cat = cats[i];
	const depart = Heure(cat.depart);

	// Catégorie commencée, personne sur l'eau : entre deux bateaux.
	if (etats[i].commencee)
		return { nom : 'course', cat : cat, vue : Vue(cat) };

	if (i === 0)
	{
		// Avant le premier départ : compte à rebours, générique, présentateur,
		// liste de départ. Tout est calé sur l'heure du départ.
		const gen = depart - R.generiqueAvant * 1000;
		const genFin = gen + (R.generique && !regie.genKO ? Duree(regie.genDuree + 0.5) : 0);
		const listes = depart - R.departsAvant * 1000;

		if (heure < gen)
			return { nom : 'compte', cat : cat, cible : minuit + depart };
		if (heure < genFin)
			return { nom : 'generique', cat : cat, offset : (heure - gen) / Duree(1) };
		if (heure < listes)
		{
			const nomDebut = genFin + Duree(R.speakerDelai);
			return { nom : 'speaker', cat : cat, cible : minuit + depart,
			         avecNom : heure >= nomDebut && heure < nomDebut + Duree(R.speakerDuree) };
		}

		// Le nom de la catégorie, puis sa liste de départ jusqu'au premier
		// départ : c'est lui qui amène la course.
		if (heure < listes + Duree(R.titre))
			return { nom : 'titre', cat : cat };

		return { nom : 'depart', cat : cat };
	}
	else
	{
		// Enchaînement : résultats de la précédente, puis titre de la suivante,
		// comptés depuis la dernière arrivée.
		const prec = cats[i - 1];
		// Dernière arrivée inconnue (pas de chrono valide) : fin prévue + 2 min.
		const fin = etats[i - 1].finA || (Heure(prec.fin) + 120000);
		if (heure < fin + Duree(R.resultats))
			return { nom : 'resultats', cat : prec };
		if (heure < fin + Duree(R.resultats + R.titre))
			return { nom : 'titre', cat : cat };
	}

	if (heure < depart - R.avance * 1000)
		return { nom : 'depart', cat : cat };

	return { nom : 'course', cat : cat, vue : Vue(cat) };
}

/** Clé d'une scène : deux scènes de même clé ne déclenchent pas de rideau. */
function Cle(s)
{
	if (s.nom === 'course')
		return 'course:' + s.vue;
	if (s.nom === 'resultats' || s.nom === 'titre' || s.nom === 'depart')
		return s.nom + ':' + s.cat.epreuve;
	return s.nom;
}

/******************** pilotage ********************/

/**
 * Appelé à chaque donnée reçue et 4 fois par seconde. Une scène différente
 * passe par le rideau ; pendant le rideau, la dernière cible calculée gagne.
 */
function Piloter()
{
	// La liaison d'abord : elle doit s'afficher même si le calcul échoue.
	Liaison();

	let s;
	try
	{
		s = Calculer();
	}
	catch (e)
	{
		console.error('régie :', e);
		return;			// on garde l'écran en cours
	}

	PreparerCadres(s);
	MettreAJour(s);

	const cle = Cle(s);
	if (cle === regie.scene && !regie.rideau)
		return;

	regie.cible = s;
	if (regie.rideau)
		return;

	// Au lancement, le rose apparaît sans rideau.
	if (regie.scene === null)
	{
		Montrer(s);
		return;
	}

	Rideau();
}

/*
 * Rideau : quatre bandes obliques traversent l'écran de gauche à droite, les
 * logos passent avec la bande marine. La scène change à mi-course, quand la
 * marine couvre toute l'image (voir @keyframes rideau dans tv_regie.css).
 */
const RIDEAU_DUREE = 1200;

function Rideau()
{
	regie.rideau = true;
	const el = document.getElementById('rideau');
	el.classList.remove('passe');
	void el.offsetWidth;
	el.classList.add('passe');

	const anim = regie.reglages.anim;

	setTimeout(function() {
		Montrer(regie.cible);
	}, anim ? RIDEAU_DUREE / 2 : 0);

	setTimeout(function() {
		regie.rideau = false;
		el.classList.remove('passe');
		// La cible a pu changer pendant le rideau.
		if (Cle(regie.cible) !== regie.scene)
			Piloter();
	}, anim ? RIDEAU_DUREE + 50 : 0);
}

/******************** générique ********************/

/**
 * Lance le générique à `offset` secondes : 0 en temps normal, plus si la page
 * a été rechargée pendant qu'il passait. Le son est demandé ; si le navigateur
 * le refuse (lecture automatique), la vidéo passe muette plutôt que pas du
 * tout. Sa fenêtre est calée sur l'horloge : quand elle se ferme, la régie
 * passe au présentateur, que la vidéo soit finie ou non.
 */
function JouerGenerique(offset)
{
	const v = document.getElementById('gen_video');
	if (!v.paused)
		return;

	if (offset > 0.5 && isFinite(v.duration) && offset < v.duration)
		v.currentTime = offset;
	else
		v.currentTime = 0;

	v.muted = !regie.reglages.son;
	const p = v.play();
	if (p && p.catch)
	{
		p.catch(function() {
			v.muted = true;
			v.play().catch(function() {});
		});
	}
}

function CouperGenerique()
{
	const v = document.getElementById('gen_video');
	if (!v.paused)
		v.pause();
}

/** Affiche une scène : une seule couche visible à la fois. */
function Montrer(s)
{
	regie.scene = Cle(s);

	if (s.nom === 'generique')
		JouerGenerique(s.offset || 0);
	else
		CouperGenerique();

	const couche = {
		rose : null, fin : null, generique : 'generique',
		compte : 'compte', speaker : 'speaker', titre : 'titre',
		depart : 'c_depart', resultats : 'c_resultats',
		course : s.vue === 'inrace' ? 'c_inrace' : 'c_duo',
	}[s.nom];

	document.querySelectorAll('.couche').forEach(function(el) {
		el.classList.toggle('visible', el.id === couche);
	});

	// Les animations d'entrée repartent à chaque apparition.
	if (s.nom === 'speaker')
		document.getElementById('speaker').classList.remove('nom', 'nom-sort');

	if (s.nom === 'titre')
	{
		const el = document.getElementById(s.nom);
		el.classList.remove('joue');
		void el.offsetWidth;
		el.classList.add('joue');
	}

	document.body.dataset.scene = s.nom;
}

/**
 * Prépare les cadres de résultats et de liste de départ sur la bonne
 * catégorie, tant qu'ils sont masqués : leur page a le temps de charger
 * avant d'être montrée.
 */
function PreparerCadres(s)
{
	const cats = regie.scenario.categories;
	const i = s.cat ? cats.indexOf(s.cat) : -1;

	// La catégorie dont on montrera les résultats : la précédente de la
	// courante, ou celle qui vient de finir.
	let res = null;
	let dep = null;

	if (s.nom === 'resultats')
	{
		res = s.cat;
		dep = cats[i + 1] || null;
	}
	else if (s.cat)
	{
		res = s.nom === 'course' ? s.cat : (cats[i - 1] || null);
		dep = s.nom === 'course' ? (cats[i + 1] || null) : s.cat;
	}

	Cadre('c_resultats', res ? 'tv_results.html?epreuve=' + encodeURIComponent(res.epreuve) : null);
	Cadre('c_depart', dep ? 'tv_departs.html?epreuve=' + encodeURIComponent(dep.epreuve) : null);
}

/** Change l'adresse d'un cadre, seulement s'il est masqué et qu'elle diffère. */
function Cadre(id, url)
{
	const el = document.getElementById(id);
	if (url === null || el.classList.contains('visible'))
		return;

	const cadre = el.querySelector('iframe');
	if (cadre.dataset.url !== url)
	{
		cadre.dataset.url = url;
		cadre.src = url;
	}
}

/******************** état de la liaison ********************/

/**
 * Icône en haut à droite. Rouge tant que la page n'est pas connectée au
 * serveur WebSocket (après 1,5 s, pour ne pas clignoter au lancement), verte
 * pendant 5 s quand la connexion s'établit ou revient, puis effacée. La
 * reconnexion elle-même est celle de ws.js.
 */
function Liaison()
{
	const ok = !!(wsMain.websocket && wsMain.websocket.readyState === WebSocket.OPEN);
	const el = document.getElementById('liaison');
	const now = Date.now();

	if (ok && !regie.lieAvant)
		regie.lieDepuis = now;
	if (!ok && regie.lieAvant !== false)
		regie.coupeDepuis = now;
	regie.lieAvant = ok;

	let etat = '';
	if (!ok && now - (regie.coupeDepuis || regie.charge) > 1500)
		etat = 'coupee';
	else if (ok && now - regie.lieDepuis < 5000)
		etat = 'ok';

	if (el.dataset.etat !== etat)
	{
		el.dataset.etat = etat;
		el.className = etat;
	}
}

/******************** contenu des scènes maison ********************/

function Libelle(cat)
{
	if (cat.libelle)
		return cat.libelle;
	return typeof Categorie_name === 'function' ? Categorie_name(cat.epreuve) : cat.epreuve;
}

function HeureLisible(txt)
{
	const p = String(txt).split(':');
	return parseInt(p[0]) + 'h' + p[1] + (p[2] && p[2] !== '00' ? ':' + p[2] : '');
}

/** Textes qui dépendent de la scène ou de l'heure : appelé à chaque pilotage. */
function MettreAJour(s)
{
	if (s.nom === 'compte')
	{
		SetTexte('cp_reste', Rebours(s.cible - Maintenant(), true));
		SetTexte('cp_cat', Libelle(s.cat) + ' — premier départ à ' + HeureLisible(s.cat.depart));
	}

	if (s.nom === 'speaker')
	{
		SetTexte('sp_reste', Rebours(s.cible - Maintenant()));
		SetTexte('sp_cat', Libelle(s.cat));

		// Le nom entre quand la scène commence, et ressort après speaker_duree :
		// il n'est rejoué que s'il n'était pas déjà là.
		const el = document.getElementById('speaker');
		if (s.avecNom && !el.classList.contains('nom'))
		{
			el.classList.remove('nom-sort');
			el.classList.add('nom');
		}
		else if (!s.avecNom && el.classList.contains('nom'))
		{
			el.classList.remove('nom');
			el.classList.add('nom-sort');
		}
	}

	if (s.nom === 'titre' && s.cat)
	{
		SetTexte('ti_cat', Libelle(s.cat));
		const n = Bateaux(s.cat.epreuve).length || s.cat.nb;
		SetTexte('ti_info', n + ' bateaux · premier départ ' + HeureLisible(s.cat.depart));
	}

	if (regie.reglages.debug)
	{
		const d = new Date(Maintenant());
		SetTexte('debug', d.toLocaleTimeString('fr-FR') + (regie.repetition ? ' ×' + regie.vitesse : '') + ' · ' + Cle(s)
			+ (regie.clock > 0 && Date.now() - regie.clockRecu < 10000 ? ' · horloge competFFCK' : ' · horloge poste')
			+ ' · sur l\'eau : ' + (regie.onCourse.join(', ') || '—'));
	}
}

/** « 04:32 », ou « 01:04:32 » / « 2 j  01:04:32 » avec `long` au-delà d'une heure. */
function Rebours(ms, long)
{
	const sec = Math.max(0, Math.ceil(ms / 1000));
	const j = Math.floor(sec / 86400);
	const pad = function(n) { return (n < 10 ? '0' : '') + n; };
	const h = Math.floor(sec / 3600) % 24;
	const ms_ = pad(Math.floor(sec / 60) % 60) + ':' + pad(sec % 60);

	if (!long && j === 0 && h === 0)
		return ms_;

	return (j > 0 ? j + ' j  ' : '') + pad(h) + ':' + ms_;
}

function SetTexte(id, txt)
{
	const el = document.getElementById(id);
	if (el && el.textContent !== txt)
		el.textContent = txt;
}

/******************** initialisation ********************/

function Init()
{
	const urlParams = new URLSearchParams(window.location.search);
	const num = function(key, def) {
		const v = parseFloat(urlParams.get(key));
		return isNaN(v) ? def : v;
	};

	const id = urlParams.get('scenario') || '';
	regie.scenario = REGIE_SCENARIOS[id] || null;
	if (regie.scenario === null)
	{
		document.body.dataset.scene = 'erreur';
		document.getElementById('erreur').textContent =
			'Scénario inconnu « ' + id + ' ». Scénarios : ' + Object.keys(REGIE_SCENARIOS).join(', ');
		return;
	}

	regie.reglages = {
		rose : num('rose', 5),
		resultats : num('resultats', 45),
		titre : num('titre', 10),
		avance : num('avance', 60),
		generiqueAvant : num('generique_avant', num('speaker_avant', 300)),
		speakerDelai : num('speaker_delai', 3),
		speakerDuree : num('speaker_duree', 10),
		departsAvant : num('departs_avant', 30),
		generique : true,
		anim : urlParams.get('anim') !== '0',
		son : urlParams.get('son') !== '0',
		debug : urlParams.get('debug') === '1',
	};

	regie.repetition = urlParams.get('repetition') === '1';

	if (urlParams.has('maintenant'))
	{
		const t = new Date(urlParams.get('maintenant')).getTime();
		if (!isNaN(t))
			regie.decalage = t - Date.now();
	}

	if (urlParams.get('bg') !== '0')
		document.body.classList.add('chroma');
	if (!regie.reglages.anim)
		document.body.classList.add('no-anim');
	if (regie.reglages.debug)
		document.body.classList.add('debug');

	// Textes fixes du scénario.
	SetTexte('cp_titre', regie.scenario.titre);
	SetTexte('cp_phase', regie.scenario.phase);
	SetTexte('ti_titre', regie.scenario.titre);
	SetTexte('ti_phase', regie.scenario.phase);
	SetTexte('sp_nom', REGIE_SPEAKER.nom);
	SetTexte('sp_role', REGIE_SPEAKER.role);

	const jour = new Date(MinuitScenario());
	SetTexte('cp_date', jour.toLocaleDateString('fr-FR', { weekday : 'long', day : 'numeric', month : 'long', year : 'numeric' }));

	// Générique : chargé dès le lancement, pendant le rose.
	const gen = urlParams.has('generique') ? urlParams.get('generique') : 'video/generique.mp4';
	const v = document.getElementById('gen_video');
	if (gen === '0' || gen === '' || !/^[A-Za-z0-9_\/.-]+$/.test(gen) || gen.indexOf('..') >= 0)
	{
		regie.reglages.generique = false;
	}
	else
	{
		// Absente ou illisible : on la saute, le présentateur prend sa place.
		v.onerror = function() { regie.genKO = true; Piloter(); };
		v.onloadedmetadata = function() {
			if (isFinite(v.duration) && v.duration > 0)
				regie.genDuree = v.duration;
		};
		v.src = gen;
	}

	// Écrans de course chargés une fois pour toutes.
	document.querySelector('#c_duo iframe').src = 'tv_duo.html';
	document.querySelector('#c_inrace iframe').src = 'tv_inrace.html';

	Redimensionner();
	window.addEventListener('resize', Redimensionner);

	wsMain.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsMain.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.mapCommand.set('<on_course>', OnFlowOnCourse);
	wsMain.mapCommand.set('<bib_time>', function() { ReloadEpreuve(); });
	wsMain.mapCommand.set('<penalty_add>', function() {});
	wsMain.mapCommand.set('<run_erase>', function() { regie.onCourse = []; ReloadEpreuve(); });
	wsMain.mapCommand.set('<mode_chrono>', function() { ReloadEpreuve(); });

	Piloter();
	setInterval(Piloter, 250);

	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}

function Redimensionner()
{
	const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
	document.documentElement.style.setProperty('--regie-scale', k);
}
