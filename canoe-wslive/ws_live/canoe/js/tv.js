function OnOpenWebSocketCommand()
{
	wsMain.websocket.send(JSON.stringify({key:'<race_load>', key_race:'*' }));
}

function OnCommandRaceLoad(objJSON)
{
	canoe.SetRace(objJSON);
}

function onStartlist()
{
	wsMain.websocket.send(JSON.stringify({key:'<order>', action:'tv', url:'./tv_startlist.html' }));
}

function onRanking()
{
	wsMain.websocket.send(JSON.stringify({key:'<order>', action:'tv', url:'./tv_ranking.html' }));
}

function onInRace()
{
	wsMain.websocket.send(JSON.stringify({key:'<order>', action:'tv', url:'./tv_inrace.html' }));
}

////////// Variables globales et Initialisation  //////////
const wsMain = new ws.Context(wsParams.url, wsParams.port);

function Init()
{
	// Ouverture ws 
	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}

