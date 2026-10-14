<?php
require_once __DIR__ . '/_bootstrap.php';
$competitionCodeWithPrefix = $_GET['competition'] ?? '';
$heatId = isset($_GET['heat_id']) ? (int)$_GET['heat_id'] : 0;
if ($competitionCodeWithPrefix === '' || $heatId === 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Paramètres manquants.']);
    exit;
}
$isManual = (preg_match('/^[MI]/', $competitionCodeWithPrefix) === 1);
$competitionCodeForKCrossTables = $competitionCodeWithPrefix; 
$competitionCodeForSourceTables = (int) preg_replace('/[^0-9]/', '', $competitionCodeWithPrefix);
$withclub = true; 
try {
    $join_sql = "";
    $select_cols_participant = "";
    if ($isManual) {
        $join_sql = "LEFT JOIN {$tableManualResults} r ON s.Code_bateau = r.code_bateau AND r.id_competition = :competitionCodeSource1";
        $select_cols_participant = "r.dossard AS bib, r.nom AS Nom, r.prenom AS Prenom, r.club AS club";
    } else {
        $join_sql = "LEFT JOIN Resultat r ON s.Code_bateau = r.Code_bateau AND r.Code_competition = :competitionCodeSource1
                     LEFT JOIN Resultat_Equipier re ON s.Code_bateau = re.Code_bateau AND re.Code_competition = :competitionCodeSource2";
        $select_cols_participant = "r.Dossard AS bib, re.Nom AS Nom, re.Prenom AS Prenom, re.Club AS club";
    }
    $sql = "
        SELECT
            h.Code_Serie AS heatId, h.Nom_Tour AS roundKey, h.Nom_Serie AS heatName, h.H_depart AS startTime,
            h.Num_Serie_Global as globalHeatNumber, h.Etat AS etat, h.Zones_Jugees,
            h.Last_Modified AS heatLastModified, h.Modified_By AS heatModifiedBy,
            cat.Nom_Categorie AS categoryKey, cat.Nom_Variante AS nomVariante,
            st.Nombre_portes as gateCount, st.Roll_Zone as rollZoneAfterGate, st.Detail_portes as detailPortes, st.Format as formatKey,
            s.Slot_Index AS prioDepart, s.Code_bateau AS participantId, s.Ordre_arrivee, s.Penalite, s.Statut_Special, s.Clt AS finalRank,
            s.Last_Modified AS slotLastModified, s.Modified_By AS slotModifiedBy,
            {$select_cols_participant}
        FROM {$tableHeats} h
        LEFT JOIN {$tableSlots} s ON h.Code_Serie = s.Code_Serie AND h.Code_competition = s.Code_competition
        JOIN {$tableCategories} cat ON h.Code_Categorie = cat.Code_Categorie AND h.Code_competition = cat.Code_competition
        JOIN {$tableSettings} st ON h.Code_competition = st.Code_competition
        {$join_sql}
        WHERE 
            h.Code_competition = :compKCross
            AND h.Code_Serie = :heatId
        ORDER BY s.Slot_Index
    ";
    $params = [
        ':compKCross' => $competitionCodeForKCrossTables,
        ':competitionCodeSource1' => $competitionCodeForSourceTables,
        ':heatId' => $heatId
    ];
    if (!$isManual) {
        $params[':competitionCodeSource2'] = $competitionCodeForSourceTables;
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (empty($rows)) { 
        echo json_encode(['success' => false, 'message' => 'Série introuvable']); 
        exit; 
    }
    $firstRow = $rows[0];
    $maxLastModified = $firstRow['heatLastModified'] !== null ? (int)$firstRow['heatLastModified'] : 0;
    foreach ($rows as $row) {
        $slotLastMod = $row['slotLastModified'] !== null ? (int)$row['slotLastModified'] : 0;
        if ($slotLastMod > $maxLastModified) {
            $maxLastModified = $slotLastMod;
        }
    }
    $heat = [
        'id' => (int)$firstRow['heatId'], 
        'categoryKey' => $firstRow['categoryKey'], 
        'roundKey' => $firstRow['roundKey'],
        'name' => $firstRow['heatName'], 
        'startTime' => $firstRow['startTime'], 
        'etat' => (int)$firstRow['etat'],
        'globalHeatNumber' => $firstRow['globalHeatNumber'] ? (int)$firstRow['globalHeatNumber'] : null,
        'formatKey' => $firstRow['formatKey'], 
        'nomVariante' => $firstRow['nomVariante'],
        'zonesJugees' => $firstRow['Zones_Jugees'], 
        'gateCount' => (int)$firstRow['gateCount'],
        'rollZoneAfterGate' => (int)$firstRow['rollZoneAfterGate'], 
        'detailPortes' => $firstRow['detailPortes'],
        'lastModified' => $maxLastModified,
        'modifiedBy' => $firstRow['heatModifiedBy'],
        'slots' => []
    ];
    foreach ($rows as $row) {
        if ($row['prioDepart'] === null) continue; 
        $nom_normalise = $row['Nom'] ? mb_strtoupper($row['Nom'], 'UTF-8') : '';
        $prenom_normalise = $row['Prenom'] ? mb_convert_case($row['Prenom'], MB_CASE_TITLE, 'UTF-8') : '';
        $nom_complet_formate = trim($nom_normalise . ' ' . $prenom_normalise);
        if (empty($nom_complet_formate)) $nom_complet_formate = 'N/A';
        $heat['slots'][] = [
            'prioDepart' => (int)$row['prioDepart'],
            'lastModified' => $row['slotLastModified'] !== null ? (int)$row['slotLastModified'] : null,
            'modifiedBy' => $row['slotModifiedBy'],
            'participant' => [
                'id' => $row['participantId'], 
                'bib' => $row['bib'], 
                'name' => $nom_complet_formate,
                'club' => $row['club'], 
                'ordre_arrivee' => $row['Ordre_arrivee'],
                'penalite' => $row['Penalite'], 
                'specialStatus' => $row['Statut_Special'],
                'finalRank' => ((int)$row['finalRank'] > 0) ? (int)$row['finalRank'] : ($row['Statut_Special'] ?: '-')
            ]
        ];
    }
    echo json_encode(['success' => true, 'heat' => $heat]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => "Erreur API: " . $e->getMessage()]);
}
?>