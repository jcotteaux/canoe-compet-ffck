function OnOpenWebSocketCommand()
{
	wsMain.websocket.send(JSON.stringify({key : '<race_load>', key_race : wsMain.key_race }));
}

function OnCommandRaceLoad(objJSON) 
{
//	alert("OnCommandRaceLoad :"+JSON.stringify(objJSON));
	ski.SetRace(objJSON);

	// Chargement de toutes les épreuves ...
	const cmd = { key : '<epreuve_load>',  epreuve : '' };	
	wsMain.websocket.send(JSON.stringify(cmd));
}

function OnCommandEpreuveLoad(objJSON) 
{
//	alert("OnCommandEpreuveLoad :"+JSON.stringify(objJSON));
	ski.SetEpreuve(objJSON);
	SetPena();
}

function OnCommandPenaltyAck(objJSON)
{
//	alert("OnCommandPenaltyAck :"+JSON.stringify(objJSON));

	if (GetBibSelected() == objJSON.bib)
	{
		const elem = document.querySelectorAll('#main table tbody tr[data-gate="'+objJSON.gate+'"] td.gate_ack');
		if (elem && typeof elem === "object" && elem.length == 1)
			elem[0].innerHTML = '*';
	}
	localStorage.setItem(objJSON.bib+'|ack'+objJSON.gate, '1');
}

function SetPena() 
{
	var html;

	html  = '<h1 class="text-center text-info bg-dark">Choix Notation Pénalité</h1>';

	html += '<div class="row">';
	html += '<select id="lst_pena" class="form-select" aria-label="Choix des Pénalités">';
	for (let p=1;p<=ski.GetNbPena();p++)
	{
		html += '<option value="'+p.toString()+'">Pénalité '+p.toString()+'</option>';
	}
	html += '</select>';
	html += '</div>';
	html += '<br>';
	html += '<div class="row">';
	html += '<button class="btn btn-primary" onclick="onSetPena()">Valider</button>';
	html += '</div>';

	document.getElementById("main").innerHTML = html;
}

function onSetPena()
{
/*
	var selected = [];
	for (var option of document.getElementById('lst_pena').options)
	{
		if (option.selected) {
			selected.push(option.value);
		}
	}
	
	if (selected.length == 0)
		alert('Erreur : Aucune Selection');
	else
		DoNotation(selected);
*/
	DoNotation(document.getElementById('lst_pena').value);
}

function DoNotation(indexPena)
{
	wsMain.pena_index = parseInt(indexPena);

	var html;

	html  = '<h1 class="text-center text-info bg-dark">Notation Pénalité n°'+wsMain.pena_index.toString()+'</h1>';

	html += '<div class="mb-3">';
	html +=	'<label for="bib_selection" class="form-label">Dossard</label>';
	html += '<select id="bib_selection" class="form-select" onchange="onChangeBibSelection(this)"></select>';
	html += '</div>';

	html += '<div class="mb-3">';
	html += '<div class="alert alert-info text-center" role="alert">Cible</div>';

	html += '<div class="row">';
	for (let t=1;t<=5;t++)
	{
		html += '<div class="col text-center">'+t.toString()+'</div>';
	}
	html += '</div>';
	html += '<br>';

	html += '<div class="row">';
	for (let t=1;t<=5;t++)
	{
		html += '<button type="button" class="col btn tir" data-index="'+t.toString()+'" data-value="0">';
		html += '&nbsp;<br>&nbsp;';
		html += '</button>';
	}
	html += '</div>';

	html += '<br>';
	html += '<div class="row">';
	html += '<button class="col btn btn-primary" onclick="onSendPena()">Valider</button>';
	html += '</div>';

	document.getElementById("main").innerHTML = html;

	[].forEach.call(document.querySelectorAll('#main div button.tir'), function(el) {
		RefreshTir(el);
		el.addEventListener('click', function() {
			ChangeTir(el);
		})
	})

	var bibSelect = document.getElementById('bib_selection');

	const tRanking = ski.GetTableRanking();
	tRanking.OrderByInteger('Dossard');

	for (let r = 0; r < tRanking.GetNbRows(); r++)
	{
		var bib = tRanking.GetCell('Dossard', r);
		var opt = document.createElement('option');
		opt.value = bib;
		opt.innerHTML = bib+" - "+tRanking.GetCell('Nom', r)+" "+tRanking.GetCell('Prenom', r);
		bibSelect.appendChild(opt);
	}
	
	LoadBibLocalStorage(GetBibSelected());
}

function ClearTir(el)
{
	el.setAttribute("data-value", '0');
	RefreshTir(el);
}

function ChangeTir(el)
{
	const index = parseInt(el.getAttribute("data-index"));
	const value = parseInt(el.getAttribute("data-value"));

	if (value == 0)
		el.setAttribute("data-value", '1');
	else if (value == 1)
		el.setAttribute("data-value", '-1');
	else
		el.setAttribute("data-value", '0');

	RefreshTir(el);
}

function RefreshTir(el)
{
	el.classList.remove("btn-danger");
	el.classList.remove("btn-success");
	el.classList.remove("btn-info");

	const value = parseInt(el.getAttribute("data-value"));
	if (value == 1)
	{
		el.classList.add("btn-success");
	}
	else if (value == -1)
	{
		el.classList.add("btn-danger");
	}
	else
	{
		el.classList.add("btn-info");
	}
}

function onSendPena()
{
	var nbKo = 0;
	[].forEach.call(document.querySelectorAll('#main div button.tir'), function(el) {
		const value = parseInt(el.getAttribute("data-value"));
		if (value == -1)
			++nbKo;
	})

	const bib = GetBibSelected();
	const cmd = { key : '<bib_penalty>', bib : bib, col : wsMain.pena_index, value : nbKo, signature : 'ws' };
	wsMain.websocket.send(JSON.stringify(cmd));
}

function GetBibSelected()
{
	return document.getElementById("bib_selection").value;
}

function GetCountInputPena()
{
	const porteMin = ski.GetSecteurPorteMin(wsMain.secteur);
	const porteMax = ski.GetSecteurPorteMax(wsMain.secteur);
	
	var nb = 0;
	for (let p = porteMin; p <= porteMax; p++)
	{
		const elem = document.querySelectorAll('#main table tbody tr[data-gate="'+p.toString()+'"]');
		if (elem && typeof elem === "object" && elem.length == 1)
		{
			const pen = elem[0].getAttribute('data-pen');
			if (pen == '0' || pen == '2' || pen == '50')
				++nb;
		}
	}
	return nb;
}

function onBibNext()
{
	const nb = GetCountInputPena();
	if (nb == 0 || nb == ski.GetSecteurNbPorte(wsMain.secteur))
		SetBibStep(1);
	else
		alert('Saisie non complète ! '+nb.toString()+' / '+ski.GetSecteurNbPorte(wsMain.secteur).toString());
}

function onBibPrev()
{
	const nb = GetCountInputPena();
	if (nb == 0 || nb == ski.GetSecteurNbPorte(wsMain.secteur))
		SetBibStep(-1);
	else
		alert('Saisie non complète ! '+nb.toString()+' / '+ski.GetSecteurNbPorte(wsMain.secteur).toString());
}

function SetBibStep(step)
{
	const tRanking = ski.GetTableRanking();
	const bib = GetBibSelected();
	
	for (let r = 0; r < tRanking.GetNbRows(); r++)
	{
		if (tRanking.GetCell('Dossard', r) == bib)
		{
			if (r+step >= 0 && r+step < tRanking.GetNbRows())
			{
				const bibStep = tRanking.GetCell('Dossard', r+step);
				document.getElementById('bib_selection').value = bibStep;
				LoadBibLocalStorage(bibStep);
			}
		}
	}
}

function onChangeBibSelection(selectObject) 
{
	LoadBibLocalStorage(selectObject.value);

	[].forEach.call(document.querySelectorAll('#main div button.tir'), function(el) {
		ClearTir(el);
	})
}

function LoadBibLocalStorage(bib)
{
/*
	const porteMin = ski.GetSecteurPorteMin(wsMain.secteur);
	const porteMax = ski.GetSecteurPorteMax(wsMain.secteur);

	for (let p = porteMin; p <= porteMax; p++)
	{
		const elem = document.querySelectorAll('#main table tbody tr[data-gate="'+p.toString()+'"]');
		if (elem && typeof elem === "object" && elem.length == 1)
		{
			const penStorage = localStorage.getItem(bib+'|pen'+p.toString());
			if (penStorage === null)
				elem[0].setAttribute('data-pen', '-1');
			else
				elem[0].setAttribute('data-pen', penStorage);
			
			const ackStorage = localStorage.getItem(bib+'|ack'+p.toString());
			if (ackStorage !== null && ackStorage == '1')
				elem[0].children[4].innerHTML = '*';
			else
				elem[0].children[4].innerHTML = '&nbsp;';
		}
	}
*/
}


////////// Variables globales et Initialisation  //////////
const wsMain = new ws.Context(wsParams.url, wsParams.port);

function Init()
{
	wsMain.lang = 'en';
	wsMain.key_race = '*';
	
	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);
	
	if (urlParams.has('key'))
		wsMain.key_race = urlParams.get('key');

	// Command Notification
	wsMain.SetCommand('<race_load>', OnCommandRaceLoad);
	wsMain.SetCommand('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.SetCommand('<penalty_ack>', OnCommandPenaltyAck);
	
	// Ouverture ws 
	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}


