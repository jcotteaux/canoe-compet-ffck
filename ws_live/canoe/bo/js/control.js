function OnRefresh()
{
	document.getElementById("container_message").innerHTML = 
		'<div class="alert alert-warning" role="alert">Sending Web-Socket Ping ...</div>';

	if (wsMain.websocket && typeof wsMain.websocket === "object")
	{
		if (wsMain.websocket.readyState !== WebSocket.CLOSED)
		{
			// Connexion encore Ok ...
			OnSendPing();
			return;
		}
	}
	
	// Ouverture ws 
	wsMain.OpenWebSocketCommand(OnSendPing);
}

function OnSendPing()
{
	if (wsMain.websocket && typeof wsMain.websocket === "object")
		wsMain.websocket.send(JSON.stringify({key : '<ping>', ws_count : true, js_count : true }));
}

function OnCommandPing(objJSON) 
{
	var info = 'Web-Socket Ping OK : time='+objJSON.time;
	if (typeof objJSON.ws_count === 'number')
		info += ', ws='+objJSON.ws_count;
	if (typeof objJSON.js_count === 'number')
		info += ', js='+objJSON.js_count;
	
	document.getElementById("container_message").innerHTML = 
		'<div class="alert alert-success" role="alert">'+info+'</div>';
}

function OnSendPingSocket() 
{	
	document.getElementById("container_message").innerHTML = 
		'<div class="alert alert-warning" role="alert">Sending Socket Ping ...</div>';

	fetch('./ping_live.php?' + new URLSearchParams({
		url: wsMain.url,
		port: wsMain.port
	}))
		.then((response) => response.json())
		.then((jsonData) => {	
			if (jsonData && typeof jsonData === "object") 
			{
				if (jsonData.success == true)
				{				
					document.getElementById("container_message").innerHTML = 
						'<div class="alert alert-success" role="alert">Socket Ping OK !</div>';
				}
				else
				{
					document.getElementById("container_message").innerHTML = 
						'<div class="alert alert-danger" role="alert">Socket Ping Error ...</div>';
				}
			}
	});
}

function OnStop()
{
	document.getElementById("container_message").innerHTML = 
		'<div class="alert alert-warning" role="alert">Stopping ...</div>';

	DoStopLive(false);
}

function OnStart()
{
	DoStartLive();
}

function OnReStart()
{
	DoStopLive(true);
}

function DoStopLive(restart)
{
	fetch('./stop_live.php?' + new URLSearchParams({
		url: wsMain.url,
		port: wsMain.port
	}))
		.then((response) => response.json())
		.then((jsonData) => {	
			if (jsonData && typeof jsonData === "object") 
			{
				if (jsonData.success == true)
				{
					document.getElementById("container_message").innerHTML = 
						'<div class="alert alert-success" role="alert">Stop OK !</div>';
				}
				else
					DoKillLive(restart);
			}
	});
}

function DoKillLive(restart)
{
	fetch('./kill_live.php?' + new URLSearchParams({
		url: wsMain.url,
		port: wsMain.port
	}))
		.then((response) => response.json())
		.then((jsonData) => {	
			if (jsonData && typeof jsonData === "object") 
			{
				document.getElementById("container_message").innerHTML = 
						'<div class="alert alert-success" role="alert">Stop (Kill) OK !</div>';

				if (restart)
					DoStartLive();
			}
	});
}

function DoStartLive()
{
	fetch('./start_live.php')
		.then((response) => response.json())
		.then((jsonData) => {	
			if (jsonData && typeof jsonData === "object") 
			{
				document.getElementById("container_message").innerHTML = 
					'<div class="alert alert-success" role="alert">Start OK !</div>';
			}
	});
}

const wsMain = new ws.Context(wsParams.url, wsParams.port);
function Init()
{
	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);
	
	if (urlParams.has('lang'))
		wsMain.lang = urlParams.get('lang')

	// Command Notification
	wsMain.mapCommand.set('<ping>', OnCommandPing);

	// Ouverture ws 
	OnRefresh();
}
