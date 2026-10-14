function OnOpenWebSocketCommand()
{
	const cmd = { key:'<race_load>', key_race: wsMain.data_key };
	wsMain.websocket.send(JSON.stringify(cmd));
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

	var html = '<h2 class="text-center">'+document.getElementById("message").innerHTML+'</h2>';
	html += '<h4 class="text-center"> penalty_ack : bib='+objJSON.bib+', col='+objJSON.col+', value='+objJSON.value+'</h4>';
	document.getElementById("message").innerHTML = html;
	
/*	
	if (GetBibSelected() == objJSON.bib)
	{
		const elem = document.querySelectorAll('#main table tbody tr[data-gate="'+objJSON.gate+'"] td.gate_ack');
		if (elem && typeof elem === "object" && elem.length == 1)
			elem[0].innerHTML = '*';
	}
	localStorage.setItem(objJSON.bib+'|ack'+objJSON.gate, '1');
*/
}

/* Fenetre d'entre pour le choix du tir a noter */
function SetPena() 
{
	var html;

	html  = '<h1 class="text-center text-info bg-dark">Choix Notation Tir</h1>';

	html += '<div class="row">';
	html += '<select id="lst_pena" class="form-select" aria-label="Choix des Tirs">';
	for (let p=1;p<=ski.GetNbPena();p++)
	{
		html += '<option value="'+p.toString()+'">Tir '+p.toString()+'</option>';
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
	//var bib = GetFirstDossard(0);
	//var identite = GetIdentite(bib);
	var bib = '';
	var identite = 'Identité';
	DoNotation(document.getElementById('lst_pena').value, bib, identite);
}

function DoNotation(indexPena , bibSelected, identite)
{
	wsMain.pena_index = parseInt(indexPena);
	var ValuePenalite = 0;
	var html;
	
	html  = '<h1 class="text-center text-info bg-dark">Notation Tir n°'+wsMain.pena_index.toString()+'</h1>';
	
	html += '<br>';
	html += '<div class="row">';
	html += '<button class="col btn btn-primary" onclick="SetPena()">Changer de TIR</button>';
	html += '</div>';
	
	html += '<br>';
	html += '<div class="container">';
		html += '<div class="row">';
			if(bibSelected == '')
			{		
				html += '<input type="text" class="col-2 " id="SaisiDos" placeholder="Dossard" />';
			}
			else
			{
				html += '<input type="text" class="col-2 " id="SaisiDos" placeholder="'+bibSelected+'" />';
			}
			html += '<button class="col-3 btn btn-primary ms-1 me-1" onclick="onBibsaisiPena()" >Valider</button>';
			html += '<span id="outputText" class="col-5 text-right d-flex align-items-center">'+identite+'</span>'
		html += '</div>';
	html += '</div>';

	var ValuePenalite = GetValuePenalite(bibSelected, parseInt(indexPena))||0;
//	alert('bib ! '+bibSelected+'  Ntir: '+parseInt(indexPena)+' ValuePenalite: '+ValuePenalite);
	html += '<br>';
	html += '<div class="mb-3">';
	if(bibSelected == '')
	{
		html += '<div class="alert alert-info text-center" role="alert" >Selectionner un dossard au dessus</div>';
	}
	else
	{
		html += '<h4 class="alert alert-info text-center" role="alert" >Jugement Cible pour le Dossard: '+bibSelected+' '+identite+' (pénalités enregistrées dans skiFFS: '+ValuePenalite+')</h4>';
		
		html += '<div class="row">';
		for (let t=1;t<=5;t++)
		{
			html += '<div class="col text-center">'+t.toString()+'</div>';
		}
		html += '</div>';
		html += '<br>';
		html += '<div class="row">';

		if (ValuePenalite == '0')
		{
			for (let t=1;t<=5;t++)
			{
				html += '<button type="button" class="col btn tir ms-2 me-2" data-index="'+t.toString()+'" data-value="1">';
				html += '&nbsp;<br>&nbsp;';
				html += '</button>';
			}
		}
		else if (ValuePenalite == '')
		{
			for (let t=1;t<=5;t++)
			{
				html += '<button type="button" class="col btn tir ms-2 me-2" data-index="'+t.toString()+'" data-value="0">';
				html += '&nbsp;<br>&nbsp;';
				html += '</button>';
			}
		}
		else
		{
			for (let t=1;t<=parseInt(ValuePenalite);t++)
			{
				html += '<button type="button" class="col btn tir ms-2 me-2" data-index="'+t.toString()+'" data-value="-1">';
				html += '&nbsp;<br>&nbsp;';
				html += '</button>';
			}
			
			for (let t=parseInt(ValuePenalite)+1;t<=5;t++)
			{
				html += '<button type="button" class="col btn tir ms-2 me-2" data-index="'+t.toString()+'" data-value="1">';
				html += '&nbsp;<br>&nbsp;';
				html += '</button>';
			}
		}	
		
		html += '</div>';

		html += '<br>';
		html += '<div class="row">';
		html += '<button class="col btn btn-primary" onclick="onSendPena('+bibSelected+')">Valider les pénalités</button>';
		html += '</div>';
	}
	document.getElementById("main").innerHTML = html;

	[].forEach.call(document.querySelectorAll('#main div button.tir'), function(el) {
		RefreshTir(el);
		el.addEventListener('click', function() {
			ChangeTir(el);
		})
	})
	// A quoi sert cette fonction ????? faut-il la laisser activer ????
	// LoadBibLocalStorage(GetBibSelected());
}

function onBibsaisiPena()
{
	var bib = document.getElementById('SaisiDos').value;
	var identite = GetIdentite(bib);
	DoNotation(wsMain.pena_index, bib, identite);
}

function GetFirstDossard(dos)
{
	const tRanking = ski.GetTableRanking();
	tRanking.OrderBy('Dossard');
	for (let r = 0; r < tRanking.GetNbRows(); r++)
	{
		if (parseInt(r) == parseInt(dos))
		{
			return tRanking.GetCell('Dossard', r);
			break;
		}	
	}
}

function GetIdentite(bib)
{
	const tRanking = ski.GetTableRanking();
	tRanking.OrderBy('Dossard');
	for (let r = 0; r < tRanking.GetNbRows(); r++)
	{
		if (tRanking.GetCell('Dossard', r) == bib)
		{
			var identite = tRanking.GetCell('Nom', r)+' '+tRanking.GetCell('Prenom', r);
			return identite;
			break;
		}	
	}
}

function GetValuePenalite(bib, Ntir)
{
	const tRanking = ski.GetTableRanking();
	for (let r = 0; r < tRanking.GetNbRows(); r++)
	{
		if (tRanking.GetCell('Dossard', r) == bib)
		{
			var PenaTir = tRanking.GetCell('Pena'+Ntir+'_1', r);
			// alert('bib ! '+bib+' // Ntir: '+Ntir+' // PenaTir: '+PenaTir);
			return PenaTir;
			break;
		}	
	}
}

function SetValuePenalite(bib, Ntir, value)
{
	const tRanking = ski.GetTableRanking();
	for (let r = 0; r < tRanking.GetNbRows(); r++)
	{
		if (tRanking.GetCell('Dossard', r) == bib)
		{
			tRanking.SetCell('Pena'+Ntir+'_1', r, value);
			break;
		}	
	}
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

function onSendPena(bibSelected)
{
	var nbKo = 0;
	[].forEach.call(document.querySelectorAll('#main div button.tir'), function(el) {
		const value = parseInt(el.getAttribute("data-value"));
		if (value == -1)
			++nbKo;
	})

	// const bib = GetBibSelected();
	const cmd = { key : '<bib_penalty>', bib : bibSelected, col : wsMain.pena_index, value : nbKo, signature : 'ws_pena_biath' };
	wsMain.websocket.send(JSON.stringify(cmd));
	document.getElementById("message").innerHTML = '&nbsp;&nbsp;&nbsp;&nbsp; Envoi de '+nbKo+' pénalités pour le dossard: '+bibSelected+' au Tir N°'+wsMain.pena_index+' Ok ...';
	
	SetValuePenalite(bibSelected, wsMain.pena_index, nbKo);
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
	var bib = selectObject.value;
	var identite = GetIdentite(bib);
	DoNotation(wsMain.pena_index, bib, identite);

	LoadBibLocalStorage(selectObject.value);
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
	wsMain.data_key = '*';
	
	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);

	if (urlParams.has('data_key'))
		wsMain.data_key = urlParams.get('data_key');

	// Notification
	wsMain.SetCommand('<race_load>', OnCommandRaceLoad);
	wsMain.SetCommand('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.SetCommand('<penalty_ack>', OnCommandPenaltyAck);

	// Ouverture ws wsContext
	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}


