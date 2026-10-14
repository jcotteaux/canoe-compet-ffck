function OnOpenWebSocketCommand()
{
	wsContext.wsCommand.send(JSON.stringify({key : '<race_load>', key_race : '*' }));
}

function OnCommandRaceLoad(objJSON)
{
//	alert("OnCommandRaceLoad :"+JSON.stringify(objJSON));
	canoe.SetRace(objJSON);
	canoe.SetFmtChrono(wsContext.fmtChrono);

	// Chargement de toutes les épreuves ...
	const cmd = { key : '<epreuve_load>',  epreuve : '' };	
	wsContext.wsCommand.send(JSON.stringify(cmd));
}

function OnCommandEpreuveLoad(objJSON)
{
//	alert("OnCommandEpreuveLoad :"+JSON.stringify(objJSON));
	canoe.SetRanking(objJSON);

	const tRanking = canoe.GetTableRanking();
	
	canoe.SetColumnNameRanking(tRanking);
	canoe.ComputeTpsInter(tRanking, 1);
	canoe.ComputeTpsInter(tRanking, 2);
	
	const nb_porte = canoe.GetNbPorte();
	CreateBlockPena('block_running', nb_porte);
	CreateBlockPena('block_finish', nb_porte);

	if (wsContext.bib_finish_force > 0)
		ForceBibFinish(wsContext.bib_finish_force);

	if (wsContext.bib_inter_force > 0)
		ForceBibInter(wsContext.bib_inter_force, 1);

	if (wsContext.leader_force > 0)
	{
		SetLeader();
		ShowLeader(999999);
	}
}

function CreateBlockPena(block_name, nb_porte) 
{
	CreateBlockPenaHorizontal(block_name, nb_porte);
//	CreateBlockPenaVertical(block_name, nb_porte);
}

function CreateBlockPenaHorizontal(block_name, nb_porte) 
{
	const elemPena = document.querySelector('#'+block_name+' div.pena');
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
}

function CreateBlockPenaVertical(block_name, nb_porte) 
{
	const elemPena = document.querySelector('#'+block_name+' div.pena');
	if (elemPena && typeof elemPena === "object")
	{
		var html = '<table>';
		for (let p=1;p<=nb_porte;p++)
		{
			html += "<tr>";
			html += "<td class='gate' data-pen='-1' data-col='"+p+"'>&nbsp;</td>";
			html += "</tr>";
		}
		html += '</table>';
		elemPena.innerHTML = html;
	}
}

function CreateBlockPenaBest(block_name, nb_porte) 
{
	const elemPena = document.querySelector('#'+block_name+' div.pena');
	if (elemPena && typeof elemPena === "object")
	{
		for (let p=1;p<=nb_porte;p++)
		{
			html += "<div class='gate' data-pen='-1' data-col='"+p+"'>&nbsp;</div>";
		}
		elemPena.innerHTML = html;
	}
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
		
		if (wsContext.bib_select < 0)
		{
			wsContext.bib_select = bib;
			wsContext.bib_select_tick = Date.now();
			SetLeader();
		}
		
		if (wsContext.bib_select == bib)
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
	const tRanking = canoe.GetTableRanking();
	if (typeof tRanking === 'object')
	{
		const course_phase_inter = canoe.GetCodeCoursePhase()+'_inter'+inter;
		const row = canoe.GetRankingBibIndex(tRanking, bib);

		if (bib == wsContext.bib_select && row >= 0)
		{
			var tps = time_chrono;
			var txtDiff = '';
			var txtColor = 'red';
			
			if (tps > 0)
			{
				if (wsContext.time_inter_pena == 1)
				{
					const tps_pena = canoe.GetCurrentSlalomTotalPena(tRanking, row)*1000;
					tps += tps_pena;
				}
				
				txtColor = 'green';
				if (wsContext.leader_index >= 0 && wsContext.leader_index < tRanking.GetNbRows())
				{
					const tpsLeader = tRanking.GetCellInt('Tps'+course_phase_inter, wsContext.leader_index);
					if (tpsLeader > 0)
					{
						const diff = tps - tpsLeader;
						//txtDiff = adv.GetChronoDiffMMSSCC(diff);
						txtDiff = adv.GetChronoDiffXSCC(diff);
						if (diff > 0)
							txtColor = 'red';
						else
							txtColor = 'green';
					}
				}
			}

			if (wsContext.timeoutInter != null)
			{
				window.clearTimeout(wsContext.timeoutInter);
				wsContext.timeoutInter = null;
			}
			
			wsContext.timeoutInter = window.setTimeout(function() { 
					wsContext.timeoutInter = null; 
					HideBlockInter();
				},	wsContext.timeoutInterDelay
			);

			document.querySelector('#block_start .bib').innerHTML = bib;
			SetName('#block_start', tRanking, row);
			SetNation('#block_start', tRanking, row);
			SetCateg('#block_start', tRanking, row);

			//var txtTime = adv.GetChronoHHMMSSCC(tps);
			var txtTime = adv.GetChronoXSCC(tps);
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

			if (wsContext.leader_index >= 0)
			{
				const tpsInter = tRanking.GetCellInt('Tps'+course_phase_inter, wsContext.leader_index);
				if (tpsInter > 0)
				{
					SetLeaderName(document.querySelector('#block_inter .leader_name'));
					//document.querySelector('#block_inter .leader_time').innerHTML = tRanking.GetCellChrono('Tps'+course_phase_inter, wsContext.leader_index, 'HHMMSSCC');
					document.querySelector('#block_inter .leader_time').innerHTML = tRanking.GetCellChrono('Tps'+course_phase_inter, wsContext.leader_index, 'XSCC');	
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
			if (wsContext.filter == 'bib')
			{
				if (bib % wsContext.filter_modulo != wsContext.filter_index)
					return;
			}
			else if (wsContext.filter == 'rk')
			{
				const rk = tRanking.GetCellInt('Rang'+course_phase, row);
				if (rk % wsContext.filter_modulo != wsContext.filter_index)
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
		wsContext.bib_select = tRanking.GetCell('Dossard',row);

		if (canoe.GetCodeActivite() == 'SLA')
		{
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
					//txtDiff = adv.GetChronoDiffMMSSCC(diff);
					txtDiff = adv.GetChronoDiffXSCC(diff);
			}
			else
			{
				var tps = tRanking.GetCellInt('Tps_chrono'+course_phase, row);
				if (wsContext.time_running_pena == 1)
					tps += canoe.GetCurrentSlalomTotalPena(tRanking, row)*1000;

				//txtTime = adv.GetChrono(tps, 'HHMMSSCC');
				txtTime = adv.GetChrono(tps, 'XSCC');
			}
			
			ShowFinishData(tRanking, row, txtRk, txtTime, txtDiff, timerRestart);
		}
		else
		{
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
				if (wsContext.bib_force > 0)
					wsContext.bib_select = wsContext.bib_force;
				else
					wsContext.bib_select = -1;
				
				HideBlockFinish();
				ClearLeader();
			},	wsContext.timeoutFinishDelay
		);
	}

	document.querySelector('#block_finish .bib').innerHTML = wsContext.bib_select;
	SetName('#block_finish', tRanking, row);
	SetNation('#block_finish', tRanking, row);
	SetCateg('#block_finish', tRanking, row);

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
			document.querySelector('#block_start .bib').innerHTML = wsContext.bib_select;

			SetName('#block_start', tRanking, row);
			SetNation('#block_start', tRanking, row);
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
	wsContext.bib_select = wsContext.bib_inter_force;
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
	wsContext.bib_select = -1;
	
	ClearLeader();
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
	if (tOnCourse == null || typeof tOnCourse !== 'object')
		return;

	if (wsContext.next_start > 0)
	{
		ShowBibNext(tOnCourse);
		return;
	}

	const nb = tOnCourse.GetNbRows();
	if (wsContext.bib_select <= 0)
	{
		wsContext.bib_select = GetBibSelect(tOnCourse);
		wsContext.bib_select_tick = Date.now();

		if (wsContext.bib_select > 0)
		{
			ForceBibStart(wsContext.bib_select);
		}
	}

	if (wsContext.bib_select > 0)
	{
		const i = tOnCourse.GetIndexRow('bib', wsContext.bib_select);
		if (i >= 0)
		{
			// Dossard en Course ...
			const time_running = tOnCourse.GetCellInt('time', i);
				//txtTime = adv.GetChrono(time_running, 'HHMMSSCC');
				txtTime = adv.GetChrono(time_running, 'XSCC');
			if (canoe.GetCodeActivite() == 'SLA')
			{
				const tRanking = canoe.GetTableRanking();
				const row = canoe.GetRankingBibIndex(tRanking, wsContext.bib_select);
				if (row >= 0)
				{	
					if (wsContext.time_running_pena == 1)
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
				}
			}
			else
			{
				//document.querySelector("#block_running .time").innerHTML = adv.GetChrono(time_running, 'HHMMSSCC');
				document.querySelector("#block_running .time").innerHTML = adv.GetChrono(time_running, 'XSCC');
			}
			
			const block_running = document.getElementById("block_running");
			if (block_running != null && block_running.style.display == 'none')
				block_running.style.display = 'block';
			
			if (wsContext.leader_index < 0)
				SetLeader();

			if (wsContext.leader_index >= 0)
				ShowLeader(time_running);

			HideBlockStart();
		}
		else
		{
			// Dossard au départ ou à l'arrivée ...
			if (wsContext.bib_force == wsContext.bib_select)
				wsContext.bib_select_tick = Date.now();

			ForceBib(wsContext.bib_select);
		}
	}
}

function ShowBibNext(tOncourse)
{
	wsContext.bib_select = GetBibStart(tOncourse);
	wsContext.bib_select_tick = Date.now();
	if (wsContext.bib_select > 0)
	{
		ForceBibStart(wsContext.bib_select);
	}
}

function ShowPenalty(gate, pena, block_name)
{
	const elem = document.querySelectorAll('#'+block_name+' div.pena td[data-col="'+gate.toString()+'"]');
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

function TruncateName(name)
{
	if (wsContext.lengthIdentity > 0)
	{
		if (name.length > wsContext.lengthIdentity)
			return name.substring(0, wsContext.lengthIdentity)+"...";
	}
	
	return name;
}

function TruncateNameLeader(name)
{
	if (wsContext.lengthIdentity > 0)
	{
		if (name.length > wsContext.lengthIdentity)
		{
			let iSeparator = name.indexOf(' ');
			if (iSeparator > 0)
				name = name.substring(0, iSeparator).trim()+' '+name.substring(iSeparator+1, iSeparator+2).toUpperCase();+".";

			if (name.length > wsContext.lengthIdentity)
				return name.substring(0, wsContext.lengthIdentity)+"..";
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
			el.style.fontSize = "24pt";
		}
		else
		{
			el.innerHTML = TruncateName(bateau);
			el.style.fontSize = "48pt";
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
		document.querySelector(blockName+' .img_nation').src = "./img/Flags/Empty.png";
	else
		document.querySelector(blockName+' .img_nation').src = "./img/Flags/"+nation+".png";
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
		if (wsContext.filter == 'bib')
		{
			var r = nb-1;
			while (r >= 0)
			{
				if (tOnCourse.GetCellInt('bib', r) % wsContext.filter_modulo  == wsContext.filter_index)
					return tOnCourse.GetCellInt('bib', r);
				--r;
			}
		}
		else if (wsContext.filter == 'rk')
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
						if (rk % wsContext.filter_modulo  == wsContext.filter_index)
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
					if (wsContext.filter == 'bib')
					{
						if (tRanking.GetCellInt('Dossard', r) % wsContext.filter_modulo == wsContext.filter_index)
							return tRanking.GetCellInt('Dossard', r);
					}
					else if (wsContext.filter == 'rk')
					{
						const rk = tRanking.GetCellInt('Rang'+course_phase, r);
//						alert('OK1:bib='+tRanking.GetCell('Dossard', r)+", rk="+rk+", course_phase="+course_phase+", colindex="+tRanking.GetIndexColumn('Rang'+course_phase));

						if (rk % wsContext.filter_modulo == wsContext.filter_index)
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
	wsContext.leader_index = -1;
	
	document.getElementById("block_leader").style.display = 'none';
	document.querySelector('#block_leader .name').innerHTML = '';
	document.querySelector('#block_leader .time').innerHTML = '';
}

function SetLeader()
{
	const tRanking = canoe.GetTableRanking();
	wsContext.leader_index = -1;

	if (wsContext.bib_select > 0 && typeof tRanking === 'object')
	{
		const i = canoe.GetRankingBibIndex(tRanking, wsContext.bib_select);
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
						wsContext.leader_index = r;
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
		if (wsContext.leader_index >= 0)
		{
			let bateau = tRanking.GetCell('Bateau', wsContext.leader_index);

			let iSeparator = bateau.indexOf('/');
			if (iSeparator > 0)
			{
				let equipier1 = bateau.substring(0, iSeparator).trim();
				if (equipier1.length > 15)
					equipier1 = equipier1.substring(0,14)+'.';

				let equipier2 = bateau.substring(iSeparator+1).trim();
				if (equipier2.length > 15)
					equipier2 = equipier2.substring(0,14)+'.';
				
				el.innerHTML = TruncateName(equipier1)+'<br>'+TruncateName(equipier2);
				el.style.fontSize = "10pt";
			}
			else
			{
				el.innerHTML = TruncateNameLeader(bateau);
				//el.style.fontSize = "16pt";
				el.style.fontSize = "18pt";
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
		if (wsContext.leader_index >= 0 && tpsRunning > 0 && tpsRunning < wsContext.tps_running_max)
		{
			const course_phase = canoe.GetCodeCoursePhase();
			const nbInter = canoe.GetNbInter();

			for (let k = 1; k<=nbInter; k++)
			{
				const tpsInter = tRanking.GetCellInt('Tps_chrono'+course_phase+'_inter'+k, wsContext.leader_index);
				if (tpsInter > 0)
				{
					if (tpsRunning + wsContext.leader_before_inter >= tpsInter)
					{
						if (tpsRunning <= tpsInter)
						{
							SetLeaderName(document.querySelector('#block_leader .name'));
							//document.querySelector('#block_leader .time').innerHTML = tRanking.GetCellChrono('Tps'+course_phase+'_inter'+k, wsContext.leader_index, 'HHMMSSCC');
							document.querySelector('#block_leader .time').innerHTML = tRanking.GetCellChrono('Tps'+course_phase+'_inter'+k, wsContext.leader_index, 'XSCC');
							block_leader.style.display = 'block';
							return;
						}
					}
				}
			}

			const tpsFinish = tRanking.GetCellInt('Tps_chrono'+course_phase, wsContext.leader_index);
			if (tpsFinish > 0)
			{
				if (tpsRunning + wsContext.leader_before_finish >= tpsFinish)
				{
					SetLeaderName(document.querySelector('#block_leader .name'));
					//document.querySelector('#block_leader .time').innerHTML = tRanking.GetCellChrono('Tps'+course_phase, wsContext.leader_index, 'HHMMSSCC');
					document.querySelector('#block_leader .time').innerHTML = tRanking.GetCellChrono('Tps'+course_phase, wsContext.leader_index, 'XSCC');
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
		const now = Date.now();
		if (now - wsContext.bib_select_tick > wsContext.timeoutStartDelay)
		{
			if (el.style.display == 'block')
				el.style.display = 'none';
		}
		else
		{
			ForceBibStart(wsContext.bib_select);
		}
	}
}

function Init()
{
	wsContext.lang = 'fr';
	wsContext.url = wsParams.url;
	wsContext.port = wsParams.port;
	
	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);

	wsContext.filter = ''; 
	wsContext.filter_index = 0; 
	wsContext.filter_modulo = 1; 

	if (urlParams.has('bib_filter'))
	{
		wsContext.filter = 'bib'; 

		const filter = urlParams.get('bib_filter');
		if (filter == 'pair')
		{
			wsContext.filter_modulo = 2; 
			wsContext.filter_index = 0; 
		}
		else if (filter == 'odd')
		{
			wsContext.filter_modulo = 2; 
			wsContext.filter_index = 1; 
		}
		else
		{
			const splits = filter.split("/");
			if (splits.length == 2)
			{
				wsContext.filter_index = parseInt(splits[0]);
				wsContext.filter_modulo = parseInt(splits[1]);
			}
		}
	}
	
	if (urlParams.has('rk_filter'))
	{
		wsContext.filter = 'rk'; 

		const filter = urlParams.get('rk_filter');
		if (filter == 'pair')
		{
			wsContext.filter_modulo = 2; 
			wsContext.filter_index = 0; 
		}
		else if (filter == 'odd')
		{
			wsContext.filter_modulo = 2; 
			wsContext.filter_index = 1; 
		}
		else
		{
			const splits = filter.split("/");
			if (splits.length == 2)
			{
				wsContext.filter_index = parseInt(splits[0]);
				wsContext.filter_modulo = parseInt(splits[1]);
			}
		}
	}
	
	// Temps Tournant avec ou sans les pénalités 
	wsContext.time_running_pena = 1;
	if (urlParams.has('time_running_pena'))
		wsContext.time_running_pena = parseInt(urlParams.get('time_running_pena'));
	
	wsContext.time_inter_pena = 1;
	if (urlParams.has('time_inter_pena'))
		wsContext.time_inter_pena = parseInt(urlParams.get('time_inter_pena'));

	wsContext.bib_force = -1;
	wsContext.bib_select = -1;
	wsContext.bib_select_tick = Date.now();
	
	if (urlParams.has('bib_select'))
	{
		wsContext.bib_force = parseInt(urlParams.get('bib_select'));
		wsContext.bib_select = wsContext.bib_force;
	}
	
	wsContext.bib_finish_force = -1;
	if (urlParams.has('bib_finish'))
		wsContext.bib_finish_force = parseInt(urlParams.get('bib_finish'));
	
	wsContext.bib_inter_force = -1;
	if (urlParams.has('bib_inter'))
		wsContext.bib_inter_force = parseInt(urlParams.get('bib_inter'));

	wsContext.leader_force = -1;
	if (urlParams.has('leader'))
		wsContext.leader_force = parseInt(urlParams.get('leader'));
	
	wsContext.next_start = -1;
	if (urlParams.has('next_start'))
		wsContext.next_start = parseInt(urlParams.get('next_start'));
	
	// Temps Tournant Max ...
	wsContext.tps_running_max = 59*60*1000;	
	if (urlParams.has('tps_running_max'))
		wsContext.tps_running_max = parseInt(urlParams.get('tps_running_max'));

	// Format de Temps
	wsContext.fmtChrono = '';
	if (urlParams.has('fmt_chrono'))
		wsContext.fmtChrono = urlParams.get('fmt_chrono');

	wsContext.timeoutFinish = null;
	wsContext.timeoutInter = null;

	wsContext.leader_index = -1;
	wsContext.leader_before_inter = 5000;
	wsContext.leader_before_finish = 7000;
	ClearLeader();
	
	wsContext.timeoutFinishDelay = 9999999;
	if (urlParams.has('delay_finish'))
		wsContext.timeoutFinishDelay = parseInt(urlParams.get('delay_finish'));
	
	wsContext.timeoutInterDelay = 5000;
	if (urlParams.has('delay_inter'))
		wsContext.timeoutInterDelay = parseInt(urlParams.get('delay_inter'));
	
	wsContext.timeoutStartDelay = 10000;
	if (urlParams.has('delay_start'))
		wsContext.timeoutStartDelay = parseInt(urlParams.get('delay_start'));
	
	wsContext.lengthIdentity = 20;
	if (urlParams.has('length_identity'))
		wsContext.lengthIdentity = parseInt(urlParams.get('length_identity'));

	// Command Notification
	wsContext.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsContext.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	wsContext.mapCommand.set('<order>', OnCommandOrder);
	
	// Broadcast Notification
	wsContext.mapCommand.set('<mode_chrono>', OnBroadcastModeChrono);
	wsContext.mapCommand.set('<bib_time>', OnBroadcastBibTime);
	wsContext.mapCommand.set('<penalty_add>', OnBroadcastPenaltyAdd);
	wsContext.mapCommand.set('<run_erase>', OnBroadcastRunErase);
	
	// Flow Notification
	wsContext.mapCommand.set('<on_course>', OnFlowOnCourse);

	// Ouverture ws 
	wsContext.OpenWebSocketCommand(OnOpenWebSocketCommand);
}
