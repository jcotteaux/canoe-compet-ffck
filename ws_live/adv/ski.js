const ski = {};

ski.GetCodeEvenement = function()
{
	if (typeof ski.notify_race === "object")
		return parseInt(ski.notify_race.Code_evenement);
	else
		return 0;
}

ski.GetCodeEpreuve = function()
{
	if (typeof ski.notify_race === "object")
		return parseInt(ski.notify_race.Code_epreuve);
	else
		return 0;
}

ski.GetCodeManche = function()
{
	if (typeof ski.notify_race === "object")
		return parseInt(ski.notify_race.Code_manche);
	else
		return 0;
}

ski.GetNbManche = function()
{
	if (typeof ski.notify_race === "object")
		return parseInt(ski.notify_race.Nb_manche);
	else
		return 0;
}

ski.GetNbInter = function()
{
	if (typeof ski.notify_race === "object")
		return parseInt(ski.notify_race.Nb_inter);
	else
		return 0;
}

ski.GetNbPena = function()
{
	if (typeof ski.notify_race === "object")
	{
		if (typeof ski.notify_race.Nb_pena == 'number')
			return ski.notify_race.Nb_pena;
	}

	return 0;
}

ski.GetCodeDiscipline = function()
{
	if (ski.notify_race !== undefined)
	{
		const tEpreuve = adv.GetTable(ski.notify_race, 'Epreuve');
		if (tEpreuve !== undefined)
		{
			if (tEpreuve.GetNbRows() > 0)
				return tEpreuve.GetCell("Code_discipline", 0);
		}
	}
	
	return '';
}

ski.GetNbEpreuve = function()
{
	if (ski.notify_race !== undefined)
	{
		const tEpreuve = adv.GetTable(ski.notify_race, 'Epreuve');
		if (tEpreuve !== undefined)
			return tEpreuve.GetNbRows();
	}
	
	return 0;
}

ski.GetCodeActivite = function()
{
	if (typeof ski.notify_race === "object")
	{
		const tEvenement = adv.GetTable(ski.notify_race, 'Evenement');
		if (typeof tEvenement === "object")
			return tEvenement.GetCell('Code_activite', 0);
	}
	return '?';
}	

ski.GetCodeEntite = function()
{
	if (typeof ski.notify_race === "object")
	{
		const tEvenement = adv.GetTable(ski.notify_race, 'Evenement');
		if (typeof tEvenement === "object")
			return tEvenement.GetCell('Code_entite', 0);
	}
	return '?';
}	

ski.GetCategInfo = function(code_categ, field_name)
{
	if (typeof ski.notify_race === "object")
	{
		const tCategorie = adv.GetTable(ski.notify_race, 'Categorie');
		if (typeof tCategorie === "object")
		{
			for (let r = 0; r < tCategorie.GetNbRows(); r++)
			{
				if (tCategorie.GetCell('Code', r) == code_categ)
					return tCategorie.GetCell(field_name,r);
			}
		}
	}
	return '';
}

ski.GetStringEpreuve = function(current_epreuve)
{
	if (typeof ski.notify_race === "object")
	{
		const tEpreuve = adv.GetTable(ski.notify_race, 'Epreuve');
		if (typeof tEpreuve === "object")
		{
			for (let r = 0; r < tEpreuve.GetNbRows(); r++)
			{
				if (tEpreuve.GetCellInt('Code_epreuve',r) == current_epreuve)
				{
					var txtEpreuve = tEpreuve.GetCell('Code_categorie',r);
					if (tEpreuve.GetCell('Sexe',r) != 'T')
						txtEpreuve += '/'+tEpreuve.GetCell('Sexe',r);
					
					if (tEpreuve.GetCell('Distance',r) != '')
						txtEpreuve += ' - '+tEpreuve.GetCell('Distance',r);
						
					return txtEpreuve;
				}
			}
		}
	}
	return '?';
}

ski.GetHeureDepart = function(current_epreuve)
{
	if (typeof ski.notify_race === "object")
	{
		const tEpreuve = adv.GetTable(ski.notify_race, 'Epreuve');
		if (typeof tEpreuve === "object")
		{
			for (let r = 0; r < tEpreuve.GetNbRows(); r++)
			{
				if (tEpreuve.GetCellInt('Code_epreuve',r) == current_epreuve)
				{
					var HeureDepart_Epreuve = tEpreuve.GetCellInt('Heure_depart',r);
						
					return HeureDepart_Epreuve;
				}
			}
		}
	}
	return '?';
}

ski.SetRace = function(objJSON)
{
	ski.notify_race = objJSON;
}

ski.SetEpreuve = function(objJSON, forceBibInteger=true)
{
	ski.notify_epreuve = objJSON;

	if (forceBibInteger)
	{
		const tRanking = ski.GetTableRanking();
		if (typeof tRanking === 'object')
			tRanking.SetColumnType('Dossard', adv.index_type.LONG);
	}
}

ski.SetEpreuveMulti = function(objJSON, epreuve)
{
	if (ski.notify_epreuve_multi === undefined)
		ski.notify_epreuve_multi = {};

	ski.notify_epreuve_multi[epreuve] = objJSON;
}

ski.GetNbEpreuveMulti = function()
{
	if (ski.notify_epreuve_multi !== undefined)
	{
		var count = 0;
		for (var key in ski.notify_epreuve_multi)
			++count;
		
		return count;
	}
	
	return 0;
}

ski.GetTableRankingMulti = function(epreuve)
{
	if (ski.notify_epreuve_multi !== undefined)
	{
		for (var key in ski.notify_epreuve_multi)
		{
			if (key == epreuve)
				return adv.GetTableUnique(ski.notify_epreuve_multi[key], 'ranking');
		}
	}
	
	return undefined;
}

ski.GetInfoEpreuveMulti = function(epreuve, info)
{
	if (ski.notify_epreuve_multi !== undefined)
	{
		for (var key in ski.notify_epreuve_multi)
		{
			if (key == epreuve)
				return ski.notify_epreuve_multi[key][info];
		}
	}
	
	return undefined;
}

ski.SetPassage = function(objJSON)
{
	ski.notify_passage = objJSON;
}

ski.GetTable = function(tableName)
{
	if (typeof ski.notify_race === "object")
		return adv.GetTable(ski.notify_race, tableName);
	else
		return undefined;
}

ski.GetTableRanking = function()
{
	if (typeof ski.notify_epreuve === 'object')
		return adv.GetTableUnique(ski.notify_epreuve, 'ranking');
	else
		return undefined;
}

ski.GetRankingBibIndex = function(tRanking, bib)
{
	if (bib > 0 && typeof tRanking === 'object')
		return tRanking.GetIndexRow('Dossard', bib);
	else
		return -1;
}

ski.GetTablePassage = function()
{
	if (typeof ski.notify_passage === 'object')
		return adv.GetTableUnique(ski.notify_passage, 'table_passage');
	else
		return undefined;
}

ski.GetTimePassage = function(bib, id)
{
	const tPassage = ski.GetTablePassage();
	if (tPassage !== undefined)
	{
		for (let i=0;i<tPassage.GetNbRows();i++)
		{
			if (tPassage.GetCell('Dossard',i) == bib && tPassage.GetCellInt('Id',i) == id)
				return tPassage.GetCellInt('Heure', i);
		}
	}

	return adv.chrono.KO;
}

ski.GetLastBibPassage = function(index, id)
{
	const tPassage = ski.GetTablePassage();

	var c = 0;
	if (tPassage !== undefined)
	{
		for (let i=0;i<tPassage.GetNbRows();i++)
		{
			if (tPassage.GetCellInt('Id',i) == id && tPassage.GetCellInt('Heure', i) >= 0)
			{
				const bib = tPassage.GetCell('Dossard',i);
				if (bib.length > 0 && parseInt(bib) > 0)
				{
					if (c == index)
						return parseInt(bib);
					else
						++c;
				}
			}
		}
	}

	return 0;
}

ski.GetSautNote = function(tRanking, row, manche)
{
	const note_order = tRanking.GetCellInt('Note_ordre'+manche.toString(), row);
	if (note_order == 1) return tRanking.GetCellFormat('Note'+manche.toString(), row, '1');
	else if (note_order == 104) return 'Abs';
	else if (note_order == 103) return 'Dsq';
	else if (note_order == 102) return 'Abd';
	else return '-';
}

// Parallèle //
ski.para = {};

ski.SetParaRace = function(objJSON)
{
	ski.notify_para_race = objJSON;
}

ski.para.GetNbTour = function()
{
	if (typeof ski.notify_para_race === 'object')
		return ski.notify_para_race.nb_tour;
	else
		return 0;
}

ski.para.GetNbDuel = function(tour)
{
	if (typeof ski.notify_para_race === 'object')
		return ski.notify_para_race['tour_'+tour].nb_duel;
	else
		return 0;
}

ski.para.GetTourLabel = function(tour)
{
	if (typeof ski.notify_para_race === 'object')
		return ski.notify_para_race['tour_'+tour].label;
	else
		return '?';
}

ski.para.GetNbRun = function(tour)
{
	if (typeof ski.notify_para_race === 'object')
		return ski.notify_para_race['tour_'+tour].nb_run;
	else
		return 1;
}

ski.para.GetMaxNbRun = function(tour)
{
	const nbTour = ski.para.GetNbTour();
	
	var max = 1;
	for (let t=1;t<nbTour;t++)
	{
		if (ski.para.GetNbRun(t) > max)
			max = ski.para.GetNbRun(t);
	}
	return max;
}

ski.para.GetTable = function()
{
	if (typeof ski.notify_para_race === 'object')
		return adv.GetTableUnique(ski.notify_para_race, 'duel');
	else
		return undefined;
}

ski.para.GetCell = function(tour, duel, left, colName)
{
	const tDuel = ski.para.GetTable();
	if (tDuel !== undefined)
	{
		for (let r = 0; r < tDuel.GetNbRows(); r++)
		{
			if (tDuel.GetCellInt('tour', r) == tour && tDuel.GetCellInt('duel', r) == duel && tDuel.GetCellInt('left', r) == left)
			if (tDuel.GetCellInt('tour', r) == tour && tDuel.GetCellInt('duel', r) == duel)
				return tDuel.GetCell(colName, r);
		}
	}

	return '?';
}

ski.para.SetCell = function(tour, duel, left, colName, value)
{
	const tDuel = ski.para.GetTable();
	if (tDuel !== undefined)
	{
		for (let r = 0; r < tDuel.GetNbRows(); r++)
		{
			if (tDuel.GetCellInt('tour', r) == tour && tDuel.GetCellInt('duel', r) == duel && tDuel.GetCellInt('left', r) == left)
			{
				tDuel.SetCell(colName, r, value);
				return true;
			}
		}
	}

	return false;
}

ski.para.GetCellIndex = function(tour, duel, left)
{
	const tDuel = ski.para.GetTable();
	if (tDuel !== undefined)
	{
		for (let r = 0; r < tDuel.GetNbRows(); r++)
		{
			if (tDuel.GetCellInt('tour', r) == tour && tDuel.GetCellInt('duel', r) == duel && tDuel.GetCellInt('left', r) == left)
				return r;
		}
	}

	return -1;
}	

ski.para.GetCellDiff = function(tour, duel, left, run)
{
	const tDuel = ski.para.GetTable();
	if (tDuel !== undefined)
	{
		const colDiff = tDuel.GetIndexColumn('diff'+run.toString());
		if (colDiff >= 0)
		{		
			for (let r = 0; r < tDuel.GetNbRows(); r++)
			{
				if (tDuel.GetCellInt('tour', r) == tour && tDuel.GetCellInt('duel', r) == duel && tDuel.GetCellInt('left', r) == left)
					return tDuel.GetCell(colDiff, r);
			}
		}
	}

	return '-';
}	

ski.para.GetCellTime = function(tour, duel, left, run)
{
	const tDuel = ski.para.GetTable();
	if (tDuel !== undefined)
	{
		const colTps = tDuel.GetIndexColumn('tps'+run.toString());
		if (colTps >= 0)
		{		
			for (let r = 0; r < tDuel.GetNbRows(); r++)
			{
				if (tDuel.GetCellInt('tour', r) == tour && tDuel.GetCellInt('duel', r) == duel && tDuel.GetCellInt('left', r) == left)
					return tDuel.GetCell(colTps, r);
			}
		}
	}

	return '-';
}

// Duel 
ski.SetDuelRace = function(objJSON)
{
	ski.notify_duel_race = objJSON;
}

ski.duel = {};

ski.duel.GetIndexEpreuve = function(objJSON)
{
	if (typeof ski.notify_duel_race === 'object')
		return ski.notify_duel_race.index;
	else
		return 0;
}

ski.duel.GetNbTour = function()
{
	if (typeof ski.notify_duel_race === 'object')
		return ski.notify_duel_race.nb_tour;
	else
		return 0;
}

ski.duel.GetNbDuel = function(tour)
{
	if (typeof ski.notify_duel_race === 'object')
		return ski.notify_duel_race['tour_'+tour].nb_duel;
	else
		return 0;
}

ski.duel.GetTourLabel = function(tour)
{
	if (typeof ski.notify_duel_race === 'object')
		return ski.notify_duel_race['tour_'+tour].label;
	else
		return '?';
}

ski.duel.GetNbCouloir = function(tour, duel)
{
	if (typeof ski.notify_duel_race === 'object')
		return ski.notify_duel_race['tour_'+tour]['nb_couloir_duel'+duel];
	else
		return 0;
}

ski.duel.GetMaxNbDuel = function()
{
	var maxNbDuel = 0;
	const nbTour = ski.duel.GetNbTour();
	for (let t = 1; t <= nbTour; t++)
	{
		const nbDuel = ski.duel.GetNbDuel(t);
		if (nbDuel > maxNbDuel)
			maxNbDuel = nbDuel;
	}
	return maxNbDuel;
}

ski.duel.GetMaxNbCouloir = function()
{
	var maxNbCouloir = 0;
	const nbTour = ski.duel.GetNbTour();
	for (let t = 1; t <= nbTour; t++)
	{
		const nbDuel = ski.duel.GetNbDuel(t);
		for (let d = 1; d <= nbDuel; d++)
		{
			const nbCouloir = ski.duel.GetNbCouloir(t,d);
			if (nbCouloir > maxNbCouloir)
				maxNbCouloir = nbCouloir;
		}
	}
	
	return maxNbCouloir;
}

ski.duel.GetTable = function()
{
	if (typeof ski.notify_duel_race === 'object')
		return adv.GetTableUnique(ski.notify_duel_race, 'duel');
	else
		return undefined;
}

ski.duel.GetCell = function(tour, duel, couloir, colName)
{
	const tDuel = ski.duel.GetTable();
	if (tDuel !== undefined)
	{
		for (let r = 0; r < tDuel.GetNbRows(); r++)
		{
			if (
				tDuel.GetCellInt('tour', r) == tour && 
				tDuel.GetCellInt('duel', r) == duel && 
				tDuel.GetCellInt('couloir', r) == couloir
			)
				return tDuel.GetCell(colName, r);
		}
	}

	return '?';
}

