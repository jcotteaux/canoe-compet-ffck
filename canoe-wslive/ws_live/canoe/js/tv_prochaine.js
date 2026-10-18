/*
 * Temps avant la prochaine session (tv_prochaine.html), en incrustation sur
 * fond transparent (OBS), ou la couleur de clé avec ?chroma=1.
 *
 * La session : la première demi-journée de REGIE_SCENARIOS (hors `test`) dont
 * le premier départ n'est pas encore passé. Le compte arrive à zéro, la page
 * affiche « Départ imminent » pendant `imminent` s, puis passe à la session
 * suivante. Plus aucune session : la page est vide.
 *
 * Paramètres d'URL :
 *   scenario=vendredi-apres-midi   session imposée
 *   cible=14:00                    heure imposée (aujourd'hui), à la place du
 *                                  premier départ du scénario
 *   libelle=Reprise des courses    texte imposé à la place de la phase
 *   lbl=Reprise dans               texte au-dessus du temps
 *   droite=1                       le bloc en bas à droite (défaut : à gauche)
 *   chroma=1                       fond de clé #CC00CC (défaut : transparent,
 *                                  pour une source OBS par-dessus le reste)
 *   imminent=600                   « Départ imminent » tant de s après l'heure
 *   maintenant=2026-10-16T12:30:00 simule l'heure du poste (essai)
 *
 * L'heure est celle du poste : la page ne parle pas à competFFCK, elle n'a rien
 * à attendre d'un serveur.
 */

const urlParams = new URLSearchParams(window.location.search);

const prochaine = {
	decalage : 0,		// maintenant simulé - heure du poste, en ms
	imminent : 600,
};

function Maintenant()
{
	return Date.now() + prochaine.decalage;
}

/** '14:00' ou '14:00:00' le jour `date` (AAAA-MM-JJ, null = aujourd'hui) -> ms. */
function Instant(date, hms)
{
	const j = date ? new Date(date + 'T00:00:00') : new Date(Maintenant());
	const p = String(hms).split(':').map(Number);
	j.setHours(p[0] || 0, p[1] || 0, p[2] || 0, 0);
	return j.getTime();
}

/*
 * Secours : le premier départ de chaque demi-journée, recopié de
 * js/regie_scenarios.js. Il ne sert que si ce fichier ne se charge pas : la
 * page compte alors quand même. À tenir à jour avec les scénarios.
 */
const SESSIONS_SECOURS = {
	'vendredi-matin'      : { date : '2026-10-16', phase : 'Qualifications — Manche 1',       categories : [{ libelle : 'Invités',     depart : '09:00:00' }] },
	'vendredi-apres-midi' : { date : '2026-10-16', phase : 'Qualifications — Manche 2',       categories : [{ libelle : 'Kayak Homme', depart : '14:00:00' }] },
	'samedi-matin'        : { date : '2026-10-17', phase : 'Kayak-Cross — contre-la-montre',  categories : [{ libelle : 'Invités',     depart : '10:15:00' }] },
	'samedi-apres-midi'   : { date : '2026-10-17', phase : 'Kayak-Cross — phases finales',    categories : [{ libelle : 'Kayak-Cross', depart : '15:00:00' }] },
	'dimanche-matin'      : { date : '2026-10-18', phase : 'Demi-finales',                    categories : [{ libelle : 'Invités',     depart : '09:00:00' }] },
	'dimanche-apres-midi' : { date : '2026-10-18', phase : 'Finales',                         categories : [{ libelle : 'Kayak Homme', depart : '14:05:00' }] },
};

/** Les scénarios : ceux de la régie, sinon le secours. */
function Scenarios()
{
	return typeof REGIE_SCENARIOS === 'object' && REGIE_SCENARIOS ? REGIE_SCENARIOS : SESSIONS_SECOURS;
}

/** Les sessions, dans l'ordre : { id, debut, phase, cat }. */
function Sessions()
{
	const scenarios = Scenarios();
	const out = [];
	Object.keys(scenarios).forEach(function(id) {
		const sc = scenarios[id];
		if (id === 'test' || !sc.date || !sc.categories.length)
			return;
		const c = sc.categories[0];
		out.push({ id : id, debut : Instant(sc.date, c.depart), phase : sc.phase, cat : c.libelle });
	});
	return out.sort(function(a, b) { return a.debut - b.debut; });
}

/** La session à annoncer maintenant, null s'il n'y en a plus. */
function Session()
{
	const now = Maintenant();
	const id = urlParams.get('scenario');
	let s = null;

	if (id && Scenarios()[id])
	{
		const sc = Scenarios()[id];
		const c = sc.categories[0];
		s = { id : id, debut : Instant(sc.date, c.depart), phase : sc.phase, cat : c.libelle };
	}
	else
		s = Sessions().find(function(x) { return now < x.debut + prochaine.imminent * 1000; }) || null;

	if (urlParams.has('cible'))
	{
		s = s || { phase : '', cat : '' };
		s = Object.assign({}, s, { debut : Instant(null, urlParams.get('cible')) });
		if (!urlParams.has('scenario'))
			s.cat = '';
	}
	return s;
}

function Deux(n)
{
	return String(n).padStart(2, '0');
}

function HeureLisible(ms)
{
	const d = new Date(ms);
	return d.getHours() + 'h' + Deux(d.getMinutes());
}

function JourLisible(ms)
{
	const d = new Date(ms);
	const auj = new Date(Maintenant());
	if (d.toDateString() === auj.toDateString())
		return '';
	return d.toLocaleDateString('fr-FR', { weekday : 'long' }) + ' ';
}

/** 1:29:40, 29:40 sous l'heure. */
function Reste(ms)
{
	const t = Math.ceil(ms / 1000);
	const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
	return h > 0 ? h + ':' + Deux(m) + ':' + Deux(s) : Deux(m) + ':' + Deux(s);
}

function SetTexte(id, txt)
{
	const el = document.getElementById(id);
	if (el.textContent !== txt)
		el.textContent = txt;
}

function Tic()
{
	try
	{
		const s = Session();
		document.body.classList.toggle('visible', !!s);
		if (!s)
			return;

		const reste = s.debut - Maintenant();
		const imminent = reste <= 0;
		document.body.classList.toggle('imminent', imminent);

		SetTexte('lbl', imminent ? '' : (urlParams.get('lbl') || 'Prochaine session dans'));
		SetTexte('reste', imminent ? 'Départ imminent' : Reste(reste));
		SetTexte('phase', urlParams.get('libelle') || s.phase || 'Reprise des courses');

		const quand = JourLisible(s.debut) + HeureLisible(s.debut);
		SetTexte('cat', s.cat ? s.cat + ' — premier départ ' + quand : 'à ' + quand);
	}
	catch (e)
	{
		// Une erreur garde l'affichage en cours plutôt que de casser.
		console.error(e);
	}
}

/**
 * La mise à jour suit les images (requestAnimationFrame) : la seconde change
 * à l'image même où elle tombe, sans à-coup. OBS ou le navigateur peuvent
 * ralentir les images d'une source cachée : une minuterie à 200 ms prend
 * alors le relais. Tic ne touche la page que si le texte change.
 */
function Battre()
{
	Tic();
	requestAnimationFrame(Battre);
}

function Redimensionner()
{
	const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
	document.documentElement.style.setProperty('--scale', k);
}

function Init()
{
	if (urlParams.has('maintenant'))
	{
		const t = new Date(urlParams.get('maintenant')).getTime();
		if (!isNaN(t))
			prochaine.decalage = t - Date.now();
	}
	const imm = parseInt(urlParams.get('imminent'), 10);
	if (!isNaN(imm) && imm >= 0)
		prochaine.imminent = imm;

	if (urlParams.get('droite') === '1')
		document.body.classList.add('droite');
	if (urlParams.get('chroma') === '1')
		document.body.classList.add('chroma');

	Redimensionner();
	window.addEventListener('resize', Redimensionner);

	Battre();
	setInterval(Tic, 200);
}

// On attend les polices (pas de saut de texte au premier affichage), une
// seconde au plus : si elles ne viennent pas, on démarre quand même.
let demarre = false;
function Demarrer()
{
	if (demarre)
		return;
	demarre = true;
	Init();
}
if (document.fonts && document.fonts.ready)
	document.fonts.ready.then(Demarrer, Demarrer);
setTimeout(Demarrer, 1000);
