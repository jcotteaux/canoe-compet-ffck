// Le flux peut être retardé par les saisies dans CompetFFCK.
// Dérouler localement le temps brut, puis recaler progressivement les trames.
function StopRunningClock()
{
	myContext.runningClock = null;
}

function UpdateRunningClock(time)
{
	if (!Number.isFinite(time) || time < 0) { StopRunningClock(); return; }
	const now = performance.now();
	RenderRunningClock();
	let clock = myContext.runningClock;
	if (!clock || clock.bib != myContext.bib_select || time < clock.receivedTime - 2000)
		clock = myContext.runningClock = {bib: myContext.bib_select, value: time, tick: now};
	clock.tick = now;
	clock.receivedTime = time;
	clock.receivedAt = now;
	RenderRunningClock();
}

function RenderRunningClock()
{
	const clock = myContext.runningClock;
	if (!clock || myContext.timeoutFinish != null || myContext.timeoutInter != null) return;
	const now = performance.now();
	// Ne pas inventer indéfiniment un temps en cas de coupure du flux.
	const tick = Math.min(now, clock.receivedAt + 3000);
	const elapsed = Math.max(0, tick - clock.tick);
	const target = clock.receivedTime + Math.min(now - clock.receivedAt, 3000);
	const correction = Math.max(-elapsed * 0.2, Math.min(elapsed * 0.2, target - (clock.value + elapsed)));
	clock.value += elapsed + correction;
	clock.tick = tick;
	let time = clock.value;
	if (myContext.time_running_pena == 1 && canoe.GetCodeActivite() == 'SLA')
	{
		const ranking = canoe.GetTableRanking();
		const row = ranking ? ranking.GetIndexRow('Dossard', clock.bib) : -1;
		if (row >= 0) time += canoe.GetCurrentSlalomTotalPena(ranking, row) * 1000;
	}
	const elem = document.querySelector('#block_running .time');
	const text = adv.GetChrono(Math.floor(time / 100) * 100, (canoe.GetCodeActivite() == 'SLA' || canoe.GetCodeActivite() == 'EXS' ? 'XSCC' : 'HHMMSSCC'));
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
	canoe.SetFmtChrono(myContext.fmtChrono);

	// Chargement de toutes les épreuves ...
	const cmd = { key : '<epreuve_load>',  epreuve : '' };	
	wsMain.websocket.send(JSON.stringify(cmd));
}

function OnCommandEpreuveLoad(objJSON)
{
//	alert("OnCommandEpreuveLoad :"+JSON.stringify(objJSON));
//	console.log(JSON.stringify(objJSON));
	canoe.SetRanking(objJSON);

	const tRanking = canoe.GetTableRanking();
	
	
	const course_phase = canoe.GetCodeCoursePhase();
	canoe.SetColumnNameRanking(tRanking);
	canoe.ComputeTpsInter(tRanking, 1);
	canoe.ComputeTpsInter(tRanking, 2);

	Run(InitBlock);

	if (myContext.bib_finish_force > 0)
		ForceBibFinish(myContext.bib_finish_force);

	if (myContext.bib_inter_force > 0)
		ForceBibInter(myContext.bib_inter_force, 1);

	if (myContext.leader_force > 0)
	{
		if (myContext.bib_select <= 0)
			myContext.bib_select = 1;
		
		SetLeader();
		Run(ShowLeader, myContext.tps_running_max-1);
	}
}

function InitBlock() 
{
	const nb_porte = canoe.GetNbPorte();
	CreateBlockPena('block_running', nb_porte);
	CreateBlockPena('block_inter', nb_porte);
	CreateBlockPena('block_finish', nb_porte);
}

function CreateBlockPena(block_name, nb_porte)
{
	if (canoe.GetCodeActivite() == 'EXS') {
		CreateBlockPenaEXS(block_name, nb_porte);
	} else {
		CreateBlockPenaSLA(block_name, nb_porte);
	}
}

function CreateBlockPenaSLA(block_name, nb_porte)
{
	const elemPena = document.querySelector('#'+block_name+' div.pena');
	if (elemPena && typeof elemPena === "object")
	{
		var html = '';
		for (let p=1;p<=nb_porte;p++)
		{
			const red = canoe.IsPorteInv(p) ? '1' : '0';
			html += "<div class='gate' data-red='"+red+"' data-pen='-1' data-col='"+p+"'>&nbsp;"+p+"</div>";
		}
		elemPena.innerHTML = html;
	}

	const h_block_px = getComputedStyle(document.documentElement).getPropertyValue('--block_pena_sla_height');
	const h_block = parseInt(h_block_px.substring(0, h_block_px.length-2));
	const h_total = h_block * nb_porte;

	const elemTime = document.querySelector('#'+block_name+' div.time');
	if (elemTime && typeof elemTime === "object")
	{
		const topTimePx = getComputedStyle(elemTime).top;
		const topTime = parseInt(topTimePx.substring(0, topTimePx.length-2));
		const topPena = topTime-h_total;
		elemPena.style.top = topPena.toString()+'px';
	}
}

function CreateBlockPenaEXS(block_name, nb_porte)
{
	const elemPena = document.querySelector('#'+block_name+' div.pena');
	if (elemPena && typeof elemPena === "object")
	{
		var html = '';
		for (let p=1;p<=nb_porte;p++)
		{
			// S=Start,R=Rouge,E=Esquimautage,F=Finish ou vide
			const info_porte = canoe.GetPorteInfoEXS(p);
			const num_porte = (info_porte == '' || info_porte == 'R') ? canoe.GetNumPorteEXS(p) : info_porte;
	
			html += "<div class='gate_exs' data-info='"+info_porte+"' data-pen='-1' data-col='"+p+"'>&nbsp;"+num_porte+"</div>";
		}
		elemPena.innerHTML = html;
	}

	const h_block_px = getComputedStyle(document.documentElement).getPropertyValue('--block_pena_exs_height');
	const h_block = parseInt(h_block_px.substring(0, h_block_px.length-2));
	const h_total = h_block * nb_porte;

	const elemTime = document.querySelector('#'+block_name+' div.time');
	if (elemTime && typeof elemTime === "object")
	{
		const topTimePx = getComputedStyle(elemTime).top;
		const topTime = parseInt(topTimePx.substring(0, topTimePx.length-2));
		const topPena = topTime-h_total;
		elemPena.style.top = topPena.toString()+'px';
	}
}

function OnBroadcastPenaltyAdd(objJSON) 
{
	const bib = objJSON.bib;
	const porte = objJSON.gate;
	
	var pena = objJSON.penalty;
	if (canoe.GetCodeActivite() == 'EXS' && pena == '50') {
		// en EXS il n'y pas de RAL : on change par sécurité ....
		pena = '2';
	}

	const course_phase = canoe.GetCodeCoursePhase();
	const tRanking = canoe.GetTableRanking();
	
	var row = canoe.GetRankingBibIndex(tRanking, bib);
	if (row >= 0)
	{
		const oldTps = tRanking.GetCellInt('Tps'+course_phase, row);
		if (canoe.GetCodeActivite() == 'EXS') {
			tRanking.SetCell('Pena_'+porte, row, pena);
			canoe.UpdateExsFinishTime(tRanking, row);
			row = canoe.GetRankingBibIndex(tRanking, bib);
		} else {
			canoe.UpdateSlalomPena(tRanking, row, porte, pena);
		}
	
		if (myContext.bib_select < 0)
		{
			myContext.bib_select = bib;
			myContext.bib_select_tick = Date.now();
			SetLeader();
		}
		
		if (myContext.bib_select == bib)
		{
			const tps_chrono = tRanking.GetCellInt('Tps_chrono'+course_phase, row, adv.chrono.KO);
			if (tps_chrono == adv.chrono.KO) 
			{
				Run(ShowPenalty, porte, pena, 'block_running');
			}
			else
			{
				const timerRestart = false;
				Run(ShowFinish, tRanking, row, course_phase, timerRestart);
			}
		}
	}
}

function OnBroadcastBibTime(objJSON) 
{
	const passage = parseInt(objJSON.passage);
	if (passage >= 1)
		DoBroadcastBibTimeInter(objJSON.bib, objJSON.time_chrono, passage);
	else
		DoBroadcastBibTimeFinish(objJSON.bib, objJSON.time_chrono);
}

function DoBroadcastBibTimeInter(bib, time_chrono, inter) 
{
	StopRunningClock();
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking === 'object')
	{
		const course_phase_inter = canoe.GetCodeCoursePhase()+'_inter'+inter;
		const row = canoe.GetRankingBibIndex(tRanking, bib);

		var tps = time_chrono;
		if (tps > 0)
		{
			if (myContext.time_inter_pena == 1)
			{
				const tps_pena = canoe.GetCurrentSlalomTotalPena(tRanking, row)*1000;
				tps += tps_pena;
			}
		}

		if (bib == myContext.bib_select && row >= 0)
		{
			var txtDiff = '';
			var txtColor = 'red';
			
			if (tps > 0)
			{
				txtColor = 'green';
				if (myContext.leader_index >= 0 && myContext.leader_index < tRanking.GetNbRows())
				{
					const tpsLeader = tRanking.GetCellInt('Tps'+course_phase_inter, myContext.leader_index);
					if (tpsLeader > 0)
					{
						const diff = tps - tpsLeader;
						txtDiff = adv.GetChronoDiffXSCC(diff);
						
						if (diff > 0)
							txtColor = 'red';
						else
							txtColor = 'green';
					}
				}
			}

			if (myContext.timeoutInter != null)
			{
				window.clearTimeout(myContext.timeoutInter);
				myContext.timeoutInter = null;
			}
			
			myContext.timeoutInter = window.setTimeout(function() { 
					myContext.timeoutInter = null; 
					HideBlockInter();
				},	myContext.timeoutInterDelay
			);

			document.querySelector('#block_start .bib').innerHTML = bib;
			SetName('#block_start', tRanking, row);
			SetNation('#block_start', tRanking, row);
			SetCateg('#block_start', tRanking, row);

			var txtTime = '';
			if (canoe.GetCodeActivite() == 'SLA')
				txtTime = adv.GetChronoXSCC(tps >= 0 ? Math.floor(tps / 100) * 100 : tps);
			else
				txtTime = adv.GetChronoHHMMSSCC(tps >= 0 ? Math.floor(tps / 100) * 100 : tps);
			
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

			if (canoe.GetCodeActivite() == 'SLA' || canoe.GetCodeActivite() == 'EXS') 
			{
				for (let p=1;p<=canoe.GetNbPorte();p++)
				{
					const valPena = tRanking.GetCell('Pena_'+p.toString(), row);
					Run(ShowPenalty, p, valPena, 'block_inter');
				}
			}

			ShowBlockInter();
		}
		
		tRanking.UpdateRankingTime(row, tRanking.GetIndexColumn('Tps_chrono'+course_phase_inter), tRanking.GetIndexColumn('Cltc_chrono'+course_phase_inter), tRanking.GetCellInt('Tps_chrono'+course_phase_inter,row), time_chrono);
		tRanking.UpdateRankingTime(row, tRanking.GetIndexColumn('Tps'+course_phase_inter), tRanking.GetIndexColumn('Cltc'+course_phase_inter), tRanking.GetCellInt('Tps'+course_phase_inter,row), tps);
	}
}

function DoBroadcastBibTimeFinish(bib, time_chrono) 
{
	const course_phase = canoe.GetCodeCoursePhase();
	const tRanking = canoe.GetTableRanking();

	if (typeof tRanking === 'object')
	{
		var row = canoe.GetRankingBibIndex(tRanking, bib);
		if (row >= 0)
		{
			const codeActivite = canoe.GetCodeActivite();
			const oldTpsChrono = tRanking.GetCellInt('Tps_chrono'+course_phase, row);
			const newTpsChrono = time_chrono;
			tRanking.UpdateRankingTime(row, tRanking.GetIndexColumn('Tps_chrono'+course_phase), tRanking.GetIndexColumn('Cltc_chrono'+course_phase),oldTpsChrono, newTpsChrono);

			if (codeActivite == 'SLA') {
				canoe.UpdateSlalomFinishTime(tRanking, row);
			} else if (codeActivite == 'EXS') {
				canoe.UpdateExsFinishTime(tRanking, row);
				row = canoe.GetRankingBibIndex(tRanking, bib);
			} else {
				tRanking.UpdateRankingTime(row, tRanking.GetIndexColumn('Tps'+course_phase), tRanking.GetIndexColumn('Clt'+course_phase),oldTpsChrono, newTpsChrono);
				tRanking.UpdateRankingTime(row, tRanking.GetIndexColumn('Tps_chrono'+course_phase), tRanking.GetIndexColumn('Clt_chrono'+course_phase),oldTpsChrono, newTpsChrono);

				tRanking.UpdateRankingGroupTime(row, tRanking.GetIndexColumn('Tps'+course_phase), tRanking.GetIndexColumn('Cltc'+course_phase),oldTpsChrono, newTpsChrono, 'Code_categorie');
				tRanking.UpdateRankingGroupTime(row, tRanking.GetIndexColumn('Tps_chrono'+course_phase), tRanking.GetIndexColumn('Cltc_chrono'+course_phase),oldTpsChrono, newTpsChrono, 'Code_categorie');
			}

			if (myContext.filter == 'bib')
			{
				if (bib % myContext.filter_modulo != myContext.filter_index)
					return;
			}
			else if (myContext.filter == 'rk')
			{
				const rk = tRanking.GetCellInt('Rang'+course_phase, row);
				if (rk % myContext.filter_modulo != myContext.filter_index)
					return;
			}
			
			if (myContext.bib_force > 0 && parseInt(bib) != myContext.bib_force)
				return;

			if (newTpsChrono != adv.chrono.KO && newTpsChrono != adv.chrono.DNS)
			{
				const timerRestart = true;
				Run(ShowFinish, tRanking, row, course_phase, timerRestart);
			}
		}
	}
}

function ShowFinish(tRanking, row, course_phase, timerRestart=false) 
{
	StopRunningClock();
	if (typeof tRanking === 'object' && row >= 0)
	{
		myContext.bib_select = tRanking.GetCell('Dossard',row);

		if (canoe.GetCodeActivite() == 'SLA' || canoe.GetCodeActivite() == 'EXS') 
		{
			// SLA - EXS
			for (let p=1;p<=canoe.GetNbPorte();p++)
			{
				const valPena = tRanking.GetCell('Pena_'+p.toString(), row);
				Run(ShowPenalty, p, valPena, 'block_finish');
			}

			var txtRk = '';
			var txtTime = '';
			var txtDiff = '';
	
			if (canoe.GetCodeActivite() == 'SLA') {
				// SLA
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
					if (myContext.time_running_pena == 1 && tps >= adv.chrono.OK)
						tps += canoe.GetCurrentSlalomTotalPena(tRanking, row)*1000;
					txtTime = adv.GetChrono(tps, 'XSCC');
				}
			} else {
				// EXS
				canoe.UpdateExsTotalPena(tRanking, row);
				const time = tRanking.GetCellInt('Tps'+course_phase, row);
				if (time >= adv.chrono.OK) {
					txtRk = tRanking.GetCellInt('Cltc'+course_phase, row);
					txtTime = adv.GetChrono(time, 'XSCC');
					const diff = tRanking.GetDiffTime('Tps'+course_phase, row, 'Code_categorie');
					if (diff !== undefined && diff !== null) {
						txtDiff = adv.GetChronoDiffXSCC(diff); 
					}
				} else {
					const tps_chrono = tRanking.GetCellInt('Tps_chrono'+course_phase, row);
					txtTime = adv.GetChrono(tps_chrono, 'XSCC');
				}
			}
			
			ShowFinishData(tRanking, row, txtRk, txtTime, txtDiff, timerRestart);
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

function ShowFinishData(tRanking, row, txtRk, txtTime, txtDiff, timerRestart=false)
{
	var txtColor = '';
	if (txtDiff.length > 0)
	{
		if (txtDiff.substring(0,1) == '+')
			txtColor = 'red';
		else
			txtColor = 'green';
	}
			
	if (myContext.timeoutInter != null)
	{
		window.clearTimeout(myContext.timeoutInter);
		myContext.timeoutInter = null;
	}

	if (myContext.timeoutFinish == null || timerRestart)
	{
		if (myContext.timeoutFinish != null)
			window.clearTimeout(myContext.timeoutFinish);
	
		myContext.timeoutFinish = window.setTimeout(function() { 
				myContext.timeoutFinish = null; 
				if (myContext.bib_force > 0)
					myContext.bib_select = myContext.bib_force;
				else
					myContext.bib_select = -1;

				HideBlockFinish();
				ClearLeader();
			},	myContext.timeoutFinishDelay
		);
	}

	document.querySelector('#block_finish .bib').innerHTML = myContext.bib_select;
	SetName('#block_finish', tRanking, row);
	SetNation('#block_finish', tRanking, row);
	SetCateg('#block_finish', tRanking, row);

if (parseInt(txtRk) == 1)
    txtRk = txtRk + '<sup>er</sup>';
else if (parseInt(txtRk) > 1)
    txtRk = txtRk + '<sup>ème</sup>';

	document.querySelector('#block_finish .rank').innerHTML = txtRk;
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
				Run(ShowFinish, tRanking, row, course_phase, timerRestart);
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
			document.querySelector('#block_start .bib').innerHTML = myContext.bib_select;

			SetName('#block_start', tRanking, row);
			SetNation('#block_start', tRanking, row);
			SetCateg('#block_start', tRanking, row);
			ShowBlockStart();
			
			SetLeader();
			if (myContext.leader_index < 0)
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
			Run(ShowFinish, tRanking, row, course_phase, timerRestart)
		}
	}
}

function ForceBibInter(bib, inter)
{
	myContext.bib_select = myContext.bib_inter_force;
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
	myContext.bib_select = -1;
	
	ClearLeader();
	Reload();
}

function Reload()
{
	StopRunningClock();
	if (myContext.timeoutFinish != null)
	{
		window.clearTimeout(myContext.timeoutFinish);
		myContext.timeoutFinish = null;
	}

	if (myContext.timeoutInter != null)
	{
		window.clearTimeout(myContext.timeoutInter);
		myContext.timeoutInter = null;
	}
	
	OnOpenWebSocketCommand();
	ClearRunning();
}

function OnFlowOnCourse(objJSON)
{
	if (myContext.timeoutFinish != null || myContext.timeoutInter != null)
		return;

	const tOnCourse = adv.GetTableUnique(objJSON, 'table');
	if (tOnCourse == null || typeof tOnCourse !== 'object')
		return;

	if (myContext.next_start > 0)
	{
		Run(ShowBibNext, tOnCourse);
		return;
	}

	const nb = tOnCourse.GetNbRows();
	if (myContext.bib_select <= 0)
	{
		myContext.bib_select = GetBibSelect(tOnCourse);
		myContext.bib_select_tick = Date.now();

		if (myContext.bib_select > 0)
		{
			SetLeader();
			ForceBibStart(myContext.bib_select);
		}
	}

	if (myContext.bib_select > 0)
	{
		const i = tOnCourse.GetIndexRow('bib', myContext.bib_select);
		if (i >= 0)
		{
			// Dossard en Course ...
			const time_running = tOnCourse.GetCellInt('time', i);
			const tRanking = canoe.GetTableRanking();

			UpdateRunningClock(time_running);
			if (tRanking && (canoe.GetCodeActivite() == 'SLA' || canoe.GetCodeActivite() == 'EXS')) {
				const row = canoe.GetRankingBibIndex(tRanking, myContext.bib_select);
				if (row >= 0) for (let p=1; p<=canoe.GetNbPorte(); p++)
					Run(ShowPenalty, p, tRanking.GetCell('Pena_'+p, row), 'block_running');
			}

			const block_running = document.getElementById("block_running");
			if (block_running != null && block_running.style.display == 'none')
				block_running.style.display = 'block';
			
			if (myContext.leader_index < 0)
				SetLeader();

			if (myContext.leader_index >= 0)
				Run(ShowLeader, time_running);

			HideBlockStart();
		}
		else
		{
			StopRunningClock();
			// Dossard au départ ou à l'arrivée ...
			if (myContext.flag_init === true)
			{
				if (myContext.bib_force == myContext.bib_select)
					myContext.bib_select_tick = Date.now();

				ForceBib(myContext.bib_select);
			}
		}
	}
}

function ShowBibNext(tOncourse)
{
	StopRunningClock();
	myContext.bib_select = GetBibStart(tOncourse);
	myContext.bib_select_tick = Date.now();
	if (myContext.bib_select > 0)
	{
		ForceBibStart(myContext.bib_select);
	}
}

function ShowPenalty(gate, pena, block_name)
{
	const elem = document.querySelectorAll('#'+block_name+' div.pena div[data-col="'+gate.toString()+'"]');
	if (elem && typeof elem === "object" && elem.length == 1) {
		if (pena == '0')
			elem[0].setAttribute("data-pen", '0');
		else if (pena == '2')
			elem[0].setAttribute("data-pen", '2');
		else if (pena == '50')
			elem[0].setAttribute("data-pen", '50');
		else
			elem[0].setAttribute("data-pen", '-1');
	}
}

function TruncateName(name)
{
	if (myContext.lengthIdentity > 0)
	{
		if (name.length > myContext.lengthIdentity)
			return name.substring(0, myContext.lengthIdentity)+"...";
	}
	
	return name;
}

function TruncateNameLeader(name)
{
	if (myContext.lengthIdentity > 0)
	{
		if (name.length > myContext.lengthIdentity)
		{
			let iSeparator = name.indexOf(' ');
			if (iSeparator > 0)
				name = name.substring(0, iSeparator).trim()+' '+name.substring(iSeparator+1, iSeparator+2).toUpperCase();+".";

			if (name.length > myContext.lengthIdentity)
				return name.substring(0, myContext.lengthIdentity)+"..";
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
			el.innerHTML = TruncateName(equipier1)+' / '+TruncateName(equipier2);
			el.style.fontSize = "35pt";
		}
		else
		{
			el.innerHTML = TruncateName(bateau);
			el.style.fontSize = "42pt";
		}
	}
}

function SetNation(blockName, tRanking, row)
{
	let nation = '';
	if (row >= 0)
		nation = tRanking.GetCell('Code_nation', row);

	document.querySelector(blockName+' .nation').innerHTML = nation;
	if (nation == '')
		document.querySelector(blockName+' .img_nation').src = "./tv_inrace_assets/canoe/img/Flags/Empty.png";
	else
		document.querySelector(blockName+' .img_nation').src = "./tv_inrace_assets/canoe/img/Flags/"+nation+".png";
}

function SetCateg(blockName, tRanking, row)
{
	if (row >= 0)
		document.querySelector(blockName+' .categ').innerHTML = Categorie_name(tRanking.GetCell('Code_categorie', row));
	else
		document.querySelector(blockName+' .categ').innerHTML = '';
}

function GetBibSelect(tOnCourse)
{
	const nb = tOnCourse.GetNbRows();
	if (nb > 0)
	{
		if (myContext.filter == 'bib')
		{
			var r = nb-1;
			while (r >= 0)
			{
				if (tOnCourse.GetCellInt('bib', r) % myContext.filter_modulo  == myContext.filter_index)
					return tOnCourse.GetCellInt('bib', r);
				--r;
			}
		}
		else if (myContext.filter == 'rk')
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
						if (rk % myContext.filter_modulo  == myContext.filter_index)
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
					if (myContext.filter == 'bib')
					{
						if (tRanking.GetCellInt('Dossard', r) % myContext.filter_modulo == myContext.filter_index)
							return tRanking.GetCellInt('Dossard', r);
					}
					else if (myContext.filter == 'rk')
					{
						const rk = tRanking.GetCellInt('Rang'+course_phase, r);
//						alert('OK1:bib='+tRanking.GetCell('Dossard', r)+", rk="+rk+", course_phase="+course_phase+", colindex="+tRanking.GetIndexColumn('Rang'+course_phase));

						if (rk % myContext.filter_modulo == myContext.filter_index)
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
	myContext.leader_index = -1;
	
	document.getElementById("block_leader").style.display = 'none';
	document.querySelector('#block_leader .name').innerHTML = '';
	document.querySelector('#block_leader .time').innerHTML = '';
}

function SetLeader()
{
	const tRanking = canoe.GetTableRanking();
	myContext.leader_index = -1;

	if (myContext.bib_select > 0 && typeof tRanking === 'object')
	{
		const i = canoe.GetRankingBibIndex(tRanking, myContext.bib_select);
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
						myContext.leader_index = r;
					break;
				}
			}
		}
	}
}

function SetLeaderName(el)
{
	const tRanking = canoe.GetTableRanking();
	if (el != null && typeof tRanking === 'object')
	{
		el.innerHTML = '';
		if (myContext.leader_index >= 0)
		{
			let bateau = tRanking.GetCell('Bateau', myContext.leader_index);

			let iSeparator = bateau.indexOf('/');
			if (iSeparator > 0)
			{
				let equipier1 = bateau.substring(0, iSeparator).trim();
				if (equipier1.length > 10)
					equipier1 = equipier1.substring(0,9)+'.';

				let equipier2 = bateau.substring(iSeparator+1).trim();
				if (equipier2.length > 10)
					equipier2 = equipier2.substring(0,9)+'.';

				el.innerHTML = TruncateName(equipier1)+'/'+TruncateName(equipier2);
				el.style.fontSize = "24pt";
			}
			else
			{
				el.innerHTML = TruncateNameLeader(bateau);
				el.style.fontSize = "24pt";
			}
		}
	}
}

function ShowLeader(tpsRunning)
{
	const tRanking = canoe.GetTableRanking();
	const block_leader = document.getElementById("block_leader");
	if (block_leader != null && typeof tRanking === 'object')
	{
		if (myContext.leader_index >= 0 && tpsRunning > 0 && tpsRunning < myContext.tps_running_max)
		{
			const course_phase = canoe.GetCodeCoursePhase();
			const nbInter = canoe.GetNbInter();
			
			for (let k = 1; k<=nbInter; k++)
			{
				const tpsInter = tRanking.GetCellInt('Tps_chrono'+course_phase+'_inter'+k, myContext.leader_index);
				if (tpsInter > 0)
				{
					if (tpsRunning + myContext.leader_before_inter >= tpsInter)
					{
						if (tpsRunning <= tpsInter)
						{
							SetLeaderName(document.querySelector('#block_leader .name'));
							document.querySelector('#block_leader .time').innerHTML = tRanking.GetCellChrono('Tps'+course_phase+'_inter'+k, myContext.leader_index, 'XSCC');
							block_leader.style.display = 'block';
							return;
						}
					}
				}
			}

			const tpsFinish = tRanking.GetCellInt('Tps_chrono'+course_phase, myContext.leader_index);
			if (tpsFinish > 0)
			{
				if (tpsRunning + myContext.leader_before_finish >= tpsFinish)
				{
					SetLeaderName(document.querySelector('#block_leader .name'));
					
					if (canoe.GetCodeActivite() == 'SLA' || canoe.GetCodeActivite() == 'EXS')
						document.querySelector('#block_leader .time').innerHTML = tRanking.GetCellChrono('Tps'+course_phase, myContext.leader_index, 'XSCC');
					else
						document.querySelector('#block_leader .time').innerHTML = tRanking.GetCellChrono('Tps'+course_phase, myContext.leader_index, 'HHMMSSCC');

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
}

function HideBlockFinish()
{
	var el;

	el = document.getElementById("block_finish");
	if (el != null)
		el.style.display = 'none';
}

function ShowBlockInter()
{
	var el;

	el = document.getElementById("block_running");
	if (el != null)
		el.style.display = 'none';

	el = document.getElementById("block_start");
	if (el != null)
		el.style.display = 'block';

	el = document.getElementById("block_leader");
	if (el != null)
		el.style.display = 'none';
	
	el = document.getElementById("block_inter");
	if (el != null)
		el.style.display = 'block';
}

function HideBlockInter()
{
	var el = document.getElementById("block_leader");
	if (el != null)
		el.style.display = 'none';

	el = document.getElementById("block_inter");
	if (el != null)
		el.style.display = 'none';
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
		if (myContext.bib_select_tick == null && myContext.bib_force > 0)
			myContext.bib_select_tick = Date.now();
		
		const now = Date.now();
		if (now - myContext.bib_select_tick > myContext.timeoutStartDelay)
		{
			if (el.style.display == 'block')
				el.style.display = 'none';
		}
		else
		{
			ForceBibStart(myContext.bib_select);
		}
	}
}

function Run(fn, ...param)
{
	if (typeof fn === 'function' && typeof fn.name === 'string')
	{
		const fn_name = fn.name;
		if (typeof myContext[fn_name] === 'function')
			myContext[fn_name](...param);
		else
			fn(...param);
	}
}

////////// Variables globales et Initialisation  //////////

const myContext = {
	lang : 'fr',

	filter : ''	,	// 'bib' ou 'rk'
	filter_index : 0,
	filter_modulo : 1,

	bib_force : -1,		// dossard forcé 
	bib_select : -1,	// dossard sélection
	select_tick  : Date.now(),

	time_running_pena : 1,	// Temps Tournant tenant compte ou pas des pénalités
	time_inter_pena : 1,	// Temps Inter tenant compte ou pas des pénalités

	tps_running_max : 59*60*1000,	// Temps tournant Maxi

	fmtChrono : '',			// Format de Temps

	timeoutFinishDelay : 10000,	// Affichage en ms du laps de temps à l'arrivée
	timeoutInterDelay : 5000,		// Affichage en ms du laps de temps à l'inter
	timeoutStartDelay : 20000,		// Affichage en ms du laps de temps au départ

	timeoutFinish : null,
	timeoutInter : null,

	leader_index: -1,
	leader_before_inter : 5000,		// Avance affichage  du leader à l'inter
	leader_before_finish : 7000,	// Avance affichage  du leader à l'arrivée
	lengthIdentity : 26,  // Longueur nom block Nom

	bib_finish_force : -1, 	// Dossard Arrivée forcé (debug)
	bib_inter_force : -1,	// Dossard Inter forcé (debug)
	leader_force : -1,		// Leader forcé (debug)
	next_start : -1,	
};

const wsMain = new ws.Context(wsParams.url, wsParams.port);

function Init(paramsJSON)
{
	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);

	if (typeof InitContext === 'function')
		InitContext(paramsJSON);

	if (urlParams.has('bib_filter'))
	{
		myContext.filter = 'bib'; 
		const filter = urlParams.get('bib_filter');
		if (filter == 'pair')
		{
			myContext.filter_modulo = 2; 
			myContext.filter_index = 0; 
		}
		else if (filter == 'odd')
		{
			myContext.filter_modulo = 2; 
			myContext.filter_index = 1; 
		}
		else
		{
			const splits = filter.split("/");
			if (splits.length == 2)
			{
				myContext.filter_index = parseInt(splits[0]);
				myContext.filter_modulo = parseInt(splits[1]);
			}
		}
	}
	
	if (urlParams.has('rk_filter'))
	{
		myContext.filter = 'rk'; 
		const filter = urlParams.get('rk_filter');
		if (filter == 'pair')
		{
			myContext.filter_modulo = 2; 
			myContext.filter_index = 0; 
		}
		else if (filter == 'odd')
		{
			myContext.filter_modulo = 2; 
			myContext.filter_index = 1; 
		}
		else
		{
			const splits = filter.split("/");
			if (splits.length == 2)
			{
				myContext.filter_index = parseInt(splits[0]);
				myContext.filter_modulo = parseInt(splits[1]);
			}
		}
	}
	
	// Temps Tournant avec ou sans les pénalités 
	if (urlParams.has('time_running_pena'))
		myContext.time_running_pena = parseInt(urlParams.get('time_running_pena'));
	
	if (urlParams.has('time_inter_pena'))
		myContext.time_inter_pena = parseInt(urlParams.get('time_inter_pena'));
	
	if (urlParams.has('bib_select'))
	{
		myContext.bib_force = parseInt(urlParams.get('bib_select'));
		myContext.bib_select = myContext.bib_force;
	}
	
	if (urlParams.has('bib_finish'))
		myContext.bib_finish_force = parseInt(urlParams.get('bib_finish'));

	if (urlParams.has('bib_inter'))
		myContext.bib_inter_force = parseInt(urlParams.get('bib_inter'));

	if (urlParams.has('leader'))
		myContext.leader_force = parseInt(urlParams.get('leader'));
	
	if (urlParams.has('next_start'))
		myContext.next_start = parseInt(urlParams.get('next_start'));
	
	// Temps Tournant Max ...
	if (urlParams.has('tps_running_max'))
		myContext.tps_running_max = parseInt(urlParams.get('tps_running_max'));

	// Format de Temps
	if (urlParams.has('fmt_chrono'))
		myContext.fmtChrono = urlParams.get('fmt_chrono');

//	ClearLeader();
	
	if (urlParams.has('delay_finish'))
		myContext.timeoutFinishDelay = parseInt(urlParams.get('delay_finish'));
	
	if (urlParams.has('delay_inter'))
		myContext.timeoutInterDelay = parseInt(urlParams.get('delay_inter'));
	
	if (urlParams.has('delay_start'))
		myContext.timeoutStartDelay = parseInt(urlParams.get('delay_start'));
	
	if (urlParams.has('length_identity'))
		myContext.lengthIdentity = parseInt(urlParams.get('length_identity'));

	// Command Notification
	wsMain.SetCommand('<race_load>', OnCommandRaceLoad);
	wsMain.SetCommand('<epreuve_load>', OnCommandEpreuveLoad);
	wsMain.SetCommand('<order>', OnCommandOrder);
	
	// Broadcast Notification
	wsMain.SetCommand('<mode_chrono>', OnBroadcastModeChrono);
	wsMain.SetCommand('<bib_time>', OnBroadcastBibTime);
	wsMain.SetCommand('<penalty_add>', OnBroadcastPenaltyAdd);
	wsMain.SetCommand('<run_erase>', OnBroadcastRunErase);
	
	// Flow Notification
	wsMain.SetCommand('<on_course>', OnFlowOnCourse);

	if (myContext.runningClockTimer) window.clearInterval(myContext.runningClockTimer);
	myContext.runningClockTimer = window.setInterval(RenderRunningClock, 40);
	// Ouverture ws 
	wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);
	
	myContext.flag_init = true;
}
