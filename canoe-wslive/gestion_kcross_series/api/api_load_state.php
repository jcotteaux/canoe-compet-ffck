<?php
require_once __DIR__ . '/_bootstrap.php';
$competitionCode = null;
if (!empty($_GET['competition'])) {
    $competitionCode = $_GET['competition'];
} else {
    $payload = json_decode(file_get_contents('php://input'), true);
    if (!empty($payload['competitionCode'])) {
        $competitionCode = $payload['competitionCode'];
    }
}
if ($competitionCode === null) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Code de compétition manquant.']);
    exit;
}
$action = $_GET['action'] ?? $payload['action'] ?? null;
if (empty($action)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Action manquante.']);
    exit;
}
try {
    $response = null;
    $dbLastModified = 0;
    if (in_array($action, ['load_full_competition', 'load_categories_data'])) {
        $clientLastModified = isset($_GET['last_modified']) ? (int)$_GET['last_modified'] : 0;
        $sqlMax = "
            SELECT GREATEST(
                COALESCE((SELECT MAX(Last_Modified) FROM {$tableHeats} WHERE Code_competition = :comp1), 0),
                COALESCE((SELECT MAX(Last_Modified) FROM {$tableSlots} WHERE Code_competition = :comp2), 0)
            )
        ";
        $stmtMax = $pdo->prepare($sqlMax);
        $stmtMax->execute([
            'comp1' => $competitionCode,
            'comp2' => $competitionCode
        ]);
        $dbLastModified = (int)$stmtMax->fetchColumn();
        if ($clientLastModified > 0 && $dbLastModified <= $clientLastModified) {
            http_response_code(304); 
            exit;
        }
    }
    switch ($action) {
        case 'load_heat_status':
            $heatId = isset($_GET['heatId']) ? (int)$_GET['heatId'] : 0;
            $response= loadHeatStatus($pdo, $competitionCode, $tableHeats,$heatId);
            break;
        case 'load_full_competition':
            $response = loadFullCompetitionState($pdo, $competitionCode, $tableSettings, $tableCategories, $tableSchedules, $tableHeats, $tableSlots);
            break;
        case 'load_categories_data':
            $response = loadCategoriesDataOnly($pdo, $competitionCode, $tableCategories, $tableHeats, $tableSlots);
            break;
        default:
            throw new Exception("Action de chargement non reconnue : " . htmlspecialchars($action));
    }
    if ($response) {
        if ($dbLastModified > 0) {
            $response['lastModified'] = $dbLastModified;
        }
        echo json_encode($response);
    } else {
        throw new Exception("L'action a été traitée mais n'a retourné aucune donnée.");
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => "Erreur lors du chargement de l'état: " . $e->getMessage()]);
}
function loadHeatStatus($pdo, $competitionCode, $tableHeats, $heatId) {
    global $tableSlots;
    if ($heatId === 0) throw new Exception("ID de la série manquant.");
    $sql = "
        SELECT h.Etat, h.Zones_Jugees,
               GREATEST(
                   COALESCE(h.Last_Modified, 0), 
                   COALESCE((SELECT MAX(Last_Modified) FROM {$tableSlots} WHERE Code_Serie = h.Code_Serie), 0)
               ) AS Last_Modified
        FROM {$tableHeats} h
        WHERE h.Code_competition = ? AND h.Code_Serie = ?
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$competitionCode, $heatId]);
    $res = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$res) {
        return ['success' => false, 'message' => 'Série introuvable.'];
    } else {
        return [
            'success' => true, 
            'etat' => (int)$res['Etat'], 
            'zonesJugees' => $res['Zones_Jugees'],
            'lastModified' => (int)$res['Last_Modified']
        ];
    }
}
function loadFullCompetitionState($pdo, $competitionCode, $tableSettings, $tableCategories, $tableSchedules, $tableHeats, $tableSlots) {
    $stmtSettings = $pdo->prepare("SELECT * FROM {$tableSettings} WHERE Code_competition = ?");
    $stmtSettings->execute([$competitionCode]);
    $settings = $stmtSettings->fetch(PDO::FETCH_ASSOC);
    if (!$settings) {
        return ['success' => true, 'found' => false, 'message' => 'Aucun état de persistance trouvé.'];
    }
    $stmtSchedules = $pdo->prepare("SELECT Data_horaires FROM {$tableSchedules} WHERE Code_competition = ?");
    $stmtSchedules->execute([$competitionCode]);
    $schedulesDataJson = $stmtSchedules->fetchColumn();
    $allRows = _fetchFullCategoryData($pdo, $competitionCode, $tableCategories, $tableHeats, $tableSlots);
    $categoriesData = _buildCategoriesDataFromRows($allRows);
    global $config;
    return [
        'success' => true,
        'found' => true,
        'data' => [
            'settings' => $settings,
            'schedulesData' => json_decode($schedulesDataJson, true),
            'categoriesData' => $categoriesData,
             'liveWebConfig' => $config['live_web'] ?? null 
        ]
    ];
}
function loadCategoriesDataOnly($pdo, $competitionCode, $tableCategories, $tableHeats, $tableSlots) {
    $allRows = _fetchFullCategoryData($pdo, $competitionCode, $tableCategories, $tableHeats, $tableSlots);
    if (empty($allRows)) {
        return ['success' => true, 'found' => false, 'message' => 'Aucune catégorie trouvée pour cette compétition.'];
    }
    $categoriesData = _buildCategoriesDataFromRows($allRows);
    return [
        'success' => true,
        'found' => true,
        'data' => ['categoriesData' => $categoriesData]
    ];
}
function _fetchFullCategoryData($pdo, $competitionCode, $tableCategories, $tableHeats, $tableSlots) {
    $sql = "
        SELECT
            cat.Code_Categorie, cat.Nom_Categorie, cat.Nb_Bateau, cat.Nom_Variante, cat.Ordre,
            h.Code_Serie, h.Nom_Tour, h.Nom_Serie AS Nom_Serie_Heat, h.H_depart, h.Etat, h.Num_Serie_Global,
            h.Last_Modified AS Heat_Last_Modified, h.Modified_By AS Heat_Modified_By,
            s.Slot_Index, s.Code_bateau, s.Ordre_arrivee, s.Penalite, s.Statut_Special, s.Clt,
            s.Last_Modified AS Slot_Last_Modified, s.Modified_By AS Slot_Modified_By
        FROM {$tableCategories} cat
        LEFT JOIN {$tableHeats} h ON cat.Code_Categorie = h.Code_Categorie AND h.Code_competition = cat.Code_competition
        LEFT JOIN {$tableSlots} s ON h.Code_Serie = s.Code_Serie
        WHERE cat.Code_competition = ? AND cat.Nom_Categorie != '_TEST_RESEAU_' 
        ORDER BY  cat.Ordre ASC, cat.Code_Categorie, h.Code_Serie, s.Slot_Index
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$competitionCode]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}
function _buildCategoriesDataFromRows(array $allRows): array {
    $categoriesData = [];
    foreach ($allRows as $row) {
        $catKey = $row['Nom_Categorie'];
        if (!isset($categoriesData[$catKey])) {
            $categoriesData[$catKey] = [
                'cle' => $catKey,
                'numCompetitorsInHeats' => (int)$row['Nb_Bateau'],
                'nomVariante' => $row['Nom_Variante'],
                'ordre' => is_null($row['Ordre']) ? 999 : (int)$row['Ordre'],
                'rounds' => []
            ];
        }
        $roundKey = $row['Nom_Tour'];
        if ($roundKey && !isset($categoriesData[$catKey]['rounds'][$roundKey])) {
            $categoriesData[$catKey]['rounds'][$roundKey] = [
                'name' => $roundKey,
                'heats' => []
            ];
        }
        $heatName = $row['Nom_Serie_Heat'];
        if ($heatName) {
            $heatsMap = array_column($categoriesData[$catKey]['rounds'][$roundKey]['heats'], 'name');
            $heatLastMod = $row['Heat_Last_Modified'] !== null ? (int)$row['Heat_Last_Modified'] : 0;
            $slotLastMod = $row['Slot_Last_Modified'] !== null ? (int)$row['Slot_Last_Modified'] : 0;
            $initialLastModified = max($heatLastMod, $slotLastMod);
            if (!in_array($heatName, $heatsMap)) {
                $categoriesData[$catKey]['rounds'][$roundKey]['heats'][] = [
                    'id' => (int)$row['Code_Serie'],
                    'name' => $heatName,
                    'roundKey' => $roundKey,
                    'startTime' => $row['H_depart'],
                    'etat' => (int)$row['Etat'],
                    'globalHeatNumber' => isset($row['Num_Serie_Global']) && $row['Num_Serie_Global'] ? (int)$row['Num_Serie_Global'] : null,
                    'lastModified' =>  $initialLastModified,
                    'modifiedBy' => $row['Heat_Modified_By'] ?? null,
                    'slots' => []
                ];
            }
        }
        if ($row['Code_bateau']) {
            $heatIndex = array_search($heatName, array_column($categoriesData[$catKey]['rounds'][$roundKey]['heats'], 'name'));
            if ($heatIndex !== false) {
                $categoriesData[$catKey]['rounds'][$roundKey]['heats'][$heatIndex]['slots'][] = [
                    'prioDepart' => (int)$row['Slot_Index'],
                    'participantCodeBateau' => $row['Code_bateau'],
                    'lastModified' => $row['Slot_Last_Modified'] ?? null,
                    'modifiedBy' => $row['Slot_Modified_By'] ?? null,
                    'heatResult' => [
                        'order' => $row['Ordre_arrivee'] ? (int)$row['Ordre_arrivee'] : null,
                        'penalty' => $row['Penalite'],
                        'specialStatus' => $row['Statut_Special'],
                        'finalRank' => is_numeric($row['Clt']) ? (int)$row['Clt'] : null
                    ]
                ];
            }
        }
    }
    return $categoriesData;
}
?>