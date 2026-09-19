const ws = {};

/**
 * Commandes qui établissent l'état de la page, par niveau : après une coupure
 * il suffit de les rejouer dans l'ordre pour retrouver l'affichage exact.
 * Rejouer une commande de niveau N périme celles de niveau supérieur
 * (changer de course invalide l'épreuve sélectionnée).
 */
ws.STATE_COMMANDS = new Map([
	['<competition_load>', 0],
	['<race_load>', 1],
	['<epreuve_load>', 2],
]);

ws.RECONNECT_DELAY_MIN = 1000;
ws.RECONNECT_DELAY_MAX = 15000;

ws.Context = function(url='ws://localhost', port=8080)
{
	this.url = url;
	this.port = port;

	this.mode = '';			// mode command, mode binary, ...
	this.delay = 0;			// retard en ms

	this.keyCommand = 'key';
	this.mapCommand = new Map();
	this.allowedFunctions = new Set();	// noms autorises pour le champ `fn`

	// Reconnexion automatique
	this.reconnect = true;			// mettre à false pour désactiver
	this.reconnectDelay = ws.RECONNECT_DELAY_MIN;
	this.reconnectTimer = null;
	this.reconnectCount = 0;
	this.stateCommands = [];		// commandes à rejouer après une coupure
	this.openArgs = null;			// arguments du dernier OpenWebSocket
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

/**
 * Mémorise une commande d'état pour pouvoir la rejouer après une coupure.
 * Appelée automatiquement : OpenWebSocket instrumente websocket.send, ce qui
 * couvre aussi les pages qui appellent websocket.send() directement.
 */
ws.Context.prototype.RememberCommand = function(data)
{
	if (typeof data !== 'string')
		return;

	var cmd = null;
	try { cmd = JSON.parse(data); } catch (e) { return; }
	if (!cmd || typeof cmd !== 'object')
		return;

	const level = ws.STATE_COMMANDS.get(cmd[this.keyCommand]);
	if (level === undefined)
		return;

	this.stateCommands = this.stateCommands.filter(function(c) { return c.level < level; });
	this.stateCommands.push({ level : level, data : data });
}

/** Rejoue l'état après reconnexion ; retourne false si rien à rejouer. */
ws.Context.prototype.ReplayState = function()
{
	if (this.stateCommands.length == 0)
		return false;

	// <competition_load> ne sert qu'à afficher le sélecteur de compétition :
	// le rejouer alors qu'une course est chargée ferait clignoter la liste
	// devant le public avant que le classement ne revienne.
	var replay = this.stateCommands;
	if (replay.length > 1)
		replay = replay.filter(function(c) { return c.level > 0; });

	const socket = this.websocket;
	replay.forEach(function(c) { socket.send(c.data); });
	return true;
}

ws.Context.prototype.NotifyStatus = function(status, detail)
{
	const info = Object.assign({ status : status, url : this.url+':'+this.port }, detail || {});
	console.log('WebSocket '+status, info);
	if (typeof window !== 'undefined' && typeof window.dispatchEvent == 'function')
		window.dispatchEvent(new CustomEvent('competffck:ws-status', { detail : info }));
}

ws.Context.prototype.ScheduleReconnect = function()
{
	if (!this.reconnect || this.reconnectTimer != null)
		return;

	const delay = this.reconnectDelay;
	this.reconnectCount++;
	this.NotifyStatus('reconnecting', { attempt : this.reconnectCount, delay : delay });

	const self = this;
	this.reconnectTimer = window.setTimeout(function() {
		self.reconnectTimer = null;
		const a = self.openArgs;
		if (a) self.OpenWebSocket(a.fnOpen, a.fnClose, a.fnMessage, a.mode, a.binaryType);
	}, delay);

	// délai progressif : on n'inonde pas un serveur qui vient de tomber
	this.reconnectDelay = Math.min(Math.round(this.reconnectDelay * 1.5), ws.RECONNECT_DELAY_MAX);
}

/** Fermeture volontaire : pas de reconnexion. */
ws.Context.prototype.Close = function()
{
	this.reconnect = false;
	if (this.reconnectTimer != null)
	{
		window.clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
	}
	if (this.websocket)
		this.websocket.close();
}

/**
 * Autorise une fonction globale à être appelée via le champ `fn` d'une trame.
 * Sans cela, `fn` est refusé : voir ResolveFunction.
 */
ws.Context.prototype.AllowFunction = function(name)
{
	this.allowedFunctions.add(name);
}

/**
 * Resout le champ `fn` d'une trame.
 *
 * Le code d'origine faisait `window[objJSON.fn](objJSON)` : le serveur
 * choisissait donc n'importe quelle fonction globale de la page. Sur un reseau
 * de course ouvert, quiconque se fait passer pour le serveur execute du code
 * arbitraire. On n'accepte plus que les noms explicitement autorises par la
 * page via AllowFunction(), et on journalise bruyamment les refus pour que le
 * cas legitime, s'il existe, soit visible immediatement.
 */
ws.Context.prototype.ResolveFunction = function(name)
{
	if (!this.allowedFunctions.has(name))
	{
		console.warn('WebSocket : fonction "'+name+'" refusee (non autorisee). '
			+ 'Si elle est legitime : wsContext.AllowFunction("'+name+'").');
		return null;
	}

	const fn = window[name];
	if (typeof fn !== 'function')
	{
		console.warn('WebSocket : fonction "'+name+'" autorisee mais introuvable.');
		return null;
	}

	return fn;
}

/**
 * Repartition d'une trame vers son handler.
 *
 * Tout appel de handler est protege : auparavant, une seule exception dans un
 * handler (une colonne absente, un element de DOM manquant) interrompait le
 * traitement et la page cessait silencieusement de se mettre a jour jusqu'au
 * prochain F5. On journalise et on continue.
 */
ws.Context.prototype.Dispatch = function(objJSON, schedule)
{
	if (!objJSON || typeof objJSON !== 'object')
		return;

	const call = (fn, label) => {
		const guarded = (arg) => {
			try
			{
				fn(arg);
			}
			catch (e)
			{
				console.error('WebSocket : erreur dans le handler '+label, e, arg);
			}
		};
		schedule(guarded, objJSON);
	};

	// Priorite 1 : fonction de retour specifiee par la trame
	if (objJSON.fn !== undefined && typeof objJSON.fn === 'string')
	{
		const fn = this.ResolveFunction(objJSON.fn);
		if (fn)
			call(fn, objJSON.fn);
		return;
	}

	// Priorite 2 : handler enregistre pour cette cle
	const key = objJSON[this.keyCommand];
	if (typeof key === 'string' || typeof key === 'number')
	{
		const fn = this.mapCommand.get(key);
		if (typeof fn === 'function')
		{
			call(fn, String(key));
			return;
		}
	}

	// Priorite 3 : handler par defaut
	const fnDefault = this.mapCommand.get('*');
	if (typeof fnDefault === 'function')
	{
		call(fnDefault, '*');
		return;
	}

	if (key !== undefined)
		console.debug('WebSocket : aucune fonction pour la cle', key);
}

ws.Context.prototype.ParseFrame = function(evt)
{
	try
	{
		return JSON.parse(evt.data);
	}
	catch (e)
	{
		console.warn('WebSocket : trame illisible, ignoree', String(evt.data).slice(0, 200));
		return null;
	}
}

ws.Context.prototype.onmessage_command = function(evt)
{
	this.Dispatch(this.ParseFrame(evt), function(fn, arg) { fn(arg); });
}

ws.Context.prototype.onmessage_command_delay = function(evt)
{
	const delay = this.delay;
	this.Dispatch(this.ParseFrame(evt), function(fn, arg) { setTimeout(fn, delay, arg); });
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
	// mémorisé pour pouvoir rouvrir à l'identique après une coupure
	this.openArgs = { fnOpen : fnOpen, fnClose : fnClose, fnMessage : fnMessage, mode : mode, binaryType : binaryType };

	this.websocket = new WebSocket(this.url+':'+(this.port).toString());
	this.mode = mode;
	if (mode == 'binary')
		this.websocket.binaryType = binaryType;

	// Instrumentation de send() : capte aussi les pages qui appellent
	// wsMain.websocket.send(...) sans passer par le contexte.
	const socket = this.websocket;
	const nativeSend = socket.send.bind(socket);
	socket.send = (data) => { this.RememberCommand(data); nativeSend(data); };

	const isReconnection = this.reconnectCount > 0;

	socket.onopen = (evt) => {
		this.reconnectDelay = ws.RECONNECT_DELAY_MIN;

		// Après une coupure on rejoue l'état : rappeler fnOpen renverrait
		// l'utilisateur à la liste des compétitions en plein direct.
		const replayed = isReconnection && this.ReplayState();

		this.reconnectCount = 0;
		this.NotifyStatus(isReconnection ? 'reconnected' : 'connected', { replayed : !!replayed });

		if (replayed)
			return;

		if (fnOpen != undefined)
			fnOpen(evt);
		else
			this.onopen(evt);
	};

	if (fnMessage != undefined)
		socket.onmessage = fnMessage;
	else
	{
		if (this.mode == 'binary')
			socket.onmessage = (evt) => this.onmessage_binary(evt);
		else if (this.delay == 0)
			socket.onmessage = (evt) => this.onmessage_command(evt);
		else
			socket.onmessage = (evt) => this.onmessage_command_delay(evt);
	}

	socket.onclose = (evt) => {
		if (fnClose != undefined)
			fnClose(evt);
		else
			this.onclose(evt);

		this.websocket = null;
		this.ScheduleReconnect();
	};

	// Sans ce handler, une erreur de connexion remonte en exception non gérée.
	socket.onerror = () => { /* onclose suit toujours : c'est lui qui replanifie */ };
}

ws.Context.prototype.OpenWebSocketCommand = function(fnOpen=undefined, fnClose=undefined, fnMessage=undefined)
{
	this.OpenWebSocket(fnOpen, fnClose, fnMessage, 'command');
}

ws.Context.prototype.OpenWebSocketBinary = function(fnOpen=undefined, fnClose=undefined, fnMessage=undefined)
{
	this.OpenWebSocket(fnOpen, fnClose, fnMessage, 'binary', 'arraybuffer');
}
