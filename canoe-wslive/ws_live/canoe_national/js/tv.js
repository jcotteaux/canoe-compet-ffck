function OnOpenWebSocketCommand()
{
	wsContext.wsCommand.send(JSON.stringify({key:'<race_load>', key_race:'*' }));
}

function OnCommandRaceLoad(objJSON)
{
	canoe.SetRace(objJSON);
}

function onStartlist()
{
	wsContext.wsCommand.send(JSON.stringify({key:'<order>', action:'tv', url:'./tv_startlist.html' }));
}

function onRanking()
{
	wsContext.wsCommand.send(JSON.stringify({key:'<order>', action:'tv', url:'./tv_ranking.html' }));
}

function onInRace()
{
	wsContext.wsCommand.send(JSON.stringify({key:'<order>', action:'tv', url:'./tv_inrace.html' }));
}

function Init()
{
	wsContext.lang = 'en';
	wsContext.url = wsParams.url;
	wsContext.port = wsParams.port;
	
	// Ouverture ws 
	wsContext.OpenWebSocketCommand(OnOpenWebSocketCommand);
}

