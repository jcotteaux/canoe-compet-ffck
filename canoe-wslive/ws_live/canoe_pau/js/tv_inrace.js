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
	const elemPena = document.querySelector('#block_pena div.pena');
	if (elemPena && typeof elemPena === "object")
	{
			var html = '<table>';
		for (let p=1;p<=wsContext.nb_porte;p++)
		{
			html += '<tr>';
			html += "<td class='gate' data-pen='-1' data-col='"+p+"'>&nbsp;</td>";
			html += '</tr>';
		}
		html += '</table>';
		
		elemPena.innerHTML = html;
	}
}

function OnBroadcastPenaltyAdd(objJSON) 
{
//	alert("OnCommandEpreuveLoad :"+JSON.stringify(objJSON));
	const bib = objJSON.bib;
	const porte = objJSON.gate;
	const pena = objJSON.penalty;
	const course_phase = canoe.GetCodeCoursePhase();
	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
	const iRow = tRanking.GetIndexRow('Dossard', bib);
	for (let row=0;row<tRanking.GetNbRows();row++)
	{
		if (bib == tRanking.GetCell('Dossard', row))
		{
			
			const oldTps = tRanking.GetCellInt('Tps'+course_phase, row);
			const newTps = canoe.UpdateSlalomPena(tRanking, row, porte, pena);
			
			if (wsContext.bib_select == bib)
			{
				if (wsContext.timeoutFinish != null)
				{
					var penaTotal = tRanking.GetCellInt('Total_pena'+course_phase, row, 'Code_categorie');
					var time_pena = tRanking.GetCellInt('Tps'+course_phase, row, adv.chrono.KO);
					const rk_categ = tRanking.ComputeRank('Tps'+course_phase, row, 'Code_categorie');
					const diff_categ = tRanking.GetDiffTime('Tps'+course_phase, row, 'Code_categorie');
					if (time_pena != '-1'){
						if (diff_categ > 0)
							color_chrono = 'red';
						else
							color_chrono = 'green';
						document.querySelector('#block_finish .bib').innerHTML = bib;
					
						SetName('#block_finish', tRanking, iRow);
						SetNation('#block_finish', tRanking, iRow);
						SetCateg('#block_finish', tRanking, iRow);
						document.querySelector('#block_finish .rank').innerHTML = rk_categ;
						
						if (penaTotal != 'Code_categorie')	{
							document.querySelector('#block_finish .pena').innerHTML = penaTotal;
						}
						else{
							document.querySelector('#block_finish .pena').innerHTML = '0';
						}
						
						document.querySelector('#block_finish .time').innerHTML = adv.GetChrono(time_pena, 'HHMMSSCC');
						if (color_chrono == 'red')
						{
							document.querySelector("#block_finish").classList.remove('green');
							document.querySelector("#block_finish").classList.add('red');
						}
						else
						{
							document.querySelector("#block_finish").classList.add('green');
							document.querySelector("#block_finish").classList.remove('red');
						}
						if (diff_categ != undefined)
							document.querySelector('#block_finish .diff').innerHTML = adv.GetChronoDiffMMSSCC(diff_categ);

						ShowBlockFinish();

					}
					const timerRestart = false;
				}
			} 
			break;
		}
	}
	
	if (wsContext.bib_select == bib)
		SetOnCoursePenalty(porte, pena);

	
}

function SetOnCoursePenalty(gate, pena)
{
	const elem = document.querySelectorAll('#block_pena div.pena td[data-col="'+gate.toString()+'"]');
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

function DoBroadcastBibTimeInter(objJSON, inter) 
{
//	alert("OnCommandEpreuveLoad :"+JSON.stringify(objJSON));
	const bib = objJSON.bib;

	const course_phase_inter = canoe.GetCodeCoursePhase()+'_inter'+inter;
	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
	const course_phase = canoe.GetCodeCoursePhase();
	const iRow = tRanking.GetIndexRow('Dossard', bib);
	const time_pena = canoe.GetCurrentSlalomTotalPena(tRanking, iRow)*1000;
	
	if (bib == wsContext.bib_select)
	{
		var time_chrono = objJSON.time_chrono+time_pena;
		var bestTime = tRanking.GetCellInt('Tps'+course_phase_inter, wsContext.leader_index)+canoe.GetCurrentSlalomTotalPenaInter(tRanking, wsContext.leader_index)*1000;
		if (bestTime != canoe.GetCurrentSlalomTotalPenaInter(tRanking, wsContext.leader_index)*1000)
		{
			
			diff_chrono = time_chrono - bestTime;
			if (diff_chrono > 0)
				color_chrono = 'red';
			else
				color_chrono = 'green';
		}
		else
		{
			/*if (objJSON.time_chrono > 0)
				color_chrono = 'green';
			else
				color_chrono = 'red';*/
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

	//	alert(time_chrono+'/'+diff_chrono+'/'+color_chrono);

		document.querySelector('#block_start .bib').innerHTML = bib;
		SetName('#block_start', tRanking, iRow);
		SetNation('#block_start', tRanking, iRow);
		SetCateg('#block_start', tRanking, iRow);

		document.querySelector('#block_inter .time').innerHTML = adv.GetChronoHHMMSSCC(objJSON.time_chrono+time_pena);
		
		if (diff_chrono != undefined )
		{
			if (color_chrono == 'red')
			{
				document.querySelector("#block_inter").classList.remove('green');
				document.querySelector("#block_inter").classList.add('red');
			}
			else 
			{
				document.querySelector("#block_inter").classList.add('green');
				document.querySelector("#block_inter").classList.remove('red');
			}
			document.querySelector("#block_inter .diff").innerHTML = adv.GetChronoDiffMMSSCC(diff_chrono);
		}		
		document.querySelector('#block_leader .name').innerHTML = '';
		document.querySelector('#block_leader .time').innerHTML = '';

		if (wsContext.leader_index >= 0)
		{
			const tpsInter = tRanking.GetCellInt('Tps'+course_phase_inter, wsContext.leader_index);
			if (tpsInter > 0)
			{
				SetLeaderName(document.querySelector('#block_leader .name'));
				document.querySelector('#block_leader .time').innerHTML = adv.GetChronoHHMMSSCC(tRanking.GetCellInt('Tps'+course_phase_inter, wsContext.leader_index)+canoe.GetCurrentSlalomTotalPenaInter(tRanking, wsContext.leader_index)*1000);
			}
		}

		ShowBlockInter();
	}
	
	if (iRow >= 0)
		tRanking.UpdateRankingTime(iRow, tRanking.GetIndexColumn('Tps'+course_phase_inter), tRanking.GetIndexColumn('Cltc'+course_phase_inter), tRanking.GetCellInt('Tps'+course_phase_inter,iRow), objJSON.time_chrono);
}

function DoBroadcastBibTimeFinish(objJSON) 
{
//	alert("DoBroadcastBibTimeFinish :"+JSON.stringify(objJSON));
	const bib = objJSON.bib;
	const course_phase = canoe.GetCodeCoursePhase();
	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
	const iRow = tRanking.GetIndexRow('Dossard', bib);
	let color_chrono;

	for (let i=0;i<tRanking.GetNbRows();i++)
	{
		if (bib == tRanking.GetCell('Dossard', i))
		{
			const tpsChrono = objJSON.time_chrono;
			tRanking.SetCell('Tps_chrono'+course_phase,i, tpsChrono);
			const oldTps = tRanking.GetCellInt('Tps'+course_phase, i);
			const newTps = canoe.UpdateSlalomFinishTime(tRanking, i);

			var time_chrono = tRanking.GetCellInt('Tps_chrono'+course_phase, i, adv.chrono.KO);
			var time_pena = tRanking.GetCellInt('Tps'+course_phase, i, adv.chrono.KO);
			const rk_categ = tRanking.ComputeRank('Tps'+course_phase, i, 'Code_categorie');
			const diff_categ = tRanking.GetDiffTime('Tps'+course_phase, i, 'Code_categorie');
			var penaTotal = tRanking.GetCellInt('Total_pena'+course_phase, i, 'Code_categorie');
			if (bib == wsContext.bib_select)
			{	
				if (wsContext.timeoutInter != null)
				{
					window.clearTimeout(wsContext.timeoutInter);
					wsContext.timeoutInter = null;
				}

				if (wsContext.timeoutFinish != null)
					window.clearTimeout(wsContext.timeoutFinish);

				wsContext.timeoutFinish = window.setTimeout(function() { 
						wsContext.timeoutFinish = null; 
						wsContext.bib_select = -1; 
						HideBlockFinish();
						HideBlockRunning();
						ResetLeader();
					},	wsContext.timeoutFinishDelay
				);

				if (bib == tRanking.GetCell('Dossard', i))
				{

					if (penaTotal != -1)
					{
						document.querySelector('#block_finish .bib').innerHTML = bib;
					
						SetName('#block_finish', tRanking, iRow);
						SetNation('#block_finish', tRanking, iRow);
						SetCateg('#block_finish', tRanking, iRow);
						document.querySelector('#block_finish .rank').innerHTML = rk_categ;
						
						if (penaTotal != 'Code_categorie')	{
							document.querySelector('#block_finish .pena').innerHTML = penaTotal;
						}
						else{
							document.querySelector('#block_finish .pena').innerHTML = '0';
						}
						
						document.querySelector('#block_finish .time').innerHTML = adv.GetChrono(time_pena, 'HHMMSSCC');
						if (rk_categ == 1)
							color_chrono = 'green';
						else
							color_chrono = 'red';

						if (color_chrono == 'red')
						{
							document.querySelector('#block_finish .diff').style.color ='red';
							document.querySelector("#block_finish").classList.remove('green');
							document.querySelector("#block_finish").classList.add('red');
						}
						else
						{
							document.querySelector('#block_finish .diff').style.color ='green';
							document.querySelector("#block_finish").classList.add('green');
							document.querySelector("#block_finish").classList.remove('red');
						}
						if (diff_categ != undefined)
							document.querySelector('#block_finish .diff').innerHTML = adv.GetChronoDiffMMSSCC(diff_categ);

						ShowBlockFinish();
					}
					else 
					{
						const time_pena = canoe.GetCurrentSlalomTotalPena(tRanking, iRow)*1000
						document.querySelector("#block_running .time").innerHTML = adv.GetChrono(time_chrono+time_pena, 'HHMMSSCC');
					}
				}

			}
			
			if (iRow >= 0)
				tRanking.UpdateRankingTime(iRow, tRanking.GetIndexColumn('Tps'+course_phase), tRanking.GetIndexColumn('Cltc'+course_phase), tRanking.GetCellInt('Tps'+course_phase,iRow), objJSON.time_chrono);
		}
	}
}

function OnBroadcastRunErase(objJSON)
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
	
	wsContext.bib_select = -1;
	ResetLeader();
	document.getElementById("block_running").style.display = 'none';

	OnOpenWebSocketCommand();
}

function OnFlowOnCourse(objJSON)
{
//	alert("OnFlowOnCourse :"+JSON.stringify(wsContext));

	const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
	if (wsContext.timeoutFinish != null || wsContext.timeoutInter != null)
		return;

	const tOnCourse = adv.GetTableUnique(objJSON, 'table');
	const i = tRanking.GetIndexRow('Dossard', wsContext.bib_select);
	if (tOnCourse == null || typeof tOnCourse !== 'object')
		return;
	//alert("OnFlowOnCourse :"+JSON.stringify(tOnCourse));
	const nb = tOnCourse.GetNbRows();
	//if (wsContext.bib_select <= 0)
	wsContext.bib_select = GetBibSelect(tOnCourse);
	const course_phase = canoe.GetCodeCoursePhase();
	
	for (let p=1;p<=wsContext.nb_porte;p++)
	{
		const valPena = tRanking.GetCell('Pena_'+p.toString(), i);
		SetOnCoursePenalty(p, valPena);
	}

	if (wsContext.bib_select > 0)
	{
		const i = tOnCourse.GetIndexRow('bib', wsContext.bib_select);
		if (i >= 0)
		{
			const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
			const iRow = tRanking.GetIndexRow('Dossard', wsContext.bib_select);
			const time_pena = canoe.GetCurrentSlalomTotalPena(tRanking, iRow)*1000;
			const time_running = tOnCourse.GetCellInt('time', i);
			
			document.querySelector("#block_running .time").innerHTML = adv.GetChrono(time_running+time_pena, 'HHMMSSCC');
			document.querySelector('#block_start .bib').innerHTML = wsContext.bib_select;
			SetName('#block_start', tRanking, iRow);
			SetNation('#block_start', tRanking, iRow);
			SetCateg('#block_start', tRanking, iRow);
			const block_running = document.getElementById("block_running");
			if (block_running != null && block_running.style.display == 'none')
				block_running.style.display = 'block';
			
			if (wsContext.leader_index < 0)
				SetLeader();
			
			if (wsContext.leader_index >= 0){
				ShowLeader(time_running+time_pena);
				}
			HideBlockStart(tOnCourse.GetCellInt('time', i));
		}
	}
	else
	{
		wsContext.bib_select = GetBibStart();
		if (wsContext.bib_select > 0)
		{
			const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
			const iRow = tRanking.GetIndexRow('Dossard', wsContext.bib_select);
			document.querySelector('#block_start .bib').innerHTML = wsContext.bib_select;

			SetName('#block_start', tRanking, iRow);
			SetNation('#block_start', tRanking, iRow);
			SetCateg('#block_start', tRanking, iRow);
	
			ShowBlockStart();
		}
	}
}

function SetName(blockName, tRanking, iRow)
{
	let el = document.querySelector(blockName+' .name');
	el.innerHTML = '';
	if (iRow >= 0)
	{
		let bateau = tRanking.GetCell('Bateau', iRow);
		let iSeparator = bateau.indexOf('/');
		if (iSeparator > 0)
		{
			let equipier1 = bateau.substring(0, iSeparator).trim();
			let equipier2 = bateau.substring(iSeparator+1).trim();
			el.innerHTML = equipier1+', '+equipier2;
			el.style.fontSize = "25pt";
			el.style.top = "18px";
		}
		else
		{
			if (bateau.length < 24){
				el.innerHTML = bateau;
				el.style.fontSize = "37pt";
			}
			else {
				el.innerHTML = bateau.substring(0,23)+'.';
				el.style.fontSize = "37pt";
			}
					}
	}
}

function SetNation(blockName, tRanking, iRow)
{
	let nation = '';
	if (iRow >= 0)
		nation = tRanking.GetCell('Code_nation', iRow);

	document.querySelector(blockName+' .nation').innerHTML = nation;
	if (nation == '')
		document.querySelector(blockName+' .img_nation').src = "./img/Flags/Empty.png";
	else
		document.querySelector(blockName+' .img_nation').src = "./img/Flags/"+nation+".png";
}

function SetCateg(blockName, tRanking, iRow)
{
	if (iRow >= 0)
		document.querySelector(blockName+' .categ').innerHTML = tRanking.GetCell('Code_categorie', iRow);
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
//		alert("ok");
			if (typeof tRanking === 'object')
			{
				var r = 0;
				while (r <= nb-1 )
				{
					const bib = tOnCourse.GetCellInt('bib', r);
					const row = canoe.GetRankingBibIndex(tRanking, bib);
					if (row >= 0)
					{
						const rk = tRanking.GetCellInt('Rang'+course_phase, row);
						if (rk % wsContext.filter_modulo  == wsContext.filter_index)
							return bib;
					}
					++r;
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
				if (tRanking.GetCellInt('Tps'+course_phase, r, adv.chrono.KO) == adv.chrono.KO)
				{
					if (wsContext.filter == 'bib')
					{
						if (tRanking.GetCellInt('Dossard', r) % wsContext.filter_modulo == wsContext.filter_index)
							return tRanking.GetCellInt('Dossard', r);
					}
					else if (wsContext.filter == 'rk')
					{
						const rk = tRanking.GetCellInt('Rang'+course_phase, r);
//						alert('OK1:bib='+tRanking.GetCell('Dossard', r)+", rk="+rk+", course_phase="+course_phase+", colrkindex="+tRanking.GetIndexColumn('Rang'+course_phase));

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

function ResetLeader()
{
	wsContext.leader_index = -1;
	document.querySelector('#block_leader .name').innerHTML = '';
	document.querySelector('#block_leader .time').innerHTML = '';
}

function SetLeader()
{
	wsContext.leader_index = -1;

	if (wsContext.bib_select > 0)
	{
		const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
		const i = tRanking.GetIndexRow('Dossard', wsContext.bib_select);
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
	
	if (el != null)
	{
		el.innerHTML = '';
		if (wsContext.leader_index >= 0)
		{
			const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
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
				
				el.innerHTML = equipier1+'<br>'+equipier2;
				el.style.fontSize = "16pt";
			}
			else
			{
				el.innerHTML = bateau.substring(0,13)+'.';
				el.style.fontSize = "24pt";
			}
		}
	}
}

function ShowLeader(tpsRunning)
{

	const block_leader = document.getElementById("block_leader");
	if (block_leader != null)
	{
		if (wsContext.leader_index >= 0 && tpsRunning > 0)
		{
			const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
			const course_phase = canoe.GetCodeCoursePhase();
			const nbInter = canoe.GetNbInter();

			for (let k = 1; k<=nbInter; k++)
			{
				const course_phase_inter = canoe.GetCodeCoursePhase()+'_inter'+k;
				const tpsInter = tRanking.GetCellInt('Tps'+course_phase+'_inter'+k, wsContext.leader_index)+canoe.GetCurrentSlalomTotalPenaInter(tRanking, wsContext.leader_index)*1000;
				if (tpsInter > canoe.GetCurrentSlalomTotalPenaInter(tRanking, wsContext.leader_index)*1000)
				{
					if (tpsRunning + wsContext.leader_before_inter >= tpsInter && tpsRunning < tpsInter)
					{
						SetLeaderName(document.querySelector('#block_leader .name'));

						document.querySelector('#block_leader .time').innerHTML = adv.GetChronoHHMMSSCC(tRanking.GetCellInt('Tps'+course_phase_inter, wsContext.leader_index)+(canoe.GetCurrentSlalomTotalPenaInter(tRanking, wsContext.leader_index)*1000));
						
						block_leader.style.display = 'block';
						return;
					}
				}
			}

			const tpsFinish = tRanking.GetCellInt('Tps'+course_phase, wsContext.leader_index);
			if (tpsFinish > 0)
			{
				if (tpsRunning + wsContext.leader_before_finish >= tpsFinish && tpsRunning < tpsFinish)
				{
					SetLeaderName(document.querySelector('#block_leader .name'));
					var time_pena = tRanking.GetCellInt('Tps_chrono'+course_phase, wsContext.leader_index, adv.chrono.KO)+canoe.GetCurrentSlalomTotalPenaInter(tRanking, wsContext.leader_index)*1000;
					document.querySelector('#block_leader .time').innerHTML = adv.GetChrono(time_pena, 'HHMMSSCC');
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

	el = document.getElementById("block_pena");
	if (el != null)
		el.style.display = 'none';
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
		el.style.display = 'block';

	el = document.getElementById("block_running");
	if (el != null)
		el.style.display = 'none';

	el = document.getElementById("block_start");
	if (el != null)
		el.style.display = 'block';

	el = document.getElementById("block_inter");
	if (el != null)
		el.style.display = 'block';

	el = document.getElementById("block_pena");
	if (el != null)
		el.style.display = 'block';
}

function HideBlockInter()
{
	var el;
	
	el = document.getElementById("block_leader");
	if (el != null)
		el.style.display = 'none';

	el = document.getElementById("block_inter");
	if (el != null)
		el.style.display = 'none';
}

function ShowBlockStart()
{
	var el;
	
	el = document.getElementById("block_start");
	if (el != null)
		el.style.display = 'block';

	el = document.getElementById("block_pena");
	if (el != null)
		el.style.display = 'none';

	el = document.getElementById("block_leader");
	if (el != null)
		el.style.display = 'none';
}

function HideBlockRunning()
{
	var el;
	
	el = document.getElementById("block_start");
	if (el != null)
		el.style.display = 'none';

	el = document.getElementById("block_pena");
	if (el != null)
		el.style.display = 'none';

	el = document.getElementById("block_leader");
	if (el != null)
		el.style.display = 'none';

	el = document.getElementById("block_running");
	if (el != null)
		el.style.display = 'none';

	el = document.getElementById("block_finish");
	if (el != null)
		el.style.display = 'none';
}

function HideBlockStart(tpsRunning)
{
	el = document.getElementById("block_start");
	if (el != null)
 	{
		if (el.style.display == 'block')
		{
			if (tpsRunning > wsContext.timeoutStartDelay && wsContext.timeoutStartDelay > 0)
				el.style.display = 'none';

			el = document.getElementById("block_pena");
			if (el != null)
				el.style.display = 'block';
			el = document.getElementById("block_start");
		}
		else if  (el.style.display == 'none')
		{
			const tRanking = adv.GetTableUnique(wsContext.notify_ranking, 'ranking');
			const iRow = tRanking.GetIndexRow('Dossard', wsContext.bib_select);
			if (iRow >= 0)
			{
				el.style.display = 'block';

				document.querySelector('#block_start .bib').innerHTML = wsContext.bib_select;

				SetName('#block_start', tRanking, iRow);
				SetNation('#block_start', tRanking, iRow);
				SetCateg('#block_start', tRanking, iRow);
			}
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
		if (filter == 'odd')
		{
			wsContext.filter_modulo = 2; 
			wsContext.filter_index = 0; 
		}
		else if (filter == 'pair')
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

	wsContext.timeoutFinish = null;
	wsContext.timeoutInter = null;

	wsContext.bib_select = -1;
	ResetLeader();
	wsContext.nb_porte = 0;

	wsContext.leader_before_inter = 5000;
	wsContext.leader_before_finish = 5000;
	
	wsContext.timeoutFinishDelay = 6000; // 3000 pour les Heats 6000 pour la Semi et Finale
	wsContext.timeoutInterDelay = 5000;
	wsContext.timeoutStartDelay = 0;
	
	// Command Notification
	wsContext.mapCommand.set('<race_load>', OnCommandRaceLoad);
	wsContext.mapCommand.set('<epreuve_load>', OnCommandEpreuveLoad);
	
	// Broadcast Notification
	wsContext.mapCommand.set('<run_erase>', OnBroadcastRunErase);
	wsContext.mapCommand.set('<penalty_add>', OnBroadcastPenaltyAdd);
	wsContext.mapCommand.set('<bib_time>', OnBroadcastBibTime);
	
	// Flow Notification
	wsContext.mapCommand.set('<on_course>', OnFlowOnCourse);

	// Ouverture ws 
	wsContext.OpenWebSocketCommand(OnOpenWebSocketCommand);
}
