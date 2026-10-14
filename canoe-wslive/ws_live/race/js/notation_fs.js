function OnOpenWebSocketCommand()
{
	wsMain.websocket.send(JSON.stringify({key : '<race_load>', key_race : wsMain.key_race }));
}

function OnCommandRaceLoad(objJSON) 
{
//	alert("OnCommandRaceLoad :"+JSON.stringify(objJSON));
	ski.SetRace(objJSON);

	if (wsMain.judge == 'chef')
	{
		document.getElementById("header").innerHTML = '<h3 class="text-center text-info bg-dark">Selection Dossard / Notation</h3>';
		
		const tEpreuve = ski.GetTable('Epreuve');
		if (tEpreuve !== undefined)
		{
			for (let e=0;e<tEpreuve.GetNbRows();e++)
			{
				const code_epreuve = tEpreuve.GetCell('Code_epreuve',e);
				const cmd = { key : '<epreuve_load>',  epreuve:code_epreuve , fn:'response_EpreuveLoad'};	
				wsMain.websocket.send(JSON.stringify(cmd));
			}
		}
	}

	// Chargement de toutes les épreuves ...
	const cmd = { key : '<epreuve_load>',  epreuve : '' };	
	wsMain.websocket.send(JSON.stringify(cmd));
}

function response_EpreuveLoad(objJSON) 
{
//	alert("response_EpreuveLoad :"+JSON.stringify(objJSON));
	
	const epreuve = objJSON.epreuve;
	ski.SetEpreuveMulti(objJSON, epreuve);
	
	const tEpreuve = ski.GetTable('Epreuve');
	if (tEpreuve.GetNbRows() == ski.GetNbEpreuveMulti())
	{
		// Chargement complet ...
		Navigation_Epreuve();
	}
}

function Navigation_Epreuve()
{
	const tEpreuve = ski.GetTable('Epreuve');
	const nb_epreuve = tEpreuve.GetNbRows();
	
	var html = '';
	html += '<ul class="list-group">';
	for (let e=0;e<nb_epreuve;e++)
	{
		const categ = tEpreuve.GetCell('Code_categorie', e);
		const sexe = tEpreuve.GetCell('Sexe', e);
		const epreuve = tEpreuve.GetCellInt('Code_epreuve', e);
		
		const nb_course = ski.GetInfoEpreuveMulti(epreuve, 'Nb_course');
		for (let course=1;course<=nb_course;course++)
		{
			const label_course = ski.GetInfoEpreuveMulti(epreuve, 'Label_course'+course.toString());
			const nb_run = ski.GetInfoEpreuveMulti(epreuve, 'Nb_run_course'+course.toString());
			for (let run=1;run<=nb_run;run++)
			{
				html += '<button type="button" class="list-group-item list-group-item-action" ';
				html += 'data-epreuve="'+epreuve.toString()+'" ';
				html += 'data-course="'+course.toString()+'" ';
				html += 'data-run="'+run.toString()+'" ';
				html += '>Epr. '+epreuve.toString()+' ['+categ+'/'+sexe+']';
				html += ' : Course '+course.toString()+' - '+label_course;
				html += ' : Run '+run.toString();
				html += '</button>';
			}
		}
	}
	html += '</ul>';

	document.getElementById("navigation").innerHTML = html;
	
	[].forEach.call(document.querySelectorAll('#navigation ul button'), function(el) {
		el.addEventListener('click', function() {
			Navigation_Epreuve_active_clear();
			el.classList.add('active');
			const e = parseInt(el.getAttribute("data-epreuve"));
			const c = parseInt(el.getAttribute("data-course"));
			const r = parseInt(el.getAttribute("data-run"));
			ShowRun(e,c,r);
		})
	})
}

function Navigation_Epreuve_active_clear()
{
	[].forEach.call(document.querySelectorAll('#navigation ul button.active'), function(el) {
		el.classList.remove('active');
	})
}

function ShowRun(epreuve, course, run) 
{
	wsMain.select_epreuve = epreuve;
	wsMain.select_course = course;
	wsMain.select_run = run;

	if (wsMain.refresh_interval != null)
		window.clearInterval(wsMain.refresh_interval);
	wsMain.refresh_interval = window.setInterval(function () { onRefresh(); }, 3000);
	
	const cmd = { key : '<epreuve_load>',  epreuve:epreuve , fn:'response_EpreuveLoad_notation'};	
	wsMain.websocket.send(JSON.stringify(cmd));
}

function response_EpreuveLoad_notation(objJSON) 
{
//	alert("response_EpreuveLoad_notation :"+JSON.stringify(objJSON));

	const epreuve = objJSON.epreuve;
	ski.SetEpreuveMulti(objJSON, epreuve);

	const course = wsMain.select_course;
	const run = wsMain.select_run;

	const tEpreuve = ski.GetTable('Epreuve');
	const categ = tEpreuve.GetCell('Code_categorie', epreuve-1);
	const sexe = tEpreuve.GetCell('Sexe', epreuve-1);
	
	const label_course = ski.GetInfoEpreuveMulti(epreuve, 'Label_course'+course.toString());
	const nb_judge = parseInt(ski.GetInfoEpreuveMulti(epreuve, 'Nb_juge_course'+course.toString()));

	var html = '';
	if (wsMain.judge == 'chef')
	{
		wsMain.select_label  = 'Epreuve '+epreuve.toString()+' ['+categ+'/'+sexe+']';
		wsMain.select_label += ' : Course '+course.toString()+' - '+label_course;
		wsMain.select_label += ' : Run '+run.toString();
		
		html += '<h4 class="text-center text-info">'+wsMain.select_label+'</h4>';
	}
	
	const tRanking = ski.GetTableRankingMulti(epreuve);
	if (tRanking !== undefined)
	{
		html += '<h2 class="text-center text-info">Liste des Concurrents : '+tRanking.GetNbRows().toString()+' : <button class="col btn btn-dark" onclick="onReload()">Re-Chargement</button></h2>';

		html += '<table class="table table-striped">';
		html += '<thead class="table-dark"><tr>';
		html += '<th class="text-center">Dossard</th>';
		html += '<th class="text-center">Identité</th>';
		
		if (wsMain.judge == 'chef')
			html += '<th class="text-center">Selection</th>';
		
		html += '<th class="text-center">Style JP</th>';
		
		for (let j=1;j<=nb_judge;j++)
		{
			html += '<th id="label_j'+j.toString()+'" class="text-center">J'+j.toString()+'</th>';
		}
		html += '<th class="text-center">N.Run</th>';
		html += '<th class="text-center">C.Run</th>';
		if (run > 1)
		{
			html += '<th class="text-center">Note</th>';
			html += '<th class="text-center">C.Tot</th>';
		}
		
		html += '</tr></thead>';
		html += '<tbody>';
		
		tRanking.OrderBy('Dossard');

		const colStyleJp = tRanking.GetIndexColumn('Notation_C'+course.toString()+'_Style_jp_M'+run.toString());
		for (let r=0;r<tRanking.GetNbRows();r++)
		{
			const bib = tRanking.GetCell('Dossard', r);
			var styleJp = '';
			if (colStyleJp >= 0)
				styleJp = tRanking.GetCell(colStyleJp, r);

			html += '<tr data-dossard="'+bib+'">';
			html += '<td class="text-end">'+bib+'</td>';
			html += '<td>'+tRanking.GetCell('Nom', r)+' '+tRanking.GetCell('Prenom', r)+'</td>';

			if (wsMain.judge == 'chef')
			{
				html += '<td class="text-center"><button class="btn btn-dark action_select">Selection</button></td>';

				html += '<td>';
				html += '<select class="form-select">';
				html += '<option >&nbsp;</option>';
				html += '<option value="A" '+adv.GetSelected('A',styleJp)+'>A</option>';
				html += '<option value="B" '+adv.GetSelected('B',styleJp)+'>B</option>';
				html += '<option value="C" '+adv.GetSelected('C',styleJp)+'>C</option>';
				html += '<option value="D" '+adv.GetSelected('D',styleJp)+'>D</option>';
				html += '<option value="E" '+adv.GetSelected('E',styleJp)+'>E</option>';
				html += '</select>';
				html += '</td>';
			}
			else
			{
				html += '<td class="text-center">'+styleJp+'</td>';
			}
				
			for (let j=1;j<=nb_judge;j++)
			{
				html += '<td class="text-center" data-juge="'+j.toString()+'">'+tRanking.GetCellDouble('Notation_C'+course.toString()+'_M'+run.toString()+'_J'+j.toString(), r, 1)+'</td>';
			}

			html += '<td class="text-center note" >'+tRanking.GetCellDouble('Notation_C'+course.toString()+'_M'+run.toString(), r, 1)+'</td>';
			const clt = tRanking.GetCellInt('Notation_C'+course.toString()+'_M'+run.toString()+'_Clt', r);
			if (clt >= 1)
				html += '<td class="text-center clt">'+clt.toString()+'</td>';
			else
				html += '<td class="text-center clt">&nbsp;</td>';
			
			if (run > 1)
			{
				html += '<td class="text-center note" >'+tRanking.GetCellDouble('Notation',r, 1)+'</td>';
				const cltCourse = tRanking.GetCellInt('Notation_Clt', r);
				if (cltCourse >= 1)
					html += '<td class="text-center clt">'+cltCourse.toString()+'</td>';
				else
					html += '<td class="text-center clt">&nbsp;</td>';
			}
		}
		
		html += '</tbody>';
		html += '</table>';
	}
	
	document.getElementById("main").innerHTML = html;
	
	if (wsMain.judge == 'chef')
	{
		[].forEach.call(document.querySelectorAll('#main table tr td button.action_select'), function(el) {
			el.addEventListener('click', function() {
				Navigation_Button_reset();
				el.classList.remove('btn-dark');
				el.classList.add('btn-primary');
				const elTr = el.closest('tr');
				if (elTr !== undefined)
				{
					const bib = parseInt(elTr.getAttribute("data-dossard"));
					DoSelectBib(bib);
				}
			})
		});
		
		[].forEach.call(document.querySelectorAll('#main table tr select'), function(el) {
			el.addEventListener('change', function() {
				const elTr = el.closest('tr');
				if (elTr !== undefined)
				{
					const bib = parseInt(elTr.getAttribute("data-dossard"));
					DoBibStyleJp(bib, el.value);
				}
			})
		});
	}
}

function DoBibStyleJp(bib, styleJp)
{
	const cmd = { 
		key : '<bib_notation>', 
		style_jp : styleJp, 
		bib : bib, 
		course : wsMain.select_course, 
		run : wsMain.select_run, 
		signature : 'ws' 
	};
	wsMain.websocket.send(JSON.stringify(cmd));
//	alert(JSON.stringify(cmd));
}

function DoSelectBib(bib)
{
	wsMain.select_bib = bib;
	
	if (wsMain.select_bib_timeout != null)
		window.clearTimeout(wsMain.select_bib_timeout);
	
	ResetSelectBibAck();
	SendSelectBib();
}

function SendSelectBib()
{
	wsMain.websocket.send(JSON.stringify({
		key:'<order>', 
		action:'notation_select', 
		epreuve: wsMain.select_epreuve, 
		course: wsMain.select_course, 
		run: wsMain.select_run, 
		bib:wsMain.select_bib, 
		label:wsMain.select_label, 
		key_race:wsMain.key_race 
	}));
		
	const nb_ack = GetCountSelectBibAck();
	const nb_judge = parseInt(ski.GetInfoEpreuveMulti(wsMain.select_epreuve, 'Nb_juge_course'+wsMain.select_course.toString()));
	if (nb_ack < nb_judge)
		wsMain.select_bib_timeout = window.setTimeout(function () { SendSelectBib(); }, 1000);
}

function SendSelectBibAck()
{
	const cmd = { 
		key : '<order>', 
		action:'notation_select_ack', 
		judge:wsMain.judge,
		epreuve: wsMain.select_epreuve, 
		course: wsMain.select_course, 
		run: wsMain.select_run, 
		bib:wsMain.select_bib, 
		key_race:wsMain.key_race 
	};
	
	wsMain.websocket.send(JSON.stringify(cmd));
//	alert(JSON.stringify(cmd));
}

function LabelJudgeShowAck(judge, ack)
{
	const elLabel = document.getElementById('label_j'+judge.toString());
	if (elLabel !== undefined && typeof elLabel == 'object' && elLabel !== null)
	{
		if (ack)
		{
			elLabel.classList.add('text-success');
			elLabel.classList.remove('text-danger');
		}
		else
		{
			elLabel.classList.add('text-danger');
			elLabel.classList.remove('text-success');
		}
	}
}

function ResetSelectBibAck()
{
	for (let r=0;r<wsMain.select_bib_judge_ack.length;r++)
	{
		wsMain.select_bib_judge_ack[r] = 0;
		LabelJudgeShowAck(r+1, false);
	}
}

function GetCountSelectBibAck()
{
	var count = 0;
	for (let r=0;r<wsMain.select_bib_judge_ack.length;r++)
	{
		if (wsMain.select_bib_judge_ack[r] == 1)
			++count;
	}
	
	return count;
}

function Navigation_Button_reset()
{
	[].forEach.call(document.querySelectorAll('#main table tr td button'), function(el) {
		el.classList.add('btn-dark');
		el.classList.remove('btn-primary');
	});
}

function OnCommandEpreuveLoad(objJSON) 
{
//	alert("OnCommandEpreuveLoad :"+JSON.stringify(objJSON));

	ski.SetEpreuve(objJSON);
	if (wsMain.judge != 'chef')
	{
		DoNotation();
	}
}

function onRefresh()
{
	const cmd = { key:'<epreuve_load>', epreuve:wsMain.select_epreuve, force_refresh:true, fn:'response_EpreuveLoad_refresh'};	
	wsMain.websocket.send(JSON.stringify(cmd));
}

function onReload()
{
	if (wsMain.refresh_interval != null)
		window.clearInterval(wsMain.refresh_interval);

	if (wsMain.select_bib_timeout != null)
		window.clearTimeout(wsMain.select_bib_timeout);

	window.location.reload();
}

function response_EpreuveLoad_refresh(objJSON) 
{
//	alert("response_EpreuveLoad_refresh :"+JSON.stringify(objJSON));
	
	const epreuve = wsMain.select_epreuve;
	const course = wsMain.select_course;
	const run = wsMain.select_run;
	
	ski.SetEpreuveMulti(objJSON, epreuve);

	const nb_judge = parseInt(ski.GetInfoEpreuveMulti(epreuve, 'Nb_juge_course'+course.toString()));
	const tRanking = ski.GetTableRankingMulti(epreuve);
	if (tRanking !== undefined)
	{
		const colStyleJp = tRanking.GetIndexColumn('Notation_C'+course.toString()+'_Style_jp_M'+run.toString());
		for (let r=0;r<tRanking.GetNbRows();r++)
		{
			const bib = tRanking.GetCell('Dossard',r);
			[].forEach.call(document.querySelectorAll("#main table tr[data-dossard='"+bib+"']"), function(el) {
				for (let j=1;j<=nb_judge;j++)
				{
					const elJuge = el.querySelector("td[data-juge='"+j.toString()+"']");
					if (elJuge !== undefined && typeof elJuge == 'object')
					{
						elJuge.innerHTML = tRanking.GetCellDouble('Notation_C'+course.toString()+'_M'+run.toString()+'_J'+j.toString(), r, 1);
					}
				}

				const elNote = el.querySelector("td.note");
				if (elNote !== undefined && typeof elNote == 'object')
				{
					elNote.innerHTML = tRanking.GetCellDouble('Notation_C'+course.toString()+'_M'+run.toString(), r, 1);
				}

				const elClt = el.querySelector("td.clt");
				if (elClt !== undefined && typeof elClt == 'object')
				{
					const clt = tRanking.GetCellInt('Notation_C'+course.toString()+'_M'+run.toString()+'_Clt', r);
					if (clt >= 1)
						elClt.innerHTML = clt.toString();
					else
						elClt.innerHTML = '&nbsp';
				}

				if (colStyleJp >= 0)
				{
					const styleJp = tRanking.GetCell(colStyleJp, r);
					const elSelect = el.querySelector("td select");
					if (elSelect !== undefined && typeof elSelect == 'object' && elSelect !== null)
					{
						const valueSelect = elSelect.value;
						if (valueSelect != styleJp && styleJp != '')
							elSelect.value = styleJp;
					}
				}
			});
		}
	}
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

function OnCommandOrder(objJSON)
{
//	alert("OnCommandOrder :"+JSON.stringify(objJSON));

	if (objJSON !== null)
	{
		if (objJSON.action == 'notation_select')
		{
			if (wsMain.judge != 'chef')
			{
				if (wsMain.select_epreuve != objJSON.epreuve ||
					wsMain.select_course != objJSON.course ||
					wsMain.select_run != objJSON.run ||
					wsMain.select_bib != objJSON.bib
				)
				{
					wsMain.select_epreuve = objJSON.epreuve;
					wsMain.select_course = objJSON.course;
					wsMain.select_run = objJSON.run;
					wsMain.select_bib = objJSON.bib;
					wsMain.select_label = objJSON.label;
					DoNotation();
					
					if (wsMain.refresh_interval != null)
						window.clearInterval(wsMain.refresh_interval);
					wsMain.refresh_interval = window.setInterval(function () { onRefresh(); }, 3000);
				
					const cmd = { key : '<epreuve_load>',  epreuve:wsMain.select_epreuve , fn:'response_EpreuveLoad_notation'};	
					wsMain.websocket.send(JSON.stringify(cmd));
				}
				
				SendSelectBibAck();
			}
		}
		else if (objJSON.action == 'notation_select_ack')
		{
			if (wsMain.judge == 'chef')
			{
				if (wsMain.select_epreuve == objJSON.epreuve &&
					wsMain.select_course == objJSON.course &&
					wsMain.select_run == objJSON.run &&
					wsMain.select_bib == objJSON.bib 
				)
				{
					const judgeAck = parseInt(objJSON.judge);
					if (judgeAck >= 1 && judgeAck <= wsMain.select_bib_judge_ack.length)
					{
						wsMain.select_bib_judge_ack[judgeAck-1] = 1;
						LabelJudgeShowAck(judgeAck, true);
					}
				}
			}
		}
	}
}

function DoNotation()
{
	const epreuve = wsMain.select_epreuve;
	const course = wsMain.select_course;
	const run = wsMain.select_run;
	const bib = wsMain.select_bib;

	var html = '';

	html += '<h3 class="text-center text-info bg-dark">Juge '+wsMain.judge+'</h3>';

	html += '<h2 class="text-center text-info bg-dark">'+wsMain.select_label+'</h2>';
	html += '<h1 class="text-center text-info bg-dark">Dossard : '+bib.toString()+'</h1>';
/*
	html += '<div class="mb-3">';
	html +=	'<label for="bib_selection" class="form-label">Dossard</label>';
	html += '<select id="bib_selection" class="form-select" onchange="onChangeBibSelection(this)"></select>';
	html += '</div>';
*/
	html += '<div class="mb-3">';
	html += '<label for="note" class="form-label">Note</label>';
	html += '<input type="text" class="form-control" id="note" placeholder="note à saisir">';
	html += '</div>';

	html += '<br>';
	html += '<div class="row">';
	html += '<button class="col btn btn-primary" onclick="onSendNote()">Valider</button>';
	html += '</div>';

	document.getElementById("notation").innerHTML = html;
}

function ClearNote()
{
	document.getElementById('note').value = '';
}

function onSendNote()
{
	var note = document.getElementById('note').value;

	const cmd = { 
		key : '<bib_notation>', 
		note : note, 
		bib : wsMain.select_bib, 
		course : wsMain.select_course, 
		run : wsMain.select_run, 
		judge : wsMain.judge, 
		signature : 'ws' 
	};
	wsMain.websocket.send(JSON.stringify(cmd));
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
	wsMain.key_race = '*';
	
	wsMain.judge = '';
	wsMain.select_epreuve = -1;
	wsMain.select_course = -1;
	wsMain.select_run = -1;
	wsMain.select_bib = -1;
	wsMain.select_label = '';
	wsMain.refresh_interval = null;
	
	wsMain.select_bib_judge_ack = [0,0,0,0,0,0,0,0,0,0];
	wsMain.select_bib_timeout = null;
		
	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);
	
	if (urlParams.has('key'))
		wsMain.key_race = urlParams.get('key');
	
	if (urlParams.has('j'))
		wsMain.judge = urlParams.get('j');
	
	// Command Notification
	wsMain.SetCommand('<race_load>', OnCommandRaceLoad);
	wsMain.SetCommand('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.SetCommand('<order>', OnCommandOrder);
	
	// Ouverture ws 
	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}


