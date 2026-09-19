const ws = {};

ws.Context = function(url='ws://localhost', port=8080)
{
	this.url = url;
	this.port = port;
	
	this.mode = '';			// mode command, mode binary, ...
	this.delay = 0;			// retard en ms 

	this.keyCommand = 'key';
	this.mapCommand = new Map();
};

ws.Context.prototype.SetCommand = function(key, value)
{
	this.mapCommand.set(key, value);
}

ws.Context.prototype.onopen = function(evt)
{
	console.log('WebSocket event onopen ok : '+this.url+':'+(this.port).toString()+' mode:'+this.mode);
}

ws.Context.prototype.onclose = function(evt)
{
	this.websocket = null; 
}

ws.Context.prototype.onmessage_command = function(evt)
{
	var objJSON = null;
	try 
	{
		objJSON = JSON.parse(evt.data);
	} 
	catch (e) 
	{
		console.log(`Parsing error / data : ${evt.data} / exception : {e}`);
		return;
	}

	if (objJSON && typeof objJSON === "object") 
	{
		if (objJSON.fn !== undefined && typeof objJSON.fn == "string")
		{
			// Priorité 1 : Function de retour spécifié ...
			window[objJSON.fn](objJSON);
		}
		else
		{
			const typeObj = typeof objJSON[this.keyCommand];
			if (typeObj === "string" || typeObj === "number")
			{
				const fn = this.mapCommand.get(objJSON[this.keyCommand]);
				if (fn && typeof fn === "function")
				{
					// Priorité 2 : Map Function spécifié ...
					fn(objJSON);
					return;
				}
			}

			const fnDefault = this.mapCommand.get('*');
			if (fnDefault && typeof fnDefault === "function")
			{
				// Priorité 3 : Map Function par défaut 
				fnDefault(objJSON);
			}
		}
	}
}

ws.Context.prototype.onmessage_command_delay = function(evt)
{
	var objJSON = null;
	try 
	{
		objJSON = JSON.parse(evt.data);
	} 
	catch (e) 
	{
		console.log(`Parsing error / data : ${evt.data} / exception : {e}`);
		return;
	}

	if (objJSON && typeof objJSON === "object") 
	{
		if (objJSON.fn !== undefined && typeof objJSON.fn == "string")
		{
			// Priorité 1 : Function de retour spécifié ...
			setTimeout(window[objJSON.fn], this.delay, objJSON);
		}
		else
		{
			const typeObj = typeof objJSON[this.keyCommand];
			if (typeObj === "string" || typeObj === "number")
			{
				const fn = this.mapCommand.get(objJSON[this.keyCommand]);
				if (fn && typeof fn === "function")
				{
					// Priorité 2 : Map Function spécifié ...
					setTimeout(fn, this.delay, objJSON);
					return;
				}
			}

			const fnDefault = this.mapCommand.get('*');
			if (fnDefault && typeof fnDefault === "function")
			{
				// Priorité 3 : Map Function par défaut 
				setTimeout(fnDefault, this.delay, objJSON);
			}
		}
	}
}

ws.Context.prototype.onmessage_binary = function(evt)
{
	const base64 = adv.ToBase64(evt.data);
	if (base64 !== null)
	{
		const img = document.getElementById(this.image_binary);
		if (typeof img == 'object')
			img.src = "data:image/jpg;base64,"+base64;
	}
}

ws.Context.prototype.OpenWebSocket = function(fnOpen=undefined, fnClose=undefined, fnMessage=undefined, mode='command', binaryType='arraybuffer')
{
	this.websocket = new WebSocket(this.url+':'+(this.port).toString());
	this.mode = mode;
	if (mode == 'binary')
		this.websocket.binaryType = binaryType;
	
	if (fnOpen != undefined)
		this.websocket.onopen = fnOpen;
	else
		this.websocket.onopen = (evt) => this.onopen(evt);

	if (fnMessage != undefined)
		this.websocket.onmessage = fnMessage;
	else
	{
		if (this.mode == 'binary')
			this.websocket.onmessage = (evt) => this.onmessage_binary(evt);
		else if (this.delay == 0)
			this.websocket.onmessage = (evt) => this.onmessage_command(evt);
		else
			this.websocket.onmessage = (evt) => this.onmessage_command_delay(evt);
	}
	
	if (fnClose != undefined)
		this.websocket.onclose = fnClose;
	else
		this.websocket.onclose = (evt) => this.onclose(evt);
}

ws.Context.prototype.OpenWebSocketCommand = function(fnOpen=undefined, fnClose=undefined, fnMessage=undefined)
{
	this.OpenWebSocket(fnOpen, fnClose, fnMessage, 'command');
}

ws.Context.prototype.OpenWebSocketBinary = function(fnOpen=undefined, fnClose=undefined, fnMessage=undefined)
{
	this.OpenWebSocket(fnOpen, fnClose, fnMessage, 'binary', 'arraybuffer');
}
