function OnOpenWebSocketCommand()
{
	wsContext.wsCommand.send(JSON.stringify({key:'<race_load>', key_race:'*' }));
}

function OnCommandRaceLoad(objJSON)
{
	wsContext.notify_race = objJSON;

	const tCompetition = adv.GetTable(objJSON, 'Competition');
	const tCompetition_Course = adv.GetTable(objJSON, 'Competition_Course');
	const tCompetition_Course_Phase = adv.GetTable(objJSON, 'Competition_Course_Phase');

	document.querySelector("#head .place").innerHTML = ('START LIST');
	document.querySelector("#head .title").innerHTML = tCompetition_Course_Phase.GetCell('Libelle', (canoe.GetCodePhase()-1));
	
	// Chargement de toutes les épreuves ...
	const cmd = { key : '<epreuve_load>',  epreuve : '' };	
	wsContext.wsCommand.send(JSON.stringify(cmd));
}

function OnCommandEpreuveLoad(objJSON)
{
	wsContext.notify_ranking = objJSON;

	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
	canoe.SetColumnNameRanking(tRanking);

	const course_phase = canoe.GetCodeCoursePhase();
	tRanking.OrderBy('Heure_depart'+course_phase+', Dossard');
	
	if (wsContext.epreuve == '')
		SetCurrentEpreuve(tRanking);
	
	ShowRanking(tRanking);
}

function SetCurrentEpreuve(tRanking)
{
	const course_phase = canoe.GetCodeCoursePhase();
	var lastHeureDep = 0;

	wsContext.epreuve = '';
	wsContext.scroll_start = 0;
	
	for (let i=0;i<=tRanking.GetNbRows();i++)
	{
		if (tRanking.GetCellInt('Tps'+course_phase,i) >= adv.chrono.OK)
		{
			if (tRanking.GetCellInt('Heure_depart'+course_phase,i) > lastHeureDep)
			{
				lastHeureDep = tRanking.GetCellInt('Heure_depart'+course_phase,i);
				wsContext.epreuve = tRanking.GetCell('Code_categorie',i);
			}
		}
	}
	
	if (wsContext.epreuve == '' && tRanking.GetNbRows() > 0)
		wsContext.epreuve = tRanking.GetCell('Code_categorie',0);
	
	document.querySelector("#head .categ").innerHTML = ' - '+wsContext.epreuve;
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
		var i = wsContext.scroll_start;
		while (row <= 10 && i < tRanking.GetNbRows())
		{
			if (tRanking.GetCell('Code_categorie', i) == wsContext.epreuve)
			{
				ShowRankingRow(row, tRanking, i, course_phase);
				++row;
			}
			++i;
		}
		
		if (GetCountRanking(tRanking, course_phase, i) > 0)
			wsContext.scroll_start = i;
		else
			wsContext.scroll_start = 0;
		
		window.setTimeout(function() { 
				const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
				ShowRanking(tRanking);
			},	wsContext.scroll_delay
		);
	}
}

function GetCountRanking(tRanking, course_phase, iStart)
{
	let count = 0;
	for (let i=iStart;i<=tRanking.GetNbRows();i++)
	{
		if (tRanking.GetCell('Code_categorie', i) == wsContext.epreuve && 
			tRanking.GetCellInt('Heure_depart'+course_phase,i) > 0
		)
		{
			++count;
		}
	}
	return count;
}

function ShowRankingRow(row, tRanking, i, course_phase)
{
	document.querySelector('#block_ranking .row'+row+' .bib').innerHTML = tRanking.GetCell('Dossard', i);
	document.querySelector('#block_ranking .row'+row+' .identity').innerHTML = tRanking.GetCell('Bateau', i);
	
	const code_nation = tRanking.GetCell('Code_nation', i);

	if (code_nation.length > 0)
	{
		document.querySelector('#block_ranking .row'+row+' .img_nation').innerHTML = "<img src='./img/flags/"+code_nation+".png' height='48' width='48' />";
	}
	else
	{
		document.querySelector('#block_ranking .row'+row+' .img_nation').innerHTML = '';
	}

	document.querySelector('#block_ranking .row'+row+' .time').innerHTML = tRanking.GetCellChrono('Heure_depart'+course_phase, i, 'HHMMSS');

	ShowRow(row);
}

function Init()
{
	wsContext.lang = 'en';
	wsContext.url = wsParams.url;
	wsContext.port = wsParams.port;

	wsContext.epreuve = '';
	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);
	
	if (urlParams.has('epreuve'))
	{
		wsContext.epreuve = urlParams.get('epreuve');
		document.querySelector("#head .categ").innerHTML = ' - '+wsContext.epreuve;
	}
	
	wsContext.scroll_start = 0;
	wsContext.scroll_delay = 10000;
	
	// Command Notification
	wsContext.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsContext.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	
	// Ouverture ws 
	wsContext.OpenWebSocketCommand(OnOpenWebSocketCommand);
}

