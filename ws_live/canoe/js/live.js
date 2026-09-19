// Version avec correction de live sept 2023
function OnOpenWebSocketCommand()
{
	document.getElementById("container_message").innerHTML = '';
	wsMain.websocket.send(JSON.stringify({key : '<competition_load>' }));
}

function OnFlowOnCourse(objJSON) 
{
	if (wsMain.scrolling > 0)
	{
		if (objJSON.epreuve !== undefined)
		{
			if ((objJSON.epreuve != GetCurrentEpreuve())&&(wsMain.all_categ!=1)) // si all on ne change pas de catégorie auto
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
					elemTime.innerHTML = tOnCourse.GetCellChrono('time', i, wsMain.fmtChronoOnCourse);
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
	tRanking.OrderBy('Code_categorie ,Cltc'+txtCoursePhase+',Heure_depart'+txtCoursePhase);
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
	wsMain.notify_competitions = objJSON;

	document.getElementById("container_message").innerHTML = '';
   	document.getElementById("navigation_epreuve").style.display = 'none';
    
   	document.getElementById("title").innerHTML = 'Live CompetFFCK';
    document.getElementById("sub_title").innerHTML = 'Liste des Compétitions';

	const tCompetitions = adv.GetTableUnique(wsMain.notify_competitions, 'competitions');

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

	//SetArrayColumns();
	
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

	if (wsMain.mini==1)
		document.getElementById("title").innerHTML = tCompetition.GetCell('Nom', 0)+' - '+tCompetition_Course_Phase.GetCell('Libelle', index_phase);
	else
	{
		document.getElementById("title").innerHTML = tCompetition.GetCell('Nom', 0);
		document.getElementById("sub_title").innerHTML = tCompetition_Course.GetCell('Libelle', 0)+' - '+tCompetition_Course_Phase.GetCell('Libelle', index_phase);
	}
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
	wsMain.scrolling_start = 0;
	window.clearTimeout(wsMain.scrolling_timeout);
	wsMain.scrolling_timeout=null;

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
	wsMain.scrolling_start = 0;
	window.clearTimeout(wsMain.scrolling_timeout);
	wsMain.scrolling_timeout=null;

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

function ShowPDF()
{
    const cmd = { key:'<pdf>',  type:'res' };
    wsMain.websocket.send(JSON.stringify(cmd));
}

function SetBodyEpreuves() 
{
	const tEpreuves = canoe.GetTable('Competition_Course_Phase_Manche_Epreuve');
	wsMain.scrolling_start = 0;
	window.clearTimeout(wsMain.scrolling_timeout);
	wsMain.scrolling_timeout=null;

	var html;
	html  = '<table class="table table-striped">';
	html += '<thead><tr>';
	html += '<th class="text-center">'+GetTraduction('categ')+'</th>';
	html += '<th class="text-center">'+GetTraduction('state')+'</th>';
	html += '</tr></thead>';
	html += '<tbody>';	
	
	if (wsMain.all_categ > 0) {
		html += '<tr>';
		html += '<td class="text-center"><button id="all" class="btn btn-primary" style="width: auto !important;">Toutes les catégories</button></td>';
		html += '<td class="text-center"></td>';
		html += '</tr>';
	}
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

	if (wsMain.all_categ > 0) {
		document.getElementById("all").addEventListener('click', function() {
			const cmd = { key : '<epreuve_load>' };
			wsMain.websocket.send(JSON.stringify(cmd));
			wsMain.aff_categ=1;
		});
}

	[].forEach.call(document.querySelectorAll('#main table td button'), function(el) {
		el.addEventListener('click', function() {
			const r = parseInt(el.getAttribute("data-row"));
			const epreuve = tEpreuves.GetCell('Libelle_court', r);
			const cmd = { key : '<epreuve_load>', epreuve : epreuve };
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

	const txtCoursePhase = canoe.GetCodeCoursePhase();
	tRanking.OrderBy('Code_categorie ,Cltc'+txtCoursePhase+',Heure_depart'+txtCoursePhase);
	
	if (wsMain.all_categ==0) 
	{
		document.getElementById("navigation_prev").classList.remove('disabled');
		document.getElementById("navigation_next").classList.remove('disabled');
	}
	SetArrayColumns();
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
	wsMain.array_columns.length = 0;

	if (wsMain.aff_categ==1) 	 // On affiche la catégorie devant le nom si toutes catégories
		wsMain.array_columns.push({ "name" : "Code_categorie", "label" : GetTraduction('mini_categ'), "style" : "categorie" });

	wsMain.array_columns.push({ "name" : "Cltc", "label" : GetTraduction('rk'), "style" : "rank", "context" : "course_phase" });
	wsMain.array_columns.push({ "name" : "Dossard", "label" : GetTraduction('bib'), "style" : "bib" });
	wsMain.array_columns.push({ "name" : "Bateau", "label" : GetTraduction('name'), "style" : "name" });
	
	if ((wsMain.club===1)||((wsMain.club===0)&&(canoe.GetNbPorte()===0)))
		if (canoe.GetCodeNiveau() == 'INT')
			wsMain.array_columns.push({ "context" : "nation" });
		else
			wsMain.array_columns.push({ "name" : "Club", "label" : GetTraduction('club'), "style" : "club" });
	
	if (canoe.GetCodeActivite() == 'SLA')
	{
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
		
		const code_phase = canoe.GetCodePhase();
		var index_phase = 0;
		if (tCompetition_Course_Phase.GetNbRows() >= code_phase && code_phase > 0)
			index_phase = code_phase-1;

		elSubTitle.innerHTML = tCompetition_Course.GetCell('Libelle', 0)+' - '+tCompetition_Course_Phase.GetCell('Libelle', index_phase)+" - "+currentEpreuve;
	}
	
	var html;
	html  = '<table class="table table-striped">';
	if (wsMain.podium==0) 
	{
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
					if (wsMain.pena==1)
						for (let p = 1; p <= nbPorte; p++)
						{
							if (canoe.IsPorteInv(p))
								html += '<th class="gate_inv">'+p.toString()+'</th>';
							else
								html += '<th>'+p.toString()+'</th>';
						}
					else
					{
						html += '<th>Péna</th>';
					}
				}
				else if (columnContext == "inter_chrono")
				{
					for (let k=1;k<=nbInter;k++)
					{
						html += '<th class="text-end" data-sort-header="Cltc_chrono'+course_phase+'_inter'+k+'" colspan="2">Inter'+k+'</td>';
					}
				}
				else if (columnContext == "nation")
				{
					html += '<th class="text-center" data-sort-header="Code_nation">Nation</td>';
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
	}
	
	html += '<tbody id="onCourse">'

// Contenu du tableau
// On compte le nombre de bateaux arrivés pour la gestion de l'affichage sans les bateaux avec horaire dep. et le nombre dans le classement voulu pour le podium
	var nb_finish=0;
	var nb_affiche=0;
	var nb_podium=0;
	var dernier_arrivee=0;
	for (let r = 0; r<=tRanking.GetNbRows()-1; r++)
	{
		for (var i=0;i<wsMain.array_columns.length;i++)
		{
			if (wsMain.array_columns[i].hasOwnProperty('context'))
			{
				const columnContext = wsMain.array_columns[i].context;
				if (columnContext == 'course_phase')
				{
					const columnName = wsMain.array_columns[i].name + course_phase;
					var classement=""	 
					if (wsMain.array_columns[i].name=="Cltc") {
						if (wsMain.array_columns[i].hasOwnProperty('fmt'))
							classement = tRanking.GetCellInt(columnName, r, wsMain.array_columns[i].fmt);
						else
							classement=tRanking.GetCellInt(columnName, r);
						if (classement)	{
							if (nb_finish==0) dernier_arrivee=r;
							nb_finish++;
						}
						if (classement>0 && classement<=wsMain.podium) nb_podium++;	
					}
				}
			}
		}

	}

// Selon les options on affiche tout avec horaires ou que les bateaux arrivés ou le podium
	if (wsMain.podium>0) 
	{
		nb_affiche=nb_podium;
		tRanking.OrderBy('Cltc'+course_phase+',Heure_depart'+course_phase);
	}
	else
		if (wsMain.horaire==1||nb_finish==0) // On affiche tout mode par defaut 
		nb_affiche=tRanking.GetNbRows();	
	else 
		if (wsMain.last_finish>0) // On affiche les derniers dossards arrivés
		{
			nb_affiche=Math.min(wsMain.last_finish,nb_finish);
			tRanking.OrderBy('Heure_depart'+canoe.GetCodeCoursePhase()+' DESC');
		//	tRanking.OrderBy('Heure_arrivee_reel'+canoe.GetCodeCoursePhase()+' DESC'); TODO a MODIFIER QUAND COMPETFFCK LE PRENDRA EN CHARGE 
		}
	else	// On affiche le classement seulement sans les horaires de départ
	{
		nb_affiche=nb_finish;
		tRanking.OrderBy('Code_categorie ,Cltc'+course_phase+',Heure_depart'+course_phase);
	}
		
	var rMin = 0;
	var rMax = nb_affiche-1;
	if (wsMain.scrolling > 0)
	{
		if (wsMain.last_finish>0)
			{
				rMin = dernier_arrivee + wsMain.decalage; 
				rMax = rMin + wsMain.last_finish-1;	
			}
			else
			{
				rMin = wsMain.scrolling_start;
				rMax = rMin + wsMain.scrolling-1;
				if (rMax > nb_affiche-1)
					rMax = nb_affiche-1;
			}
	}
let lg_tab=-1;
	for (let r = rMin; r<=rMax; r++)
	{
		var bib = tRanking.GetCell('Dossard', r);
		var html_cour="";
		var classement=0;
		lg_tab++;
		html_cour += '<tr data-bib="'+bib+'">'

		for (var i=0;i<wsMain.array_columns.length;i++)
		{
			if (wsMain.array_columns[i].hasOwnProperty('context'))
			{
				const columnContext = wsMain.array_columns[i].context;
				if (columnContext == 'course_phase')
				{
					const columnName = wsMain.array_columns[i].name + course_phase;
					if (wsMain.array_columns[i].hasOwnProperty('fmt'))
						html_cour += '<td class="'+wsMain.array_columns[i].style+'">'+tRanking.GetCellFormat(columnName, r, wsMain.array_columns[i].fmt)+'</td>';
					else
						html_cour += '<td class="'+wsMain.array_columns[i].style+'">'+tRanking.GetCellFormat(columnName, r)+'</td>';
				}
				else if (columnContext == 'finish_start')
				{
					const columnName = wsMain.array_columns[i].name + course_phase;
					const columnFmt = wsMain.array_columns[i].fmt;
					let tps = tRanking.GetCellInt(columnName, r, adv.chrono.KO);
					if (tps != adv.chrono.KO)
					{
						classement=1;
						html_cour += '<td class="'+wsMain.array_columns[i].style+'">'+tRanking.GetCellFormat(columnName,r,columnFmt)+'</td>';
					}
					else
						html_cour += '<td class="'+wsMain.array_columns[i].style+'">['+tRanking.GetCellFormat('Heure_depart'+course_phase,r,'HHMMSS')+']</td>';
				}
				else if (columnContext == "pena_slalom")
				{
					var html_pena=""
					var totalpena = tRanking.GetCell('Total_pena'+course_phase, r);
					if (totalpena===-1)	totalpena="";
					for (let p = 1; p <= nbPorte; p++)
					{
						var pen = tRanking.GetCell('Pena_'+p.toString(), r);
						if (pen == '0')
							html_pena += '<td class="gate" data-col="'+p.toString()+'" data-pen="0"/>';
						else if (pen == '2')
							html_pena += '<td class="gate" data-col="'+p.toString()+'" data-pen="2">2</td>';
						else if (pen == '50')
							html_pena += '<td class="gate" data-col="'+p.toString()+'" data-pen="50">50</td>';
						else
							html_pena += '<td class="gate" data-col="'+p.toString()+'" data-pen="-1">&nbsp;</td>';
					}
					if (wsMain.pena==1)  // On affiche toutes les péna ou simplement le total ()
						html_cour+=html_pena;
					else
						html_cour+='<td class="penalite" >'+totalpena+'</td>';

				}
				else if (columnContext == "inter_chrono")
				{
					for (let k=1;k<=nbInter;k++)
					{
						html_cour += '<td class="rank_inter" data-inter="'+k+'">'+tRanking.GetCellRank('Cltc_chrono'+course_phase+'_inter'+k, r)+'</td>';
						html_cour += '<td class="time_inter" data-inter="'+k+'">'+tRanking.GetCellChrono('Tps_chrono'+course_phase+'_inter'+k, r, 'HHMMSSCC')+'</td>';
					}
				}
				else if (columnContext == "nation")
				{
					const code_nation = tRanking.GetCell('Code_nation', r);
					var img_nation = "./img/Flags/empty.png";
					if (code_nation != '')
						img_nation = "./img/Flags/"+code_nation+".png";
					
					html_cour += '<td class="nation">'+code_nation+'&nbsp;<img src="'+img_nation+'" alt="" height="16" width="16" /></td>';
				}
			}
			else
			{
				if (wsMain.array_columns[i].hasOwnProperty('fmt'))
				{
					const fmt = wsMain.array_columns[i].fmt;
					html_cour += '<td class="'+wsMain.array_columns[i].style+'">'+tRanking.GetCellFormat(wsMain.array_columns[i].name, r, fmt)+'</td>';
				}
				else
				{
					html_cour += '<td class="'+wsMain.array_columns[i].style+'">'+tRanking.GetCellFormat(wsMain.array_columns[i].name, r)+'</td>';
				}
			}
		}
				
		html_cour += '</tr>';
		if ((!((wsMain.last_finish>0)&&(classement==0))  )  && (!((wsMain.horaire==0)&&(classement==0)&&(nb_finish>0)) ))
			html += html_cour;
		else
			rMax= Math.min(rMax+1,tRanking.GetNbRows()-1)

	}
	html += '</tbody>';
	
	html += '</table>';
	document.getElementById("main").innerHTML = html;
	if (wsMain.tampon!==html)
	{
	 	wsMain.tampon=html;
		TextResize();
	 	wsMain.tamponsvg=document.getElementById("main").innerHTML;
	}
	else
		document.getElementById("main").innerHTML=wsMain.tamponsvg;
	
	if (changeScrolling)
	{
		if (wsMain.scrolling > 0)
		{
			wsMain.scrolling_start = rMax+1;
			if (wsMain.scrolling_start > nb_affiche-1)
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
} 

function TextResize()
{
	if (wsMain.classreduct.length>0)
	{
		var elements;
		var zonetemp = "texte_temp"; // Parametrage du div caché
		if (document.getElementById(zonetemp)==null)
			document.body.insertAdjacentHTML("afterend","<div id='texte_temp'  style='visibility:hidden;position:fixed;left: 0px;bottom: 0px;white-space:nowrap;display:inline-block;width:auto;'><div>")				
		var zonetempElement = document.getElementById(zonetemp);

		wsMain.classreduct.forEach(function(nameclass)
		{
			elements = document.getElementsByClassName(nameclass);
			if (elements.length>0) {
				// Recupere la taille de la police et le style (Gras...) et largeur de la cellule
				var fontweight = window.getComputedStyle(elements[0]).getPropertyValue('font-weight')
				var fontsize =  wsMain.fontsize;// parseInt(window.getComputedStyle(elements[0]).getPropertyValue('font-size'))
				var padding = parseInt(window.getComputedStyle(elements[0]).getPropertyValue('padding-right'))
				
				zonetempElement.style.fontSize=(fontsize)?fontsize:"";	
				zonetempElement.style.fontWeight=(fontweight)?parseInt(fontweight):"";
				var cellwidth = elements[0].offsetWidth-2*padding;

				[].forEach.call(document.getElementsByClassName(nameclass),function(el) {
					var text=el.innerHTML;
					zonetempElement.innerHTML=text; 
					var tmpwidth=parseInt(zonetempElement.offsetWidth);	
					var fontsize_cour=fontsize
					if (tmpwidth>cellwidth) 
					{
						if (nameclass==="name")
						{
							const equipiers = text.split('/');
							for (j in equipiers)
							{
								chaine = equipiers[j].split(' ')
								chaine[chaine.length-1]=chaine[chaine.length-1][0]+"."	
								equipiers[j]=chaine.join(' ')
							}
							text=equipiers.join("/")
						}
						zonetempElement.innerHTML=text; 
						tmpwidth=parseInt(zonetempElement.offsetWidth);
						fontsize_cour=Math.min((fontsize*cellwidth)/tmpwidth,fontsize);
					}
					el.innerHTML=`<div style='width:${cellwidth}px !important; font-size:${fontsize_cour}px; white-space:nowrap; overflow: hidden;'>${text}</div>`;
				}
				);
			}
		});
	}
}

function ReadMessage(event){
	const message=event.data
	var urlObj = new URL(document.getElementById("logo").href, window.location.href);

	if (message.entete!== undefined)
	{	
		document.getElementById('header').style.display = message.entete===0?"none":"";
		urlObj.searchParams.set('entete', message.entete);
	}
	
	['last_finish', 'scrolling', 'scrolling_delay', 'decalage'].forEach(el => {
	  if (message[el] !== undefined) {
		wsMain[el] = parseInt(message[el]);
		urlObj.searchParams.set(el, message[el]);
	  }
	});

	document.getElementById("logo").href=urlObj.toString();
}

////////// Variables globales et Initialisation  //////////
const wsMain = new ws.Context(wsParams.url, wsParams.port);

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
		'mini_categ': { en : 'Cat.', fr : 'Epr.' },
		'prev': { en : 'Previous', fr : 'Précédent' }, 
		'next': { en : 'Next', fr : 'Suivant' }
	};
	
	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);
	let options="";

	if (urlParams.has('lang'))
		wsMain.lang = urlParams.get('lang')
	
	document.getElementById("navigation_prev").innerHTML = '&lt;&lt;&nbsp;'+GetTraduction('prev');
	document.getElementById("navigation_next").innerHTML = GetTraduction('next')+'&nbsp;>>';
	
	wsMain.scrolling = 0;
	wsMain.scrolling_start = 0;
	wsMain.scrolling_delay = 15000;
	wsMain.scrolling_timeout = null;
	wsMain.podium=0; // n'affiche que les X premiers bateaux avec gestion ex aequo
	wsMain.horaire=1; // si horaire=0 n'affiche pas les bateaux non partis
	wsMain.last_finish=0;
	wsMain.all_categ=0; // si 1 on affiche le bouton toutes les catégories
	wsMain.aff_categ=0; // 1 on affiche la colonne catégorie
	wsMain.club=1; // On affiche la colonne club
	wsMain.pena=1;
	wsMain.fontsize=16;
	wsMain.classreduct=[];  // liste des class dont le texte est à adapter à la taille de la cellule
	wsMain.tampon='';
	wsMain.tamponsvg='';
	
	if (urlParams.has('textadapt')) 
	{
		wsMain.classreduct= urlParams.get('textadapt').split(';');
	}

	if (urlParams.has('all')) 
	{
		wsMain.all_categ=1;
		options+="&all";
	}

	if (urlParams.has('no_club')) 
	{
		wsMain.club=0;
		options+="&no_club";
	}
	if (urlParams.has('no_pena')) 
	{
		wsMain.pena=0;
		options+="&no_pena";
	}
	
	if (urlParams.has('podium')) 
	{
		wsMain.podium = parseInt(urlParams.get('podium'));
		options+="&podium="+wsMain.podium;
		wsMain.scrolling=5; // il faut juste être positif pour recalculer l'affichage
		wsMain.scrolling_delay=100;
		if (wsMain.podium>0)
		document.getElementById('titre').innerHTML="Premiers"
	}
	
	if (urlParams.has('horaire'))
	{
		wsMain.horaire = parseInt(urlParams.get('horaire'));
		options+="&horaire="+wsMain.horaire;
	}	
	if (urlParams.has('last_finish')) 
	{
		wsMain.last_finish = parseInt(urlParams.get('last_finish'));	
		options+="&last_finish="+wsMain.last_finish;
		if (!wsMain.last_finish>0)
			wsMain.last_finish=100000;
		document.getElementById('titre').innerHTML="Dernières arrivées"
		wsMain.scrolling_delay=100;
		wsMain.horaire = 0;
		wsMain.scrolling=wsMain.last_finish; 	
		wsMain.all_categ=1;
	}
	
	if (urlParams.has('decalage')) 
	{
		wsMain.decalage = parseInt(urlParams.get('decalage'));
		options+="&decalage="+wsMain.decalage;
	}
	else
	wsMain.decalage = 0
	
	if (urlParams.has('titre')) 
	{
		document.getElementById('titre').innerHTML=urlParams.get('titre');	
		options+="&titre="+urlParams.get('titre');
	}

	if (urlParams.has('mini'))
	{
		wsMain.mini= parseInt(urlParams.get('mini'));
		options+="&mini="+wsMain.mini;
		if (wsMain.mini==1)
			document.getElementById('navigation_epreuve').style.padding = '0px';
			document.getElementById('sub_title').style.display = "none";
			document.getElementById('header').style.minHeight  = "70px";	
	}	
	if (urlParams.has('entete'))
		if (parseInt(urlParams.get('entete'))==0)
		{
			options+="&entete=0";
			document.getElementById('header').style.display = "none";
		}
	if (urlParams.has('saut'))
		if (parseInt(urlParams.get('saut'))==0)
		{
			options+="&saut=0";
			document.getElementById('saut').style.display = "none";
		}
	if (urlParams.has('scrolling'))
	{
		wsMain.scrolling = parseInt(urlParams.get('scrolling'));
		options+="&scrolling="+wsMain.scrolling;
	}
	if (urlParams.has('delay'))
	{
		options+="&delay="+parseInt(urlParams.get('delay'));
		wsMain.scrolling_delay = parseInt(urlParams.get('delay'))*1000;
	}

	wsMain.fmtChronoOnCourse = 'HHMMSS';
	if (urlParams.has('fmt_chrono_on_course'))
	{
		wsMain.fmtChronoOnCourse = urlParams.get(fmt_chrono_on_course);
	}

	if (options!="")
		document.getElementById("logo").href="./live.html?"+options;
	
	wsMain.array_columns = new Array(),

	// Command Notification
	wsMain.mapCommand.set('<competition_load>', OnCommandCompetitionLoad);
	wsMain.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsMain.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.mapCommand.set('<pdf>', OnCommandPDF);
	
	// Broadcast Notification
	wsMain.mapCommand.set('<bib_time>', OnBroadcastBibTime);
	wsMain.mapCommand.set('<penalty_add>', OnBroadcastPenaltyAdd);
	wsMain.mapCommand.set('<mode_chrono>', OnBroadcastModeChrono);
	wsMain.mapCommand.set('<run_erase>', OnBroadcastRunErase);
	
	// Flow Notification
	wsMain.mapCommand.set('<on_course>', OnFlowOnCourse);

	// Ouverture ws 
	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);

	// Navigation 
	[].forEach.call(document.querySelectorAll('ul#navigation li a'), function(el) {
		el.addEventListener('click', function() {
			const nav = el.getAttribute('data-nav');
			if (nav == 'epreuve') SetBodyEpreuves();
			else if (nav == 'refresh') document.location.reload();
		})
	})

	// Gestion des tailles des textes
	window.addEventListener('resize', TextResize);
	// Dialogue si dans iframe
	window.addEventListener('message', ReadMessage);
}

