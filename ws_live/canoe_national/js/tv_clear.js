function OnOpenWebSocketCommand()
{
// alert('OnOpenWebSocketCommand ok');
}

function Init()
{
	wsContext.lang = 'en';
	wsContext.url = wsParams.url;
	wsContext.port = wsParams.port;

	wsContext.mapCommand.set('<order>', OnCommandOrder);
	
	// Ouverture ws 
	wsContext.OpenWebSocketCommand(OnOpenWebSocketCommand);
}
