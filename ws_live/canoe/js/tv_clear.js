function OnOpenWebSocketCommand()
{
// alert('OnOpenWebSocketCommand ok');
}

////////// Variables globales et Initialisation  //////////
const wsMain = new ws.Context(wsParams.url, wsParams.port);

function Init()
{
	wsMain.mapCommand.set('<order>', OnCommandOrder);
	
	// Ouverture ws 
	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}
