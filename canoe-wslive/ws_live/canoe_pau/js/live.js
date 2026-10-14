function OnOpenWebSocketCommand()
{
	document.getElementById("container_message").innerHTML = '';
	wsContext.wsCommand.send(JSON.stringify({key : '<competition_load>' }));
}

function OnFlowOnCourse(objJSON) 
{
	if (wsContext.scrolling > 0)
	{
		if (objJSON.epreuve !== undefined)
		{
			if (objJSON.epreuve != GetCurrentEpreuve())
			{
				const cmd = { key : '<epreuve_load>',  epreuve : objJSON.epreuve };
				wsContext.wsCommand.send(JSON.stringify(cmd));
				return;
			}
		}
	}

	const elClock = document.getElementById("clock");
	if (elClock == null)
		return;

	elClock.innerHTML = adv.GetChronoHHMMSSD(objJSON.clock);
	
	if (wsContext.notify_ranking == null)
		return;

	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking')
	if (typeof tRanking != 'object')
		return;

	const tOnCourse = adv.GetTableUnique(objJSON, 'table');
	const tOnCoursePrev = wsContext.notify_on_course;

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
	for (let i=0;i<tOnCourse.GetNbRows();i++)
	{
		var bib = tOnCourse.GetCell('bib',i);
		for (let j=0;j<tRanking.GetNbRows();j++)
		{
			if (bib == tRanking.GetCell('Dossard', j))
			{
				const elemTime = document.querySelector('#main table tbody tr[data-bib="'+bib+'"] td.time');
				if (elemTime && typeof elemTime === "object")
				{
					elemTime.innerHTML = tOnCourse.GetCellChrono('time', i, 'HHMMSSD');
					elemTime.setAttribute('data-oncourse', '1');
				}
				break;
			}
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
						const stateOnCourse = elemTime.GetAttribute('data-oncourse');
						if (stateOnCourse == '1')
							elemTime.setAttribute('data-oncourse', '0');
					}
					break;
				}
			}
		}
	}

	wsContext.notify_on_course = tOnCourse;
}

function OnBroadcastModeChrono(objJSON)
{
	if (typeof wsContext.notify_ranking !== 'object')
		OpenWebSocketCommand();
}

function OnBroadcastRunErase(objJSON)
{
	if (typeof wsContext.notify_ranking === 'object')
	{
		if (objJSON.Code_competition == canoe.GetCodeCompetition() && objJSON.Code_course == canoe.GetCodeCourse() && objJSON.Code_phase == canoe.GetCodePhase())
		{
			const tOnCourse = wsContext.notify_on_course;
			if (typeof tOnCourse === 'object')
				tOnCourse.RemoveAllRows();
			
			const elem = document.querySelectorAll('#main table tbody tr td[data-oncourse="1"]');
			if (elem && typeof elem === "object" && elem.length >= 1)
			{
				for (let i=0;i<elem.length;i++)
					elem[i].setAttribute('data-oncourse', '0');
			}

			const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
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
	if (typeof wsContext.notify_ranking === 'object')
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
	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
	const course_phase = canoe.GetCodeCoursePhase();
	const codeActivite = canoe.GetCodeActivite();
	
	const tOnCoursePrev = wsContext.notify_on_course;
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
	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
	const txtCoursePhase = canoe.GetCodeCoursePhase();
	
	tRanking.OrderBy('Cltc'+txtCoursePhase+',Heure_depart'+txtCoursePhase);
	SetBodyEpreuve();
}

function DoBroadcastBibTimeInter(objJSON, inter)
{
	const bib = objJSON.bib;
	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
	const course_phase_inter = canoe.GetCodeCoursePhase()+'_inter'+inter;
		
	for (let i=0;i<tRanking.GetNbRows();i++)
	{
		if (bib == tRanking.GetCell('Dossard', i))
		{
			tRanking.UpdateRankingTime(i, tRanking.GetIndexColumn('Tps'+course_phase_inter), tRanking.GetIndexColumn('Cltc'+course_phase_inter), tRanking.GetCellInt('Tps'+course_phase_inter,i), objJSON.time_chrono);

			const elemTime = document.querySelector('#main table tbody tr[data-bib="'+bib+'"] td.time_inter[data-inter="'+inter+'"]');
			if (elemTime && typeof elemTime === "object")
			{
				if (objJSON.diff_categ === undefined)
				{
					elemTime.innerHTML = adv.GetChronoHHMMSSCC(objJSON.time_chrono);
				}
				else
				{
					const time_inter = adv.GetChronoHHMMSSCC(objJSON.time_chrono);
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
					elemRank.innerHTML = tRanking.GetCellRank('Cltc'+course_phase_inter, k);
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

//	alert('OnBroadcastPenaltyAdd bib='+bib+', porte='+porte+', pena='+pena);
	SetOnCoursePenalty(bib, porte, pena);
	
	const course_phase = canoe.GetCodeCoursePhase();
	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
	
	for (let row=0;row<tRanking.GetNbRows();row++)
	{
		if (bib == tRanking.GetCell('Dossard', row))
		{
			const oldTps = tRanking.GetCellInt('Tps'+course_phase, row);
			const newTps = canoe.UpdateSlalomPena(tRanking, row, porte, pena);
		
			if (newTps != oldTps)
				RefreshFinishTime(tRanking, row, newTps);

			break;
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
			elem[0].innerHTML = '';
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

function UpdateSlalomFinishTime(tRanking, row)
{
	const course_phase = canoe.GetCodeCoursePhase();
	const oldTps = tRanking.GetCellInt('Tps'+course_phase, row);
	const newTps = canoe.UpdateSlalomFinishTime(tRanking, row);
	
	if (newTps != oldTps)
		RefreshFinishTime(tRanking, row, newTps);
	
	return newTps;
}

function OnCommandCompetitionLoad(objJSON) 
{
	wsContext.notify_competitions = objJSON;

	document.getElementById("container_message").innerHTML = '';
   	document.getElementById("navigation_epreuve").style.display = 'none';
    
   	document.getElementById("title").innerHTML = 'Live CompetFFCK';
    document.getElementById("sub_title").innerHTML = 'Liste des Compétitions';

	const tCompetitions = adv.GetTableUnique(wsContext.notify_competitions, 'competitions');

	var html;
	html  = '<table class="table table-striped">';

	html += '<thead><tr>';
	html += '<th class="text-center">'+GetTraduction('Codex')+'</th>';
	html += '<th class="text-center">'+GetTraduction('Activité')+'</th>';
	html += '<th class="text-center">'+GetTraduction('Nom')+'</th>';
	html += '<th class="text-center">'+GetTraduction('Date')+'</th>';
	html += '<th class="text-center">'+GetTraduction('Course')+'</th>';
	html += '<th class="text-center">'+GetTraduction('Phase')+'</th>';
	html += '<th class="text-center">'+GetTraduction('On line')+'</th>';
	html += '</tr></thead>';

	html += '<tbody>';
	for (let r = 0; r < tCompetitions.GetNbRows(); r++)
	{
		html += '<tr>'
		html += '<td class="text-center"><a href="#" >'+tCompetitions.GetCell('key', r)+'</a></td>';
		html += '<td class="text-center">'+tCompetitions.GetCell('Code_activite', r)+'</td>';
		html += '<td class="text-center">'+tCompetitions.GetCell('Nom', r)+'</td>';
		html += '<td class="text-center">'+tCompetitions.GetCell('Date_debut', r)+'</td>';
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
			const cmd = { key:'<race_load>', key_race:el.innerHTML };
			wsContext.wsCommand.send(JSON.stringify(cmd));
		})
	})

}

function OnCommandRaceLoad(objJSON) 
{
	wsContext.notify_race = objJSON;
	
//	alert("OnCommandRaceLoad :"+JSON.stringify(objJSON));
//	alert('Compétition '+canoe.GetCodeCompetition()+', Course '+canoe.GetCodeCourse()+', Phase'+ canoe.GetCodePhase());

   	document.getElementById("navigation_epreuve").style.display = 'block';
	document.getElementById("container_message").innerHTML = '';

	SetArrayColumns();
	
	SetBodyHeader();
	SetBodyEpreuves();
}

function SetBodyHeader() 
{
	const tCompetition = adv.GetTable(wsContext.notify_race, 'Competition');
	const tCompetition_Course = adv.GetTable(wsContext.notify_race, 'Competition_Course');
	const tCompetition_Course_Phase = adv.GetTable(wsContext.notify_race, 'Competition_Course_Phase');

	document.getElementById("title").innerHTML = tCompetition.GetCell('Nom', 0);
    document.getElementById("sub_title").innerHTML = tCompetition_Course.GetCell('Libelle', 0)+' - '+tCompetition_Course_Phase.GetCell('Libelle', 0);
	
//	const test = canoe.GetCodeActivite()+'/nbInter='+canoe.GetNbInter()+'/'+canoe.GetCodeCompetition()+'/'+canoe.GetCodeCoursePhase();
//	alert(test);
}

function GetTraduction(key)
{
	if (wsContext.traduction[key] == undefined)
		return key;
	else
		if (wsContext.lang == 'en')
			return wsContext.traduction[key].en;
		else
			return wsContext.traduction[key].fr;
}

function GetTraductionStateHTML(state) 
{
	if (wsContext.lang == 'en')
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
	if (typeof wsContext.notify_ranking === 'object')
		ReOrder();
	else if (typeof wsContext.notify_race == "object")
		ShowEpreuves();
}

function PrevEpreuve()
{
	const tEpreuves = adv.GetTable(wsContext.notify_race, 'Competition_Course_Phase_Manche_Epreuve');
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
					wsContext.wsCommand.send(JSON.stringify(cmd));
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
	const tEpreuves = adv.GetTable(wsContext.notify_race, 'Competition_Course_Phase_Manche_Epreuve');
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
					wsContext.wsCommand.send(JSON.stringify(cmd));
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
	SetBodyEpreuves(wsContext.notify_race);
}

function ShowPDF()
{
    const cmd = { key:'<pdf>',  type:'res' };
    wsContext.wsCommand.send(JSON.stringify(cmd));
}

function SetBodyEpreuves() 
{
	const tEpreuves = adv.GetTable(wsContext.notify_race, 'Competition_Course_Phase_Manche_Epreuve');

	var html;
	html  = '<table class="table table-striped">';
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
			wsContext.wsCommand.send(JSON.stringify(cmd));
		})
	})
}

function OnCommandEpreuveLoad(objJSON) 
{
//	alert("OnCommandEpreuveLoad :"+JSON.stringify(objJSON));
	wsContext.notify_ranking = objJSON;

	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
	canoe.SetColumnNameRanking(tRanking);
	
	const txtCoursePhase = canoe.GetCodeCoursePhase();
	tRanking.OrderBy('Cltc'+txtCoursePhase+',Heure_depart'+txtCoursePhase);
	
	document.getElementById("navigation_prev").classList.remove('disabled');
	document.getElementById("navigation_next").classList.remove('disabled');

	SetBodyEpreuve(true);
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
	wsContext.array_columns.length = 0;
	
	wsContext.array_columns.push({ "name" : "Cltc", "label" : GetTraduction('rk'), "style" : "rank", "context" : "course_phase" });
	wsContext.array_columns.push({ "name" : "Dossard", "label" : GetTraduction('bib'), "style" : "bib" });
	wsContext.array_columns.push({ "name" : "Bateau", "label" : GetTraduction('name'), "style" : "name" });
	
	if (canoe.GetCodeNiveau() == 'INT')
		wsContext.array_columns.push({ "context" : "nation" });
	else
		wsContext.array_columns.push({ "name" : "Club", "label" : GetTraduction('club'), "style" : "club" });
	
	if (canoe.GetCodeActivite() == 'SLA')
	{
		wsContext.array_columns.push({ "name" : "Tps_chrono", "label" : "Chrono", "style" : "chrono", "context" : "course_phase", "fmt" : 'HHMMSSCC' });
		wsContext.array_columns.push({ "context" : "inter_chrono" });
		wsContext.array_columns.push({ "context" : "pena_slalom" });
		wsContext.array_columns.push({ "name" : "Tps", "label" : GetTraduction('time_finish'), "style" : "time", "context" : "finish_start", "fmt" : 'XSCC' });
	}
	else
	{
		wsContext.array_columns.push({ "context" : "inter_chrono" });
		wsContext.array_columns.push({ "name" : "Tps_chrono", "label" : GetTraduction('time_finish'), "style" : "time", "context" : "finish_start", "fmt" : 'HHMMSSCC'});
	}
}

function GetCurrentEpreuve()
{
	if (typeof wsContext.notify_ranking === 'object')
		return wsContext.notify_ranking.epreuve;
	else
		return '';
}

function SetBodyEpreuve(changeScrolling=false)
{
	if (changeScrolling)
	{
		if (wsContext.scrolling_timeout != null)
		{
			window.clearTimeout(wsContext.scrolling_timeout);
			wsContext.scrolling_timeout = null;
		}
	}
	
	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking')
	const course_phase = canoe.GetCodeCoursePhase();
	const nbPorte = wsContext.notify_ranking.Nb_porte;
	const nbInter = canoe.GetNbInter();
	const currentEpreuve = GetCurrentEpreuve();
	
	const elEpreuve = document.getElementById("sel_epreuve");
	if (elEpreuve != null)
		elEpreuve.innerHTML = currentEpreuve;

	const elSubTitle = document.getElementById("sub_title");
	if (elSubTitle != null)
	{
		const tCompetition_Course = adv.GetTable(wsContext.notify_race, 'Competition_Course');
		const tCompetition_Course_Phase = adv.GetTable(wsContext.notify_race, 'Competition_Course_Phase');
		elSubTitle.innerHTML = tCompetition_Course.GetCell('Libelle', 0)+' - '+tCompetition_Course_Phase.GetCell('Libelle', 0)+" - "+currentEpreuve;
	}
	
	var html;
	html  = '<table class="table table-striped">';
	html += '<thead class="table-dark" id="onCourseHeader"><tr>';
	for (var i=0;i<wsContext.array_columns.length;i++)
	{
		if (wsContext.array_columns[i].hasOwnProperty('context'))
		{
			const columnContext = wsContext.array_columns[i].context;
			if (columnContext == 'course_phase' || columnContext == 'finish_start')
			{
				const columnName = wsContext.array_columns[i].name + course_phase;
				const style = wsContext.array_columns[i].style;
				var text_align = "text-center";
				if (style == 'rank' || style == 'chrono' || style == 'time')
					text_align = "text-end";
				html += '<th class="'+text_align+'" data-sort-header="'+columnName+'">'+wsContext.array_columns[i].label+'</th>';
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
					html += '<th class="text-end" data-sort-header="Cltc'+course_phase+'_inter'+k+'" colspan="2">Inter'+k+'</td>';
				}
			}
			else if (columnContext == "nation")
			{
				html += '<th class="text-center" data-sort-header="Code_nation">Nation</td>';
			}
		}
		else
		{
			const style = wsContext.array_columns[i].style;
			var text_align = "text-center";
			if (style == 'rank' || style == 'chrono' || style == 'time')
				text_align = "text-end";
			html += '<th class="'+text_align+'" data-sort-header="'+wsContext.array_columns[i].name+'">'+wsContext.array_columns[i].label+'</th>';
		}
	}
	html += '</tr></thead>';
	
	html += '<tbody id="onCourse">'
	
	var rMin = 0;
	var rMax = tRanking.GetNbRows()-1;
	if (wsContext.scrolling > 0)
	{
		rMin = wsContext.scrolling_start;
		rMax = rMin + wsContext.scrolling-1;
		if (rMax > tRanking.GetNbRows()-1)
			rMax = tRanking.GetNbRows()-1;
	}
	
	for (let r = rMin; r<=rMax; r++)
	{
		var bib = tRanking.GetCell('Dossard', r);
		html += '<tr data-bib="'+bib+'">'

		for (var i=0;i<wsContext.array_columns.length;i++)
		{
			if (wsContext.array_columns[i].hasOwnProperty('context'))
			{
				const columnContext = wsContext.array_columns[i].context;
				if (columnContext == 'course_phase')
				{
					const columnName = wsContext.array_columns[i].name + course_phase;
					if (wsContext.array_columns[i].hasOwnProperty('fmt'))
						html += '<td class="'+wsContext.array_columns[i].style+'">'+tRanking.GetCellFormat(columnName, r, wsContext.array_columns[i].fmt)+'</td>';
					else
						html += '<td class="'+wsContext.array_columns[i].style+'">'+tRanking.GetCellFormat(columnName, r)+'</td>';
				}
				else if (columnContext == 'finish_start')
				{
					const columnName = wsContext.array_columns[i].name + course_phase;
					const columnFmt = wsContext.array_columns[i].fmt;
					let tps = tRanking.GetCellInt(columnName, r, adv.chrono.KO);
					if (tps != adv.chrono.KO)
						html += '<td class="'+wsContext.array_columns[i].style+'">'+tRanking.GetCellFormat(columnName,r,columnFmt)+'</td>';
					else
						html += '<td class="'+wsContext.array_columns[i].style+'">['+tRanking.GetCellFormat('Heure_depart'+course_phase,r,'HHMMSS')+']</td>';
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
							html += '<td class="gate" data-col="'+p.toString()+'" data-pen="-1"/>';
					}
				}
				else if (columnContext == "inter_chrono")
				{
					for (let k=1;k<=nbInter;k++)
					{
						html += '<td class="rank_inter" data-inter="'+k+'">'+tRanking.GetCellRank('Cltc'+course_phase+'_inter'+k, r)+'</td>';
						html += '<td class="time_inter" data-inter="'+k+'">'+tRanking.GetCellChrono('Tps'+course_phase+'_inter'+k, r, 'HHMMSSCC')+'</td>';
					}
				}
				else if (columnContext == "nation")
				{
					const code_nation = tRanking.GetCell('Code_nation', r);
					var img_nation = "./img/Flags/empty.png";
					if (code_nation != '')
						img_nation = "./img/Flags/"+code_nation+".png";
					
					html += '<td class="nation">'+code_nation+'&nbsp;<img src="'+img_nation+'" alt="" height="16" width="16" /></td>';
				}
			}
			else
			{
				if (wsContext.array_columns[i].hasOwnProperty('fmt'))
				{
					const fmt = wsContext.array_columns[i].fmt;
					html += '<td class="'+wsContext.array_columns[i].style+'">'+tRanking.GetCellFormat(wsContext.array_columns[i].name, r, fmt)+'</td>';
				}
				else
				{
					html += '<td class="'+wsContext.array_columns[i].style+'">'+tRanking.GetCellFormat(wsContext.array_columns[i].name, r)+'</td>';
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
		if (wsContext.scrolling > 0)
		{
			wsContext.scrolling_start = rMax+1;
			if (wsContext.scrolling_start > tRanking.GetNbRows()-1)
				wsContext.scrolling_start = 0;

			wsContext.scrolling_timeout = window.setTimeout(function () { SetBodyEpreuve(true); }, wsContext.scrolling_delay);
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
} 

function Init()
{
	wsContext.url = wsParams.url;
	wsContext.port = wsParams.port;

	wsContext.lang = 'fr';
	wsContext.traduction = {
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
		wsContext.lang = urlParams.get('lang')
	
	document.getElementById("navigation_prev").innerHTML = '&lt;&lt;&nbsp;'+GetTraduction('prev');
	document.getElementById("navigation_next").innerHTML = GetTraduction('next')+'&nbsp;>>';
	
	wsContext.scrolling = 0;
	wsContext.scrolling_start = 0;
	wsContext.scrolling_delay = 15000;
	wsContext.scrolling_timeout = null;
	
	if (urlParams.has('scrolling'))
	{
		wsContext.scrolling = parseInt(urlParams.get('scrolling'));
		if (urlParams.has('delay'))
			wsContext.scrolling_delay = parseInt(urlParams.get('delay'))*1000;
//		alert('scrolling='+wsContext.scrolling);
	}
	
	wsContext.array_columns = new Array(),

	// Command Notification
	wsContext.mapCommand.set('<competition_load>', OnCommandCompetitionLoad);
	wsContext.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsContext.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	wsContext.mapCommand.set('<pdf>', OnCommandPDF);
	
	// Broadcast Notification
	wsContext.mapCommand.set('<bib_time>', OnBroadcastBibTime);
	wsContext.mapCommand.set('<penalty_add>', OnBroadcastPenaltyAdd);
	wsContext.mapCommand.set('<mode_chrono>', OnBroadcastModeChrono);
	wsContext.mapCommand.set('<run_erase>', OnBroadcastRunErase);
	
	// Flow Notification
	wsContext.mapCommand.set('<on_course>', OnFlowOnCourse);

	// Ouverture ws 
	wsContext.OpenWebSocketCommand(OnOpenWebSocketCommand);

	// Navigation 
	[].forEach.call(document.querySelectorAll('ul#navigation li a'), function(el) {
		el.addEventListener('click', function() {
			const nav = el.getAttribute('data-nav');
			if (nav == 'epreuve') SetBodyEpreuves(wsContext.notify_race);
			else if (nav == 'refresh') document.location.reload();
		})
	})
}
