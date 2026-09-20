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
	canoe.ComputeTpsInter(tRanking, 1);
	canoe.ComputeTpsInter(tRanking, 2);
	
	const nb_porte = canoe.GetNbPorte();
	CreateBlockPena('block_running', nb_porte);
	CreateBlockPena('block_finish', nb_porte);

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

function CreateBlockPena(block_name, nb_porte) 
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

		if (bib == wsMain.bib_select && row >= 0)
		{
			var tps = time_chrono;
			var txtDiff = '';
			var txtColor = 'red';
			
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
			SetNation('#block_start', tRanking, row);
			SetCateg('#block_start', tRanking, row);

			var txtTime = '';
			if (canoe.GetCodeActivite() == 'SLA')
				txtTime = adv.GetChronoXSCC(tps);
			else
				txtTime = adv.GetChronoHHMMSSCC(tps);
			
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
				if (wsMain.bib_force > 0)
					wsMain.bib_select = wsMain.bib_force;
				else
					wsMain.bib_select = -1;
				
				HideBlockFinish();
				ClearLeader();
			},	wsMain.timeoutFinishDelay
		);
	}

	document.querySelector('#block_finish .bib').innerHTML = wsMain.bib_select;
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
	if (wsMain.timeoutFinish != null || wsMain.timeoutInter != null)
		return;

	const tOnCourse = adv.GetTableUnique(objJSON, 'table');
	if (tOnCourse == null || typeof tOnCourse !== 'object')
		return;

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
				}
			}
			else
			{
				const txtTime = adv.GetChrono(time_running, 'HHMMSSCC');
				document.querySelector("#block_running .time").innerHTML = txtTime;
			}
			
			const block_running = document.getElementById("block_running");
			if (block_running != null && block_running.style.display == 'none')
				block_running.style.display = 'block';
			
			if (wsMain.leader_index < 0)
				SetLeader();

			if (wsMain.leader_index >= 0)
				ShowLeader(time_running);

			HideBlockStart();
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

function ShowBibNext(tOncourse)
{
	wsMain.bib_select = GetBibStart(tOncourse);
	wsMain.bib_select_tick = Date.now();
	if (wsMain.bib_select > 0)
	{
		ForceBibStart(wsMain.bib_select);
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

function SetLeaderName(el)
{
	const tRanking = canoe.GetTableRanking();
	if (el != null && typeof tRanking === 'object')
	{
		el.innerHTML = '';
		if (wsMain.leader_index >= 0)
		{
			let bateau = tRanking.GetCell('Bateau', wsMain.leader_index);

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

	wsMain.leader_index = -1;
	wsMain.leader_before_inter = 5000;
	wsMain.leader_before_finish = 7000;
	ClearLeader();
	
	wsMain.timeoutFinishDelay = 40000;
	if (urlParams.has('delay_finish'))
		wsMain.timeoutFinishDelay = parseInt(urlParams.get('delay_finish'));
	
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
