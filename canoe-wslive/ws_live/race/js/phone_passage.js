function OnOpenWebSocketCommand()
{
	wsMain.websocket.send(JSON.stringify({key : '<race_load>', key_race : wsMain.key_race }));
	document.getElementById("message").innerHTML = 'Connexion Ok ...';
}

function OnCloseWebSocketCommand()
{
	document.getElementById("message").innerHTML = 'Connexion Ko !!!';
}

function OnCommandRaceLoad(objJSON) 
{
	wsMain.notify_race = objJSON;
	wsMain.websocket.send(JSON.stringify({key : '<epreuve_load>' }));
}

function OnCommandEpreuveLoad(objJSON) 
{
//	alert("OnCommandEpreuveLoad :"+JSON.stringify(objJSON));
	wsMain.notify_ranking = objJSON;
	
	const tRanking = adv.GetTableUnique(wsMain.notify_ranking, 'ranking');
	
	if (wsMain.target == 'canoe')
	{
		const course_phase = canoe.GetCodeCoursePhase();
		tRanking.OrderBy('Heure_depart'+course_phase+', Dossard');
	}
	else
	{
		const manche = ski.GetCodeManche();
		tRanking.OrderBy('Rang'+manche+', Dossard');
	}
	
	SetBodyEpreuve();
}

function OnBroadcastBibNext(objJSON)
{
//	alert("OnBroadcastBibNext :"+JSON.stringify(objJSON));
	if (wsMain.bib_select == 'next')
		SetBibCurrent(objJSON.bib);
}

function onChangeBibSelection(el)
{
//	alert(document.getElementById("bib_selection").value);
}

function SetBodyEpreuve()
{
	var html;
	html  = '<form>';

	html += '<h3 class="text-center">Phone Passage <span id="clock" class="badge bg-success">23h59.59.9</span></h3>';
	
	html += '<div class="mb-3">';
	html += '<select id="bib_selection" class="form-select" onchange="onChangeBibSelection()"></select>';
	html += '</div>';

	if (wsMain.passage != -2)
	{
		var labelPassage;
		if (wsMain.passage == -1)
			labelPassage = 'Arrivée';
		else if (wsMain.passage == 0)
			labelPassage = 'Départ';
		else
			labelPassage = 'Inter'+wsMain.passage.toString();
		
		html += '<div class="row">';
		html += '<button onclick="onBibPulse()" type="button" class="btn btn-outline-primary col">';
		html += '<img hspace="2" width="48" height="48" src="./img/32x32_chrono.png">&nbsp;Impulsion '+labelPassage;
		html += '</button>';
		html += '</div>';
		html += '<br>';
		
		html += '<div class="row">';
		html += '<button onclick="onBibDelete()" type="button" class="btn btn-outline-primary col">';
		html += 'Annulation Dernière Impulsion '+labelPassage;
		html += '</button>';
		html += '</div>';
		html += '<br>';
	}

	if (wsMain.dns)
	{
		html += '<div class="row">';
		html += '<button onclick="onBibDns()" type="button" class="btn btn-outline-primary col">Absent</button>';
		html += '</div>';
		html += '<br>';
	}

	if (wsMain.dnf)
	{	
		html += '<div class="row">';
		html += '<button onclick="onBibDnf()" type="button" class="btn btn-outline-primary col">Abandon</button>';
		html += '</div>';
		html += '<br>';
	}

	if (wsMain.bib_start)
	{
		html += '<div class="row">';
		html += '<button onclick="onBibStart()" type="button" class="btn btn-outline-primary col">Dossard au Départ</button>';
		html += '</div>';
		html += '<br>';
	}

	if (wsMain.bib_inter1)
	{
		html += '<div class="row">';
		html += '<button onclick="onBibInter1()" type="button" class="btn btn-outline-primary col">Dossard à l\'Inter 1</button>';
		html += '</div>';
		html += '<br>';
	}

	if (wsMain.bib_inter2)
	{
		html += '<div class="row">';
		html += '<button onclick="onBibInter2()" type="button" class="btn btn-outline-primary col">Dossard à l\'Inter 2</button>';
		html += '</div>';
		html += '<br>';
	}

	if (wsMain.bib_finish)
	{
		html += '<div class="row">';
		html += '<button onclick="onBibFinish()" type="button" class="btn btn-outline-primary col">Dossard à l\'Arrivée 1</button>';
		html += '</div>';
		html += '<br>';
	}

	html += '</form>';
	html += '<br>';
	
	html += '<div class="row">';
	html += '<button onclick="onBibPrev()" type="button" class="btn btn-outline-primary col">Précédent</button>';
	html += '<button onclick="onBibNext()" type="button" class="btn btn-outline-primary col">Suivant</button>';
	html += '</div>';
	html += '<br>';
	
	html += '<div class="row">';
	html += '<button onclick="onHisto()" type="button" class="btn btn-outline-primary col">Historique</button>';
	html += '</div>';

	document.getElementById("main").innerHTML = html;
	
	[].forEach.call(document.querySelectorAll('#main table tbody tr td'), function(el) {
		el.addEventListener('click', function() {
		})
	})
	
	const tRanking = adv.GetTableUnique(wsMain.notify_ranking, 'ranking')
	var bibSelect = document.getElementById('bib_selection');
	
	for (let r = 0; r < tRanking.GetNbRows(); r++)
	{
		var bib = tRanking.GetCell('Dossard', r);
		var opt = document.createElement('option');
		opt.value = bib;
		
		if (wsMain.target == 'canoe')
			opt.innerHTML = bib+" - "+tRanking.GetCell('Bateau', r)+" ("+tRanking.GetCell('Code_categorie', r)+")";
		else
			opt.innerHTML = bib+" - "+tRanking.GetCell('Nom', r)+" "+tRanking.GetCell('Prenom', r);
		
		bibSelect.appendChild(opt);
	}
}

function onBibDns()
{
	DoPassage(GetBibSelected(), 0, adv.chrono.DNS);
}

function onBibDnf()
{
	DoPassage(GetBibSelected(), -1, adv.chrono.DNF);
}

function onBibPulse()
{
	DoPassage(GetBibSelected(), wsMain.passage, adv.chrono.AUTO);
}

function onBibDelete()
{
	DoBibDelete();
}

function onBibNext()
{
	SetBibStep(1);
}

function onBibPrev()
{
	SetBibStep(-1);
}

function onBibStart()
{
	DoBibPassage(GetBibSelected(), 0);
}

function onBibInter1()
{
	DoBibPassage(GetBibSelected(), 1);
}

function onBibFinish()
{
	DoBibPassage(GetBibSelected(), -1);
}

function SetBibStep(step)
{
	const tRanking = adv.GetTableUnique(wsMain.notify_ranking, 'ranking');
	const bib = GetBibSelected();
	
	for (let r = 0; r < tRanking.GetNbRows(); r++)
	{
		if (tRanking.GetCell('Dossard', r) == bib)
		{
			if (r+step >= 0 && r+step < tRanking.GetNbRows())
			{
				const bibStep = tRanking.GetCell('Dossard', r+step);
				document.getElementById('bib_selection').value = bibStep;
			}
		}
	}
}

function SetBibCurrent(bib)
{
	const tRanking = adv.GetTableUnique(wsMain.notify_ranking, 'ranking');
	for (let r = 0; r < tRanking.GetNbRows(); r++)
	{
		if (tRanking.GetCell('Dossard', r) == bib)
		{
			document.getElementById('bib_selection').value = bib;
		}
	}
}

function GetBibSelected()
{
	return document.getElementById("bib_selection").value;
}

function DoPassage(bib, passage, time)
{
	const tRanking = adv.GetTableUnique(wsMain.notify_ranking, 'ranking');
	if (tRanking != null)
	{
		var i = tRanking.GetIndexRow('Dossard', bib);
		if (i >= 0)
		{
			wsMain.websocket.send(JSON.stringify({key:'<passage_add>', time:time, bib:bib, passage:passage, device:'ws_phone_passage' }));

			// Enregistrement Local 
			let ms = time;
			if (time == adv.chrono.AUTO)
			{
				var now = new Date();
				ms = now.getHours()*3600000 + now.getMinutes() * 60000 +  now.getSeconds()*1000+now.getMilliseconds();
			}
			
			let key = bib.toString()+'|'+passage.toString();
			let value = adv.GetChronoHHMMSSMMM(ms)+' | '+ms.toString();
			localStorage.setItem(key, value);
			
			SetBibStep(1);
			Beep();
			
			wsMain.bib_last = bib;
			document.getElementById("message").innerHTML = 'Envoi Passage Dossard '+bib+' Ok ...';
		}
	}
}

function DoBibDelete()
{
	const tRanking = adv.GetTableUnique(wsMain.notify_ranking, 'ranking');
	if (tRanking != null && wsMain.bib_last != '')
	{
		var i = tRanking.GetIndexRow('Dossard', wsMain.bib_last);
		if (i >= 0)
		{
			wsMain.websocket.send(JSON.stringify({key:'<bib_delete>', bib:wsMain.bib_last, key_count:-1, passage:wsMain.passage, device:'ws_phone_passage' }));
			
			if (i > 0)
				SetBibCurrent(tRanking.GetCell('Dossard', i-1));
			
			Beep();
			
			document.getElementById("message").innerHTML = 'Envoi Annulation Passage Dossard '+wsMain.bib_last+' Ok ...';
		}
	}
}

function DoBibPassage(bib, passage)
{
	const tRanking = adv.GetTableUnique(wsMain.notify_ranking, 'ranking');
	if (tRanking != null)
	{
		var i = tRanking.GetIndexRow('Dossard', bib);
		if (i >= 0)
		{
			wsMain.websocket.send(JSON.stringify({key:'<bib_next>', bib:bib, passage:passage, key_count:-1, device:'ws_phone_passage'}));
			SetBibStep(1);
			Beep();
			document.getElementById("message").innerHTML = 'Envoi Passage Dossard '+bib+' Ok ...';
		}
	}
}

function onHisto()
{
	const tRanking = adv.GetTableUnique(wsMain.notify_ranking, 'ranking');
	if (tRanking != null)
	{
		let html = '<table>';

		html += '<thead>';
		html += '<th>Dossard</th>';
		html += '<th>Passage</th>';
		html += '<th>Heure</th>';
		html += '</thead>';

		html += '<tbody>';
		for (let r = 0; r < tRanking.GetNbRows(); r++)
		{
			let bib = tRanking.GetCell('Dossard', r);
			let key = bib+'|'+wsMain.passage.toString();
			
			let value = localStorage.getItem(key);
			if (value == null)
				value = '-';

			html += '<tr>';
			html += '<td>'+bib+'</td>';
			html += '<td>'+wsMain.passage.toString()+'</td>';
			html += '<td>'+value+'</td>';
			html += '</tr>';
		}
		html += '</tbody>';
		html += '</table>';
		
		document.getElementById("histo").innerHTML = html;
	}
}

function Beep() 
{
	var audio = new Audio('./sound/beep.wav');
	audio.play();
}

function OnFlowOnCourse(objJSON) 
{
	const elClock = document.getElementById("clock");
	if (elClock != null)
		elClock.innerHTML = adv.GetChronoHHMMSSD(objJSON.clock);
	
	if (wsMain.bib_select == 'auto')
	{
		const tOnCourse = adv.GetTableUnique(objJSON, 'table');
		const lastRow = tOnCourse.GetNbRows()-1;
		if (lastRow >= 0)
		{
			SetBibCurrent(tOnCourse.GetCell('bib',lastRow));
			wsMain.bib_select = 'auto_done';
		}
	}
}

////////// Variables globales et Initialisation  //////////
const wsMain = new ws.Context(wsParams.url, wsParams.port);

function Init()
{
	wsMain.passage = -2;
	wsMain.dns = false;
	wsMain.dnf = false;
	wsMain.bib_start = false;
	wsMain.bib_inter1 = false;
	wsMain.bib_inter2 = false;
	wsMain.bib_finish = false;
	wsMain.bib_select = 'auto'
	wsMain.bib_last = '';
	
	wsMain.key_race = '*';

	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);
	
	if (urlParams.has('key'))
		wsMain.key_race = urlParams.get('key');

	if (urlParams.has('passage'))
		wsMain.passage = parseInt(urlParams.get('passage'));
	
	if (urlParams.has('dns'))
		wsMain.dns = true;

	if (urlParams.has('dnf'))
		wsMain.dnf = true;
	
	if (urlParams.has('bib_start'))
		wsMain.bib_start = true;

	if (urlParams.has('bib_inter1'))
		wsMain.bib_inter1 = true;

	if (urlParams.has('bib_inter2'))
		wsMain.bib_inter2 = true;

	if (urlParams.has('bib_finish'))
		wsMain.bib_finish = true;
	
	if (urlParams.has('bib_select'))
		wsMain.bib_select = urlParams.get('bib_select');

	if (urlParams.has('verif'))
	{
		var verif = urlParams.get('verif');
		if (verif == 'no')
		{
			// Command Notification
			wsMain.SetCommand('<race_load>', OnCommandRaceLoad);
			wsMain.SetCommand('<epreuve_load>', OnCommandEpreuveLoad);
			
			// Broadcast Notification
			wsMain.SetCommand('<bib_next>', OnBroadcastBibNext);

			// Flow Notification
			wsMain.SetCommand('<on_course>', OnFlowOnCourse);
	
			// Ouverture ws 
			wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
		}
	}
}
