<?php
require_once __DIR__ . '/_bootstrap.php';
$competitionCodeWithPrefix = $_GET['competition'] ?? '';
$isManual = (preg_match('/^[MI]/', $competitionCodeWithPrefix) === 1);
$competitionCodeForKCrossTables = $competitionCodeWithPrefix; 
$competitionCodeForSourceTables = (int) preg_replace('/[^0-9]/', '', $competitionCodeWithPrefix);
$categoryKey = $_GET['category'] ?? '';
$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 0;
$etat_param = $_GET['etat'] ?? '2';
$withclub = isset($_GET['club']) && $_GET['club'] === 'true';
$zoneIndex_param = $_GET['zoneIndex'] ?? null;
if ($competitionCodeWithPrefix === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Code de compétition non fourni.']);
    exit;
}
$clientLastModified = isset($_GET['last_modified']) ? (int)$_GET['last_modified'] : 0;
try {
    $sqlMax = "
        SELECT GREATEST(
            COALESCE((SELECT MAX(Last_Modified) FROM {$tableHeats} WHERE Code_competition = :comp1), 0),
            COALESCE((SELECT MAX(Last_Modified) FROM {$tableSlots} WHERE Code_competition = :comp2), 0)
        )
    ";
    $stmtMax = $pdo->prepare($sqlMax);
    $stmtMax->execute([
        'comp1' => $competitionCodeForKCrossTables,
        'comp2' => $competitionCodeForKCrossTables
    ]);    
    $dbLastModified = (int)$stmtMax->fetchColumn();
    if ($clientLastModified > 0 && $dbLastModified <= $clientLastModified) {
        http_response_code(304); 
        exit; 
    }
    $etat_values = array_map('intval', explode(',', $etat_param));
    $in_clause = implode(',', $etat_values);
    $where_etat = "h.Etat IN ({$in_clause})";
    $where_zone = "";
    if ($zoneIndex_param !== null) {
        if ($zoneIndex_param === 'all') $where_zone = "AND h.Zones_Jugees IS NOT NULL AND INSTR(h.Zones_Jugees, '0') = 0";
        else if ($zoneIndex_param === 'nostart') {
            $jugeStart = isset($config['judging']['juge_start']) ? $config['judging']['juge_start'] : false;
            if ($jugeStart) {
                $where_zone = "AND h.Zones_Jugees IS NOT NULL AND INSTR(h.Zones_Jugees, '0') = 0";
            } else {
                $where_zone = "AND h.Zones_Jugees IS NOT NULL AND INSTR(SUBSTRING(h.Zones_Jugees, 2), '0') = 0";
            }
        }
        else {
            $zoneIndex_numeric = (int)$zoneIndex_param;
            $where_zone = "AND (h.Zones_Jugees IS NULL OR SUBSTRING(h.Zones_Jugees, " . ($zoneIndex_numeric + 1) . ", 1) = '0')";
        }
    }
    $where_category = "";
    if (!empty($categoryKey)) {
        $where_category = "AND cat.Nom_Categorie = :category";
    }
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
            AND {$where_etat}
            {$where_zone}
            {$where_category}
        ORDER BY h.Num_Serie_Global, h.H_depart, h.Code_Serie, s.Slot_Index
    ";
    $params = [
        ':compKCross' => $competitionCodeForKCrossTables,
        ':competitionCodeSource1' => $competitionCodeForSourceTables
    ];
    if (!$isManual) {
        $params[':competitionCodeSource2'] = $competitionCodeForSourceTables;
    }
    if (!empty($categoryKey)) {
        $params[':category'] = $categoryKey;
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $allSlots = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (empty($allSlots)) { echo json_encode(['success' => true, 'lastModified' => $dbLastModified, 'heats' => []]); exit; }
    $heats = [];
    foreach ($allSlots as $slot) {
        $heatIdentifier = $slot['heatId'];
        $heatLastMod = $slot['heatLastModified'] !== null ? (int)$slot['heatLastModified'] : 0;
        $slotLastMod = $slot['slotLastModified'] !== null ? (int)$slot['slotLastModified'] : 0;
        $computedLastModified = max($heatLastMod, $slotLastMod);        
        if (!isset($heats[$heatIdentifier])) {
            if (($limit > 0) && (count($heats) >= $limit)) break;
            $heats[$heatIdentifier] = [
                'id' => (int)$slot['heatId'], 'categoryKey' => $slot['categoryKey'], 'roundKey' => $slot['roundKey'],
                'name' => $slot['heatName'], 'startTime' => $slot['startTime'], 'etat' => (int)$slot['etat'],
                'globalHeatNumber' => $slot['globalHeatNumber'] ? (int)$slot['globalHeatNumber'] : null,
                'formatKey' => $slot['formatKey'], 'nomVariante' => $slot['nomVariante'],
                'zonesJugees' => $slot['Zones_Jugees'], 'gateCount' => (int)$slot['gateCount'],
                'rollZoneAfterGate' => (int)$slot['rollZoneAfterGate'], 'detailPortes' => $slot['detailPortes'],
                'lastModified' => $computedLastModified,
                'modifiedBy' => $slot['heatModifiedBy'],
                'slots' => []
            ];
        } else {
            $heats[$heatIdentifier]['lastModified'] = max($heats[$heatIdentifier]['lastModified'], $computedLastModified);
        }            
        if (!empty($slot['prioDepart'])) {
            $nom_normalise = $slot['Nom'] ? mb_strtoupper($slot['Nom'], 'UTF-8') : '';
            $prenom_normalise = $slot['Prenom'] ? mb_convert_case($slot['Prenom'], MB_CASE_TITLE, 'UTF-8') : '';
            $nom_complet_formate = trim($nom_normalise . ' ' . $prenom_normalise);
            if (empty($nom_complet_formate)) $nom_complet_formate = 'N/A';
            $heats[$heatIdentifier]['slots'][] = [
                'prioDepart' => (int)$slot['prioDepart'],
                'lastModified' => $slot['slotLastModified'] !== null ? (int)$slot['slotLastModified'] : null,
                'modifiedBy' => $slot['slotModifiedBy'],
                'participant' => [
                    'id' => $slot['participantId'], 'bib' => $slot['bib'], 'name' => $nom_complet_formate,
                    'club' => $withclub ? $slot['club'] : null, 'ordre_arrivee' => $slot['Ordre_arrivee'],
                    'penalite' => $slot['Penalite'], 'specialStatus' => $slot['Statut_Special'],
                    'finalRank' => ((int)$slot['finalRank'] > 0) ? (int)$slot['finalRank'] : ($slot['Statut_Special'] ?: '-')
                ]
            ];
        }
    }
    echo json_encode(['success' => true, 'lastModified' => $dbLastModified, 'heats' => array_values($heats)]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => "Erreur API: " . $e->getMessage()]);
}
?>