function OnOpenWebSocketCommand()
{
	wsMain.websocket.send(JSON.stringify({key:'<race_load>', key_race:'*' }));
}

function OnCommandRaceLoad(objJSON)
{
	canoe.SetRace(objJSON);

	const tCompetition = canoe.GetTable('Competition');
	const tCompetition_Course = canoe.GetTable('Competition_Course');
	const tCompetition_Course_Phase = canoe.GetTable('Competition_Course_Phase');

	document.querySelector("#head .name").innerHTML = tCompetition.GetCell('Nom', 0);
	document.querySelector("#head .place").innerHTML = tCompetition_Course.GetCell('Libelle', 0);
	
	const code_phase = canoe.GetCodePhase();
	if (tCompetition_Course_Phase.GetNbRows() >= code_phase && code_phase > 0)
		document.querySelector("#head .title").innerHTML = tCompetition_Course_Phase.GetCell('Libelle', code_phase-1);
	else
		document.querySelector("#head .title").innerHTML = tCompetition_Course_Phase.GetCell('Libelle', 0);

	// Chargement de toutes les épreuves ...
	const cmd = { key : '<epreuve_load>',  epreuve : '' };	
	wsMain.websocket.send(JSON.stringify(cmd));
}

function OnCommandEpreuveLoad(objJSON)
{
    canoe.SetRanking(objJSON);

   // 🔹 Récupération du code activité
    const codeActivite = canoe.GetCodeActivite();

    const tRanking = canoe.GetTableRanking();
    canoe.SetColumnNameRanking(tRanking);

    const course_phase = canoe.GetCodeCoursePhase();
	
	if (codeActivite == 'EXS') {
		tRanking.SetRankingGroup('Cltc'+course_phase, 'Nb_pena'+course_phase+',Total_pena'+course_phase+', Tps_chrono'+course_phase, "Code_categorie");
		tRanking.OrderBy('Cltc'+course_phase+', Dossard');
	} else {
		tRanking.OrderBy('Tps'+course_phase+', Dossard');
	}

    if (wsMain.epreuve == '')
        SetCurrentEpreuve(tRanking);
 
    // 🔹 Gestion du pictogramme
    const picto = document.querySelector("#head .picto");
    picto.classList.remove("sla", "des", "ocr", "mar", "exs");

    if (codeActivite === "SLA") picto.classList.add("sla");
    if (codeActivite === "DES") picto.classList.add("des");
    if (codeActivite === "OCR") picto.classList.add("ocr");
    if (codeActivite === "MAR") picto.classList.add("mar");
	if (codeActivite === "EXS") picto.classList.add("exs");

    // 🔹 Activités sans pénalité
    const activitesSansPena = ['DES','OCR','MAR'];
    if (activitesSansPena.includes(codeActivite)) {
        const pena = document.querySelector('#block_ranking .pena');
        const labelPena = document.querySelector('#head .label_pena');

        if (pena) pena.innerHTML = '';
        if (labelPena) labelPena.innerHTML = '';
    }

    ShowRanking(tRanking);
}

function SetCurrentEpreuve(tRanking)
{
	const course_phase = canoe.GetCodeCoursePhase();
	var lastHeureDep = 0;

	wsMain.epreuve = '';
	wsMain.scroll_start = 0;
	
	for (let i=0;i<=tRanking.GetNbRows();i++)
	{
		if (tRanking.GetCellInt('Tps'+course_phase,i) >= adv.chrono.OK)
		{
			if (tRanking.GetCellInt('Heure_depart'+course_phase,i) > lastHeureDep)
			{
				lastHeureDep = tRanking.GetCellInt('Heure_depart'+course_phase,i);
				wsMain.epreuve = tRanking.GetCell('Code_categorie',i);
			}
		}
	}
	
	if (wsMain.epreuve == '' && tRanking.GetNbRows() > 0)
		wsMain.epreuve = tRanking.GetCell('Code_categorie',0);

	document.querySelector("#head .categ").innerHTML = Categorie_name( wsMain.epreuve);
}

// --- GESTION DES CLASSES ET DES RANGS ---

function HideRow(row) {
    const el = document.querySelector('#block_ranking .row' + row);
    if (el) {
        el.classList.remove('visible');
        el.style.display = 'none'; // Assure que l'élément est retiré du flux
    }
}

function ShowRow(row) {
    const el = document.querySelector('#block_ranking .row' + row);
    if (el) {
        el.style.display = 'block';
        // Petit délai pour laisser le display:block s'appliquer avant l'animation
		
        setTimeout(() => {

            el.classList.add('visible');
        }, 50);
    }
}

function HideRows() {
    for (let i = 1; i <= 10; i++)
        HideRow(i);
}

function ShowRanking(tRanking) {
    if (!tRanking || typeof tRanking !== 'object') return;

    // Cache toutes les lignes avant de commencer l'affichage du nouveau bloc
    for (let j = 1; j <= 10; j++) HideRow(j);
	
    const course_phase = canoe.GetCodeCoursePhase();
    let rowsToShow = [];
    let i = wsMain.scroll_start;

    // 1️ Préparer le bloc (max 10 lignes valides : Catégorie + Temps > 0)
    while (rowsToShow.length < 10 && i < tRanking.GetNbRows()) {
		
        const isSameCategory = tRanking.GetCell('Code_categorie', i) === wsMain.epreuve;
        const hasTime = tRanking.GetCellInt('Tps' + course_phase, i, adv.chrono.KO) != adv.chrono.KO && 
                        tRanking.GetCellInt('Tps' + course_phase, i) > 0;
        if (isSameCategory && hasTime) {
            rowsToShow.push(i);
        }
        i++;
    }

    // 2️ Affichage progressif avec l'animation CSS
    rowsToShow.forEach((rankingIndex, idx) => {
        setTimeout(() => {
            ShowRankingRow(idx + 1, tRanking, rankingIndex, course_phase);
        }, idx * 200); // Décale l'apparition de chaque ligne en ms
    });

    // 3️ Calcul du total pour savoir s'il faut arrêter la boucle
    const totalInCat = GetCountRanking(tRanking, course_phase, 0);

    // 4️ Si moins de 10 lignes classées, on affiche et on stoppe le cycle
    if (totalInCat <= 10) {
        wsMain.scroll_start = 0;

		return; 
    }

    // 5️ Calcul du prochain index de départ pour le scroll
    const nextScrollStart = GetCountRanking(tRanking, course_phase, i) > 0 ? i : 0;

	// 6️ Relance le cycle après le délai
    setTimeout(() => {
        HideRowsProgressively(() => {
            
     // On détermine les durée de pause (2s pour redémarrer au début, 0,5s entre 2 pages)
        let pauseDuration = (nextScrollStart === 0) ? 3000 : 500;

            setTimeout(() => {
                wsMain.scroll_start = nextScrollStart;
                const newRanking = canoe.GetTableRanking();
                ShowRanking(newRanking);
            }, pauseDuration); 

        });
    }, wsMain.scroll_delay);
}

// Mise à jour de GetCountRanking pour éviter l'erreur d'index (i < NbRows)
function GetCountRanking(tRanking, course_phase, iStart)
{
    let count = 0;
	for (let i = iStart; i < tRanking.GetNbRows(); i++)
	{
		if (tRanking.GetCell('Code_categorie', i) == wsMain.epreuve && 
			tRanking.GetCellInt('Tps'+course_phase,i, adv.chrono.KO) != adv.chrono.KO)
		{
			count++;
		}
	}
	return count;
}

function GetRankingBestTime(tRanking, course_phase)
{
	for (let i=0;i<=tRanking.GetNbRows();i++)
	{
		if (tRanking.GetCell('Code_categorie', i) == wsMain.epreuve && 
			tRanking.GetCellInt('Tps'+course_phase,i, adv.chrono.KO) != adv.chrono.KO
		)
		{
			return tRanking.GetCellInt('Tps'+course_phase,i);
		}
	}
	
	return adv.chrono.KO;
}

function ShowRankingRow(row, tRanking, i, course_phase)
{
	if (tRanking.GetCellInt('Tps'+course_phase, i) > 0)
		document.querySelector('#block_ranking .row'+row+' .rank').innerHTML = tRanking.GetCell('Cltc'+course_phase, i);
	else
		document.querySelector('#block_ranking .row'+row+' .rank').innerHTML = '';
		
	document.querySelector('#block_ranking .row'+row+' .bib').innerHTML = tRanking.GetCell('Dossard', i);
	document.querySelector('#block_ranking .row'+row+' .identity').innerHTML = TruncateName(tRanking.GetCell('Bateau', i));
	
	const code_nation = tRanking.GetCell('Code_nation', i);
	document.querySelector('#block_ranking .row'+row+' .nation').innerHTML = code_nation;

	if (code_nation.length > 0)
	{
		document.querySelector('#block_ranking .row'+row+' .img_nation').innerHTML = "<img src='./img/Flags/"+code_nation+".png' height='32' width='46' />";
	}
	else
	{
		document.querySelector('#block_ranking .row'+row+' .img_nation').innerHTML = '';
	}
	
	if (canoe.GetCodeActivite() == 'SLA' || canoe.GetCodeActivite() == 'EXS')
	{
		if (canoe.GetCodeActivite() == 'SLA') {
			const totalPena = tRanking.GetCellInt('Total_pena'+course_phase, i);
			document.querySelector('#block_ranking .row'+row+' .pena').innerHTML = totalPena.toString();
		} else {
			if (tRanking.GetCellInt('Nb_pena'+course_phase, i) > 0) {
				document.querySelector('#block_ranking .row'+row+' .pena').innerHTML = 'FLT';
			} else {
				document.querySelector('#block_ranking .row'+row+' .pena').innerHTML = '';
			}
		}
		
		const tps = tRanking.GetCellInt('Tps'+course_phase, i);
		const tpsBest = GetRankingBestTime(tRanking, course_phase);

		var txtTime;
		if (tpsBest == tps || tps <= 0)
			txtTime = adv.GetChrono(tps, 'XSCC');
		else
			//txtTime = adv.GetChronoDiffMMSSCC(tps-tpsBest);
			txtTime = adv.GetChronoDiffXSCC(tps-tpsBest);
		document.querySelector('#block_ranking .row'+row+' .time').innerHTML = txtTime;
	}
	else
	{
		const tps = tRanking.GetCellInt('Tps'+course_phase, i);
		const tpsBest = GetRankingBestTime(tRanking, course_phase);

		var txtTime;
		if (tpsBest == tps || tps <= 0) {
			txtTime = adv.GetChrono(tps, 'HHMMSSCC');
		} else {
			txtTime = adv.GetChronoDiffMMSSCC(tps-tpsBest);
		}
		document.querySelector('#block_ranking .row'+row+' .time').innerHTML = txtTime;
	}

	ShowRow(row);
}

function TruncateName(name)
{
	if (wsMain.lengthIdentity > 0)
	{
		if (name.length > wsMain.lengthIdentity)
			return name.substring(0, wsMain.lengthIdentity)+"...";
	}
	
	return name;
}

////////// Variables globales et Initialisation  //////////
const wsMain = new ws.Context(wsParams.url, wsParams.port);

function HideRowsProgressively(callback)
{
	let idx = 10;  // dernière ligne a commencer a masquer //
	const interval = 20; // delais d'affacement des lignes  //

	function hideNext()
	{
		if (idx <= 0)
		{
			if (callback) callback();
			return;
		}
		
		HideRow(idx); // ta fonction existante
		idx--;

		setTimeout(hideNext, interval);
	}

	hideNext();
}

function Init()
{
	wsMain.lang = 'en';
	wsMain.epreuve = '';
	
	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);

	if (urlParams.has('epreuve'))
	{
		wsMain.epreuve = urlParams.get('epreuve');
		document.querySelector("#head .categ").innerHTML = Categorie_name( wsMain.epreuve);
	}

 // longueur max de caractère nom prenom//
	wsMain.lengthIdentity = 25;
	if (urlParams.has('length_identity'))
		wsMain.lengthIdentity = parseInt(urlParams.get('length_identity'));
	
// delais de scroll entre chaque page affichée  //
	wsMain.scroll_delay = 7000;
		if (urlParams.has('delay'))
		wsMain.scroll_delay = parseInt(urlParams.get('delay'));
	
	wsMain.scroll_start = 0;
	
	// Command Notification
	wsMain.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsMain.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.mapCommand.set('<order>', OnCommandOrder);
	
	// Ouverture ws 
	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}

