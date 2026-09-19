function OnOpenWebSocketCommand()
{
	wsContext.wsCommand.send(JSON.stringify({key : '<race_load>', key_race : wsContext.key_race }));
}

function OnCommandRaceLoad(objJSON) 
{
//	alert("OnCommandRaceLoad :"+JSON.stringify(objJSON));
	wsContext.notify_race = objJSON;

	// Chargement de toutes les épreuves ...
	const cmd = { key : '<epreuve_load>',  epreuve : '' };	
	wsContext.wsCommand.send(JSON.stringify(cmd));
}

function OnCommandEpreuveLoad(objJSON) 
{
//	alert("OnCommandEpreuveLoad :"+JSON.stringify(objJSON));
	wsContext.notify_ranking = objJSON;
	SetSecteur();
}

function OnCommandPenaltyAck(objJSON)
{
	if (GetBibSelected() == objJSON.bib)
	{
		const elem = document.querySelectorAll('#main table tbody tr[data-gate="'+objJSON.gate+'"] td.gate_ack');
		if (elem && typeof elem === "object" && elem.length == 1)
			elem[0].innerHTML = '*';
	}
	localStorage.setItem(objJSON.bib+'|ack'+objJSON.gate, '1');
}

function SetSecteur() 
{
	var html;
	
	html  = '<ul class="list-group">';
	for (let s=1;s<=canoe.GetNbSecteur();s++)
	{
		html += '<li class="list-group-item h3 text-center" data-row="'+s.toString()+'">Secteur '+s.toString()
		+' : Portes '+canoe.GetSecteurPorteMin(s).toString()+' à '+canoe.GetSecreurPorteMax(s).toString()+'</li>';
	}
	html += '</ul>';
	
	document.getElementById("main").innerHTML = html;
	
	[].forEach.call(document.querySelectorAll('#main ul li'), function(el) {
		el.addEventListener('click', function() {
			const s = parseInt(el.getAttribute("data-row"));
			SetJugement(s);
		})
	})
}

function SetJugement(secteur)
{
	wsContext.secteur = secteur;
	const porteMin = canoe.GetSecteurPorteMin(secteur);
	const porteMax = canoe.GetSecteurPorteMax(secteur);
	
	var html;
	html  = '<form>';
	
	html += '<div class="mb-3">';
	html += '<select id="bib_selection" class="form-select" onchange="onChangeBibSelection(this)"></select>';
	html += '</div>';

	html += '</form>';
	html += '<br>';
	
	html += '<table class="table table-striped">';
	html += '<thead class="table-dark"><tr>';
	html += '<th class="text-center">N°Porte</th>';
	html += '<th class="text-center" colspan="4">Pénalité</th>';
	html += '</tr></thead>';
	html += '<tbody>';
	for (let p = porteMin; p <= porteMax; p++)
	{
		html += '<tr data-gate="'+p.toString()+'" data-pen="-1">';
		
		if (canoe.IsPorteInv(p))
			html += '<td class="gate_inv">P.'+p.toString()+'</td>';
		else
			html += '<td class="gate_std">P.'+p.toString()+'</td>';
			
		html += '<td class="gate" data-value="0">0</td>';
		html += '<td class="gate" data-value="2">2</td>';
		html += '<td class="gate" data-value="50">50</td>';
		html += '<td class="gate_ack">&nbsp;</td>';
		html += '</tr>';
	}
	html += '</tbody>';
	html += '</table>';
	
	html += '<div class="row">';
	html += '<button onclick="onBibPrev()" type="button" class="btn btn-outline-primary col">Précédent</button>';
	html += '<button onclick="onBibNext()" type="button" class="btn btn-outline-primary col">Suivant</button>';
	html += '</div>';

	document.getElementById("main").innerHTML = html;
	
	[].forEach.call(document.querySelectorAll('#main table tbody tr td'), function(el) {
		el.addEventListener('click', function() {
			const gate = el.parentNode.getAttribute("data-gate");
			const penPrev = el.parentNode.getAttribute("data-pen");
			var value = el.getAttribute("data-value");
			if (value == penPrev)
				value = '-1';
			el.parentNode.setAttribute("data-pen", value);
			el.parentNode.children[4].innerHTML = '&nbsp;';

			const bib = GetBibSelected();
			const cmd = { key : '<penalty_add>', bib : bib, gate : gate, penalty : value};
			wsContext.wsCommand.send(JSON.stringify(cmd));
			localStorage.setItem(bib+'|pen'+gate, value);
			localStorage.setItem(bib+'|ack'+gate, '0');
		})
	})
	
	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking')
	var bibSelect = document.getElementById('bib_selection');
	
	for (let r = 0; r < tRanking.GetNbRows(); r++)
	{
		var bib = tRanking.GetCell('Dossard', r);
		var opt = document.createElement('option');
		opt.value = bib;
		opt.innerHTML = bib+" - "+tRanking.GetCell('Bateau', r)+" ("+tRanking.GetCell('Code_categorie', r)+")";
		bibSelect.appendChild(opt);
	}
	
	LoadBibLocalStorage(GetBibSelected());
}

function GetBibSelected()
{
	return document.getElementById("bib_selection").value;
}

function GetCountInputPena()
{
	const porteMin = canoe.GetSecteurPorteMin(wsContext.secteur);
	const porteMax = canoe.GetSecteurPorteMax(wsContext.secteur);
	
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
	if (nb == 0 || nb == canoe.GetSecteurNbPorte(wsContext.secteur))
		SetBibStep(1);
	else
		alert('Saisie non complète ! '+nb.toString()+' / '+canoe.GetSecteurNbPorte(wsContext.secteur).toString());
}

function onBibPrev()
{
	const nb = GetCountInputPena();
	if (nb == 0 || nb == canoe.GetSecteurNbPorte(wsContext.secteur))
		SetBibStep(-1);
	else
		alert('Saisie non complète ! '+nb.toString()+' / '+canoe.GetSecteurNbPorte(wsContext.secteur).toString());
}

function SetBibStep(step)
{
	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
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
}

function LoadBibLocalStorage(bib)
{
	const porteMin = canoe.GetSecteurPorteMin(wsContext.secteur);
	const porteMax = canoe.GetSecteurPorteMax(wsContext.secteur);

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
}

function Init()
{
	wsContext.lang = 'en';
	wsContext.url = wsParams.url;
	wsContext.port = wsParams.port;

	wsContext.key_race = '*';
	
	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);
	
	if (urlParams.has('key'))
		wsContext.key_race = urlParams.get('key');

	// Command Notification
	wsContext.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsContext.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	wsContext.mapCommand.set('<penalty_ack>', OnCommandPenaltyAck);
	
	// Ouverture ws 
	wsContext.OpenWebSocketCommand(OnOpenWebSocketCommand);
}


