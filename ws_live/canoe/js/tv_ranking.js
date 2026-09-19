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

	const tRanking = canoe.GetTableRanking();
	canoe.SetColumnNameRanking(tRanking);

	const course_phase = canoe.GetCodeCoursePhase();
	tRanking.OrderBy('Tps'+course_phase+', Dossard');
	
	if (wsMain.epreuve == '')
		SetCurrentEpreuve(tRanking);
	
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
	
	document.querySelector("#head .categ").innerHTML = wsMain.epreuve;
}

function HideRow(row)
{
	document.querySelector('#block_ranking .row'+row).style.display = 'none';
}

function ShowRow(row)
{
	document.querySelector('#block_ranking .row'+row).style.display = 'block';
}

function HideRows()
{
	for (let i=1;i<=10;i++)
		HideRow(i);
}

function ShowRanking(tRanking)
{
	HideRows();
	if (tRanking && typeof tRanking === 'object')
	{
		const course_phase = canoe.GetCodeCoursePhase();

		var row = 1;
		var i = wsMain.scroll_start;
		while (row <= 10 && i < tRanking.GetNbRows())
		{
			if (tRanking.GetCell('Code_categorie', i) == wsMain.epreuve && 
				tRanking.GetCellInt('Tps'+course_phase,i, adv.chrono.KO) != adv.chrono.KO
			)
			{
				ShowRankingRow(row, tRanking, i, course_phase);
				++row;
			}
			++i;
		}
		
		if (GetCountRanking(tRanking, course_phase, i) > 0)
			wsMain.scroll_start = i;
		else
			wsMain.scroll_start = 0;
		
		window.setTimeout(function() { 
				const tRanking = canoe.GetTableRanking();
				ShowRanking(tRanking);
			},	wsMain.scroll_delay
		);
	}
}

function GetCountRanking(tRanking, course_phase, iStart)
{
	let count = 0;
	for (let i=iStart;i<=tRanking.GetNbRows();i++)
	{
		if (tRanking.GetCell('Code_categorie', i) == wsMain.epreuve && 
			tRanking.GetCellInt('Tps'+course_phase,i, adv.chrono.KO) != adv.chrono.KO
		)
		{
			++count;
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
		document.querySelector('#block_ranking .row'+row+' .img_nation').innerHTML = "<img src='./img/flags/"+code_nation+".png' height='38' width='56' />";
	}
	else
	{
		document.querySelector('#block_ranking .row'+row+' .img_nation').innerHTML = '';
	}
	
	if (canoe.GetCodeActivite() == 'SLA')
	{
		const totalPena = tRanking.GetCellInt('Total_pena'+course_phase, i);
		document.querySelector('#block_ranking .row'+row+' .pena').innerHTML = totalPena.toString();
		
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
		//document.querySelector('#block_ranking .row'+row+' .time').innerHTML = tRanking.GetCellChrono('Tps'+course_phase, i, 'HHMMSSCC');
		document.querySelector('#block_ranking .row'+row+' .time').innerHTML = tRanking.GetCellChrono('Tps'+course_phase, i, 'XSCC');
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

function Init()
{
	wsMain.lang = 'en';
	wsMain.epreuve = '';
	
	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);

	if (urlParams.has('epreuve'))
	{
		wsMain.epreuve = urlParams.get('epreuve');
		document.querySelector("#head .categ").innerHTML = wsMain.epreuve;
	}
	
	wsMain.lengthIdentity = 25;
	if (urlParams.has('length_identity'))
		wsMain.lengthIdentity = parseInt(urlParams.get('length_identity'));
	
	wsMain.scroll_delay = 5000;
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

