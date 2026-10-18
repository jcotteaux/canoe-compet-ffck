/*
 * Télécommande de l'écran du podium (tv_podium_pilote.html).
 *
 * Envoie au serveur local (tools/serve.js, POST /pilote/podium) la catégorie
 * et l'étape de révélation ; l'écran (tv_palmares.html?pilote=1) les reçoit par
 * /pilote/podium/flux, et cette page aussi : plusieurs télécommandes restent
 * d'accord entre elles.
 *
 * Les catégories : ?epreuves=XK1H,XK1D, ou celles du scénario ?scenario=
 * (regie_scenarios.js) ; sans l'un ni l'autre, celles que l'écran publie
 * (les catégories qui ont des résultats dans competFFCK, ou celles du
 * fichier), et à défaut le scénario samedi-matin.
 *
 * Avec ?fichier (podium/podium.json, ou ?fichier=autre.json), elle lit le
 * fichier des podiums elle-même : toute une cérémonie (élite, médailles,
 * Coupe de France, clubs…), groupée par section dans l'ordre du fichier, avec
 * pour chaque écran qui monte sur le podium et qui remet les médailles. Sans
 * attendre que l'écran l'ait publiée.
 *
 * Paramètres d'URL :
 *   fichier[=podium/podium.json]
 *   scenario=samedi-matin
 *   epreuves=XK1H,XK1D
 */

const urlParams = new URLSearchParams(window.location.search);
const ETAPES = ['marches vides', '3e affiché', '3e et 2e affichés', 'podium complet'];

const pilote = { epreuve : '', etape : 0 };
let boutons = '';

/** Les catégories publiées par l'écran, via le serveur. */
let publiees = null;

/** Celles du fichier des podiums (?fichier), relu toutes les 10 s. */
let duFichier = null;
const fichier = urlParams.has('fichier') ? (urlParams.get('fichier') || 'podium/podium.json') : '';

function LireFichier()
{
	if (!/^[\w\/.-]+\.json$/.test(fichier) || fichier.indexOf('..') >= 0)
		return;
	fetch(fichier + '?t=' + Date.now(), { cache : 'no-store' })
		.then(function(r) { return r.json(); })
		.then(function(doc) {
			duFichier = (doc.categories || []).filter(function(c) { return c && c.epreuve; }).map(function(c) {
				return {
					code : String(c.epreuve),
					libelle : c.libelle || String(c.epreuve),
					// La section de la cérémonie, sinon le titre et la phase de l'écran.
					groupe : c.section || [c.titre || doc.titre, c.phase || doc.phase].filter(Boolean).join(' — '),
					remis_par : c.remis_par || '',
					noms : (c.classement || []).slice(0, 3).map(function(r) { return r && r.nom ? String(r.nom) : ''; }),
				};
			});
			Boutons();
			Courant();
		})
		.catch(function() { /* fichier en cours d'édition : on garde la version précédente */ });
}

/** [{ code, libelle, groupe?, remis_par?, noms? }] : les catégories proposées. */
function Categories()
{
	if (fichier && Array.isArray(duFichier))
		return duFichier;

	const id = urlParams.get('scenario') || 'samedi-matin';
	const sc = typeof REGIE_SCENARIOS === 'object' ? REGIE_SCENARIOS[id] : null;
	const libelle = function(code) {
		if (typeof REGIE_SCENARIOS === 'object')
		{
			for (const k in REGIE_SCENARIOS)
			{
				const c = REGIE_SCENARIOS[k].categories.find(function(x) { return x.epreuve === code; });
				if (c && c.libelle)
					return c.libelle;
			}
		}
		return code;
	};

	const epreuves = (urlParams.get('epreuves') || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
	if (epreuves.length > 0)
		return epreuves.map(function(c) { return { code : c, libelle : libelle(c) }; });
	if (!urlParams.has('scenario') && Array.isArray(publiees) && publiees.length > 0)
		return publiees;
	if (sc)
		return sc.categories.filter(function(c) { return c.vue !== 'kcross'; })
			.map(function(c) { return { code : c.epreuve, libelle : c.libelle || c.epreuve }; });
	return [];
}

function Envoyer(changement)
{
	return fetch('/pilote/podium', {
		method : 'POST',
		headers : { 'Content-Type' : 'application/json' },
		body : JSON.stringify(changement),
	}).then(function(r) { return r.json(); }).then(Afficher).catch(function() {
		document.getElementById('liaison').className = 'coupee';
		document.getElementById('liaison').textContent = 'hors ligne';
	});
}

function Afficher(etat)
{
	if (!etat)
		return;
	if (Array.isArray(etat.categories))
		publiees = etat.categories;
	Boutons();
	pilote.epreuve = etat.epreuve || '';
	pilote.etape = etat.etape || 0;

	document.querySelectorAll('#categories button').forEach(function(b) {
		b.classList.toggle('actif', b.dataset.code === pilote.epreuve);
	});
	Courant();
	document.querySelectorAll('.etapes button').forEach(function(b) {
		b.classList.toggle('fait', pilote.etape >= parseInt(b.dataset.etape, 10));
	});
	document.getElementById('etat').textContent = '· ' + ETAPES[pilote.etape];
}

/** Les boutons de catégorie, refaits seulement quand la liste change. */
function Boutons()
{
	const cats = Categories();
	const cle = JSON.stringify(cats);
	if (cle === boutons)
		return;
	boutons = cle;

	// Une grille par section (titre et phase de l'écran), dans l'ordre.
	const zone = document.getElementById('categories');
	zone.innerHTML = '';
	let grille = null, groupe = null;
	cats.forEach(function(c) {
		if (!grille || (c.groupe || '') !== groupe)
		{
			groupe = c.groupe || '';
			if (groupe)
			{
				const h = document.createElement('h3');
				h.textContent = groupe;
				zone.appendChild(h);
			}
			grille = document.createElement('div');
			grille.className = 'grille';
			zone.appendChild(grille);
		}
		const b = document.createElement('button');
		b.dataset.code = c.code;
		b.title = c.code;
		const lib = document.createElement('span');
		lib.className = 'lib';
		lib.textContent = c.libelle;
		b.appendChild(lib);
		const noms = (c.noms || []).filter(Boolean);
		if (noms.length)
		{
			const n = document.createElement('small');
			n.textContent = noms.join(' · ');
			if (noms.some(function(x) { return /COMPL[ÉE]TER/i.test(x); }))
				b.classList.add('a-completer');
			b.appendChild(n);
		}
		b.addEventListener('click', function() { Envoyer({ epreuve : c.code, etape : 0 }); });
		grille.appendChild(b);
	});
	pilote.liste = cats;
}

/** Le rappel de l'écran en cours : section, catégorie, podium, qui remet. */
function Courant()
{
	const el = document.getElementById('courant');
	const c = (Categories() || []).find(function(x) { return x.code === pilote.epreuve; });
	if (!c)
	{
		el.hidden = true;
		return;
	}
	el.hidden = false;
	el.querySelector('.groupe').textContent = c.groupe || '';
	el.querySelector('.lib').textContent = c.libelle;
	el.querySelector('.noms').textContent = (c.noms || []).filter(Boolean)
		.map(function(n, i) { return (i + 1) + '. ' + n; }).join('   ');
	el.querySelector('.remis').textContent = c.remis_par ? 'Remis par : ' + c.remis_par : '';
}

function Init()
{
	if (fichier)
	{
		LireFichier();
		setInterval(LireFichier, 10000);
	}
	Boutons();

	document.querySelectorAll('button[data-etape]').forEach(function(b) {
		b.addEventListener('click', function() { Envoyer({ etape : parseInt(b.dataset.etape, 10) }); });
	});

	// L'état du serveur, à chaque changement, d'où qu'il vienne.
	const liaison = document.getElementById('liaison');
	const flux = new EventSource('/pilote/podium/flux');
	flux.onopen = function() { liaison.className = ''; liaison.textContent = 'en ligne'; };
	flux.onerror = function() { liaison.className = 'coupee'; liaison.textContent = 'hors ligne'; };
	flux.onmessage = function(ev) {
		try { Afficher(JSON.parse(ev.data)); } catch (e) { console.error(e); }
	};
}

Init();
