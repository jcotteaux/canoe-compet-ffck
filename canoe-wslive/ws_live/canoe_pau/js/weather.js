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
	
	wsContext.scroll_start = 0;
	wsContext.scroll_delay = 10000;
	
	// Command Notification
	wsContext.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsContext.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	
	// Ouverture ws 
	wsContext.OpenWebSocketCommand(OnOpenWebSocketCommand);
}

