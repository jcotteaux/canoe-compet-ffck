function OnOpenWebSocketCommand()
{
	wsContext.wsCommand.send(JSON.stringify({key : '<race_load>', key_race : wsContext.key_race }));
}

function OnCommandRaceLoad(objJSON) 
{
//	alert("OnCommandRaceLoad :"+JSON.stringify(objJSON));
	ski.SetRace(objJSON);

	// Chargement de toutes les épreuves ...
	const cmd = { key : '<epreuve_load>',  epreuve : '' };	
	wsContext.wsCommand.send(JSON.stringify(cmd));
}

function OnCommandEpreuveLoad(objJSON) 
{
//	alert("OnCommandEpreuveLoad :"+JSON.stringify(objJSON));
	ski.SetEpreuve(objJSON);
	SetJuge();
}

function SetJuge() 
{
	var html;

	html  = '<h1 class="text-center text-info bg-dark">Course - Run - Juge</h1>';

	html += '<div class="mb-3">';
	html +=	'<label for="num_course" class="form-label">Course</label>';
	html += '<select id="num_course" class="form-select" aria-label="Course">';
	for (let p=1;p<=3;p++)
	{
		html += '<option value="'+p.toString()+'">Course '+p.toString()+'</option>';
	}
	html += '</select>';
	html += '</div>';

	html += '<div class="mb-3">';
	html +=	'<label for="num_run" class="form-label">Run</label>';
	html += '<select id="num_run" class="form-select" aria-label="Run">';
	for (let p=1;p<=5;p++)
	{
		html += '<option value="'+p.toString()+'">Run '+p.toString()+'</option>';
	}
	html += '</select>';
	html += '</div>';

	html += '<div class="mb-3">';
	html +=	'<label for="num_juge" class="form-label">Juge</label>';
	html += '<select id="num_juge" class="form-select" aria-label="Juge">';
	for (let p=1;p<=5;p++)
	{
		html += '<option value="'+p.toString()+'">Juge '+p.toString()+'</option>';
	}
	html += '</select>';
	html += '</div>';

	html += '<br>';
	html += '<div class="row">';
	html += '<button class="btn btn-primary" onclick="onSetJuge()">Valider</button>';
	html += '</div>';

	document.getElementById("main").innerHTML = html;
}

function onSetJuge()
{
	DoNotation(
		document.getElementById('num_course').value,
		document.getElementById('num_run').value,
		document.getElementById('num_juge').value
	);
}

function DoNotation(course, run, juge)
{
	wsContext.num_course = parseInt(course);
	wsContext.num_run = parseInt(run);
	wsContext.num_juge = parseInt(juge);

	var html;

	html  = '<h1 class="text-center text-info bg-dark">';
	html += 'Course '+wsContext.num_course.toString();
	html += ', Run '+wsContext.num_run.toString();
	html += ', Juge '+wsContext.num_juge.toString();
	html += '</h1>';

	html += '<div class="mb-3">';
	html +=	'<label for="bib_selection" class="form-label">Dossard</label>';
	html += '<select id="bib_selection" class="form-select" onchange="onChangeBibSelection(this)"></select>';
	html += '</div>';

	html += '<div class="mb-3">';
	html += '<label for="note" class="form-label">Note</label>';
	html += '<input type="text" class="form-control" id="note" placeholder="note à saisir">';
	html += '</div>';

	html += '<br>';
	html += '<div class="row">';
	html += '<button class="col btn btn-primary" onclick="onSendNote()">Valider</button>';
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

function ClearNote(el)
{
	document.getElementById('note').value = '';
}

function onSendNote()
{
	var note = document.getElementById('note').value;

	const bib = GetBibSelected();
	const cmd = { 
		key : '<bib_notation>', 
		bib : bib, 
		course : wsContext.num_course, 
		run : wsContext.num_run, 
		judge : wsContext.num_juge, 
		note : note, 
		signature : 'ws' 
	};
	wsContext.wsCommand.send(JSON.stringify(cmd));
//	alert(JSON.stringify(cmd));
}

function GetBibSelected()
{
	return document.getElementById("bib_selection").value;
}

function onBibNext()
{
	SetBibStep(1);
}

function onBibPrev()
{
	SetBibStep(-1);
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
		ClearNote(el);
	})
}

function LoadBibLocalStorage(bib)
{
/*
	const porteMin = ski.GetSecteurPorteMin(wsContext.secteur);
	const porteMax = ski.GetSecteurPorteMax(wsContext.secteur);

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
	
	// Ouverture ws 
	wsContext.OpenWebSocketCommand(OnOpenWebSocketCommand);
}


