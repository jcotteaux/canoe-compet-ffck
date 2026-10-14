// Le flux peut être retardé par les saisies dans CompetFFCK.
// Dérouler localement le temps brut, puis recaler progressivement les trames.
function StopRunningClock()
{
	wsMain.runningClock = null;
}

function UpdateRunningClock(time)
{
	if (!Number.isFinite(time) || time < 0) { StopRunningClock(); return; }
	const now = performance.now();
	RenderRunningClock();
	let clock = wsMain.runningClock;
	if (!clock || clock.bib != wsMain.bib_select || time < clock.receivedTime - 2000)
		clock = wsMain.runningClock = {bib: wsMain.bib_select, value: time, tick: now};
	clock.tick = now;
	clock.receivedTime = time;
	clock.receivedAt = now;
	RenderRunningClock();
}

function RenderRunningClock()
{
	const clock = wsMain.runningClock;
	if (!clock || wsMain.timeoutFinish != null || wsMain.timeoutInter != null) return;
	const now = performance.now();
	// Ne pas inventer indéfiniment un temps en cas de coupure du flux.
	const tick = Math.min(now, clock.receivedAt + 3000);
	const elapsed = Math.max(0, tick - clock.tick);
	const target = clock.receivedTime + Math.min(now - clock.receivedAt, 3000);
	const correction = Math.max(-elapsed * 0.2, Math.min(elapsed * 0.2, target - (clock.value + elapsed)));
	clock.value += elapsed + correction;
	clock.tick = tick;
	let time = clock.value;
	if (wsMain.time_pena == 1)
	{
		const ranking = canoe.GetTableRanking();
		const row = ranking ? ranking.GetIndexRow('Dossard', clock.bib) : -1;
		if (row >= 0) time += canoe.GetCurrentSlalomTotalPena(ranking, row) * 1000;
	}
	const elem = document.querySelector('#block_running .time');
	const text = adv.GetChrono(Math.floor(time / 100) * 100, canoe.GetFmtChrono());
	if (elem.innerHTML !== text) elem.innerHTML = text;
}

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

	if (wsMain.timeoutFinish == null && !wsMain.runningClock) ShowNextToStart();

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

			// Pendant le résultat, l'écran est au bateau arrivé : ses pénalités
			// jugées après l'arrivée mettent son temps à jour. Celles du bateau
			// suivi attendent (ShowRunning les reprendra du classement).
			if (wsMain.timeoutFinish != null && wsMain.bib_finish == bib)
			{
				const timerRestart = false;
				ShowRunningFinish(tRanking, row, course_phase, timerRestart);
			}
			break;
		}
	}
	
	const affiche = wsMain.timeoutFinish != null ? wsMain.bib_finish : wsMain.bib_select;
	if (affiche == bib)
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

/**
 * Écart au meilleur temps de passage de la catégorie à cet intermédiaire
 * (temps bruts, comme tv_dalle), quand competFFCK ne le donne pas.
 * undefined s'il n'y a pas encore de référence.
 */
function EcartInter(bib, passage, time_chrono)
{
	const tRanking = canoe.GetTableRanking();
	if (!tRanking || typeof tRanking !== 'object' || !(time_chrono > 0))
		return undefined;
	const col = 'Tps_chrono' + canoe.GetCodeCoursePhase() + '_inter' + passage;
	const row = canoe.GetRankingBibIndex(tRanking, bib);
	if (row < 0 || tRanking.GetIndexColumn(col) < 0)
		return undefined;
	const categ = tRanking.GetCell('Code_categorie', row);
	let best = 0;
	for (let r = 0; r < tRanking.GetNbRows(); r++)
	{
		if (r === row || tRanking.GetCell('Code_categorie', r) != categ)
			continue;
		const t = tRanking.GetCellInt(col, r, 0);
		if (t >= adv.chrono.OK && (best === 0 || t < best))
			best = t;
	}
	return best > 0 ? time_chrono - best : undefined;
}

/** Retient le temps de passage d'un bateau : référence pour les suivants. */
function NoterInter(bib, passage, time_chrono)
{
	const tRanking = canoe.GetTableRanking();
	if (!tRanking || typeof tRanking !== 'object' || !(time_chrono > 0))
		return;
	const col = 'Tps_chrono' + canoe.GetCodeCoursePhase() + '_inter' + passage;
	const row = canoe.GetRankingBibIndex(tRanking, bib);
	if (row >= 0 && tRanking.GetIndexColumn(col) >= 0)
		tRanking.SetCell(col, row, time_chrono);
}

function DoBroadcastBibTimeInter(objJSON, passage) 
{
	const bib = objJSON.bib;
	// L'écart se calcule avant de noter ce passage, puis on le note pour tous
	// les bateaux, suivis ou non.
	const tc = Number(objJSON.time_chrono);
	const ecartLocal = EcartInter(bib, passage, tc);
	if (tc != adv.chrono.KO && tc != adv.chrono.DNS)
		NoterInter(bib, passage, tc);

	if (bib == wsMain.bib_select)
	{
		const time_chrono = objJSON.time_chrono;
		const diff_chrono_categ = objJSON.diff_chrono_categ;
	
		// competFFCK donne le temps du passage (time) ; à défaut, le temps brut
		// plus les pénalités déjà jugées, comme le temps tournant.
		let time = objJSON.time;
		if (time === undefined || time === null || time === '')
		{
			time = Number(time_chrono);
			if (wsMain.time_pena == 1)
			{
				const ranking = canoe.GetTableRanking();
				const row = ranking ? ranking.GetIndexRow('Dossard', bib) : -1;
				if (row >= 0) time += canoe.GetCurrentSlalomTotalPena(ranking, row) * 1000;
			}
		}
		let diff_categ = objJSON.diff_categ;
		if (diff_categ === undefined || diff_categ === null || diff_categ === '')
			diff_categ = ecartLocal;
		
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
				wsMain.bib_finish = bib;
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
	wsMain.lastOnCourse = null;
	wsMain.lastOnCourseJSON = null;
	wsMain.bib_finish = -1;
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
	wsMain.lastOnCourseJSON = objJSON;
	wsMain.lastOnCourse = adv.GetTableUnique(objJSON, 'table');
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
				UpdateRunningClock(tOnCourse.GetCellInt('time', i));
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

		ShowNextToStart();
	}
}

function ClearRunning()
{
	document.querySelector('#block_running .time').classList.remove('next-start');
	StopRunningClock();
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
	document.querySelector('#block_running .time').classList.remove('next-start');
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
	
	UpdateRunningClock(time_running);
	
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
	document.querySelector('#block_running .time').classList.remove('next-start');
	StopRunningClock();
	if (wsMain.timeoutInter != null)
		window.clearTimeout(wsMain.timeoutInter);
	wsMain.timeoutInter = window.setTimeout(function() { wsMain.timeoutInter = null;  HideRunningInter(); }, wsMain.timeoutInterDelay);
	
	document.querySelector('#block_running .time').innerHTML = adv.GetChrono(Math.floor(time_chrono / 100) * 100, canoe.GetFmtChrono());
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
	document.querySelector('#block_running .time').classList.remove('next-start');
	StopRunningClock();
	if (wsMain.timeoutInter != null)
	{
		window.clearTimeout(wsMain.timeoutInter);
		wsMain.timeoutInter = null;
	}

	if (wsMain.timeoutFinish == null || timerRestart)
	{
		if (wsMain.timeoutFinish != null)
			window.clearTimeout(wsMain.timeoutFinish);
	
		wsMain.timeoutFinish = window.setTimeout(FinResultat, wsMain.timeoutFinishDelay);
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

/**
 * Bateau suivi : parmi ceux sur l'eau (et du filtre bib_filter / rk_filter),
 * celui qui est parti le premier, donc le prochain à arriver. On le suit
 * jusqu'à son arrivée, puis le suivant : aucun bateau n'est sauté et le
 * résultat affiché est celui du bateau qu'on vient de suivre.
 */
/** Fin du résultat d'arrivée : le bateau sur l'eau tout de suite, d'après la dernière trame. */
function FinResultat()
{
	if (wsMain.timeoutFinish != null)
		window.clearTimeout(wsMain.timeoutFinish);
	wsMain.timeoutFinish = null;
	wsMain.bib_finish = -1;
	wsMain.bib_select = -1;
	if (wsMain.lastOnCourseJSON)
		OnFlowOnCourse(wsMain.lastOnCourseJSON);
	else
		ShowNextToStart();
}

function GetBibSelect(tOnCourse)
{
	const nb = tOnCourse.GetNbRows();
	const tRanking = canoe.GetTableRanking();
	const course_phase = canoe.GetCodeCoursePhase();
	let best = -1;
	let bestTime = -1;
	for (let r = 0; r < nb; r++)
	{
		const bib = tOnCourse.GetCellInt('bib', r);
		if (wsMain.filter == 'bib')
		{
			if (bib % wsMain.filter_modulo != wsMain.filter_index)
				continue;
		}
		else if (wsMain.filter == 'rk')
		{
			if (typeof tRanking !== 'object')
				continue;
			const row = canoe.GetRankingBibIndex(tRanking, bib);
			if (row < 0 || tRanking.GetCellInt('Rang'+course_phase, row) % wsMain.filter_modulo != wsMain.filter_index)
				continue;
		}
		const time = tOnCourse.GetCellInt('time', r);
		if (time > bestTime)
		{
			best = bib;
			bestTime = time;
		}
	}
	if (best > 0)
		return best;

	return GetBibStart(tOnCourse);
}

function ShowNextToStart()
{
	const ranking = canoe.GetTableRanking();
	if (!ranking || typeof ranking !== 'object') return;
	const onCourse = wsMain.lastOnCourse || {GetIndexRow: function() { return -1; }};
	const bib = GetBibStart(onCourse);
	wsMain.bib_select = -1;
	ClearRunning();
	if (bib <= 0) return;
	const row = ranking.GetIndexRow('Dossard', bib);
	if (row < 0) return;
	document.querySelector('#block_running .bib').textContent = bib;
	document.querySelector('#block_running .identity').textContent = ranking.GetCell('Bateau', row);
	const nation = ranking.GetCell('Code_nation', row);
	if (nation) document.querySelector('#block_running .nation').innerHTML = "<img src='./img/flags/"+nation+".png' height='40' width='64' />";
	const time = document.querySelector('#block_running .time');
	time.textContent = 'NEXT TO START';
	time.classList.add('next-start');
}

function GetBibStart(tOnCourse)
{
	const tRanking = canoe.GetTableRanking();
	const course_phase = canoe.GetCodeCoursePhase();

	if (typeof tRanking === 'object' && typeof tOnCourse === 'object')
	{
		tRanking.OrderBy('Heure_depart'+course_phase+',Rang'+course_phase+',Dossard');
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
	wsMain.bib_finish = -1;
	wsMain.lastOnCourseJSON = null;
	
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

	// Un seul timer par page, indépendant de la cadence des trames.
	if (wsMain.runningClockTimer) window.clearInterval(wsMain.runningClockTimer);
	wsMain.runningClockTimer = window.setInterval(RenderRunningClock, 40);

	// Ouverture ws 
	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
	
	ClearRunning();
}
