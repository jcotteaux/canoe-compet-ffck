function OnOpenWebSocketCommand()
{
	wsMain.websocket.send(JSON.stringify({key : '<race_load>', key_race : '*' }));
}

function OnCommandRaceLoad(objJSON)
{
//	alert("OnCommandRaceLoad :"+JSON.stringify(objJSON));
	canoe.SetRace(objJSON);
	canoe.SetFmtChrono(wsMain.fmtChrono);
	
	// Chargement de toutes les épreuves ...
	const cmd = { key : '<epreuve_load>',  epreuve : '' };
	wsMain.websocket.send(JSON.stringify(cmd));
}

function OnCommandEpreuveLoad(objJSON)
{
//	alert("OnCommandEpreuveLoad :"+JSON.stringify(objJSON));
	canoe.SetRanking(objJSON);

	const tRanking = canoe.GetTableRanking();
	canoe.SetColumnNameRanking(tRanking);

	const course_phase = canoe.GetCodeCoursePhase();
	tRanking.OrderBy('Tps'+course_phase+', Dossard');

	const nb_porte = canoe.GetNbPorte();
	const elemPena = document.querySelector('#block_running div.pena');
	if (elemPena && typeof elemPena === "object")
	{
		var html = '<table><tr>';
		for (let p=1;p<=nb_porte;p++)
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
//	alert("OnBroadcastPenaltyAdd :"+JSON.stringify(objJSON));
	
	const bib = objJSON.bib;
	const porte = objJSON.gate;
	const pena = objJSON.penalty;

	const course_phase = canoe.GetCodeCoursePhase();
	const tRanking = canoe.GetTableRanking();
	
	for (let row=0;row<tRanking.GetNbRows();row++)
	{
		if (bib == tRanking.GetCell('Dossard', row))
		{
			const oldTps = tRanking.GetCellInt('Tps'+course_phase, row);
			const newTps = canoe.UpdateSlalomPena(tRanking, row, porte, pena);

			if (wsMain.bib_select == bib)
			{
				if (wsMain.timeoutFinish != null)
				{
					const timerRestart = false;
					ShowRunningFinish(tRanking, row, course_phase, timerRestart);
				}
			}
			break;
		}
	}
	
	if (wsMain.bib_select == bib)
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
//	alert("OnBroadcastBibTime :"+JSON.stringify(objJSON));
	const passage = parseInt(objJSON.passage);
	if (passage >= 1)
		DoBroadcastBibTimeInter(objJSON, passage);
	else
		DoBroadcastBibTimeFinish(objJSON);
}

function DoBroadcastBibTimeInter(objJSON, passage) 
{
	const bib = objJSON.bib;
	if (bib == wsMain.bib_select)
	{
		const time_chrono = objJSON.time_chrono;
		const diff_chrono_categ = objJSON.diff_chrono_categ;
	
		const time = objJSON.time;
		const diff_categ = objJSON.diff_categ;
		
		if (time_chrono != adv.chrono.KO && time_chrono != adv.chrono.DNS && wsMain.timeoutFinish == null)
			ShowRunningInter(time, diff_categ);
	}
}

function DoBroadcastBibTimeFinish(objJSON) 
{
	const bib = objJSON.bib;
	const course_phase = canoe.GetCodeCoursePhase();
	const tRanking = canoe.GetTableRanking();

	if (typeof tRanking === 'object')
	{
		const row = canoe.GetRankingBibIndex(tRanking, bib);
		if (row >= 0)
		{
			if (wsMain.filter == 'bib')
			{
				if (bib % wsMain.filter_modulo != wsMain.filter_index)
					return;
			}
			else if (wsMain.filter == 'rk')
			{
				const rk = tRanking.GetCellInt('Rang'+course_phase, row);
				if (rk % wsMain.filter_modulo != wsMain.filter_index)
					return;
			}
			
			const tpsChrono = objJSON.time_chrono;
			tRanking.SetCell('Tps_chrono'+course_phase,row, tpsChrono);
				
			const oldTps = tRanking.GetCellInt('Tps'+course_phase, row);
			const newTps = canoe.UpdateSlalomFinishTime(tRanking, row);
			if (tpsChrono != adv.chrono.KO && tpsChrono != adv.chrono.DNS)
			{
				const timerRestart = true;
				ShowRunningFinish(tRanking, row, course_phase, timerRestart);
			}
		}
	}
}

function OnBroadcastRunErase(objJSON)
{
	Reload();
}

function Reload()
{
	if (wsMain.timeoutFinish != null)
	{
		window.clearTimeout(wsMain.timeoutFinish);
		wsMain.timeoutFinish = null;
	}

	if (wsMain.timeoutInter != null)
	{
		window.clearTimeout(wsMain.timeoutInter);
		wsMain.timeoutInter = null;
	}
	
	OnOpenWebSocketCommand();
	ClearRunning();
}

function OnFlowOnCourse(objJSON)
{
	if (wsMain.timeoutFinish != null || wsMain.timeoutInter != null)
		return;

	const tOnCourse = adv.GetTableUnique(objJSON, 'table');
	const tRanking = canoe.GetTableRanking();
	if (tOnCourse && typeof tOnCourse === 'object' && tRanking && typeof tRanking === 'object')
	{
		const nb = tOnCourse.GetNbRows();
		if (wsMain.bib_select > 0)
		{
			const i = tOnCourse.GetIndexRow('bib', wsMain.bib_select);
			if (i >= 0)
			{
				let time_running = tOnCourse.GetCellInt('time', i);
				if (wsMain.time_pena == 1)
				{
					const row = tRanking.GetIndexRow('Dossard', wsMain.bib_select);
					if (row >= 0)
					{
						const time_pena = canoe.GetCurrentSlalomTotalPena(tRanking, row)*1000;
						time_running += time_pena;
					}
				}
				
				document.querySelector("#block_running .time").innerHTML = adv.GetChrono(time_running, canoe.GetFmtChrono());
				return;
			}
		}
		
		if (nb > 0)
		{		
			wsMain.bib_select = GetBibSelect(tOnCourse);
			const row = tRanking.GetIndexRow('Dossard', wsMain.bib_select);
			const i = tOnCourse.GetIndexRow('bib', wsMain.bib_select);

			if (row >= 0 && i >= 0)
			{
				ShowRunning(tRanking, row, tOnCourse.GetCellInt('time', i));
				return;
			}
		}

		wsMain.bib_select = -1;
		ClearRunning();
	}
}

function ClearRunning()
{
	document.querySelector('#block_running .bib').innerHTML = '';
	document.querySelector('#block_running .identity').innerHTML = '';
	document.querySelector('#block_running .nation').innerHTML = '';

	for (let p=1;p<=canoe.GetNbPorte();p++)
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
	
	const nation = tRanking.GetCell('Code_nation', i);
	if (nation.length > 0)
		document.querySelector('#block_running .nation').innerHTML = "<img src='./img/flags/"+nation+".png' height='40' width='64' />";

	const course_phase = canoe.GetCodeCoursePhase();
	for (let p=1;p<=canoe.GetNbPorte();p++)
	{
		const valPena = tRanking.GetCell('Pena_'+p.toString(), i);
		SetOnCoursePenalty(p, valPena);
	}
	
	if (wsMain.time_pena == 1)
	{
		const time_pena = canoe.GetCurrentSlalomTotalPena(tRanking, i)*1000;
		time_running += time_pena;
	}
	document.querySelector('#block_running .time').innerHTML = adv.GetChrono(time_running, canoe.GetFmtChrono());
	
	document.querySelector('#block_running .rank').innerHTML = '';
	document.querySelector('#block_running .diff').innerHTML = '';

	document.querySelector('#block_running .rank').style.display = 'none';
	document.querySelector('#block_running .diff').style.display = 'none';
}

function HideRunningInter()
{
	document.querySelector('#block_running .rank').innerHTML = '';
	document.querySelector('#block_running .diff').innerHTML = '';

	document.querySelector('#block_running .rank').style.display = 'none';
	document.querySelector('#block_running .diff').style.display = 'none';
}

function ShowRunningInter(time_chrono, diff_categ)
{
	if (wsMain.timeoutInter != null)
		window.clearTimeout(wsMain.timeoutInter);
	wsMain.timeoutInter = window.setTimeout(function() { wsMain.timeoutInter = null;  HideRunningInter(); }, wsMain.timeoutInterDelay);
	
	document.querySelector('#block_running .time').innerHTML = adv.GetChrono(time_chrono, canoe.GetFmtChrono());
	document.querySelector('#block_running .rank').style.display = 'none';
	
	if (diff_categ === undefined)
	{
		document.querySelector('#block_running .diff').style.display = 'none';
	}
	else
	{
		document.querySelector('#block_running .diff').innerHTML = adv.GetChronoDiff(diff_categ, canoe.GetFmtChrono());
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
	if (wsMain.timeoutInter != null)
	{
		window.clearTimeout(wsMain.timeoutInter);
		wsMain.timeoutInter = null;
	}

	if (wsMain.timeoutFinish == null || timerRestart)
	{
		if (wsMain.timeoutFinish != null)
			window.clearTimeout(wsMain.timeoutFinish);
	
		wsMain.timeoutFinish = window.setTimeout(function() { 
				wsMain.timeoutFinish = null; 
				wsMain.bib_select = -1; 
			},	wsMain.timeoutFinishDelay
		);
	}
	
	var time_chrono = tRanking.GetCellInt('Tps_chrono'+course_phase, i, adv.chrono.KO);
	var time_pena = tRanking.GetCellInt('Tps'+course_phase, i, adv.chrono.KO);
	
	document.querySelector('#block_running .bib').innerHTML = tRanking.GetCell('Dossard', i);
	document.querySelector('#block_running .identity').innerHTML = tRanking.GetCell('Bateau', i);
	
	for (let p=1;p<=canoe.GetNbPorte();p++)
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
			document.querySelector('#block_running .diff').innerHTML = adv.GetChronoDiff(diff_categ, canoe.GetFmtChrono()); 
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
		document.querySelector('#block_running .time').innerHTML = adv.GetChrono(time_chrono, canoe.GetFmtChrono());
		document.querySelector('#block_running .rank').style.display = 'none';
		document.querySelector('#block_running .diff').style.display = 'none';
	}
}

function GetBibSelect(tOnCourse)
{
	const nb = tOnCourse.GetNbRows();
	if (nb > 0)
	{
		if (wsMain.filter == 'bib')
		{
			var r = nb-1;
			while (r >= 0)
			{
				if (tOnCourse.GetCellInt('bib', r) % wsMain.filter_modulo  == wsMain.filter_index)
					return tOnCourse.GetCellInt('bib', r);
				--r;
			}
		}
		else if (wsMain.filter == 'rk')
		{
			const tRanking = canoe.GetTableRanking();
			const course_phase = canoe.GetCodeCoursePhase();
			if (typeof tRanking === 'object')
			{
				var r = nb-1;
				while (r >= 0 )
				{
					const bib = tOnCourse.GetCellInt('bib', r);
					const row = canoe.GetRankingBibIndex(tRanking, bib);
					if (row >= 0)
					{
						const rk = tRanking.GetCellInt('Rang'+course_phase, row);
						if (rk % wsMain.filter_modulo  == wsMain.filter_index)
							return bib;
					}
					--r;
				}
			}
		}
		else
		{
			return tOnCourse.GetCellInt('bib', nb-1);
		}
	}

	return GetBibStart(tOnCourse);
}

function GetBibStart(tOnCourse)
{
	const tRanking = canoe.GetTableRanking();
	const course_phase = canoe.GetCodeCoursePhase();

	if (typeof tRanking === 'object' && typeof tOnCourse === 'object')
	{
		tRanking.OrderBy('Cltc'+course_phase+',Heure_depart'+course_phase);
		for (let r = 0; r<tRanking.GetNbRows(); r++)
		{
			const i = tOnCourse.GetIndexRow('bib', tRanking.GetCell('Dossard',r));
			if (i < 0)
			{
				if (tRanking.GetCellInt('Tps_chrono'+course_phase, r, adv.chrono.KO) == adv.chrono.KO)
				{
					if (wsMain.filter == 'bib')
					{
						if (tRanking.GetCellInt('Dossard', r) % wsMain.filter_modulo == wsMain.filter_index)
							return tRanking.GetCellInt('Dossard', r);
					}
					else if (wsMain.filter == 'rk')
					{
						const rk = tRanking.GetCellInt('Rang'+course_phase, r);
//						alert('OK1:bib='+tRanking.GetCell('Dossard', r)+", rk="+rk+", course_phase="+course_phase+", colindex="+tRanking.GetIndexColumn('Rang'+course_phase));

						if (rk % wsMain.filter_modulo == wsMain.filter_index)
							return tRanking.GetCellInt('Dossard', r);
					}
					else
					{
						return tRanking.GetCellInt('Dossard', r);
					}
				}
			}
		}
	}
	
	return -1;
}

////////// Variables globales et Initialisation  //////////
const wsMain = new ws.Context(wsParams.url, wsParams.port);

function Init()
{
	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);
	
	wsMain.filter = ''; 
	wsMain.filter_index = 0; 
	wsMain.filter_modulo = 1; 

	if (urlParams.has('bib_filter'))
	{
		wsMain.filter = 'bib'; 

		const filter = urlParams.get('bib_filter');
		if (filter == 'pair')
		{
			wsMain.filter_modulo = 2; 
			wsMain.filter_index = 0; 
		}
		else if (filter == 'odd')
		{
			wsMain.filter_modulo = 2; 
			wsMain.filter_index = 1; 
		}
		else
		{
			const splits = filter.split("/");
			if (splits.length == 2)
			{
				wsMain.filter_index = parseInt(splits[0]);
				wsMain.filter_modulo = parseInt(splits[1]);
			}
		}
	}
	
	if (urlParams.has('rk_filter'))
	{
		wsMain.filter = 'rk'; 

		const filter = urlParams.get('rk_filter');
		if (filter == 'pair')
		{
			wsMain.filter_modulo = 2; 
			wsMain.filter_index = 0; 
		}
		else if (filter == 'odd')
		{
			wsMain.filter_modulo = 2; 
			wsMain.filter_index = 1; 
		}
		else
		{
			const splits = filter.split("/");
			if (splits.length == 2)
			{
				wsMain.filter_index = parseInt(splits[0]);
				wsMain.filter_modulo = parseInt(splits[1]);
			}
		}
	}
	
	wsMain.bib_select = -1;
	
	wsMain.timeoutFinish = null;
	wsMain.timeoutFinishDelay = 25000;
	
	wsMain.timeoutInter = null;
	wsMain.timeoutInterDelay = 5000;
	
	// Temps Tournant avec ou sans les pénalités 
	wsMain.time_pena = 1;
	if (urlParams.has('time_pena'))
		wsMain.time_pena = parseInt(urlParams.get('time_pena'));
	
	// Format de Temps
	wsMain.fmtChrono = '';
	if (urlParams.has('fmt_chrono'))
		wsMain.fmtChrono = urlParams.get('fmt_chrono');
	
	// Command Notification
	wsMain.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsMain.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	
	// Broadcast Notification
	wsMain.mapCommand.set('<mode_chrono>', OnBroadcastModeChrono);
	wsMain.mapCommand.set('<bib_time>', OnBroadcastBibTime);
	wsMain.mapCommand.set('<penalty_add>', OnBroadcastPenaltyAdd);
	wsMain.mapCommand.set('<run_erase>', OnBroadcastRunErase);
	
	// Flow Notification
	wsMain.mapCommand.set('<on_course>', OnFlowOnCourse);

	// Ouverture ws 
	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
	
	ClearRunning();
}
