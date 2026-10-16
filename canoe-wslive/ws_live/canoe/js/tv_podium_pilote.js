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
 * Paramètres d'URL :
 *   scenario=samedi-matin
 *   epreuves=XK1H,XK1D
 */

const urlParams = new URLSearchParams(window.location.search);
const ETAPES = ['marches vides', '3e affiché', '3e et 2e affichés', 'podium complet'];

const pilote = { epreuve : '', etape : 0 };
let boutons = '';

/** [{ code, libelle }] : les catégories proposées. */
/** Les catégories publiées par l'écran, via le serveur. */
let publiees = null;

function Categories()
{
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

	const zone = document.getElementById('categories');
	zone.innerHTML = '';
	cats.forEach(function(c) {
		const b = document.createElement('button');
		b.dataset.code = c.code;
		b.textContent = c.libelle;
		b.title = c.code;
		b.addEventListener('click', function() { Envoyer({ epreuve : c.code, etape : 0 }); });
		zone.appendChild(b);
	});
}

function Init()
{
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
