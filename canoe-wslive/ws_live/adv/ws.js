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

/**
 * Connexion muette : une liaison coupée sans fermeture propre (wifi qui
 * décroche, switch redémarré, serveur figé) laisse la socket « ouverte » sans
 * plus rien recevoir, et la page reste figée sur le dernier état. Le flux
 * <on_course> arrive à 10 Hz : s'il s'est déjà manifesté sur cette socket et
 * que plus rien n'arrive pendant ce délai, on la remplace (reconnexion puis
 * rejeu de l'état, donc rechargement complet depuis le serveur).
 * Désactivable par ?watchdog=0.
 */
ws.SILENCE_RECONNECT = 10000;

/**
 * Chrono local : le temps tournant ne dépend plus de la régularité du serveur.
 *
 * competFFCK envoie <on_course> ~10 fois par seconde : l'horloge (`clock`) et,
 * pour chaque bateau sur l'eau, son temps de course (`time`). Les pages
 * affichaient ces valeurs telles quelles : qu'une trame tarde et le chrono se
 * fige, puis saute.
 *
 * Ici, chaque trame sert seulement à recaler une référence locale :
 *   départ estimé = heure locale de réception - temps reçu.
 * Une trame en retard donne un départ estimé plus tardif ; on garde donc le
 * plus précoce, celui de la trame la moins retardée. Le temps affiché est
 * ensuite calculé localement (maintenant - départ estimé) et, si le serveur se
 * tait, le poste fabrique lui-même la trame suivante. Les pages reçoivent des
 * <on_course> réguliers sans rien savoir du mécanisme.
 *
 * Régulation : si le serveur indique durablement que l'affichage est en
 * avance (son horloge dérive, un chrono a été recalé), on ralentit en douceur
 * jusqu'à le rejoindre. Le chrono ne recule jamais et ne saute jamais en arrière.
 *
 * Désactivable par ?chrono=serveur dans l'URL de la page.
 */
ws.ChronoLocal = function()
{
	this.bibs = new Map();		// dossard -> { ref, samples:[{t, ecart}] }
	this.clock = null;			// horloge serveur : { ref, samples }, même traitement qu'un bateau
	this.lastFrame = null;		// dernière <on_course> réelle, servant de gabarit
	this.lastReal = 0;			// réception de la dernière trame réelle
	this.lastSent = 0;			// dernière trame distribuée (réelle ou locale)
	this.timer = null;
};

ws.ChronoLocal.PERIOD = 100;			// cadence des trames locales (10 Hz, comme le serveur)
ws.ChronoLocal.MAX_SILENCE = 20000;		// au-delà, serveur perdu : on cesse d'extrapoler
ws.ChronoLocal.REGUL_WINDOW = 3000;		// avance constatée pendant ce temps -> régulation
ws.ChronoLocal.REGUL_THRESHOLD = 150;	// écart minimal (ms) pour réguler
ws.ChronoLocal.REGUL_STEP = 20;			// rattrapage max par trame reçue (ms) : 20 % de ralenti

ws.ChronoLocal.now = function()
{
	return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
};

/** Table <on_course> d'une trame : { rows, iBib, iTime } ou null. */
ws.ChronoLocal.table = function(objJSON)
{
	const t = objJSON['table<sqlTable>'];
	if (!t || !Array.isArray(t.columns) || !Array.isArray(t.rows))
		return null;
	const names = t.columns.map(function(c) { return Array.isArray(c) ? c[0] : c; });
	const iBib = names.indexOf('bib');
	const iTime = names.indexOf('time');
	if (iBib < 0 || iTime < 0)
		return null;
	return { rows : t.rows, iBib : iBib, iTime : iTime };
};

/**
 * Trame <on_course> réelle : recale les références, puis réécrit les temps
 * avec le chrono local. Retourne la trame (modifiée sur place).
 */
ws.ChronoLocal.prototype.Observe = function(objJSON)
{
	const now = ws.ChronoLocal.now();
	const tab = ws.ChronoLocal.table(objJSON);
	const clockServeur = Number(objJSON.clock);

	if (typeof objJSON.clock === 'number' || (typeof objJSON.clock === 'string' && objJSON.clock !== ''))
	{
		const est = now - Number(objJSON.clock);
		if (this.clock === null)
			this.clock = { ref : est, samples : [] };
		else if (est < this.clock.ref)
			this.clock.ref = est;
		this.Regulate(this.clock, now, est - this.clock.ref);
		objJSON.clock = Math.round(now - this.clock.ref);
	}

	if (tab)
	{
		const seen = new Set();
		for (const row of tab.rows)
		{
			const bib = String(row[tab.iBib]);
			const time = Number(row[tab.iTime]);
			if (!(time >= 1))
				continue;	// statut (DNF, DSQ...) ou valeur vide : passe tel quel
			seen.add(bib);

			let est = now - time;

			/*
			 * Départ déduit de l'heure du serveur : clock.ref est le décalage
			 * le mieux estimé sur toutes les trames passées. Une première trame
			 * retardée (réseau figé au moment du départ) donne donc tout de
			 * même le bon départ, au lieu d'un départ trop tardif suivi d'un
			 * rattrapage brutal à la trame suivante. Écarté au-delà de 5 s :
			 * l'heure et le chrono ne seraient plus sur la même base.
			 */
			if (this.clock !== null && clockServeur > 0)
			{
				const parHorloge = this.clock.ref + clockServeur - time;
				if (parHorloge < est && est - parHorloge < 5000)
					est = parHorloge;
			}

			let b = this.bibs.get(bib);
			if (!b || time < 1000 && est - b.ref > 1000)
			{
				// Nouveau départ (ou bateau relancé) : on part de la valeur reçue.
				b = { ref : est, samples : [] };
				this.bibs.set(bib, b);
			}
			else if (est < b.ref)
			{
				// Trame moins retardée que les précédentes : meilleure estimation.
				b.ref = est;
			}
			this.Regulate(b, now, est - b.ref);
			row[tab.iTime] = Math.round(now - b.ref);
		}
		// Bateaux sortis du flux : arrivés, abandons, effacés.
		for (const bib of Array.from(this.bibs.keys()))
			if (!seen.has(bib))
				this.bibs.delete(bib);
	}

	this.lastFrame = JSON.parse(JSON.stringify(objJSON));
	delete this.lastFrame.ack_ws;
	this.lastReal = now;
	this.lastSent = now;
	return objJSON;
};

/**
 * Le serveur dit-il, sans interruption depuis REGUL_WINDOW, que nous sommes en
 * avance ? Le plus petit écart de la fenêtre écarte le simple retard réseau :
 * il suffit d'une trame à l'heure pour qu'il retombe à zéro.
 */
ws.ChronoLocal.prototype.Regulate = function(b, now, ecart)
{
	b.samples.push({ t : now, ecart : ecart });
	while (b.samples.length && now - b.samples[0].t > ws.ChronoLocal.REGUL_WINDOW)
		b.samples.shift();
	if (now - b.samples[0].t < ws.ChronoLocal.REGUL_WINDOW * 0.9)
		return;		// pas encore assez d'historique

	const minEcart = Math.min.apply(null, b.samples.map(function(s) { return s.ecart; }));
	if (minEcart > ws.ChronoLocal.REGUL_THRESHOLD)
	{
		const step = Math.min(minEcart, ws.ChronoLocal.REGUL_STEP);
		b.ref += step;
		b.samples.forEach(function(s) { s.ecart -= step; });
	}
};

/** Arrivée d'un bateau : son chrono local s'arrête tout de suite. */
ws.ChronoLocal.prototype.Finish = function(bib)
{
	const key = String(bib);
	this.bibs.delete(key);
	const tab = this.lastFrame && ws.ChronoLocal.table(this.lastFrame);
	if (tab)
	{
		const kept = tab.rows.filter(function(r) { return String(r[tab.iBib]) !== key; });
		tab.rows.length = 0;
		Array.prototype.push.apply(tab.rows, kept);
	}
};

/** Manche effacée, course changée : on repart de zéro. */
ws.ChronoLocal.prototype.Reset = function()
{
	this.bibs.clear();
	this.lastFrame = null;
};

/**
 * Trame <on_course> fabriquée localement si le serveur se tait depuis plus
 * d'une période ; null s'il n'y a rien à faire.
 */
ws.ChronoLocal.prototype.Tick = function()
{
	const now = ws.ChronoLocal.now();
	if (!this.lastFrame || now - this.lastSent < ws.ChronoLocal.PERIOD)
		return null;
	if (now - this.lastReal > ws.ChronoLocal.MAX_SILENCE)
		return null;	// serveur perdu : l'affichage se fige, comme avant

	const frame = JSON.parse(JSON.stringify(this.lastFrame));
	frame.__local = true;
	if (this.clock !== null && frame.clock !== undefined)
		frame.clock = Math.round(now - this.clock.ref);
	const tab = ws.ChronoLocal.table(frame);
	if (tab)
	{
		for (const row of tab.rows)
		{
			const b = this.bibs.get(String(row[tab.iBib]));
			if (b)
				row[tab.iTime] = Math.round(now - b.ref);
		}
	}
	this.lastSent = now;
	return frame;
};

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

	// Chrono local, sauf ?chrono=serveur : voir ws.ChronoLocal.
	const params = (typeof window !== 'undefined' && window.location) ? new URLSearchParams(window.location.search) : null;
	this.chronoLocal = (params && params.get('chrono') === 'serveur') ? null : new ws.ChronoLocal();
	this.chronoTimer = null;

	// Surveillance des silences : voir ws.SILENCE_RECONNECT.
	this.watchdog = !(params && params.get('watchdog') === '0');
	this.watchdogTimer = null;
	this.lastFrameAt = 0;			// dernière trame reçue du serveur
	this.flowSeen = false;			// <on_course> déjà reçu sur cette socket
};

/** Note l'arrivée d'une trame du serveur (pas des trames du chrono local). */
ws.Context.prototype.NoteFrame = function(objJSON)
{
	if (objJSON.__local)
		return;
	this.lastFrameAt = Date.now();
	if (objJSON[this.keyCommand] === '<on_course>')
		this.flowSeen = true;
}

/**
 * Socket silencieuse depuis trop longtemps : on l'abandonne sans attendre
 * son onclose, qu'une liaison morte peut mettre des minutes à signaler.
 */
ws.Context.prototype.CheckSilence = function()
{
	const socket = this.websocket;
	if (!socket || socket.readyState !== 1 || !this.flowSeen)
		return;

	const silence = Date.now() - this.lastFrameAt;
	if (silence < ws.SILENCE_RECONNECT)
		return;

	this.NotifyStatus('silent', { silence : silence });
	this.flowSeen = false;
	socket.onopen = socket.onmessage = socket.onclose = null;
	try { socket.close(); } catch (e) { /* déjà fermée */ }
	this.websocket = null;

	const a = this.openArgs;
	if (a && a.fnClose != undefined)
		a.fnClose({ code : 4000, reason : 'silence' });
	this.ScheduleReconnect();
}

/**
 * Passe les trames de chrono par le chrono local, et démarre au besoin la
 * fabrication de trames quand le serveur se tait.
 */
ws.Context.prototype.ThroughChronoLocal = function(objJSON)
{
	const chrono = this.chronoLocal;
	if (!chrono || objJSON.__local)
		return objJSON;

	const key = objJSON[this.keyCommand];
	if (key === '<on_course>')
	{
		chrono.Observe(objJSON);
		if (this.chronoTimer == null && typeof window !== 'undefined')
		{
			this.chronoTimer = window.setInterval(() => {
				const frame = chrono.Tick();
				if (frame)
					this.Dispatch(frame, function(fn, arg) { fn(arg); });
			}, ws.ChronoLocal.PERIOD / 2);
		}
	}
	else if (key === '<bib_time>' && Number(objJSON.passage) < 1)
		chrono.Finish(objJSON.bib);
	else if (key === '<run_erase>' || key === '<race_load>')
		chrono.Reset();
	return objJSON;
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
	if (this.watchdogTimer != null)
	{
		window.clearInterval(this.watchdogTimer);
		this.watchdogTimer = null;
	}
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

	this.NoteFrame(objJSON);
	this.SendAck(objJSON);
	this.ThroughChronoLocal(objJSON);

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

	this.websocket = new WebSocket(this.url+':'+(this.port).toString(), 'lws');
	this.mode = mode;
	if (mode == 'binary')
		this.websocket.binaryType = binaryType;

	// Instrumentation de send() : capte aussi les pages qui appellent
	// wsMain.websocket.send(...) sans passer par le contexte.
	const socket = this.websocket;
	const nativeSend = socket.send.bind(socket);
	socket.send = (data) => { this.RememberCommand(data); nativeSend(data); };

	const isReconnection = this.reconnectCount > 0;

	this.flowSeen = false;
	if (this.watchdog && this.watchdogTimer == null && typeof window !== 'undefined')
		this.watchdogTimer = window.setInterval(() => this.CheckSilence(), 1000);

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

ws.Context.prototype.Send = function(cmd)
{
	this.websocket?.send(JSON.stringify(cmd));
}

ws.Context.prototype.SendAck = function(objJSON)
{
	if (objJSON.ack_ws != null) {
		this.Send({key:'<ack_ws>', id:objJSON.ack_ws});
		console.log('Ack WS:'+objJSON.ack_ws);
	}
}
