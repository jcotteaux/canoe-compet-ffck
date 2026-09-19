function OnOpenWebSocketCommand()
{
	wsContext.wsCommand.send(JSON.stringify({key : '<race_load>', key_race : '*' }));
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

	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
	canoe.SetColumnNameRanking(tRanking);

	const course_phase = canoe.GetCodeCoursePhase();
	tRanking.OrderBy('Tps'+course_phase+', Dossard');
	
	wsContext.nb_porte = wsContext.notify_ranking.Nb_porte;
	const elemPena = document.querySelector('#block_running div.pena');
	if (elemPena && typeof elemPena === "object")
	{
		var html = '<table><tr>';
		for (let p=1;p<=wsContext.nb_porte;p++)
		{
			html += "<td class='gate' data-pen='-1' data-col='"+p+"'>&nbsp;</td>";
		}
		html += '</tr></table>';
		elemPena.innerHTML = html;
	}

/* test rank 
	alert('course_phase='+course_phase);
	const rkTest = tRanking.ComputeRankBib('Tps'+course_phase, '134', 'Code_categorie');
	alert('rkTest='+rkTest);
*/
/* test diff
	const bestTime = tRanking.GetBestTime('Tps'+course_phase, 'Code_categorie');
	alert('bestTime='+bestTime);
	const i = tRanking.GetIndexRow('Dossard', '134');
	const diff_categ = tRanking.GetDiffTime('Tps'+course_phase, i, 'Code_categorie');
	alert('diff_categ='+diff_categ);
	alert(adv.GetChronoDiffMMSSCC(diff_categ)); 
*/
}

function OnBroadcastModeChrono(objJSON)
{
	Reload();
}

function OnBroadcastPenaltyAdd(objJSON) 
{
	const bib = objJSON.bib;
	const porte = objJSON.gate;
	const pena = objJSON.penalty;

	const course_phase = canoe.GetCodeCoursePhase();
	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
	for (let row=0;row<tRanking.GetNbRows();row++)
	{
		if (bib == tRanking.GetCell('Dossard', row))
		{
			const oldTps = tRanking.GetCellInt('Tps'+course_phase, row);
			const newTps = canoe.UpdateSlalomPena(tRanking, row, porte, pena);

			if (wsContext.running_bib == bib)
			{
				if (wsContext.timeoutFinish != null)
				{
					const timerRestart = false;
					ShowRunningFinish(tRanking, row, course_phase, timerRestart);
				}
			}
			break;
		}
	}
	
	if (wsContext.running_bib == bib)
		SetOnCoursePenalty(porte, pena);
}

function SetOnCoursePenalty(gate, pena)
{
	const elem = document.querySelectorAll('#block_running div.pena td[data-col="'+gate.toString()+'"]');
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

function DoBroadcastBibTimeInter(objJSON, passage) 
{
	if (bib == wsContext.running_bib)
	{
		if (time_chrono != adv.chrono.KO && time_chrono != adv.chrono.DNS && wsContext.timeoutFinish == null)
			ShowRunningInter(time_chrono, diff_categ);
	}
}

function DoBroadcastBibTimeFinish(objJSON) 
{
//	alert("DoBroadcastBibTimeFinish :"+JSON.stringify(objJSON));
	
	const bib = objJSON.bib;
	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
	const course_phase = canoe.GetCodeCoursePhase();
	const codeActivite = canoe.GetCodeActivite();
	
	for (let i=0;i<tRanking.GetNbRows();i++)
	{
		if (bib == tRanking.GetCell('Dossard', i))
		{
			const tpsChrono = objJSON.time_chrono;
			tRanking.SetCell('Tps_chrono'+course_phase,i, tpsChrono);
			const oldTps = tRanking.GetCellInt('Tps'+course_phase, i);
			const newTps = canoe.UpdateSlalomFinishTime(tRanking, i);
			if (tpsChrono != adv.chrono.KO && tpsChrono != adv.chrono.DNS)
			{
				const timerRestart = true;
				ShowRunningFinish(tRanking, i, course_phase, timerRestart);
			}
			break;
		}
	}
}

function OnBroadcastRunErase(objJSON)
{
	Reload();
}

function Reload()
{
	if (wsContext.timeoutFinish != null)
	{
		window.clearTimeout(wsContext.timeoutFinish);
		wsContext.timeoutFinish = null;
	}

	if (wsContext.timeoutInter != null)
	{
		window.clearTimeout(wsContext.timeoutInter);
		wsContext.timeoutInter = null;
	}
	
	OnOpenWebSocketCommand();
	ClearRunning();
}

function OnFlowOnCourse(objJSON)
{
	if (wsContext.timeoutFinish != null || wsContext.timeoutInter != null)
		return;

	const tOnCourse = adv.GetTableUnique(objJSON, 'table');
	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
	if (tOnCourse && typeof tOnCourse === 'object')
	{
		const nb = tOnCourse.GetNbRows();
		if (wsContext.running_bib > 0)
		{
			const i = tOnCourse.GetIndexRow('bib', wsContext.running_bib);
			if (i >= 0)
			{
				let time_running = tOnCourse.GetCellInt('time', i);
				//alert('ok');
				const row = tRanking.GetIndexRow('Dossard', wsContext.running_bib);
					
				if (row >= 0)
				{
					const time_pena = canoe.GetCurrentSlalomTotalPena(tRanking, row)*1000;
					time_running += time_pena;
				}
			

				document.querySelector("#block_running .time").innerHTML = adv.GetChrono(time_running, 'XSCC');

				return;
			}
		}
		
		if (nb > 0)
		{		
			if (typeof wsContext.notify_ranking === 'object')
			{
				wsContext.running_bib = tOnCourse.GetCell('bib', nb-1);
				 
				const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
				const i = tRanking.GetIndexRow('Dossard', wsContext.running_bib);

				if (i >= 0)
				{
					ShowRunning(tRanking, i, tOnCourse.GetCellChrono('time', nb-1, 'HHMMSSCC'));
					return;
				}
			}
		}

		wsContext.running_bib = -1;
		ClearRunning();
	}
}

function ClearRunning()
{
	document.querySelector('#block_running .bib').innerHTML = '';
	document.querySelector('#block_running .identity').innerHTML = '';
	document.querySelector('#block_running .nation').innerHTML = '';

	for (let p=1;p<=wsContext.nb_porte;p++)
		SetOnCoursePenalty(p, '');

	document.querySelector('#block_running .rank').innerHTML = '';
	document.querySelector('#block_running .time').innerHTML = '';
	document.querySelector('#block_running .diff').innerHTML = '';
	
	document.querySelector('#block_running .rank').style.display = 'none';
	document.querySelector('#block_running .diff').style.display = 'none';
}

function ShowRunning(tRanking, i, time_running)
{
	document.querySelector('#block_running .bib').innerHTML = tRanking.GetCell('Dossard', i);
	document.querySelector('#block_running .identity').innerHTML = tRanking.GetCell('Bateau', i);
//	document.querySelector('#block_running .nation').innerHTML = "<img src='./img/flags/"+tRanking.GetCell('Club', i)+".png' height='40' width='64' />";
	document.querySelector('#block_running .nation').innerHTML = "<img src='./img/flags/FRA.png' height='40' width='64' />";

	const course_phase = canoe.GetCodeCoursePhase();
	for (let p=1;p<=wsContext.nb_porte;p++)
	{
		const valPena = tRanking.GetCell('Pena_'+p.toString(), i);
		SetOnCoursePenalty(p, valPena);
	}
//	const time_pena = canoe.GetCurrentSlalomTotalPena(tRanking, i)*1000;
//	time_running += time_pena;

	document.querySelector('#block_running .time').innerHTML = time_running;
	
	document.querySelector('#block_running .rank').innerHTML = '';
	document.querySelector('#block_running .diff').innerHTML = '';

	document.querySelector('#block_running .rank').style.display = 'none';
	document.querySelector('#block_running .diff').style.display = 'none';
}

function ShowRunningInter(time_chrono, diff_categ)
{
	if (wsContext.timeoutInter != null)
		window.clearTimeout(wsContext.timeoutInter);
	wsContext.timeoutInter = window.setTimeout(function() { wsContext.timeoutInter = null; }, wsContext.timeoutInterDelay);
	
	document.querySelector('#block_running .time').innerHTML = adv.GetChrono(time_chrono, 'HHMMSSCC');
	document.querySelector('#block_running .rank').style.display = 'none';
	
	if (diff_categ === undefined)
	{
		document.querySelector('#block_running .diff').style.display = 'none';
	}
	else
	{
		document.querySelector('#block_running .diff').innerHTML = adv.GetChronoDiffMMSSCC(diff_categ);
		document.querySelector('#block_running .diff').style.display = 'flex';
	
		if (diff_categ > 0)
		{
			document.querySelector('#block_running .diff').classList.remove('green');
			document.querySelector('#block_running .diff').classList.add('red');
		}
		else
		{
			document.querySelector('#block_running .diff').classList.add('green');
			document.querySelector('#block_running .diff').classList.remove('red');
		}
	}
}

function ShowRunningFinish(tRanking, i, course_phase, timerRestart)
{
	if (wsContext.timeoutInter != null)
	{
		window.clearTimeout(wsContext.timeoutInter);
		wsContext.timeoutInter = null;
	}

	if (wsContext.timeoutFinish == null || timerRestart)
	{
		if (wsContext.timeoutFinish != null)
			window.clearTimeout(wsContext.timeoutFinish);
	
		wsContext.timeoutFinish = window.setTimeout(function() { 
				wsContext.timeoutFinish = null; 
				wsContext.running_bib = -1; 
			},	wsContext.timeoutFinishDelay
		);
	}
	
	var time_chrono = tRanking.GetCellInt('Tps_chrono'+course_phase, i, adv.chrono.KO);
	var time_pena = tRanking.GetCellInt('Tps'+course_phase, i, adv.chrono.KO);
	
	document.querySelector('#block_running .bib').innerHTML = tRanking.GetCell('Dossard', i);
	document.querySelector('#block_running .identity').innerHTML = tRanking.GetCell('Bateau', i);
	
	for (let p=1;p<=wsContext.nb_porte;p++)
	{
		const valPena = tRanking.GetCell('Pena_'+p.toString(), i);
		SetOnCoursePenalty(p, valPena);
	}
	
	if (time_pena >= adv.chrono.OK)
	{	
		const rk_categ = tRanking.ComputeRank('Tps'+course_phase, i, 'Code_categorie');
		const diff_categ = tRanking.GetDiffTime('Tps'+course_phase, i, 'Code_categorie');

		document.querySelector('#block_running .time').innerHTML = adv.GetChrono(time_pena, 'XSCC');
		document.querySelector('#block_running .rank').innerHTML = rk_categ;
		document.querySelector('#block_running .rank').style.display = 'flex';

		if (diff_categ === undefined || diff_categ === null)
		{
			document.querySelector('#block_running .diff').style.display = 'none';
		}
		else
		{
			document.querySelector('#block_running .diff').innerHTML = adv.GetChronoDiffMMSSCC(diff_categ); 
			document.querySelector('#block_running .diff').style.display = 'flex';
		
			if (diff_categ > 0)
			{
				document.querySelector('#block_running .diff').classList.remove('green');
				document.querySelector('#block_running .diff').classList.add('red');
			}
			else
			{
				document.querySelector('#block_running .diff').classList.add('green');
				document.querySelector('#block_running .diff').classList.remove('red');
			}
		}
	}
	else
	{
		document.querySelector('#block_running .time').innerHTML = adv.GetChrono(time_chrono, 'HHMMSSCC');
		document.querySelector('#block_running .rank').style.display = 'none';
		document.querySelector('#block_running .diff').style.display = 'none';
	}
}

function Init()
{
	wsContext.lang = 'fr';
	wsContext.url = wsParams.url;
	wsContext.port = wsParams.port;

	wsContext.running_bib = -1;
	wsContext.nb_porte = 0;
	
	wsContext.timeoutFinish = null;
	wsContext.timeoutFinishDelay = 30000;
	
	wsContext.timeoutInter = null;
	wsContext.timeoutInterDelay = 5000;
	
	// Command Notification
	wsContext.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsContext.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	
	// Broadcast Notification
	wsContext.mapCommand.set('<mode_chrono>', OnBroadcastModeChrono);
	wsContext.mapCommand.set('<bib_time>', OnBroadcastBibTime);
	wsContext.mapCommand.set('<penalty_add>', OnBroadcastPenaltyAdd);
	wsContext.mapCommand.set('<run_erase>', OnBroadcastRunErase);
	
	// Flow Notification
	wsContext.mapCommand.set('<on_course>', OnFlowOnCourse);

	// Ouverture ws 
	wsContext.OpenWebSocketCommand(OnOpenWebSocketCommand);
	
	ClearRunning();
}
