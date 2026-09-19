const canoe = {};

canoe.SetRace = function(objJSON)
{
	canoe.notify_race = objJSON;
}

canoe.GetCodeCompetition = function()
{
	if (typeof canoe.notify_race === "object")
		return parseInt(canoe.notify_race.Code_competition);
	else
		return 0;
}

canoe.GetCodeCourse = function()
{
	if (typeof canoe.notify_race === "object")
		return parseInt(canoe.notify_race.Code_course);
	else
		return 0;
}

canoe.GetCodePhase = function()
{
	if (typeof canoe.notify_race === "object")
		return parseInt(canoe.notify_race.Code_phase);
	else
		return 0;
}

canoe.GetCodeActivite = function()
{
	if (typeof canoe.notify_race === "object")
	{
		const tCompetition = adv.GetTable(canoe.notify_race, 'Competition');
		if (typeof tCompetition === "object")
			return tCompetition.GetCell('Code_activite', 0);
	}
	return '?';
}	

canoe.GetCodeNiveau = function()
{
	if (typeof canoe.notify_race === "object")
	{
		const tCompetition = adv.GetTable(canoe.notify_race, 'Competition');
		if (typeof tCompetition === "object")
			return tCompetition.GetCell('Code_niveau', 0);
	}
	return '?';
}	

canoe.GetCodeCoursePhase = function()
{
	return canoe.GetCodeCourse().toString()+'_'+canoe.GetCodePhase().toString();
}

canoe.GetNbInter = function()
{
	if (typeof canoe.notify_race === "object")
		return parseInt(canoe.notify_race.Nb_inter);
	else
		return 0;
}

canoe.GetTable = function(tableName)
{
	if (typeof canoe.notify_race === "object")
		return adv.GetTable(canoe.notify_race, tableName);
	else
		return undefined;
}

canoe.SetFmtChrono = function(defaultFmtChrono)
{
	if (defaultFmtChrono.length > 0)
	{
		canoe.fmtChrono = defaultFmtChrono;
	}
	else
	{
		if (canoe.GetCodeActivite() == 'SLA')
		{
			canoe.fmtChrono = 'XSCC';
		}
		else
		{
			canoe.fmtChrono = 'MMSSCC';
		}
	}
}

canoe.GetFmtChrono = function()
{
	if (canoe.fmtChrono === null)
	{
		if (canoe.GetCodeActivite() == 'SLA')
			return 'XSCC';
		else
			return 'MMSSCC';
	}
	else
	{
		return canoe.fmtChrono;
	}
}

canoe.SetRanking = function(objJSON)
{
	canoe.notify_ranking = objJSON;	
}

canoe.GetTableRanking = function()
{
	if (typeof canoe.notify_ranking === 'object')
		return adv.GetTableUnique(canoe.notify_ranking, 'ranking');
	else
		return undefined;
}

canoe.GetRankingBibIndex = function(tRanking, bib)
{
	if (bib > 0 && typeof tRanking === 'object')
		return tRanking.GetIndexRow('Dossard', bib);
	else
		return -1;
}

canoe.GetCurrentEpreuve = function()
{
	if (typeof canoe.notify_ranking === 'object')
		return canoe.notify_ranking.epreuve;
	else
		return '';
}

canoe.GetNbPorte = function()
{
	if (typeof canoe.notify_ranking === "object")
	{
		if (typeof canoe.notify_ranking.Nb_porte == 'number')
			return canoe.notify_ranking.Nb_porte;
	}

	return 0;
}

canoe.GetNbPorteInv = function()
{
	if (typeof canoe.notify_ranking === "object" && typeof canoe.notify_ranking.Porte_inverse == "object")
		return canoe.notify_ranking.Porte_inverse.length;
	else
		return 0;
}

canoe.IsPorteInv = function(porte)
{
	if (typeof canoe.notify_ranking === "object" && typeof canoe.notify_ranking.Porte_inverse == "object")
	{
		for (let p = 0; p < canoe.notify_ranking.Porte_inverse.length; p++)
		{
			if (canoe.notify_ranking.Porte_inverse[p] == porte)
				return true;
		}
	}
	
	return false;
}

canoe.GetNbSecteur = function()
{
	if (adv.IsTableUnique(canoe.notify_ranking, 'Secteur'))
	{
		const tSecteur = adv.GetTableUnique(canoe.notify_ranking, 'Secteur');
		const nbSecteur = tSecteur.GetNbRows();
		if (nbSecteur > 0)
			return nbSecteur;
	}
	
	return 1;
}

canoe.GetSecteurPorteMin = function(secteur)
{
	if (adv.IsTableUnique(canoe.notify_ranking, 'Secteur'))
	{
		const tSecteur = adv.GetTableUnique(canoe.notify_ranking, 'Secteur');
		if (tSecteur.GetNbRows() > 0)
		{
			let p = 0;
			for (let s=0;s<secteur-1;s++)
				p += tSecteur.GetCellInt("Nb_porte", s);
			
			return p+1;
		}
	}

	return 1;
}

canoe.GetSecteurPorteMax = function(secteur)
{
	if (adv.IsTableUnique(canoe.notify_ranking, 'Secteur'))
	{
		const tSecteur = adv.GetTableUnique(canoe.notify_ranking, 'Secteur');
		if (tSecteur.GetNbRows() > 0)
		{
			let p = 0;
			for (let s=0;s<secteur-1;s++)
				p += tSecteur.GetCellInt("Nb_porte", s);
			
			return p+tSecteur.GetCellInt("Nb_porte", secteur-1);
		}
	}

	return canoe.GetNbPorte();
}

canoe.GetSecteurNbPorte = function(secteur)
{
	return canoe.GetSecteurPorteMax(secteur) - canoe.GetSecteurPorteMin(secteur) + 1;
}

canoe.SetColumnNameRanking = function(tRanking)
{
	const course_phase = canoe.GetCodeCoursePhase();
	if (canoe.GetCodeActivite() == 'SLA')
	{
		const nbPorte = canoe.GetNbPorte();

		tRanking.SetColumnName('@RK_'+course_phase+'_1', 'Cltc'+course_phase);
		tRanking.SetColumnName('@START_RK_'+course_phase+'_1', 'Rang'+course_phase);
		tRanking.SetColumnName('@START_TIME_'+course_phase+'_1', 'Heure_depart'+course_phase);
		tRanking.SetColumnName('@CHRONO_'+course_phase+'_1', 'Tps_chrono'+course_phase);
		tRanking.SetColumnName('@TIME_'+course_phase+'_1', 'Tps'+course_phase);
		
		for (let p = 1; p <= nbPorte; p++)
			tRanking.SetColumnName('@PENA_'+p.toString()+'_1', "Pena_"+p.toString());

		tRanking.SetColumnName('@SUMPENA_'+course_phase+'_1', 'Total_pena'+course_phase);
		
		if (tRanking.GetIndexColumn("@CHRONO_INTER1_"+course_phase+'_1') >= 0)
		{
			tRanking.SetColumnName('@CHRONO_INTER1_'+course_phase+'_1', 'Tps_chrono'+course_phase+'_inter1');
			tRanking.SetColumnName('@RK_CHRONO_INTER1_'+course_phase+'_1', 'Cltc_chrono'+course_phase+'_inter1');
			tRanking.SetColumnName('@DIFF_CHRONO_INTER1_'+course_phase+'_1', 'Diffc_chrono'+course_phase+'_inter1');
		}
		
		if (tRanking.GetIndexColumn("@CHRONO_INTER2_"+course_phase+'_1') >= 0)
		{
			tRanking.SetColumnName('@CHRONO_INTER2_'+course_phase+'_1', 'Tps_chrono'+course_phase+'_inter2');
			tRanking.SetColumnName('@RK_CHRONO_INTER2_'+course_phase+'_1', 'Cltc_chrono'+course_phase+'_inter2');
			tRanking.SetColumnName('@DIFF_CHRONO_INTER2_'+course_phase+'_1', 'Cltc_chrono'+course_phase+'_inter2');
		}
		
		if (tRanking.GetIndexColumn("@INTER1_"+course_phase+'_1') >= 0)
		{
			tRanking.SetColumnName('@INTER1_'+course_phase+'_1', 'Tps'+course_phase+'_inter1');
			tRanking.SetColumnName('@RK_INTER1_'+course_phase+'_1', 'Cltc'+course_phase+'_inter1');
			tRanking.SetColumnName('@DIFF_INTER1_'+course_phase+'_1', 'Diffc'+course_phase+'_inter1');
		}

		if (tRanking.GetIndexColumn("@INTER2_"+course_phase+'_1') >= 0)
		{
			tRanking.SetColumnName('@INTER2_'+course_phase+'_1', 'Tps'+course_phase+'_inter2');
			tRanking.SetColumnName('@RK_INTER2_'+course_phase+'_1', 'Cltc'+course_phase+'_inter2');
			tRanking.SetColumnName('@DIFF_INTER2_'+course_phase+'_1', 'Diffc'+course_phase+'_inter2');
		}
	}
	
	// Maj Rang de départ
	tRanking.OrderBy('Heure_depart'+course_phase+", Dossard");
	for (let r = 0; r < tRanking.GetNbRows(); r++)
	{
		tRanking.SetCell('Rang'+course_phase, r, r+1);
	}
}

canoe.ComputeTpsInter = function(tRanking, inter)
{
	const course_phase_inter = canoe.GetCodeCoursePhase()+'_inter'+inter.toString();
	if (canoe.GetCodeActivite() == 'SLA')
	{
		for (let i=0; i< tRanking.GetNbRows(); i++)
		{
			const tps_chrono = tRanking.GetCellInt('Tps_chrono'+course_phase_inter, i);
			if (tps_chrono >= adv.chrono.OK)
			{
				const tps_pena = canoe.GetCurrentSlalomTotalPena(tRanking, i)*1000;
				tRanking.SetCell('Tps'+course_phase_inter, i, tps_chrono+tps_pena);
			}
			else
			{
				tRanking.SetCell('Tps'+course_phase_inter, i, tps_chrono);
			}
		}
	}
	else
	{
		const colCltc_chrono = tRanking.GetIndexColumn('Cltc_chrono'+course_phase_inter);
		if (colCltc_chrono < 0)
			tRanking.AddColumn('Cltc_chrono'+course_phase_inter, tRanking.GetColumnType(tRanking.GetIndexColumn('Cltc'+canoe.GetCodeCoursePhase())));
		
		for (let i=0; i< tRanking.GetNbRows(); i++)
		{
			const tps = tRanking.GetCellInt('Tps'+course_phase_inter, i);
			tRanking.SetCell('Tps_chrono'+course_phase_inter, i, tps);
		}
	}

	tRanking.SetRanking('Clt_chrono'+course_phase_inter, 'Tps_chrono'+course_phase_inter);
	tRanking.SetRanking('Cltc_chrono'+course_phase_inter, 'Tps_chrono'+course_phase_inter, "Code_categorie");
	
	tRanking.SetRanking('Clt'+course_phase_inter, 'Tps'+course_phase_inter);
	tRanking.SetRanking('Cltc'+course_phase_inter, 'Tps'+course_phase_inter, "Code_categorie");
}

canoe.UpdateSlalomPena = function(tRanking, row, porte, pena)
{
	tRanking.SetCell('Pena_'+porte, row, pena);
	return canoe.UpdateSlalomFinishTime(tRanking, row);
}

canoe.GetCurrentSlalomTotalPena = function(tRanking, row)
{
	const nb_porte = canoe.GetNbPorte();

	var sumPena = 0;
	for (let p = 1; p <= nb_porte; p++)
	{
		var pen = tRanking.GetCell('Pena_'+p.toString(), row);
		if (pen == '2')
			sumPena += 2;
		else if (pen == '50')
			sumPena += 50;
	}
	
	return sumPena;
}

canoe.GetCurrentSlalomCountPena = function(tRanking, row)
{
	const nb_porte = canoe.GetNbPorte();

	var count = 0;
	for (let p = 1; p <= nb_porte; p++)
	{
		var pen = tRanking.GetCell('Pena_'+p.toString(), row);
		if (pen == '2' || pen == '50' || pen == '0')
			++count;
	}
	
	return count;
}

canoe.UpdateSlalomTotalPena = function(tRanking, row)
{
	const course_phase = canoe.GetCodeCoursePhase();
	const colTotalPena = tRanking.GetIndexColumn('Total_pena'+course_phase);
	const nb_porte = canoe.GetNbPorte();
	
	if (colTotalPena >= 0 && nb_porte > 0)
	{
		var sumPena = 0;
		for (let p = 1; p <= nb_porte; p++)
		{
			var pen = tRanking.GetCell('Pena_'+p.toString(), row);
			if (pen == '2')
				sumPena += 2;
			else if (pen == '50')
				sumPena += 50;
			else if (pen != '0')
			{
				sumPena = -1;
				break;
			}
		}
		tRanking.SetCell(colTotalPena, row, sumPena);
		return sumPena;
	}
	else
	{
		return -1;
	}
}

canoe.UpdateSlalomFinishTime = function(tRanking, row)
{
	const course_phase = canoe.GetCodeCoursePhase();

	var newTps = adv.chrono.KO;
	var sumPena = canoe.UpdateSlalomTotalPena(tRanking, row);
	if (sumPena >= 0)
	{
		var tpsChrono = tRanking.GetCellInt('Tps_chrono'+course_phase, row);
		if (tpsChrono >= adv.chrono.OK)
			newTps = tpsChrono + sumPena * 1000;
		else
			newTps = tpsChrono;
	}
	
	const oldTps = tRanking.GetCellInt('Tps'+course_phase, row);
	if (oldTps != newTps)
	{
		tRanking.UpdateRankingTime(
			row, 
			tRanking.GetIndexColumn('Tps'+course_phase), 
			tRanking.GetIndexColumn('Clt'+course_phase), 
			oldTps, 
			newTps
		);

		tRanking.UpdateRankingGroupTime(
			row, 
			tRanking.GetIndexColumn('Tps'+course_phase), 
			tRanking.GetIndexColumn('Cltc'+course_phase), 
			oldTps, 
			newTps, 
			'Code_categorie'
		);
	}
	
	return newTps;
}

