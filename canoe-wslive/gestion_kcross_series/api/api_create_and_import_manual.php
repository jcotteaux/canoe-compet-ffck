<?php
require_once __DIR__ . '/_bootstrap.php';
$response = ['success' => false];
$payload = json_decode(file_get_contents('php://input'), true);
if (!$payload || !isset($payload['competitionDetails'], $payload['mapping'], $payload['data'])) {
    http_response_code(400);
    $response['message'] = 'Données de la requête invalides.';
    echo json_encode($response);
    exit;
}
$details = $payload['competitionDetails'];
$mapping = $payload['mapping'];
$data = $payload['data'];
$status_code_map_reverse = [ "DNF" => -500, "DSQ" => -800, "ABS" => -600, "DES" => -700];
function timeToCentiseconds($timeStr) {
    global $status_code_map_reverse;
    if ($timeStr === null || $timeStr === '') return null;
    $timeStr = trim(strtoupper($timeStr));
    if (isset($status_code_map_reverse[$timeStr])) return $status_code_map_reverse[$timeStr];
    if (preg_match('/^(\d{1,2}):(\d{2})[\.,](\d{1,2})$/', $timeStr, $matches)) {
        return ((int)$matches[1] * 60 * 100) + ((int)$matches[2] * 100) + (int)str_pad($matches[3], 2, '0', STR_PAD_RIGHT);
    }
    if (preg_match('/^(\d+)[\.,](\d{1,2})$/', $timeStr, $matches_ss)) {
         return ((int)$matches_ss[1] * 100) + (int)str_pad($matches_ss[2], 2, '0', STR_PAD_RIGHT);
    }
    if (preg_match('/^\d+$/', $timeStr)) {
        return (int)$timeStr;
    }
    return null;
}
try {
    $pdo->beginTransaction();
    $annee = date('Y', strtotime($details['date_debut']));
    $randomStr = str_pad(mt_rand(1, 9999), 4, '0', STR_PAD_LEFT);
    $nouveauCodex = "GCKC" . $annee . $randomStr;
    $sql_create = "INSERT INTO {$tableManualCompetitions} (Codex, nom, ville, date_debut, date_fin, etat) VALUES (:codex,:nom, :ville, :date_debut, :date_fin, 4)";
    $stmt_create = $pdo->prepare($sql_create);
    $stmt_create->execute([
        ':codex' => $nouveauCodex,
        ':nom' => $details['nom'], ':ville' => $details['ville'],
        ':date_debut' => $details['date_debut'], ':date_fin' => $details['date_fin']
    ]);
    $newCompetitionId = $pdo->lastInsertId();
    $resultsByCategory = [];
    $dossardCounter = 1;
    foreach ($data as $rowIndex => $row) {
        $category = isset($mapping['Code_categorie']) ? trim($row[$mapping['Code_categorie']]) : 'DEFAULT';
        if (empty($category)) continue;
        $tps_chrono_str = isset($mapping['Tps_chrono']) ? $row[$mapping['Tps_chrono']] : "00:00.01";
        $tps_chrono = timeToCentiseconds($tps_chrono_str);
        if ($tps_chrono === null && !empty($tps_chrono_str)) {
            $errorPayload = json_encode([
                    'key' => 'INVALID_TIME_FORMAT',
                    'params' => [
                        'line' => $rowIndex + 2,
                        'value' => $tps_chrono_str
                    ]
                ]);
                throw new Exception($errorPayload);
        }
        $csvDossard = isset($mapping['Dossard']) ? trim($row[$mapping['Dossard']]) : null;
        if (!empty($csvDossard)) {
            $dossard = $csvDossard;
        } else {
            $dossard = $dossardCounter;
            $dossardCounter++; 
        }
        $nom = isset($mapping['Nom']) ? trim($row[$mapping['Nom']]) : '';
        $prenom = isset($mapping['Prenom']) ? trim($row[$mapping['Prenom']]) : '';
        $club = isset($mapping['Club']) ? trim($row[$mapping['Club']]) : '';
        $sexe = isset($mapping['Sexe']) ? trim($row[$mapping['Sexe']]) : '';
        $nation = isset($mapping['Nation']) ? trim($row[$mapping['Nation']]) : '';
        $licence = isset($mapping['Licence']) ? trim($row[$mapping['Licence']]) : '';
        $source_csv = isset($mapping['Source']) ? trim($row[$mapping['Source']]) : '';
        $cltc_value = isset($mapping['Cltc']) ? trim($row[$mapping['Cltc']]) : '';
        $cltc_int = (is_numeric($cltc_value) && $cltc_value > 0) ? (int)$cltc_value : null;
        $resultsByCategory[$category][] = [
            'Cltc' => $cltc_int,
            'Dossard' => $dossard,
            'Nom' => $nom,
            'Prenom' => $prenom,
            'Bateau' => trim(strtoupper($nom) . ' ' . $prenom),
            'Club' => $club,
            'Sexe' => $sexe,
            'Nation' => $nation,
            'Licence' => $licence,
            'Source' => $source_csv,
            'Tps_chrono' => $tps_chrono,
            'Code_bateau' => 'M' . $newCompetitionId . ($dossard ? '-' . $dossard : '')
            ];
    }
    $stmtResultat = $pdo->prepare("INSERT INTO {$tableManualResults} (id_competition, dossard, nom, prenom, club, sexe, nation, licence, source, code_categorie, tps_chrono_cs, cltc, code_bateau, bateau) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    foreach ($resultsByCategory as $category => $results) {
        usort($results, function ($a, $b) {
            $cltc_a = $a['Cltc']; $cltc_b = $b['Cltc'];
            $tps_a = $a['Tps_chrono']; $tps_b = $b['Tps_chrono'];
            if ($cltc_a > 0 && $cltc_b > 0) return $cltc_a <=> $cltc_b;
            if ($tps_a > 0 && $tps_b > 0) return $tps_a <=> $tps_b;
            if ($tps_a > 0) return -1;
            if ($tps_b > 0) return 1;
            if ($tps_a !== $tps_b) return $tps_a <=> $tps_b;
            return strcmp($a['Bateau'], $b['Bateau']);
        });
        $cltc = 1;
        foreach ($results as $result) {
            $clt = !empty($result['Cltc']) ? $result['Cltc'] : ($result['Tps_chrono'] > 0 ? $cltc : null);
            $stmtResultat->execute([
                $newCompetitionId, $result['Dossard'], $result['Nom'], $result['Prenom'],
                $result['Club'], $result['Sexe'], $result['Nation'], $result['Licence'],  $result['Source'], $category, $result['Tps_chrono'],
                $clt,
                $result['Code_bateau'], $result['Bateau']
            ]);
            if ($result['Tps_chrono'] > 0) $cltc++;
        }
    }
    $pdo->commit();
    $response['success'] = true;
    $response['message'] = 'Compétition et résultats importés avec succès.';
    $response['competitionCode'] = 'M' . $newCompetitionId; 
} catch (Exception $e) {
    $pdo->rollBack();
    $errorMessage = $e->getMessage();
    $decodedError = json_decode($errorMessage, true);
    if ($decodedError !== null && isset($decodedError['key'])) {
        http_response_code(400); 
        $response['success'] = false; 
        $response['error'] = $decodedError; 
    } else {
        http_response_code(500);
        $response['message'] = 'Erreur serveur lors de la création : ' . $errorMessage;
    }
}
echo json_encode($response);
?>