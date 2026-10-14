function OnOpenWebSocketCommand()
{
	wsContext.wsCommand.send(JSON.stringify({key:'<race_load>', key_race:'*' }));
}

function OnCommandRaceLoad(objJSON)
{
	wsContext.notify_race = objJSON;
	wsContext.notify_competitions = objJSON;

	const tCompetition = adv.GetTable(objJSON, 'Competition');
	const tCompetition_Course = adv.GetTable(objJSON, 'Competition_Course');
	const tCompetition_Course_Phase = adv.GetTable(objJSON, 'Competition_Course_Phase');

//	document.querySelector("#head .name").innerHTML = tCompetition.GetCell('Nom', 0);
//	document.querySelector("#head .place").innerHTML = (tCompetition.GetCell('Ville', 0) + " - " + tCompetition.GetCell('Departement', 0)+"000");
//	document.querySelector("#head .date").innerHTML = (tCompetition.GetCell('Date_debut', 0) + " - " + tCompetition.GetCell('Date_fin', 0));
//	document.querySelector("#head .title").innerHTML = tCompetition_Course_Phase.GetCell('Libelle', (canoe.GetCodePhase()-1));
	
	// Chargement de toutes les épreuves ...
	const cmd = { key : '<epreuve_load>',  epreuve : '' };	
	wsContext.wsCommand.send(JSON.stringify(cmd));
}

function OnCommandEpreuveLoad(objJSON)
{
	
}

function SetCurrentEpreuve(tRanking)
{
	
}

function HideRow(row)
{
	
}

function ShowRow(row)
{
	
}

function HideRows()
{
	
}

function ShowRanking(tRanking)
{
	
}

function GetCountRanking(tRanking, course_phase, iStart)
{
	
}

function ShowRankingRow(row, tRanking, i, course_phase)
{
	
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
	}
	
	
	// Command Notification
	wsContext.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsContext.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	
	// Ouverture ws 
	wsContext.OpenWebSocketCommand(OnOpenWebSocketCommand);
}

