function OnOpenWebSocketCommand()
{
	document.getElementById("container_message").innerHTML = '';
	wsMain.websocket.send(JSON.stringify({key : '<competition_load>', mode_test : wsMain.mode_test }));
}

function OnFlowOnCourse(objJSON) 
{
	if (wsMain.scrolling > 0)
	{
		if (objJSON.epreuve !== undefined)
		{
			if (objJSON.epreuve != GetCurrentEpreuve())
			{
				const cmd = { key : '<epreuve_load>',  epreuve : objJSON.epreuve };
				wsMain.websocket.send(JSON.stringify(cmd));
				return;
			}
		}
	}

	const elClock = document.getElementById("clock");
	if (elClock == null)
		return;

	elClock.innerHTML = adv.GetChrono2H2M2S(objJSON.clock);
	
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking != 'object')
		return;

	const tOnCourse = adv.GetTableUnique(objJSON, 'table');
	const tOnCoursePrev = wsMain.notify_on_course;

	if (typeof tOnCoursePrev == 'object')
	{
		// Suppression des anciens on_course tjs ok ...
		for (let i=0;i<tOnCourse.GetNbRows();i++)
		{
			var bib = tOnCourse.GetCell('bib',i);
			for (let k=0;k<tOnCoursePrev.GetNbRows();k++)
			{
				if (tOnCoursePrev.GetCell('bib',k) == bib)
				{
					tOnCoursePrev.RemoveRowAt(k);
					break;
				}
			}
		}
	}
	
	// Traitement on_course ok ...
	let i = 0;
	while (i<tOnCourse.GetNbRows())
	{
		const chronoValue = tOnCourse.GetCellInt('time', i);
		if (chronoValue >= wsMain.chrono_min && chronoValue <= wsMain.chrono_max)
		{
			var bib = tOnCourse.GetCell('bib',i);
			++i;
			
			const j = tRanking.GetIndexRow('Dossard', bib);
			if (j >= 0 && j < tRanking.GetNbRows())
			{
				const elemTime = document.querySelector('#main table tbody tr[data-bib="'+bib+'"] td.time');
				if (elemTime && typeof elemTime === "object")
				{
					elemTime.innerHTML = adv.GetChrono(chronoValue, wsMain.fmtChronoOnCourse);
					elemTime.setAttribute('data-oncourse', '1');
				}
			}
		}
		else
		{
			tOnCourse.RemoveRowAt(i);
		}
	}

	if (typeof tOnCoursePrev == 'object')
	{
		// Remise en état des anciens on_course ko ...
		for (let k=0;k<tOnCoursePrev.GetNbRows();k++)
		{
			var bib = tOnCoursePrev.GetCell('bib',k);
			for (let j=0;j<tRanking.GetNbRows();j++)
			{
				if (bib == tRanking.GetCell('Dossard', j))
				{
					const elemTime = document.querySelector('#main table tbody tr[data-bib="'+bib+'"] td.time');
					if (elemTime && typeof elemTime === "object")
					{
						elemTime.innerHTML = tRanking.GetCellChrono('Tps'+canoe.GetCodeCoursePhase(), j, 'HHMMSSCC');
						const stateOnCourse = elemTime.getAttribute('data-oncourse');
						if (stateOnCourse == '1')
							elemTime.setAttribute('data-oncourse', '0');
					}
					break;
				}
			}
		}
	}

	wsMain.notify_on_course = tOnCourse;
}

function OnBroadcastModeChrono(objJSON)
{
	// Il manquait `typeof` : la condition comparait un objet a la chaine
	// 'object' et etait donc toujours vraie, et OpenWebSocketCommand n'existe
	// pas (la fonction de la page s'appelle OnOpenWebSocketCommand). Chaque
	// <mode_chrono> levait donc un ReferenceError.
	if (!canoe.HasRanking())
		OnOpenWebSocketCommand();
}

function OnBroadcastRunErase(objJSON)
{
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking === 'object')
	{
		if (objJSON.Code_competition == canoe.GetCodeCompetition() && objJSON.Code_course == canoe.GetCodeCourse() && objJSON.Code_phase == canoe.GetCodePhase())
		{
			const tOnCourse = wsMain.notify_on_course;
			if (typeof tOnCourse === 'object')
				tOnCourse.RemoveAllRows();
			
			const elem = document.querySelectorAll('#main table tbody tr td[data-oncourse="1"]');
			if (elem && typeof elem === "object" && elem.length >= 1)
			{
				for (let i=0;i<elem.length;i++)
					elem[i].setAttribute('data-oncourse', '0');
			}

			const course_phase = canoe.GetCodeCoursePhase();
			tRanking.SetColumnToNull('Tps_chrono'+course_phase);
			tRanking.SetColumnToNull('Tps'+course_phase);
			tRanking.SetColumnToNull('Clt'+course_phase);
			tRanking.SetColumnToNull('Cltc'+course_phase);
			
			SetBodyEpreuve(true);
		}
	}
}

function OnBroadcastBibTime(objJSON) 
{
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking === 'object')
	{
		const passage = parseInt(objJSON.passage);
		if (passage >= 1)
			DoBroadcastBibTimeInter(objJSON, passage);
		else
			DoBroadcastBibTimeFinish(objJSON);
	}
}
	
function DoBroadcastBibTimeFinish(objJSON) 
{
	const bib = objJSON.bib;
	const tRanking = canoe.GetTableRanking();
	const course_phase = canoe.GetCodeCoursePhase();
	const codeActivite = canoe.GetCodeActivite();
	
	const tOnCoursePrev = wsMain.notify_on_course;
	if (tOnCoursePrev && typeof tOnCoursePrev === "object")
	{
		for (let k=0;k<tOnCoursePrev.GetNbRows();k++)
		{
			if (tOnCoursePrev.GetCell('bib',k) == bib)
			{
				tOnCoursePrev.RemoveRowAt(k);
				break;
			}
		}
	}
	
	for (let i=0;i<tRanking.GetNbRows();i++)
	{
		if (bib == tRanking.GetCell('Dossard', i))
		{
			tRanking.SetCell('Tps_chrono'+course_phase,i, objJSON.time_chrono);
	
			if (codeActivite == 'SLA')
			{
				// Slalom
				const elemChrono = document.querySelector('#main table tbody tr[data-bib="'+bib+'"] td.chrono');
				if (elemChrono && typeof elemChrono === "object")
				{
					elemChrono.innerHTML = adv.GetChronoHHMMSSCC(objJSON.time_chrono);
					elemChrono.setAttribute('data-oncourse', '2');
					window.setTimeout(function() { 
						elemChrono.setAttribute('data-oncourse', '3');
					} , 1000);
				}
				
				UpdateSlalomFinishTime(tRanking, i);
			}
			else
			{
				// Descente ...
				tRanking.UpdateRankingTime(i, tRanking.GetIndexColumn('Tps'+course_phase), tRanking.GetIndexColumn('Cltc'+course_phase), tRanking.GetCellInt('Tps'+course_phase,i), objJSON.time_chrono);
				const elemTime = document.querySelector('#main table tbody tr[data-bib="'+bib+'"] td.time');
				if (elemTime && typeof elemTime === "object")
				{
					const time_chrono = adv.GetChronoHHMMSSCC(objJSON.time_chrono);
					if (objJSON.diff_categ === undefined)
					{
						elemTime.innerHTML = time_chrono;
						elemTime.setAttribute('data-oncourse', '2');
					}
					else
					{
						elemTime.innerHTML = time_chrono+' ['+adv.GetChronoDiffMMSSCC(objJSON.diff_categ)+']';
						if (objJSON.diff_categ > 0)
							elemTime.setAttribute('data-oncourse', 'red');
						else
							elemTime.setAttribute('data-oncourse', 'green');
					}

					window.setTimeout(function() { 
						elemTime.setAttribute('data-oncourse', '3');
						window.setTimeout(function() { 
							elemTime.innerHTML = time_chrono; 
							ReOrder();
							const elemTimeReorder = document.querySelector('#main table tbody tr[data-bib="'+bib+'"] td.time');
							if (elemTimeReorder && typeof elemTimeReorder === "object")
							{
								elemTimeReorder.setAttribute('data-oncourse', 'yellow');
								window.setTimeout(function() {elemTimeReorder.setAttribute('data-oncourse', '0')}, 3000);
							}
						}, 3000);
					} , 1000);
				}
				
				// Ré-Affichage Colonne Cltc
				for (let k=0;k<tRanking.GetNbRows();k++)
				{
					const elemRank = document.querySelector('#main table tbody tr[data-bib="'+tRanking.GetCell('Dossard',k)+'"] td.rank');
					if (elemRank && typeof elemRank === "object")
					{
						elemRank.innerHTML = tRanking.GetCellRank('Cltc'+course_phase, k);
					}
				}
			}
			break;
		}
	}
}

function ReOrder()
{
	const tRanking = canoe.GetTableRanking();
	const txtCoursePhase = canoe.GetCodeCoursePhase();
	
	tRanking.OrderBy('Cltc'+txtCoursePhase+',Heure_depart'+txtCoursePhase);
	SetBodyEpreuve();
}

function DoBroadcastBibTimeInter(objJSON, inter) 
{
	const bib = objJSON.bib;
	const tRanking = canoe.GetTableRanking();
	const course_phase_inter = canoe.GetCodeCoursePhase()+'_inter'+inter;
		
	for (let i=0;i<tRanking.GetNbRows();i++)
	{
		if (bib == tRanking.GetCell('Dossard', i))
		{
			const oldTps = tRanking.GetCellInt('Tps_chrono'+course_phase_inter,i);
			const newTps = objJSON.time_chrono;
			tRanking.UpdateRankingTime(i, tRanking.GetIndexColumn('Tps_chrono'+course_phase_inter), tRanking.GetIndexColumn('Cltc_chrono'+course_phase_inter), oldTps, newTps);

			const elemTime = document.querySelector('#main table tbody tr[data-bib="'+bib+'"] td.time_inter[data-inter="'+inter+'"]');
			if (elemTime && typeof elemTime === "object")
			{
				if (objJSON.diff_categ === undefined)
				{
					elemTime.innerHTML = adv.GetChronoHHMMSSCC(newTps);
				}
				else
				{
					const time_inter = adv.GetChronoHHMMSSCC(newTps);
					elemTime.innerHTML = time_inter+' ['+adv.GetChronoDiffMMSSCC(objJSON.diff_categ)+']';

					if (objJSON.diff_categ > 0)
						elemTime.setAttribute('data-oncourse', 'red');
					else
						elemTime.setAttribute('data-oncourse', 'green');

					window.setTimeout(function() { 
						elemTime.setAttribute('data-oncourse', 'end');
						window.setTimeout(function() { elemTime.innerHTML = time_inter; elemTime.setAttribute('data-oncourse', '0') }, 3000);
						} , 4000
					);
				}
			}
			
			for (let k=0;k<tRanking.GetNbRows();k++)
			{
				const elemRank = document.querySelector('#main table tbody tr[data-bib="'+tRanking.GetCell('Dossard',k)+'"] td.rank_inter[data-inter="'+inter+'"');
				if (elemRank && typeof elemRank === "object")
				{
					elemRank.innerHTML = tRanking.GetCellRank('Cltc_chrono'+course_phase_inter, k);
				}
			}
			
			break;
		}
	}	
}

function OnBroadcastPenaltyAdd(objJSON) 
{
	const bib = objJSON.bib;
	const porte = objJSON.gate;
	const pena = objJSON.penalty;

	SetOnCoursePenalty(bib, porte, pena);
	
	const course_phase = canoe.GetCodeCoursePhase();
	const tRanking = canoe.GetTableRanking();

	if (typeof tRanking === 'object')
	{
		for (let row=0;row<tRanking.GetNbRows();row++)
		{
			if (bib == tRanking.GetCell('Dossard', row))
			{
				const oldTps = tRanking.GetCellInt('Tps'+course_phase, row);
				const newTps = canoe.UpdateSlalomPena(tRanking, row, porte, pena);
				
				if (wsMain.final_A_B)
					ComputeClt_A_B(tRanking);
			
				if (newTps != oldTps)
					RefreshFinishTime(tRanking, row, newTps);

				break;
			}
		}
	}
}

function SetOnCoursePenalty(bib, gate, pena)
{
	const elem = document.querySelectorAll('#onCourse tr[data-bib="'+bib.toString()+'"] td[data-col="'+gate.toString()+'"]');
	if (elem && typeof elem === "object" && elem.length == 1)
	{
		if (pena == '0')
		{
			elem[0].setAttribute("data-pen", '0');
			elem[0].innerHTML = '';
		}
		else if (pena == '2')
		{
			elem[0].setAttribute("data-pen", '2');
			elem[0].innerHTML = '2';
		}
		else if (pena == '50')
		{
			elem[0].setAttribute("data-pen", '50');
			elem[0].innerHTML = '50';
		}
		else
		{
			elem[0].setAttribute("data-pen", '-1');
			elem[0].innerHTML = '&nbsp;';
		}
	}
}

function RefreshFinishTime(tRanking, row, newTps)
{
	const course_phase = canoe.GetCodeCoursePhase();
	const bib = tRanking.GetCell('Dossard', row);

	const elemTime = document.querySelector('#main table tbody tr[data-bib="'+bib+'"] td.time');
	if (elemTime && typeof elemTime === "object")
	{
		elemTime.innerHTML = adv.GetChronoXSCC(newTps);
		
		if (newTps >= adv.chrono.OK)
		{
			if (tRanking.GetCellInt('Cltc'+course_phase, row) == 1)
				elemTime.setAttribute('data-oncourse', 'green');
			else
				elemTime.setAttribute('data-oncourse', 'red');
		
			window.setTimeout(function() { 
				elemTime.setAttribute('data-oncourse', '3');
				window.setTimeout(function() { 
					ReOrder();
					const elemTimeReorder = document.querySelector('#main table tbody tr[data-bib="'+bib+'"] td.time');
					if (elemTimeReorder && typeof elemTimeReorder === "object")
					{
						elemTimeReorder.setAttribute('data-oncourse', 'yellow');
						window.setTimeout(function() {elemTimeReorder.setAttribute('data-oncourse', '0')}, 3000);
					}
				}, 3000);
			} , 1000);
		}
	}
	
	for (let k=0;k<tRanking.GetNbRows();k++)
	{
		const elemRank = document.querySelector('#main table tbody tr[data-bib="'+tRanking.GetCell('Dossard',k)+'"] td.rank');
		if (elemRank && typeof elemRank === "object")
		{
			elemRank.innerHTML = tRanking.GetCellRank('Cltc'+course_phase, k);
		}
	}
}

function ComputeClt_A_B(tRanking)
{
	if (tRanking.GetIndexColumn('Clt_A_B') < 0)
		tRanking.AddColumn('Clt_A_B', adv.index_type.RANKING);

	const txtCoursePhase = canoe.GetCodeCoursePhase();
	tRanking.SetRankingGroup('Clt_A_B', 'Tps'+txtCoursePhase, 'Groupe, Code_epreuve');
}

function UpdateSlalomFinishTime(tRanking, row)
{
	const course_phase = canoe.GetCodeCoursePhase();
	const oldTps = tRanking.GetCellInt('Tps'+course_phase, row);
	const newTps = canoe.UpdateSlalomFinishTime(tRanking, row);
	
	if (wsMain.final_A_B)
		ComputeClt_A_B(tRanking);

	if (newTps != oldTps)
		RefreshFinishTime(tRanking, row, newTps);
	
	return newTps;
}

function OnCommandCompetitionLoad(objJSON) 
{
	wsMain.notify_competitions = objJSON;

	document.getElementById("container_message").innerHTML = '';
   	document.getElementById("navigation_epreuve").style.display = 'none';
    
   	document.getElementById("title").innerHTML = 'Fédération Française de Canoë Kayak et Sports de Pagaie';
    document.getElementById("sub_title").innerHTML = 'Liste des compétitions en live';

	const tCompetitions = adv.GetTableUnique(wsMain.notify_competitions, 'competitions');

	var html;
	html  = '<table class="table table-striped">';

	html += '<thead><tr>';
	html += '<th class="text-center">'+GetTraduction('Codex')+'</th>';
	html += '<th class="text-center">'+GetTraduction('Activité')+'</th>';
	html += '<th class="text-center">'+GetTraduction('Nom')+'</th>';
	html += '<th class="text-center">'+GetTraduction('Lieu')+'</th>';	
	html += '<th class="text-center">'+GetTraduction('Date')+'</th>';
	html += '<th class="text-center">'+GetTraduction('Type Course')+'</th>';
	html += '<th class="text-center">'+GetTraduction('Phase')+'</th>';
	html += '<th class="text-center">'+GetTraduction('On line')+'</th>';
	html += '</tr></thead>';

	html += '<tbody>';
	for (let r = 0; r < tCompetitions.GetNbRows(); r++)
	{
		const key = tCompetitions.GetCell('key', r);
		
		html += '<tr>'
		html += '<td class="text-center"><a href="#" data-key="'+key+'">'+key+'</a></td>';
		html += '<td class="text-center">'+tCompetitions.GetCell('Code_activite', r)+'</td>';
		html += '<td class="text-center">'+tCompetitions.GetCell('Nom', r)+'</td>';
		html += '<td class="text-center">'+tCompetitions.GetCell('Ville', r)+'</td>';
		html += '<td class="text-center">'+tCompetitions.GetCellDate('Date_phase', r, 'DDMMYYYY')+'</td>';
		html += '<td class="text-center">'+tCompetitions.GetCell('Libelle_course', r)+'</td>';
		html += '<td class="text-center">'+tCompetitions.GetCell('Libelle_phase', r)+'</td>';

        if (tCompetitions.GetCellInt('active', r) == 1)
            html += '<td class="text-center"><img width="24" height="24" src="./img/32x32_online.png"></td>';
        else
            html += '<td class="text-center">-</td>';

		html += '</tr>';
	}
	html += '</tbody>';
	html += '</table>';

	document.getElementById("main").innerHTML = html;

	[].forEach.call(document.querySelectorAll('#main table td a'), function(el) {
		el.addEventListener('click', function() {
			const cmd = { key:'<race_load>', key_race:el.getAttribute('data-key') };
			wsMain.websocket.send(JSON.stringify(cmd));
		})
	})
}

function OnCommandRaceLoad(objJSON) 
{
//	alert("OnCommandRaceLoad :"+JSON.stringify(objJSON));
	canoe.SetRace(objJSON);
	
   	document.getElementById("navigation_epreuve").style.display = 'block';
	document.getElementById("container_message").innerHTML = '';

	SetArrayColumns();
	
	SetBodyHeader();
	SetBodyEpreuves();
}

function SetBodyHeader() 
{
	const tCompetition = canoe.GetTable('Competition');
	const tCompetition_Course = canoe.GetTable('Competition_Course');
	const tCompetition_Course_Phase = canoe.GetTable('Competition_Course_Phase');

	const code_phase = canoe.GetCodePhase();
	var index_phase = 0;
	if (tCompetition_Course_Phase.GetNbRows() >= code_phase && code_phase > 0)
		index_phase = code_phase-1;

	document.getElementById("title").innerHTML = tCompetition.GetCell('Nom', 0);
//	document.getElementById("sub_title").innerHTML = tCompetition_Course.GetCell('Libelle', 0)+' - '+tCompetition_Course_Phase.GetCell('Libelle', index_phase);
	document.getElementById("sub_title").innerHTML = tCompetition_Course_Phase.GetCell('Libelle', index_phase);
}

function GetTraduction(key)
{
	if (wsMain.traduction[key] == undefined)
		return key;
	else
		if (wsMain.lang == 'en')
			return wsMain.traduction[key].en;
		else
			return wsMain.traduction[key].fr;
}

function GetTraductionStateHTML(state) 
{
	if (wsMain.lang == 'en')
	{
		if (state == '1')
			return '<img width="16" height="16" src="./img/16x16_etat_inscription_1.png">&nbsp;Waiting'; 
		else if (state == '2')
			return '<img width="16" height="16" src="./img/16x16_etat_inscription_2.png">&nbsp;Programmed'; 
		else if (state == '3')
			return '<img width="16" height="16" src="./img/16x16_etat_inscription_3.png">&nbsp;In progress'; 
		else if (state == '4')
			return '<img width="16" height="16" src="./img/16x16_etat_inscription_4.png">&nbsp;Unofficial'; 
		else if (state == '5')
			return '<img width="16" height="16" src="./img/16x16_etat_inscription_5.png">&nbsp;Official'; 
		else
			return state;
	}
	else 
	{
		if (state == '1')
			return '<img width="16" height="16" src="./img/16x16_etat_inscription_1.png">&nbsp;En attente'; 
		else if (state == '2')
			return '<img width="16" height="16" src="./img/16x16_etat_inscription_2.png">&nbsp;Programmée'; 
		else if (state == '3')
			return '<img width="16" height="16" src="./img/16x16_etat_inscription_3.png">&nbsp;En cours'; 
		else if (state == '4')
			return '<img width="16" height="16" src="./img/16x16_etat_inscription_4.png">&nbsp;Officieux'; 
		else if (state == '5')
			return '<img width="16" height="16" src="./img/16x16_etat_inscription_5.png">&nbsp;Officiel'; 
		else
			return state;
	}
}

function Refresh()
{
	if (canoe.GetTableRanking() === 'object')
		ReOrder();
	else if (canoe.GetTable('Competition_Course_Phase_Manche_Epreuve') == "object")
		SetBodyEpreuves();
}

function PrevEpreuve()
{
	const tEpreuves = canoe.GetTable('Competition_Course_Phase_Manche_Epreuve');
	const epreuve = GetCurrentEpreuve();
	for (let r = 0; r < tEpreuves.GetNbRows(); r++)
	{
		if (tEpreuves.GetCell('Libelle_court', r) == epreuve)
		{
			--r;
			while (r >= 0)
			{
				if (tEpreuves.GetCellInt('Nombre', r, 0) > 0)
				{
					const cmd = { key : '<epreuve_load>',  epreuve : tEpreuves.GetCell('Libelle_court', r) };
					wsMain.websocket.send(JSON.stringify(cmd));
					return;
				}
				--r;
			}
			break;
		}
	}
}

function NextEpreuve()
{
	const tEpreuves = canoe.GetTable('Competition_Course_Phase_Manche_Epreuve');
	const epreuve = GetCurrentEpreuve();
	for (let r = 0; r < tEpreuves.GetNbRows(); r++)
	{
		if (tEpreuves.GetCell('Libelle_court', r) == epreuve)
		{
			++r;
			while (r < tEpreuves.GetNbRows())
			{
				if (tEpreuves.GetCellInt('Nombre', r, 0) > 0)
				{
					const cmd = { key : '<epreuve_load>',  epreuve : tEpreuves.GetCell('Libelle_court', r) };
					wsMain.websocket.send(JSON.stringify(cmd));
					return;
				}
				++r;
			}
			break;
		}
	}
}

function ShowEpreuves()
{
	SetBodyEpreuves();
}

function ShowPDF()
{
    const cmd = { key:'<pdf>',  type:'res' };
    wsMain.websocket.send(JSON.stringify(cmd));
}

function SetBodyEpreuves() 
{
	const tEpreuves = canoe.GetTable('Competition_Course_Phase_Manche_Epreuve');

	var html;
	html = HTML_Message();
	
	html += '<table class="table table-striped">';
	html += '<thead><tr>';
	html += '<th class="text-center">'+GetTraduction('categ')+'</th>';
	html += '<th class="text-center">'+GetTraduction('state')+'</th>';
	html += '</tr></thead>';
	html += '<tbody>';
	for (let r = 0; r < tEpreuves.GetNbRows(); r++)
	{
		if (tEpreuves.GetCellInt('Nombre', r, 0) > 0)
		{
			var state = tEpreuves.GetCell('Etat_programme_epreuve', r);
			
			html += '<tr>'
			html += '<td class="text-center">'+tEpreuves.GetCell('Libelle_court', r)+'</td>';
			html += '<td class="text-center"><button data-row="'+r.toString()+'">'+GetTraductionStateHTML(state)+'</button></td>';
			html += '</tr>';
		}
	}
	html += '</tbody>';
	html += '</table>';

	document.getElementById("main").innerHTML = html;

	[].forEach.call(document.querySelectorAll('#main table td button'), function(el) {
		el.addEventListener('click', function() {
			const r = parseInt(el.getAttribute("data-row"));
			const epreuve = tEpreuves.GetCell('Libelle_court', r);
			const cmd = { key : '<epreuve_load>',  epreuve : epreuve };
			wsMain.websocket.send(JSON.stringify(cmd));
		})
	})
}

function OnCommandEpreuveLoad(objJSON) 
{
//	alert("OnCommandEpreuveLoad :"+JSON.stringify(objJSON));
	canoe.SetRanking(objJSON);

	const tRanking = canoe.GetTableRanking();
	canoe.SetColumnNameRanking(tRanking);
	canoe.ComputeTpsInter(tRanking, 1);
	canoe.ComputeTpsInter(tRanking, 2);
	
	if (wsMain.final_A_B)
		ComputeClt_A_B(tRanking);
	
	const txtCoursePhase = canoe.GetCodeCoursePhase();
	tRanking.SetRanking('Cltc'+txtCoursePhase, 'Tps'+txtCoursePhase);
	tRanking.OrderBy('Cltc'+txtCoursePhase+',Heure_depart'+txtCoursePhase);
	
	document.getElementById("navigation_prev").classList.remove('disabled');
	document.getElementById("navigation_next").classList.remove('disabled');

	if (wsMain.tv)
	{
		document.getElementById("tv_startlist").classList.remove('disabled');
		document.getElementById("tv_ranking").classList.remove('disabled');
		document.getElementById("tv_clear").classList.remove('disabled');
	}

	SetBodyEpreuve(true);
}

function onTvStartlist() 
{
	wsMain.websocket.send(JSON.stringify({key:'<order>', action:'tv', url:'./tv_startlist.html?epreuve='+GetCurrentEpreuve() }));
}

function onTvRanking() 
{
	wsMain.websocket.send(JSON.stringify({key:'<order>', action:'tv', url:'./tv_ranking.html?epreuve='+GetCurrentEpreuve() }));
}

function onTvClear() 
{
	wsMain.websocket.send(JSON.stringify({key:'<order>', action:'tv', url:'./tv_clear.html' }));
}

function onTvInRace(bib_select) 
{
	wsMain.websocket.send(JSON.stringify({key:'<order>', action:'tv', url:'./tv_inrace.html?bib_select='+bib_select }));
}

function OnCommandPDF(objJSON) 
{
//	alert("OnCommandPDF :"+JSON.stringify(objJSON));
    window.open(objJSON.url, '_blank');
}

function filterDossard(table, itemRow)
{
	const bib = table.GetInt(itemRow, 'Dossard');
	if (bib > 3 && bib < 10)
		return true;
	else
		return false;
}

function SetArrayColumns() 
{
	wsMain.array_columns.length = 0;
	
//	wsMain.array_columns.push({ "name" : "Rang", "label" : GetTraduction('rs'), "style" : "rank", "context" : "course_phase" });
	wsMain.array_columns.push({ "name" : "Cltc", "label" : GetTraduction('rk'), "style" : "rank", "context" : "course_phase" });
	wsMain.array_columns.push({ "name" : "Dossard", "label" : GetTraduction('bib'), "style" : "bib" });
	wsMain.array_columns.push({ "name" : "Bateau", "label" : GetTraduction('name'), "style" : "name" });
	
	if (canoe.GetCodeNiveau() == 'INT')
		wsMain.array_columns.push({ "context" : "nation" });
	else
		wsMain.array_columns.push({ "name" : "Club", "label" : GetTraduction('club'), "style" : "club" });
	
	if (canoe.GetCodeActivite() == 'SLA')
	{
		if (wsMain.final_A_B)
			wsMain.array_columns.push({ "context" : "Clt_A_B" });

		wsMain.array_columns.push({ "name" : "Tps_chrono", "label" : "Chrono", "style" : "chrono", "context" : "course_phase", "fmt" : 'HHMMSSCC' });
		wsMain.array_columns.push({ "context" : "inter_chrono" });
		wsMain.array_columns.push({ "context" : "pena_slalom" });
		wsMain.array_columns.push({ "name" : "Tps", "label" : GetTraduction('time_finish'), "style" : "time", "context" : "finish_start", "fmt" : 'XSCC' });
	}
	else
	{
		wsMain.array_columns.push({ "context" : "inter_chrono" });
		wsMain.array_columns.push({ "name" : "Tps_chrono", "label" : GetTraduction('time_finish'), "style" : "time", "context" : "finish_start", "fmt" : 'HHMMSSCC'});
	}
	
	if (wsMain.tv)
	{
		wsMain.array_columns.push({ "context" : "tv_inrace" });
	}
}

function GetCurrentEpreuve()
{
	return canoe.GetCurrentEpreuve();
}

function SetBodyEpreuve(changeScrolling=false)
{
	if (changeScrolling)
	{
		if (wsMain.scrolling_timeout != null)
		{
			window.clearTimeout(wsMain.scrolling_timeout);
			wsMain.scrolling_timeout = null;
		}
	}
	
	const tRanking = canoe.GetTableRanking();
	const course_phase = canoe.GetCodeCoursePhase();
	const nbPorte = canoe.GetNbPorte();
	const nbInter = canoe.GetNbInter();
	const currentEpreuve = GetCurrentEpreuve();
	
	const elEpreuve = document.getElementById("sel_epreuve");
	if (elEpreuve != null)
		elEpreuve.innerHTML = currentEpreuve;

	const elSubTitle = document.getElementById("sub_title");
	if (elSubTitle != null)
	{
		const tCompetition_Course = canoe.GetTable('Competition_Course');
		const tCompetition_Course_Phase = canoe.GetTable('Competition_Course_Phase');

		const tProgramme_Epreuve_Embarcation = canoe.GetTable('Programme_Epreuve_Embarcation');
		var labelEpreuve = currentEpreuve;
		for (let e=0;e<tProgramme_Epreuve_Embarcation.GetNbRows();e++) {
			if (tProgramme_Epreuve_Embarcation.GetCell('Libelle_court',e) == currentEpreuve) {
				labelEpreuve = tProgramme_Epreuve_Embarcation.GetCell('Libelle_long',e);
				break;
			}
		}
		
		const code_phase = canoe.GetCodePhase();
		var index_phase = 0;
		if (tCompetition_Course_Phase.GetNbRows() >= code_phase && code_phase > 0)
			index_phase = code_phase-1;

		elSubTitle.innerHTML = tCompetition_Course_Phase.GetCell('Libelle', index_phase)+" - "+labelEpreuve;
	}
	
	var html;
	html = HTML_Message();
	html += '<table class="table table-striped">';
	html += '<thead class="table-dark" id="onCourseHeader"><tr>';
	for (var i=0;i<wsMain.array_columns.length;i++)
	{
		if (wsMain.array_columns[i].hasOwnProperty('context'))
		{
			const columnContext = wsMain.array_columns[i].context;
			if (columnContext == 'course_phase' || columnContext == 'finish_start')
			{
				const columnName = wsMain.array_columns[i].name + course_phase;
				const style = wsMain.array_columns[i].style;
				var text_align = "text-center";
				if (style == 'rank' || style == 'chrono' || style == 'time')
					text_align = "text-end";
				html += '<th class="'+text_align+'" data-sort-header="'+columnName+'">'+wsMain.array_columns[i].label+'</th>';
			}
			else if (columnContext == "pena_slalom")
			{
				for (let p = 1; p <= nbPorte; p++)
				{
					if (canoe.IsPorteInv(p))
						html += '<th class="gate_inv">'+p.toString()+'</th>';
					else
						html += '<th>'+p.toString()+'</th>';
				}
			}
			else if (columnContext == "inter_chrono")
			{
				for (let k=1;k<=nbInter;k++)
				{
					html += '<th class="text-end" data-sort-header="Cltc_chrono'+course_phase+'_inter'+k+'" colspan="2">Inter'+k+'</th>';
				}
			}
			else if (columnContext == "nation")
			{
				html += '<th class="text-center" data-sort-header="Code_nation">Nation</th>';
			}
			else if (columnContext == "Clt_A_B")
			{
				html += '<th class="text-end" data-sort-header="Clt_A_B">C.Final</th>';
			}
			else if (columnContext == "tv_inrace")
			{
				html += '<th class="text-center">Tv</th>';
			}
		}
		else
		{
			const style = wsMain.array_columns[i].style;
			var text_align = "text-center";
			if (style == 'rank' || style == 'chrono' || style == 'time')
				text_align = "text-end";
			html += '<th class="'+text_align+'" data-sort-header="'+wsMain.array_columns[i].name+'">'+wsMain.array_columns[i].label+'</th>';
		}
	}
	html += '</tr></thead>';
	
	html += '<tbody id="onCourse">'
	
	var rMin = 0;
	var rMax = tRanking.GetNbRows()-1;
	if (wsMain.scrolling > 0)
	{
		rMin = wsMain.scrolling_start;
		rMax = rMin + wsMain.scrolling-1;
		if (rMax > tRanking.GetNbRows()-1)
			rMax = tRanking.GetNbRows()-1;
	}
	
	for (let r = rMin; r<=rMax; r++)
	{
		var bib = tRanking.GetCell('Dossard', r);
		html += '<tr data-bib="'+bib+'">'

		for (var i=0;i<wsMain.array_columns.length;i++)
		{
			if (wsMain.array_columns[i].hasOwnProperty('context'))
			{
				const columnContext = wsMain.array_columns[i].context;
				if (columnContext == 'course_phase')
				{
					const columnName = wsMain.array_columns[i].name + course_phase;
					if (wsMain.array_columns[i].hasOwnProperty('fmt'))
						html += '<td class="'+wsMain.array_columns[i].style+'">'+tRanking.GetCellFormat(columnName, r, wsMain.array_columns[i].fmt)+'</td>';
					else
						html += '<td class="'+wsMain.array_columns[i].style+'">'+tRanking.GetCellFormat(columnName, r)+'</td>';
				}
				else if (columnContext == 'finish_start')
				{
					const columnName = wsMain.array_columns[i].name + course_phase;
					const columnFmt = wsMain.array_columns[i].fmt;
					let tps = tRanking.GetCellInt(columnName, r, adv.chrono.KO);
					if (tps != adv.chrono.KO)
						html += '<td class="'+wsMain.array_columns[i].style+'">'+tRanking.GetCellFormat(columnName,r,columnFmt)+'</td>';
					else
						html += '<td class="'+wsMain.array_columns[i].style+'">['+tRanking.GetCellFormat('Heure_depart'+course_phase,r,'HHMMSS')+']</td>';
				}
				else if (columnContext == "pena_slalom")
				{
					for (let p = 1; p <= nbPorte; p++)
					{
						var pen = tRanking.GetCell('Pena_'+p.toString(), r);
						if (pen == '0')
							html += '<td class="gate" data-col="'+p.toString()+'" data-pen="0"/>';
						else if (pen == '2')
							html += '<td class="gate" data-col="'+p.toString()+'" data-pen="2">2</td>';
						else if (pen == '50')
							html += '<td class="gate" data-col="'+p.toString()+'" data-pen="50">50</td>';
						else
							html += '<td class="gate" data-col="'+p.toString()+'" data-pen="-1">&nbsp;</td>';
					}
				}
				else if (columnContext == "inter_chrono")
				{
					for (let k=1;k<=nbInter;k++)
					{
						html += '<td class="rank_inter" data-inter="'+k+'">'+tRanking.GetCellRank('Cltc_chrono'+course_phase+'_inter'+k, r)+'</td>';
						html += '<td class="time_inter" data-inter="'+k+'">'+tRanking.GetCellChrono('Tps_chrono'+course_phase+'_inter'+k, r, 'HHMMSSCC')+'</td>';
					}
				}
				else if (columnContext == "nation")
				{
					const code_nation = tRanking.GetCell('Code_nation', r);
					var img_nation = "./img/Flags/empty.png";
					if (code_nation != '')
						img_nation = "./img/Flags/"+code_nation+".png";
					
					html += '<td class="nation">'+code_nation+'&nbsp;<img src="'+img_nation+'" alt="" height="20" width="25" /></td>';
				}
				else if (columnContext == "Clt_A_B")
				{
					html += '<td class="rank">';
					const cltAB = tRanking.GetCellRank('Clt_A_B', r);
					if (cltAB > 0)
						html += cltAB+'/'+tRanking.GetCell('Groupe',r);
					else
						html += '&nbsp;';
					html += '</td>';
				}
				else if (columnContext == "tv_inrace")
				{
					html += '<td><button class="btn btn-primary tv_inrace" data-bib="'+bib+'">In-Race</button></td>';
				}
			}
			else
			{
				if (wsMain.array_columns[i].hasOwnProperty('fmt'))
				{
					const fmt = wsMain.array_columns[i].fmt;
					html += '<td class="'+wsMain.array_columns[i].style+'">'+tRanking.GetCellFormat(wsMain.array_columns[i].name, r, fmt)+'</td>';
				}
				else
				{
					html += '<td class="'+wsMain.array_columns[i].style+'">'+tRanking.GetCellFormat(wsMain.array_columns[i].name, r)+'</td>';
				}
			}
		}
		
		html += '</tr>';
	}
	html += '</tbody>';
	
	html += '</table>';
	
	document.getElementById("main").innerHTML = html;
	
	if (changeScrolling)
	{
		if (wsMain.scrolling > 0)
		{
			wsMain.scrolling_start = rMax+1;
			if (wsMain.scrolling_start > tRanking.GetNbRows()-1)
				wsMain.scrolling_start = 0;

			wsMain.scrolling_timeout = window.setTimeout(function () { SetBodyEpreuve(true); }, wsMain.scrolling_delay);
		}
	}
	
	[].forEach.call(document.querySelectorAll('#main table thead th[data-sort-header]'), function(el) {
		const sortColumn = el.getAttribute("data-sort-header");
		el.innerHTML += '&nbsp;'+tRanking.GetSortHeaderImageHTML(sortColumn);
		el.style.cursor = "pointer";
		el.addEventListener('click', function() {
			if (sortColumn == "Cltc"+canoe.GetCodeCoursePhase())
			{
				tRanking.OrderBy(sortColumn+',Heure_depart'+canoe.GetCodeCoursePhase());
			}
			else
			{
				tRanking.SortHeaderColumn(sortColumn);
			}
			
			SetBodyEpreuve();
		})
	});
	
	[].forEach.call(document.querySelectorAll('button.tv_inrace'), function(el) {
		el.addEventListener('click', function() {
			onTvInRace(el.getAttribute("data-bib"));
		});
	});
} 

function HTML_Message()
{
	var html = '';
	html += '<div class="container-fluid">';
	html += '<div class="row" id="row_marquee">';
    html += '<div class="col-1" id="label_marquee">&nbsp;</div>';
	html += '<div class="col-9" id="marquee"><span id="msg">&nbsp;</span></div>';
	html += '<div class="col-2"><img id="video1" src="" /></div>';
	html += '</div>';
	html += '</div>';
	html += '<br>';
	return html;
}

function OnBroadcastMsg(objJSON) 
{
//	alert("OnBroadcastMsg :"+JSON.stringify(objJSON));
	const htmlMsg = objJSON.msg;
	const elMsg = document.getElementById("msg");
	if (elMsg !== null && htmlMsg !== null)
		elMsg.innerHTML = htmlMsg;
}

////////// Variables globales et Initialisation  //////////
const wsMain = new ws.Context(wsParams.url, wsParams.port);
//const wsVideo1 = new ws.Context('wss://technique.clubesf.com/wss_video1/', 443);
//const wsVideo1 = new ws.Context('ws://192.168.74.131', 8085);

function Init()
{
	wsMain.lang = 'fr';
	wsMain.traduction = {
		'rk': { en : 'Rk', fr : 'Clt' }, 
		'bib': { en : 'Bib', fr : 'Dos.' }, 
		'name': { en : 'Name', fr : 'Identité' }, 
		'club': { en : 'Team', fr : 'Club' }, 
		'team': { en : 'Team', fr : 'Equipe' }, 
		'hour_start': { en : 'Dep.Time', fr : 'H.Départ' }, 
		'time_finish': { en : 'T.Finish', fr : 'T.Arrivée' }, 

		'state': { en : 'State', fr : 'Etat' }, 
		'categ': { en : 'Categ', fr : 'Epreuve' }, 
		'prev': { en : 'Previous', fr : 'Précédent' }, 
		'next': { en : 'Next', fr : 'Suivant' }
	};
	
	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);
	
	if (urlParams.has('lang'))
		wsMain.lang = urlParams.get('lang');
	
	if (urlParams.has('mode_test'))
		wsMain.mode_test = urlParams.get('mode_test')
	else
		wsMain.mode_test = 0;
	
	document.getElementById("navigation_prev").innerHTML = '&lt;&lt;&nbsp;'+GetTraduction('prev');
	document.getElementById("navigation_next").innerHTML = GetTraduction('next')+'&nbsp;>>';
	
	wsMain.scrolling = 0;
	wsMain.scrolling_start = 0;
	wsMain.scrolling_delay = 15000;
	wsMain.scrolling_timeout = null;
	
	if (urlParams.has('scrolling'))
	{
		wsMain.scrolling = parseInt(urlParams.get('scrolling'));
		if (urlParams.has('delay'))
			wsMain.scrolling_delay = parseInt(urlParams.get('delay'))*1000;
//		alert('scrolling='+wsMain.scrolling);
	}
	
	wsMain.fmtChronoOnCourse = 'HHMMSS';
	if (urlParams.has('fmt_chrono_on_course'))
	{
		wsMain.fmtChronoOnCourse = urlParams.get(fmt_chrono_on_course);
	}

	wsMain.tv = false;
	if (urlParams.has('tv'))
		wsMain.tv = true;
	
	wsMain.final_A_B = false;
	if (urlParams.has('final_A_B'))
		wsMain.final_A_B = true;
	
	wsMain.chrono_min = 10;
	wsMain.chrono_max = 3600*1000-10;
		
	wsMain.array_columns = new Array(),

	// Command Notification
	wsMain.SetCommand('<competition_load>', OnCommandCompetitionLoad);

	wsMain.SetCommand('<race_load>', OnCommandRaceLoad);
	wsMain.SetCommand('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.SetCommand('<pdf>', OnCommandPDF);
	
	// Broadcast Notification
	wsMain.SetCommand('<bib_time>', OnBroadcastBibTime);
	wsMain.SetCommand('<penalty_add>', OnBroadcastPenaltyAdd);
	wsMain.SetCommand('<mode_chrono>', OnBroadcastModeChrono);
	wsMain.SetCommand('<run_erase>', OnBroadcastRunErase);
	wsMain.SetCommand('<msg>', OnBroadcastMsg);
	
	// Flow Notification
	wsMain.SetCommand('<on_course>', OnFlowOnCourse);

	// Ouverture ws 
	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
	
//	wsVideo1.image_binary = 'video1';
//	wsVideo1.OpenWebSocketBinary();

	// Navigation 
	[].forEach.call(document.querySelectorAll('ul#navigation li a'), function(el) {
		el.addEventListener('click', function() {
			const nav = el.getAttribute('data-nav');
			if (nav == 'epreuve') SetBodyEpreuves();
			else if (nav == 'refresh') document.location.reload();
		})
	})
}
