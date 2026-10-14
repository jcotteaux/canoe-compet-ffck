<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
$competitionCode = $_GET['competition'] ?? null;
if (empty($competitionCode)) {
    echo json_encode(['success' => false, 'error' => 'Parametre "competition" requis']);
    exit;
}
try {
    $pdo = getDbConnection();
    global $tables;
    $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM {$tables['settings']} WHERE Code_competition = ?");
    $checkStmt->execute([$competitionCode]);
    if ($checkStmt->fetchColumn() == 0) {
        echo json_encode(['success' => false, 'error' => "Competition '$competitionCode' non trouvee"]);
        exit;
    }
    $isManual = (preg_match('/^[MI]/', $competitionCode) === 1);
    $compMeta = [];
    if ($isManual) {
        $manualCompId = (int) preg_replace('/[^0-9]/', '', $competitionCode);
        $stmtMeta = $pdo->prepare("SELECT Codex AS Codex, nom AS Nom, ville AS Ville, date_debut AS Date_debut, date_fin AS Date_fin FROM {$tables['manual_competitions']} WHERE id = ?");
        $stmtMeta->execute([$manualCompId]);
        $compMeta = $stmtMeta->fetch(PDO::FETCH_ASSOC);
    } else {
        $stmtMeta = $pdo->prepare("SELECT Codex,Nom, Ville, Date_debut, Date_fin FROM Competition WHERE Code = ?");
        $stmtMeta->execute([$competitionCode]);
        $compMeta = $stmtMeta->fetch(PDO::FETCH_ASSOC);
    }
    $export = [
        'kcross_export' => [
            'version' => '1.1',
            'format' => 'kcross_course',
            'export_date' => date('c'),
            'is_manual' => $isManual
        ],
        'data' => [
            'meta' => $compMeta, 
            'competition' => null,
            'categories' => [],
            'horaires' => null,
            'series' => [],
            'slots' => [],
            'classement' => [],
            'participants' => []
        ],
        'stats' => []
    ];
    $export['data']['participants'] = [];
    $stmt = $pdo->prepare("SELECT Format, Nombre_portes, Detail_portes, Roll_Zone, Ecart_Series_Global, Ecart_Categories_Global 
                           FROM {$tables['settings']} WHERE Code_competition = ?");
    $stmt->execute([$competitionCode]);
    $export['data']['competition'] = $stmt->fetch(PDO::FETCH_ASSOC);
    $stmt = $pdo->prepare("SELECT Code_Categorie, Nom_Categorie, Nb_Bateau, Nom_Variante, Ordre 
                           FROM {$tables['categories']} WHERE Code_competition = ? AND Nom_Categorie != '_TEST_RESEAU_' ORDER BY Ordre, Code_Categorie"); 
    $stmt->execute([$competitionCode]);
    $export['data']['categories'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $stmt = $pdo->prepare("SELECT Data_horaires FROM {$tables['schedules']} WHERE Code_competition = ?");
    $stmt->execute([$competitionCode]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $export['data']['horaires'] = $row ? $row['Data_horaires'] : null;
    $stmt = $pdo->prepare("SELECT Code_Serie, Code_Categorie, Nom_Tour, Nom_Serie, H_depart, Etat, Zones_Jugees, Num_Serie_Global 
                           FROM {$tables['heats']} WHERE Code_competition = ? AND Nom_Serie != '_TEST_RESEAU_' 
                           ORDER BY Num_Serie_Global, Code_Serie");
    $stmt->execute([$competitionCode]);
    $export['data']['series'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $stmt = $pdo->prepare("
        SELECT s.Code_Serie, s.Slot_Index, s.Code_bateau, s.Ordre_arrivee, s.Penalite, s.Statut_Special, s.Clt 
        FROM {$tables['slots']} s
        INNER JOIN {$tables['heats']} h ON s.Code_Serie = h.Code_Serie AND s.Code_competition = h.Code_competition
        WHERE s.Code_competition = ?  AND h.Nom_Serie != '_TEST_RESEAU_'
        ORDER BY s.Code_Serie, s.Slot_Index
    ");                           
    $stmt->execute([$competitionCode]);
    $export['data']['slots'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $stmt = $pdo->prepare("SELECT Code_Categorie, Code_bateau, Cltc, Serie_Source 
                           FROM {$tables['ranking']} 
                           WHERE Code_competition = ? AND Serie_Source != '_TEST_RESEAU_' 
                           ORDER BY Code_Categorie, Cltc");
    $stmt->execute([$competitionCode]);
    $export['data']['classement'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if ($isManual) {
        $manualCompId = (int) preg_replace('/[^0-9]/', '', $competitionCode);
        $stmt = $pdo->prepare("SELECT dossard, nom, prenom, club, sexe, code_categorie, tps_chrono_cs, cltc, code_bateau, bateau, nation, licence 
                               FROM {$tables['manual_results']} WHERE id_competition = ? ORDER BY code_categorie, cltc");
        $stmt->execute([$manualCompId]);
        $export['data']['participants'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $stmt = $pdo->prepare("
            SELECT r.Dossard AS dossard, re.Nom AS nom, re.Prenom AS prenom, r.Club AS club, 
                   re.Sexe AS sexe, rc.Code_categorie AS code_categorie, rc.Tps_chrono AS tps_chrono_cs, 
                   rc.Cltc AS cltc, r.Code_bateau AS code_bateau, r.Bateau AS bateau, 
                   r.Code_nation AS nation, re.Matric AS licence
            FROM Resultat r
            JOIN Resultat_Course rc ON r.Code_competition = rc.Code_competition AND r.Code_bateau = rc.Code_bateau
            LEFT JOIN Resultat_Equipier re ON r.Code_competition = re.Code_competition AND r.Code_bateau = re.Code_bateau
            WHERE r.Code_competition = ?
            ORDER BY rc.Code_categorie, rc.Cltc
        ");
        $stmt->execute([$competitionCode]);
        $export['data']['participants'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    $export['stats'] = [
        'categories' => count($export['data']['categories']),
        'series' => count($export['data']['series']),
        'slots' => count($export['data']['slots']),
        'classement' => count($export['data']['classement']),
        'participants' => count($export['data']['participants'])
    ];
    echo json_encode(['success' => true, 'export' => $export]);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}