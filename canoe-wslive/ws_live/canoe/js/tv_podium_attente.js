/*
 * Attente de la remise des prix, pour l'écran derrière le podium
 * (tv_podium_attente.html).
 *
 * L'épreuve : le nom de la compétition et le libellé de la phase chargée dans
 * competFFCK (« Qualification Manche 2 »…), lus au <race_load>. Sans serveur,
 * ou tant qu'il n'a pas répondu, ceux du scénario : la page reste lisible même
 * si competFFCK est arrêté.
 *
 * Paramètres d'URL :
 *   ws=192.168.1.52:8080       serveur competFFCK (le nom de l'épreuve)
 *   scenario=samedi-matin      titre et phase de secours, pris dans regie_scenarios.js
 *   titre=... phase=...        imposent le titre et l'épreuve
 *   texte=Remise des prix      le grand texte (défaut : « Remise des prix »)
 *   sous=Kayak Homme · Kayak Dame   la ligne sous le texte (défaut : l'épreuve)
 *   heure=16:30                compte à rebours jusqu'à cette heure (aujourd'hui) ;
 *                              arrivé à zéro, le compte disparaît
 *   anim=0                     sans animation
 */

const urlParams = new URLSearchParams(window.location.search);

const attente = {
	titre : '',		// compétition et épreuve à afficher, URL > competFFCK > scénario
	epreuve : '',
};

/******************** competFFCK ********************/

const wsMain = typeof ws === 'object' ? new ws.Context(wsParams.url, wsParams.port) : null;

function OnOpenWebSocketCommand()
{
	wsMain.websocket.send(JSON.stringify({ key : '<race_load>', key_race : '*' }));
}

/** Le libellé de la phase chargée (« Qualification Manche 2 »…), '' si inconnu. */
function PhaseCompet()
{
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

function OnCommandRaceLoad(objJSON)
{
	try
	{
		canoe.SetRace(objJSON);
		const t = canoe.GetTable('Competition');
		const nom = t && t.GetNbRows() > 0 ? String(t.GetCell('Nom', 0)) : '';
		if (nom !== '')
			attente.titre = nom;
		const phase = PhaseCompet();
		if (phase !== '')
			attente.epreuve = phase;
		Afficher();
	}
	catch (e)
	{
		// Le serveur répond mal : on garde les noms du scénario.
		console.error(e);
	}
}

/** Pose les textes : ceux de l'URL d'abord, puis competFFCK, puis le scénario. */
function Afficher()
{
	const epreuve = urlParams.get('phase') || attente.epreuve;
	SetTexte('titre', urlParams.get('titre') || attente.titre);
	SetTexte('phase', epreuve);
	SetTexte('at_sous', urlParams.has('sous') ? urlParams.get('sous') : epreuve);
}

function Deux(n)
{
	return String(n).padStart(2, '0');
}

function SetTexte(id, txt)
{
	const el = document.getElementById(id);
	if (el.textContent !== txt)
		el.textContent = txt;
}

/** L'heure ?heure=16:30 aujourd'hui, en ms ; null sans paramètre ou illisible. */
function Cible()
{
	const h = urlParams.get('heure');
	if (!h || !/^\d{1,2}:\d{2}(:\d{2})?$/.test(h))
		return null;
	const p = h.split(':').map(Number);
	const d = new Date();
	d.setHours(p[0], p[1], p[2] || 0, 0);
	return d.getTime();
}

function Tic()
{
	const cible = Cible();
	const reste = cible === null ? 0 : cible - Date.now();
	document.body.classList.toggle('avec-compte', reste > 0);
	if (reste <= 0)
		return;

	const t = Math.ceil(reste / 1000);
	const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
	SetTexte('at_reste', h > 0 ? h + ':' + Deux(m) + ':' + Deux(s) : Deux(m) + ':' + Deux(s));
}

/** Quelques paillettes dorées, comme sur le palmarès. */
function Paillettes()
{
	const zone = document.getElementById('paillettes');
	for (let i = 0; i < 30; i++)
	{
		const p = document.createElement('span');
		const taille = 3 + Math.random() * 5;
		p.style.left = (Math.random() * 100).toFixed(1) + '%';
		p.style.width = p.style.height = taille.toFixed(1) + 'px';
		p.style.animationDuration = (10 + Math.random() * 10).toFixed(1) + 's';
		p.style.animationDelay = (-Math.random() * 20).toFixed(1) + 's';
		p.style.setProperty('--derive', ((Math.random() - 0.5) * 140).toFixed(0) + 'px');
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
	const id = urlParams.get('scenario');
	const sc = id && typeof REGIE_SCENARIOS === 'object' ? REGIE_SCENARIOS[id] : null;

	attente.titre = sc ? sc.titre : '';
	attente.epreuve = sc ? sc.phase : '';
	SetTexte('at_texte', urlParams.get('texte') || 'Remise des prix');
	Afficher();

	if (urlParams.get('anim') === '0')
	{
		document.body.classList.remove('entre');
		document.body.classList.add('no-anim');
	}
	else
		Paillettes();

	Redimensionner();
	window.addEventListener('resize', Redimensionner);

	// Le nom de l'épreuve, de competFFCK ; ws.js se reconnecte seul.
	if (wsMain && urlParams.has('ws'))
	{
		wsMain.lang = 'fr';
		wsMain.mapCommand.set('<race_load>', OnCommandRaceLoad);
		// La phase peut changer pendant l'attente : on relit toutes les minutes.
		wsMain.mapCommand.set('<epreuve_load>', function() {});
		wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
		setInterval(function() {
			if (wsMain.websocket && wsMain.websocket.readyState === WebSocket.OPEN)
				OnOpenWebSocketCommand();
		}, 60000);
	}

	// Calé sur les secondes : le compte descend d'une seconde à la fois.
	(function Battre() {
		Tic();
		setTimeout(Battre, 1000 - (Date.now() % 1000) + 15);
	})();
}

Init();
