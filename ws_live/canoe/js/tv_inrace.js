function OnOpenWebSocketCommand()
{
	wsMain.websocket.send(JSON.stringify({key : '<race_load>', key_race : '*' }));
}

function OnCommandRaceLoad(objJSON)
{
//	alert("OnCommandRaceLoad :"+JSON.stringify(objJSON));
	canoe.SetRace(objJSON);
	canoe.SetFmtChrono(wsMain.fmtChrono);
	wsMain.raceReady = true;

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
	canoe.ComputeTpsInter(tRanking, 1);
	canoe.ComputeTpsInter(tRanking, 2);
	
	ResetPenalties();
	wsMain.rankingReady = true;
	Resync();

	if (wsMain.bib_finish_force > 0)
		ForceBibFinish(wsMain.bib_finish_force);

	if (wsMain.bib_inter_force > 0)
		ForceBibInter(wsMain.bib_inter_force, 1);

	if (wsMain.leader_force > 0)
	{
		SetLeader();
		ShowLeader(999999);
	}
}

/*
 * Le classement vient d'être (re)chargé : à l'ouverture de la page, après une
 * reconnexion, un effacement, ou parce qu'un dossard inconnu est apparu.
 * L'affichage en cours est recalé sur ce que dit le serveur ; les index de
 * lignes de l'ancien classement ne valent plus rien.
 */
function Resync()
{
	if (wsMain.bib_select <= 0)
		return;

	const tRanking = canoe.GetTableRanking();
	const row = canoe.GetRankingBibIndex(tRanking, wsMain.bib_select);
	if (row < 0)
	{
		// Bateau disparu du classement (dossard retiré, autre course) : on repart de zéro.
		EndFinish();
		ClearRunning();
		document.getElementById('block_start').style.display = 'none';
		return;
	}

	SetLeader();
	if (wsMain.timeoutFinish != null)
	{
		ShowFinish(tRanking, row, canoe.GetCodeCoursePhase(), false);
		return;
	}

	SetName('#block_start', tRanking, row);
	SetClub('#block_start', tRanking, row);
	SetCateg('#block_start', tRanking, row);
	document.querySelector('#block_running .runner').dataset.bib = '';
	if (canoe.GetCodeActivite() == 'SLA')
	{
		for (let p=1;p<=canoe.GetNbPorte();p++)
			ShowPenalty(p, tRanking.GetCell('Pena_'+p.toString(), row), 'block_running');
	}
}

/*
 * Le serveur parle d'un dossard que notre classement ne connaît pas : il est
 * périmé (bateau ajouté, trames manquées). On le redemande, au plus toutes
 * les 5 s pour ne pas inonder le serveur.
 */
function RequestResync()
{
	if (!wsMain.rankingReady)
		return;		// premier chargement déjà en route

	const now = Date.now();
	if (now - (wsMain.resyncAt || 0) < 5000)
		return;
	wsMain.resyncAt = now;
	if (wsMain.raceReady)
		wsMain.Send({ key : '<epreuve_load>', epreuve : '' });
	else
		OnOpenWebSocketCommand();
}

function OnBroadcastPenaltyAdd(objJSON) 
{
	const bib = objJSON.bib;
	const porte = objJSON.gate;
	const pena = objJSON.penalty;

	const course_phase = canoe.GetCodeCoursePhase();
	const tRanking = canoe.GetTableRanking();
	
	const row = canoe.GetRankingBibIndex(tRanking, bib);
	if (row >= 0)
	{
		const oldTps = tRanking.GetCellInt('Tps'+course_phase, row);
		const newTps = canoe.UpdateSlalomPena(tRanking, row, porte, pena);
		
		if (wsMain.bib_select < 0)
		{
			wsMain.bib_select = bib;
			wsMain.bib_select_tick = Date.now();
			SetLeader();
		}
		
		if (wsMain.bib_select == bib)
		{
			const tps_chrono = tRanking.GetCellInt('Tps_chrono'+course_phase, row, adv.chrono.KO);
			if (tps_chrono == adv.chrono.KO) 
			{
				ShowPenalty(porte, pena, 'block_running');
			}
			else
			{
				const timerRestart = false;
				ShowFinish(tRanking, row, course_phase, timerRestart);
			}
		}
	}
	else
		RequestResync();
}

function OnBroadcastBibTime(objJSON) 
{
	if (!wsMain.rankingReady)
		return;		// le classement à venir contiendra ce temps
	if (canoe.GetRankingBibIndex(canoe.GetTableRanking(), objJSON.bib) < 0)
	{
		RequestResync();
		return;
	}

	const passage = parseInt(objJSON.passage);
	if (passage >= 1)
		DoBroadcastBibTimeInter(objJSON.bib, objJSON.time_chrono, passage);
	else
		DoBroadcastBibTimeFinish(objJSON.bib, objJSON.time_chrono);
}

function DoBroadcastBibTimeInter(bib, time_chrono, inter) 
{
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking === 'object')
	{
		const course_phase_inter = canoe.GetCodeCoursePhase()+'_inter'+inter;
		const row = canoe.GetRankingBibIndex(tRanking, bib);

		if (bib == wsMain.bib_select && row >= 0)
		{
			// ForceBibStart efface la référence du leader (ClearLeader) à
			// chaque trame pendant les delay_start premières secondes : un
			// intermédiaire dans cette fenêtre restait sans écart.
			if (wsMain.leader_index < 0)
				SetLeader();

			var tps = time_chrono;
			var txtDiff = '';
			var txtColor = 'red';
			var newLeader = false;	// devant le leader à cet intermédiaire
			
			if (tps > 0)
			{
				if (wsMain.time_inter_pena == 1)
				{
					const tps_pena = canoe.GetCurrentSlalomTotalPena(tRanking, row)*1000;
					tps += tps_pena;
				}
				
				txtColor = 'green';
				if (wsMain.leader_index >= 0 && wsMain.leader_index < tRanking.GetNbRows())
				{
					const tpsLeader = tRanking.GetCellInt('Tps'+course_phase_inter, wsMain.leader_index);
					if (tpsLeader > 0)
					{
						const diff = tps - tpsLeader;
						newLeader = diff < 0 && wsMain.leader_index != row;
						txtDiff = adv.GetChronoDiffXSCC(diff);
						
						if (diff > 0)
							txtColor = 'red';
						else
							txtColor = 'green';
					}
				}
			}

			if (wsMain.timeoutInter != null)
			{
				window.clearTimeout(wsMain.timeoutInter);
				wsMain.timeoutInter = null;
			}
			
			wsMain.timeoutInter = window.setTimeout(function() { 
					wsMain.timeoutInter = null; 
					HideBlockInter();
				},	wsMain.timeoutInterDelay
			);

			document.querySelector('#block_start .bib').innerHTML = bib;
			SetName('#block_start', tRanking, row);
			SetClub('#block_start', tRanking, row);
			SetCateg('#block_start', tRanking, row);

			var txtTime = '';
			if (canoe.GetCodeActivite() == 'SLA')
				txtTime = adv.GetChronoXSCC(tps);
			else
				txtTime = adv.GetChronoHHMMSSCC(tps);
			
			document.querySelector('#block_inter .row .label').textContent = 'Inter '+inter;
			document.querySelector('#block_inter .live').textContent = '';
			document.querySelector('#block_inter').classList.toggle('new-leader', newLeader);
			document.querySelector('#block_inter .time').innerHTML = txtTime;
			document.querySelector("#block_inter .diff").innerHTML = txtDiff;
			
			if (txtColor == 'red')
			{
				document.querySelector("#block_inter").classList.remove('green');
				document.querySelector("#block_inter").classList.add('red');
			}
			else 
			{
				document.querySelector("#block_inter").classList.add('green');
				document.querySelector("#block_inter").classList.remove('red');
			}

			document.querySelector('#block_inter .leader_name').innerHTML = '';
			document.querySelector('#block_inter .leader_time').innerHTML = '';

			if (wsMain.leader_index >= 0)
			{
				const tpsInter = tRanking.GetCellInt('Tps'+course_phase_inter, wsMain.leader_index);
				if (tpsInter > 0)
				{
					SetLeaderName(document.querySelector('#block_inter .leader_name'));
					//document.querySelector('#block_inter .leader_time').innerHTML = tRanking.GetCellChrono('Tps'+course_phase_inter, wsMain.leader_index, 'HHMMSSCC');
					document.querySelector('#block_inter .leader_time').innerHTML = tRanking.GetCellChrono('Tps'+course_phase_inter, wsMain.leader_index, 'XSCC');	
				}
			}

			ShowBlockInter();
			
			tRanking.UpdateRankingTime(row, tRanking.GetIndexColumn('Tps_chrono'+course_phase_inter), tRanking.GetIndexColumn('Cltc_chrono'+course_phase_inter), tRanking.GetCellInt('Tps_chrono'+course_phase_inter,row), time_chrono);
			tRanking.UpdateRankingTime(row, tRanking.GetIndexColumn('Tps'+course_phase_inter), tRanking.GetIndexColumn('Cltc'+course_phase_inter), tRanking.GetCellInt('Tps'+course_phase_inter,row), tps);
		}
	}
}

function DoBroadcastBibTimeFinish(bib, time_chrono) 
{
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
		
			const oldTpsChrono = tRanking.GetCellInt('Tps_chrono'+course_phase, row);
			const newTpsChrono = time_chrono;
			tRanking.UpdateRankingTime(row, tRanking.GetIndexColumn('Tps_chrono'+course_phase), tRanking.GetIndexColumn('Cltc_chrono'+course_phase),oldTpsChrono, newTpsChrono);

			const newTps = canoe.UpdateSlalomFinishTime(tRanking, row);
		
			if (newTpsChrono != adv.chrono.KO && newTpsChrono != adv.chrono.DNS)
			{
				const timerRestart = true;
				ShowFinish(tRanking, row, course_phase, timerRestart);
			}
		}
	}
}

function ShowFinish(tRanking, row, course_phase, timerRestart=false) 
{
	if (typeof tRanking === 'object' && row >= 0)
	{
		wsMain.bib_select = tRanking.GetCell('Dossard',row);

		if (canoe.GetCodeActivite() == 'SLA')
		{
			// SLA
			for (let p=1;p<=canoe.GetNbPorte();p++)
			{
				const valPena = tRanking.GetCell('Pena_'+p.toString(), row);
				ShowPenalty(p, valPena, 'block_finish');
			}

			var txtRk = '';
			var txtTime = '';
			var txtDiff = '';
		
			const totalPena = canoe.UpdateSlalomTotalPena(tRanking, row);
			if (totalPena >= 0)
			{			
				txtRk = tRanking.GetCellInt('Cltc'+course_phase, row);
				const time = tRanking.GetCellInt('Tps'+course_phase, row);
				txtTime = adv.GetChrono(time, 'XSCC');
				const diff = tRanking.GetDiffTime('Tps'+course_phase, row, 'Code_categorie');
				if (diff !== undefined && diff !== null)
					txtDiff = adv.GetChronoDiffXSCC(diff);
			}
			else
			{
				var tps = tRanking.GetCellInt('Tps_chrono'+course_phase, row);
				if (wsMain.time_running_pena == 1)
				tps += canoe.GetCurrentSlalomTotalPena(tRanking, row)*1000;

				txtTime = adv.GetChrono(tps, 'XSCC');

				// Portes pas toutes jugées : place et écart provisoires, calculés
				// sur le temps connu face aux bateaux déjà classés de la catégorie.
				const categ = tRanking.GetCell('Code_categorie', row);
				let rank = 1;
				let best = null;
				for (let r = 0; r < tRanking.GetNbRows(); r++)
				{
					if (r == row || tRanking.GetCell('Code_categorie', r) != categ)
						continue;
					const t = tRanking.GetCellInt('Tps'+course_phase, r, -1);
					if (t > 0)
					{
						if (t < tps)
							rank++;
						if (best === null || t < best)
							best = t;
					}
				}
				txtRk = rank;
				if (best !== null)
					txtDiff = adv.GetChronoDiffXSCC(tps - best);
			}

			ShowFinishData(tRanking, row, txtRk, txtTime, txtDiff, timerRestart, totalPena < 0);
		}
		else
		{
			// DES  - OCR
			var txtDiff = '';
			var	txtRk = tRanking.GetCellInt('Cltc_chrono'+course_phase, row);
			const time = tRanking.GetCellInt('Tps_chrono'+course_phase, row);
			var txtTime = adv.GetChrono(time, 'HHMMSSCC');
			const diff = tRanking.GetDiffTime('Tps'+course_phase, row, 'Code_categorie');
			if (diff !== undefined && diff !== null)
				txtDiff = adv.GetChronoDiff(diff, 'MMSSCC'); 
			
			ShowFinishData(tRanking, row, txtRk, txtTime, txtDiff, timerRestart);
		}
	}
}

function ShowFinishData(tRanking, row, txtRk, txtTime, txtDiff, timerRestart=false, provisional=false)
{
	var txtColor = '';
	if (txtDiff.length > 0)
	{
		if (txtDiff.substring(0,1) == '+')
			txtColor = 'red';
		else
			txtColor = 'green';
	}
			
	if (wsMain.timeoutInter != null)
	{
		window.clearTimeout(wsMain.timeoutInter);
		wsMain.timeoutInter = null;
	}

	if (wsMain.timeoutFinish == null || timerRestart)
	{
		if (wsMain.timeoutFinish != null)
			window.clearTimeout(wsMain.timeoutFinish);
	
		wsMain.timeoutFinish = window.setTimeout(EndFinish, wsMain.timeoutFinishDelay);
		wsMain.finishShownAt = Date.now();
	}

	document.querySelector('#block_finish .bib').innerHTML = wsMain.bib_select;
	SetName('#block_finish', tRanking, row);
	SetClub('#block_finish', tRanking, row);
	SetCateg('#block_finish', tRanking, row);
	
	if (parseInt(txtRk) == 1)
		txtRk = txtRk + '<sup>er</sup>';
	else if (parseInt(txtRk) > 1)
		txtRk = txtRk + '<sup>ème</sup>';

	

	// Toutes les portes ne sont pas encore jugées : place et temps provisoires.
	document.querySelector('#block_finish .result .label').textContent = provisional ? 'Provisoire' : 'Arrivée';
	document.querySelector('#block_finish').classList.toggle('provisional', provisional);
	document.querySelector('#block_finish .rank').innerHTML = txtRk;
	const elFinish = document.querySelector('#block_finish');
	elFinish.classList.toggle('first', parseInt(txtRk) == 1);
	elFinish.classList.toggle('second', parseInt(txtRk) == 2);
	elFinish.classList.toggle('third', parseInt(txtRk) == 3);
	document.querySelector('#block_finish .time').innerHTML = txtTime;
	document.querySelector('#block_finish .diff').innerHTML = txtDiff;
	
	if (txtColor == 'red')
	{
		document.querySelector("#block_finish").classList.remove('green');
		document.querySelector("#block_finish").classList.add('red');
	}
	else
	{
		document.querySelector("#block_finish").classList.add('green');
		document.querySelector("#block_finish").classList.remove('red');
	}
	
	ShowBlockFinish();
	SetLeader();
} 

/** Fin de l'affichage de l'arrivée : l'incrustation repart sur le bateau suivant. */
function EndFinish()
{
	if (wsMain.timeoutFinish != null)
		window.clearTimeout(wsMain.timeoutFinish);
	wsMain.timeoutFinish = null;
	if (wsMain.bib_force > 0)
		wsMain.bib_select = wsMain.bib_force;
	else
		wsMain.bib_select = -1;

	HideBlockFinish();
	ClearLeader();
}

/**
 * L'arrivée a été vue assez longtemps (delay_finish_min) et un autre bateau
 * est sur l'eau : on passe à lui. Sans cela le résultat restait delay_finish
 * (40 s) à l'écran, pendant que le chrono du bateau suivant tournait sans
 * être affiché.
 */
function FinishCanEnd(tOnCourse)
{
	if (wsMain.bib_force > 0)
		return false;	// bateau imposé par l'URL : on reste sur lui
	if (Date.now() - wsMain.finishShownAt < wsMain.timeoutFinishMinDelay)
		return false;
	const next = GetBibSelect(tOnCourse);
	return next > 0 && next != wsMain.bib_select && tOnCourse.GetIndexRow('bib', next) >= 0;
}

function ForceBib(bib)
{
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking === 'object')
	{
		const row = canoe.GetRankingBibIndex(tRanking, bib);
		if (row >= 0)
		{
			const course_phase = canoe.GetCodeCoursePhase();
			if (tRanking.GetCellInt('Tps_chrono'+course_phase, row, adv.chrono.KO) == adv.chrono.KO)
			{
				ForceBibStart(bib);
			}
			else
			{
				const timerRestart = false;
				ShowFinish(tRanking, row, course_phase, timerRestart);
			}
		}
	}
}

function ForceBibStart(bib)
{
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking === 'object')
	{
		const row = canoe.GetRankingBibIndex(tRanking, bib);
		if (row >= 0)
		{
			document.querySelector('#block_start .bib').innerHTML = wsMain.bib_select;

			SetName('#block_start', tRanking, row);
			SetClub('#block_start', tRanking, row);
			SetCateg('#block_start', tRanking, row);
			ShowBlockStart();
			
			SetLeader();
			ClearLeader();
		}
	}
}

function ForceBibFinish(bib)
{
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking === 'object')
	{
		const row = canoe.GetRankingBibIndex(tRanking, bib);
		if (row >= 0)
		{
			const course_phase = canoe.GetCodeCoursePhase();
			const timerRestart = true;
			ShowFinish(tRanking, row, course_phase, timerRestart)
		}
	}
}

function ForceBibInter(bib, inter)
{
	wsMain.bib_select = wsMain.bib_inter_force;
	SetLeader();

	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking === 'object')
	{
		const row = canoe.GetRankingBibIndex(tRanking, bib);
		if (row >= 0)
		{
			const course_phase_inter = canoe.GetCodeCoursePhase()+'_inter'+inter;
			const tps_inter = tRanking.GetCellInt('Tps'+course_phase_inter, row);
			DoBroadcastBibTimeInter(bib, tps_inter, inter) 
		}
	}
}

function OnBroadcastModeChrono(objJSON)
{
	Reload();
}

function OnBroadcastRunErase(objJSON)
{
	wsMain.bib_select = -1;
	
	ClearLeader();
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
	if (wsMain.timeoutInter != null)
	{
		ShowRunningUnderInter(objJSON);
		return;
	}

	// Avant le classement, on ne saurait ni nommer le bateau ni le situer :
	// à l'ouverture de la page, on attend qu'il soit chargé.
	if (!wsMain.rankingReady)
		return;

	const tOnCourse = adv.GetTableUnique(objJSON, 'table');
	if (tOnCourse == null || typeof tOnCourse !== 'object')
		return;

	if (wsMain.timeoutFinish != null)
	{
		if (!FinishCanEnd(tOnCourse))
			return;
		EndFinish();
	}

	if (wsMain.next_start > 0)
	{
		ShowBibNext(tOnCourse);
		return;
	}

	const nb = tOnCourse.GetNbRows();
	if (wsMain.bib_select <= 0)
	{
		wsMain.bib_select = GetBibSelect(tOnCourse);
		wsMain.bib_select_tick = Date.now();

		if (wsMain.bib_select > 0)
		{
			SetLeader();
			ForceBibStart(wsMain.bib_select);
		}
	}

	if (wsMain.bib_select > 0)
	{
		const i = tOnCourse.GetIndexRow('bib', wsMain.bib_select);
		if (i >= 0)
		{
			// Dossard en Course ...
			const time_running = tOnCourse.GetCellInt('time', i);
			if (canoe.GetCodeActivite() == 'SLA')
			{
				const txtTime = adv.GetChrono(time_running, 'XSCC');
				const tRanking = canoe.GetTableRanking();
				const row = canoe.GetRankingBibIndex(tRanking, wsMain.bib_select);
				if (row >= 0)
				{	
					if (wsMain.time_running_pena == 1)
					{
						const tps_pena = canoe.GetCurrentSlalomTotalPena(tRanking, row)*1000;
						//document.querySelector("#block_running .time").innerHTML = adv.GetChrono(time_running+tps_pena, 'HHMMSSCC');
						document.querySelector("#block_running .time").innerHTML = adv.GetChrono(time_running+tps_pena, 'XSCC');
					}
					else
					{
						//document.querySelector("#block_running .time").innerHTML = adv.GetChrono(time_running, 'HHMMSSCC');
						document.querySelector("#block_running .time").innerHTML = adv.GetChrono(time_running, 'XSCC');
					}
					
					const course_phase = canoe.GetCodeCoursePhase();
					for (let p=1;p<=canoe.GetNbPorte();p++)
					{
						const valPena = tRanking.GetCell('Pena_'+p.toString(), row);
						ShowPenalty(p, valPena, 'block_running');
					}
				}
				else
				{
					//document.querySelector("#block_running .time").innerHTML = adv.GetChrono(time_running, 'HHMMSSCC');
					document.querySelector("#block_running .time").innerHTML = adv.GetChrono(time_running, 'XSCC');
					RequestResync();
				}
			}
			else
			{
				const txtTime = adv.GetChrono(time_running, 'HHMMSSCC');
				document.querySelector("#block_running .time").innerHTML = txtTime;
			}
			
			const block_running = document.getElementById("block_running");
			if (block_running != null && block_running.style.display == 'none')
			{
				block_running.style.display = 'block';
				UpdatePenaPanel();
			}
			
			if (wsMain.leader_index < 0)
				SetLeader();

			if (wsMain.leader_index >= 0)
				ShowLeader(time_running);

			HideBlockStart();
			UpdateRunnerLine();
		}
		else
		{
			// Dossard au départ ou à l'arrivée ...
			if (wsMain.bib_force == wsMain.bib_select)
				wsMain.bib_select_tick = Date.now();

			ForceBib(wsMain.bib_select);
		}
	}
}

/*
 * Pendant l'intermédiaire, le temps de passage est figé en gros ; le chrono
 * continue de tourner en petit dessous, pour qu'on ne perde pas la course.
 */
function ShowRunningUnderInter(objJSON)
{
	const el = document.querySelector('#block_inter .live');
	const tOnCourse = adv.GetTableUnique(objJSON, 'table');
	if (el == null || tOnCourse == null || typeof tOnCourse !== 'object')
		return;

	const i = tOnCourse.GetIndexRow('bib', wsMain.bib_select);
	if (i < 0)
	{
		el.textContent = '';
		return;
	}

	let time_running = tOnCourse.GetCellInt('time', i);
	if (canoe.GetCodeActivite() == 'SLA')
	{
		const tRanking = canoe.GetTableRanking();
		const row = canoe.GetRankingBibIndex(tRanking, wsMain.bib_select);
		if (row >= 0 && wsMain.time_running_pena == 1)
			time_running += canoe.GetCurrentSlalomTotalPena(tRanking, row)*1000;
		el.textContent = adv.GetChrono(time_running, 'XSCC');
	}
	else
		el.textContent = adv.GetChrono(time_running, 'HHMMSSCC');
}

function ShowBibNext(tOncourse)
{
	wsMain.bib_select = GetBibStart(tOncourse);
	wsMain.bib_select_tick = Date.now();
	if (wsMain.bib_select > 0)
	{
		ForceBibStart(wsMain.bib_select);
	}
}

/*
 * Pénalités du bateau affiché, sur le bord droit : une ligne par porte
 * pénalisée (2 s touchée, 50 s manquée), dans l'ordre des portes, ajoutée dès
 * que le juge la saisit. Les portes passées proprement ne sont pas listées.
 * `block_name` reste dans la signature d'origine mais ne sert plus : le
 * panneau est le même en course et à l'arrivée.
 */
function ShowPenalty(gate, pena, block_name)
{
	if (wsMain.penaBib !== wsMain.bib_select)
		ResetPenalties();

	const value = String(pena);
	if (value === '2' || value === '50')
		wsMain.penaGates.set(parseInt(gate), value);
	else
		wsMain.penaGates.delete(parseInt(gate));
	RenderPenalties();
}

function ResetPenalties()
{
	wsMain.penaBib = wsMain.bib_select;
	wsMain.penaGates = new Map();
	const list = document.querySelector('#block_pena .pena-list');
	if (list)
		list.innerHTML = '';
	UpdatePenaPanel();
}

/** Met à jour le panneau sans le reconstruire : seule une nouvelle porte s'anime. */
function RenderPenalties()
{
	const list = document.querySelector('#block_pena .pena-list');
	if (!list)
		return;

	const gates = Array.from(wsMain.penaGates.keys()).sort(function(a, b) { return a - b; });
	Array.from(list.children).forEach(function(el) {
		if (!wsMain.penaGates.has(parseInt(el.dataset.gate)))
			el.remove();
	});
	gates.forEach(function(gate, i) {
		const value = wsMain.penaGates.get(gate);
		let el = list.querySelector('.gate[data-gate="'+gate+'"]');
		if (!el)
		{
			el = document.createElement('div');
			el.className = 'gate';
			el.dataset.gate = gate;
			el.innerHTML = '<span class="num"><small>Porte</small>'+gate+'</span><span class="val"></span>';
		}
		el.dataset.pen = value;
		el.querySelector('.val').textContent = '+'+value;
		if (list.children[i] !== el)
			list.insertBefore(el, list.children[i] || null);
	});

	UpdatePenaPanel();
}

/** Visible tant que le bateau est affiché (en course, intermédiaire, arrivée) et pénalisé. */
function UpdatePenaPanel()
{
	const panel = document.getElementById('block_pena');
	if (!panel || !wsMain.penaGates)
		return;
	const shown = function(id) {
		const el = document.getElementById(id);
		return el != null && el.style.display == 'block';
	};
	const visible = wsMain.penaGates.size > 0 && (shown('block_running') || shown('block_inter') || shown('block_finish'));
	panel.style.display = visible ? 'flex' : 'none';
}

function ClearRunning()
{
	const el = document.getElementById('block_running');
	if (el != null)
		el.style.display = 'none';
	ResetPenalties();
}

function TruncateName(name)
{
	if (wsMain.lengthIdentity > 0)
	{
		if (name.length > wsMain.lengthIdentity)
			return name.substring(0, wsMain.lengthIdentity)+"...";
	}
	
	return name;
}

function TruncateNameLeader(name)
{
	if (wsMain.lengthIdentity > 0)
	{
		if (name.length > wsMain.lengthIdentity)
		{
			let iSeparator = name.indexOf(' ');
			if (iSeparator > 0)
				name = name.substring(0, iSeparator).trim()+' '+name.substring(iSeparator+1, iSeparator+2).toUpperCase();+".";

			if (name.length > wsMain.lengthIdentity)
				return name.substring(0, wsMain.lengthIdentity)+"..";
		}
	}
	
	return name;
}

function SetName(blockName, tRanking, row)
{
	let el = document.querySelector(blockName+' .name');
	el.innerHTML = '';
	if (row >= 0)
	{
		let bateau = tRanking.GetCell('Bateau', row);
		let iSeparator = bateau.indexOf('/');
		if (iSeparator > 0)
		{
			let equipier1 = bateau.substring(0, iSeparator).trim();
			let equipier2 = bateau.substring(iSeparator+1).trim();
			el.innerHTML = TruncateName(equipier1)+'<br>'+TruncateName(equipier2);
			el.classList.add('crew');
		}
		else
		{
			el.innerHTML = TruncateName(bateau);
			el.classList.remove('crew');
		}
	}
}

function SetClub(blockName, tRanking, row)
{
	document.querySelector(blockName+' .club').textContent = row >= 0 ? tRanking.GetCell('Club', row) : '';
}

function SetCateg(blockName, tRanking, row)
{
	if (row >= 0)
		document.querySelector(blockName+' .categ').innerHTML = tRanking.GetCell('Code_categorie', row);
	else
		document.querySelector(blockName+' .categ').innerHTML = '';
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

function ClearLeader()
{
	wsMain.leader_index = -1;
	
	document.getElementById("block_leader").style.display = 'none';
	document.querySelector('#block_leader .name').innerHTML = '';
	document.querySelector('#block_leader .time').innerHTML = '';
}

function SetLeader()
{
	const tRanking = canoe.GetTableRanking();
	wsMain.leader_index = -1;

	if (wsMain.bib_select > 0 && typeof tRanking === 'object')
	{
		const i = canoe.GetRankingBibIndex(tRanking, wsMain.bib_select);
		if (i >= 0)
		{
			const epreuve = tRanking.GetCell('Code_categorie', i);
			const course_phase = canoe.GetCodeCoursePhase();
			tRanking.OrderBy('Cltc'+course_phase+',Heure_depart'+course_phase);
			
			for (let r = 0; r<tRanking.GetNbRows(); r++)
			{
				if (tRanking.GetCell('Code_categorie', r) == epreuve)
				{
					if (tRanking.GetCellInt('Tps'+course_phase, r, -1) > 0)
						wsMain.leader_index = r;
					break;
				}
			}
		}
	}
}

/** Nom du bateau sur une seule ligne : équipage abrégé « A / B ». */
function BoatOneLine(bateau)
{
	let iSeparator = bateau.indexOf('/');
	if (iSeparator > 0)
	{
		let equipier1 = bateau.substring(0, iSeparator).trim();
		if (equipier1.length > 15)
			equipier1 = equipier1.substring(0,14)+'.';

		let equipier2 = bateau.substring(iSeparator+1).trim();
		if (equipier2.length > 15)
			equipier2 = equipier2.substring(0,14)+'.';

		return equipier1+' / '+equipier2;
	}
	return TruncateNameLeader(bateau);
}

function SetLeaderName(el)
{
	const tRanking = canoe.GetTableRanking();
	if (el != null && typeof tRanking === 'object')
	{
		el.innerHTML = '';
		// Une seule ligne : la bande du leader n'a la hauteur que d'un nom.
		if (wsMain.leader_index >= 0)
			el.textContent = BoatOneLine(tRanking.GetCell('Bateau', wsMain.leader_index));
	}
}

/*
 * Mode réduit : une fois l'identité repliée (delay_start), seul le chrono
 * reste à l'écran. Le dossard et le nom passent alors en petit sous le temps,
 * dans le même pavé, pour qu'on sache toujours qui est sur l'eau.
 */
function UpdateRunnerLine()
{
	const block = document.getElementById('block_running');
	const line = block.querySelector('.runner');
	if (line.dataset.bib != String(wsMain.bib_select))
	{
		const tRanking = canoe.GetTableRanking();
		const row = canoe.GetRankingBibIndex(tRanking, wsMain.bib_select);
		line.textContent = row >= 0 ? wsMain.bib_select+'  '+BoatOneLine(tRanking.GetCell('Bateau', row)) : '';
		line.dataset.bib = row >= 0 ? wsMain.bib_select : '';
	}
	const reduced = document.getElementById('block_start').style.display != 'block' && line.textContent != '';
	block.classList.toggle('reduced', reduced);
}

function ShowLeader(tpsRunning)
{
	const tRanking = canoe.GetTableRanking();
	const block_leader = document.getElementById("block_leader");
	if (block_leader != null && typeof tRanking === 'object')
	{
		if (wsMain.leader_index >= 0 && tpsRunning > 0 && tpsRunning < wsMain.tps_running_max)
		{
			const course_phase = canoe.GetCodeCoursePhase();
			const nbInter = canoe.GetNbInter();

			for (let k = 1; k<=nbInter; k++)
			{
				const tpsInter = tRanking.GetCellInt('Tps_chrono'+course_phase+'_inter'+k, wsMain.leader_index);
				if (tpsInter > 0)
				{
					if (tpsRunning + wsMain.leader_before_inter >= tpsInter)
					{
						if (tpsRunning <= tpsInter)
						{
							SetLeaderName(document.querySelector('#block_leader .name'));
							//document.querySelector('#block_leader .time').innerHTML = tRanking.GetCellChrono('Tps'+course_phase+'_inter'+k, wsMain.leader_index, 'HHMMSSCC');
							document.querySelector('#block_leader .time').innerHTML = tRanking.GetCellChrono('Tps'+course_phase+'_inter'+k, wsMain.leader_index, 'XSCC');
							block_leader.style.display = 'block';
							return;
						}
					}
				}
			}

			const tpsFinish = tRanking.GetCellInt('Tps_chrono'+course_phase, wsMain.leader_index);
			if (tpsFinish > 0)
			{
				if (tpsRunning + wsMain.leader_before_finish >= tpsFinish)
				{
					SetLeaderName(document.querySelector('#block_leader .name'));
					
					if (canoe.GetCodeActivite() == 'SLA')
						document.querySelector('#block_leader .time').innerHTML = tRanking.GetCellChrono('Tps'+course_phase, wsMain.leader_index, 'XSCC');
					else
						document.querySelector('#block_leader .time').innerHTML = tRanking.GetCellChrono('Tps'+course_phase, wsMain.leader_index, 'HHMMSSCC');

					block_leader.style.display = 'block';
					return;
				}
			}
		}
	}
}

function ShowBlockFinish()
{
	var el;

	el = document.getElementById("block_start");
	if (el != null)
		el.style.display = 'none';
	
	el = document.getElementById("block_running");
	if (el != null)
		el.style.display = 'none';

	el = document.getElementById("block_leader");
	if (el != null)
		el.style.display = 'none';

	el = document.getElementById("block_inter");
	if (el != null)
		el.style.display = 'none';

	el = document.getElementById("block_finish");
	if (el != null)
		el.style.display = 'block';
	UpdatePenaPanel();
}

function HideBlockFinish()
{
	var el;

	el = document.getElementById("block_finish");
	if (el != null)
		el.style.display = 'none';
	UpdatePenaPanel();
}

function ShowBlockInter()
{
	var el;
	
	el = document.getElementById("block_leader");
	if (el != null)
		el.style.display = 'none';

	el = document.getElementById("block_running");
	if (el != null)
		el.style.display = 'none';

	el = document.getElementById("block_start");
	if (el != null)
		el.style.display = 'block';

	el = document.getElementById("block_inter");
	if (el != null)
		el.style.display = 'block';
	UpdatePenaPanel();
}

function HideBlockInter()
{
	var el = document.getElementById("block_leader");
	if (el != null)
		el.style.display = 'none';

	el = document.getElementById("block_inter");
	if (el != null)
		el.style.display = 'none';

	// Le chrono reprend aussitôt, sans attendre la trame suivante : sinon le
	// coin reste vide un instant. La trame suivante le met à jour (ou affiche
	// l'arrivée si le bateau a fini entre-temps).
	el = document.getElementById("block_running");
	if (el != null && wsMain.bib_select > 0 && wsMain.timeoutFinish == null)
		el.style.display = 'block';
}

function ShowBlockStart()
{
	var el = document.getElementById("block_start");
	if (el != null)
		el.style.display = 'block';
}

function HideBlockStart()
{
	var el = document.getElementById("block_start");
	if (el != null)
 	{
		const now = Date.now();
		if (now - wsMain.bib_select_tick > wsMain.timeoutStartDelay)
		{
			if (el.style.display == 'block')
				el.style.display = 'none';
		}
		else
		{
			ForceBibStart(wsMain.bib_select);
		}
	}
}

////////// Variables globales et Initialisation  //////////
const wsMain = new ws.Context(wsParams.url, wsParams.port);

function Init()
{
	wsMain.lang = 'fr';
	
	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);

	wsMain.filter = ''; 
	wsMain.filter_index = 0; 
	wsMain.filter_modulo = 1; 

	if (urlParams.has('delay'))
	{
		wsMain.delay = parseInt(urlParams.get('delay'));
	}

	/*
	 * Regie : memes parametres que tv_leaders, tv_oncourse et tv_podium.
	 *   bg=1     fond a la couleur de cle au lieu de transparent, et
	 *            animations sans fondu (voir tv_inrace.css, body.chroma)
	 *   anim=0   aucune animation
	 */
	if (urlParams.get('bg') === '1')
		document.body.classList.add('chroma');
	if (urlParams.get('anim') === '0')
		document.body.classList.add('no-anim');

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
	
	// Temps Tournant avec ou sans les pénalités 
	wsMain.time_running_pena = 1;
	if (urlParams.has('time_running_pena'))
		wsMain.time_running_pena = parseInt(urlParams.get('time_running_pena'));
	
	wsMain.time_inter_pena = 1;
	if (urlParams.has('time_inter_pena'))
		wsMain.time_inter_pena = parseInt(urlParams.get('time_inter_pena'));

	wsMain.bib_force = -1;
	wsMain.bib_select = -1;
	wsMain.bib_select_tick = Date.now();
	
	if (urlParams.has('bib_select'))
	{
		wsMain.bib_force = parseInt(urlParams.get('bib_select'));
		wsMain.bib_select = wsMain.bib_force;
	}
	
	wsMain.bib_finish_force = -1;
	if (urlParams.has('bib_finish'))
		wsMain.bib_finish_force = parseInt(urlParams.get('bib_finish'));
	
	wsMain.bib_inter_force = -1;
	if (urlParams.has('bib_inter'))
		wsMain.bib_inter_force = parseInt(urlParams.get('bib_inter'));

	wsMain.leader_force = -1;
	if (urlParams.has('leader'))
		wsMain.leader_force = parseInt(urlParams.get('leader'));
	
	wsMain.next_start = -1;
	if (urlParams.has('next_start'))
		wsMain.next_start = parseInt(urlParams.get('next_start'));
	
	// Temps Tournant Max ...
	wsMain.tps_running_max = 59*60*1000;	
	if (urlParams.has('tps_running_max'))
		wsMain.tps_running_max = parseInt(urlParams.get('tps_running_max'));

	// Format de Temps
	wsMain.fmtChrono = '';
	if (urlParams.has('fmt_chrono'))
		wsMain.fmtChrono = urlParams.get('fmt_chrono');

	wsMain.timeoutFinish = null;
	wsMain.timeoutInter = null;
	wsMain.raceReady = false;
	wsMain.rankingReady = false;
	wsMain.resyncAt = 0;
	ResetPenalties();

	wsMain.leader_index = -1;
	wsMain.leader_before_inter = 5000;
	wsMain.leader_before_finish = 7000;
	ClearLeader();
	
	wsMain.timeoutFinishDelay = 40000;
	if (urlParams.has('delay_finish'))
		wsMain.timeoutFinishDelay = parseInt(urlParams.get('delay_finish'));

	// Durée minimale de l'arrivée avant de passer au bateau suivant sur l'eau.
	wsMain.timeoutFinishMinDelay = 8000;
	if (urlParams.has('delay_finish_min'))
		wsMain.timeoutFinishMinDelay = parseInt(urlParams.get('delay_finish_min'));
	wsMain.finishShownAt = 0;
	
	wsMain.timeoutInterDelay = 5000;
	if (urlParams.has('delay_inter'))
		wsMain.timeoutInterDelay = parseInt(urlParams.get('delay_inter'));
	
	wsMain.timeoutStartDelay = 10000;
	if (urlParams.has('delay_start'))
		wsMain.timeoutStartDelay = parseInt(urlParams.get('delay_start'));
	
	wsMain.lengthIdentity = 26;
	if (urlParams.has('length_identity'))
		wsMain.lengthIdentity = parseInt(urlParams.get('length_identity'));

	// Command Notification
	wsMain.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsMain.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.mapCommand.set('<order>', OnCommandOrder);
	
	// Broadcast Notification
	wsMain.mapCommand.set('<mode_chrono>', OnBroadcastModeChrono);
	wsMain.mapCommand.set('<bib_time>', OnBroadcastBibTime);
	wsMain.mapCommand.set('<penalty_add>', OnBroadcastPenaltyAdd);
	wsMain.mapCommand.set('<run_erase>', OnBroadcastRunErase);
	
	// Flow Notification
	wsMain.mapCommand.set('<on_course>', OnFlowOnCourse);

	// Ouverture ws 
	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
}
