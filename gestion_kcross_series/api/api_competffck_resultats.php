<?php
require_once __DIR__ . '/_bootstrap.php';
$status_code_map = [ -500.0 => "DNF", -800.0 => "DSQ", -600.0 => "DNS", -700.0 => "DES"];
$tri_non_classes_priorites = [ -500.0 => 1, -700.0 => 1, -800.0 => 2, -600.0 => 3 ];
$code_select = [ -500.0=> true,  -700.0 => true,  -800.0 => false, -600.0 => false ]; 
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
$priorite_autres_negatifs = empty($tri_non_classes_priorites) ? 1 : (max($tri_non_classes_priorites) + 1);
$priorite_zero_ou_null = $priorite_autres_negatifs + 1;
$competitionCodeWithPrefix = $_GET['competition'] ?? '';
$response = ['success' => false];
if (empty($competitionCodeWithPrefix)) {
    http_response_code(400); 
    echo json_encode(['success' => false, 'message' => "Code de compétition non fourni."]);
    exit;
}
$isManual = (preg_match('/^[MI]/', $competitionCodeWithPrefix) === 1);
$code_competition = (int) preg_replace('/[^0-9]/', '', $competitionCodeWithPrefix);
$response = ['success' => false];
if ($code_competition === 0) {
    $response['message'] = "Code de compétition non fourni.";
    echo json_encode($response);
    exit;
}
$competition_details = null;
$resultats_bruts_sql = [];
$statuts_par_code_categorie = [];
if ($isManual) {
    $sql_competition = "SELECT id as Code, Codex, nom as Nom, ville as Ville, date_debut as Date_debut, date_fin as Date_fin FROM {$tableManualCompetitions} WHERE id = :code";
    $stmt_competition = $pdo->prepare($sql_competition);
    $stmt_competition->execute(['code' => $code_competition]);
    $competition_details = $stmt_competition->fetch(PDO::FETCH_ASSOC);
    if (!$competition_details) { 
        $response['message'] = "Compétition manuelle non trouvée.";
        echo json_encode($response);
        exit;
    }
    $sql_resultats = "SELECT * FROM {$tableManualResults} WHERE id_competition = :code";
    $stmt_resultats = $pdo->prepare($sql_resultats);
    $stmt_resultats->execute(['code' => $code_competition]);
    $resultats_manuels = $stmt_resultats->fetchAll(PDO::FETCH_ASSOC);
    foreach ($resultats_manuels as $row) {
         if (!isset($statuts_par_code_categorie[$row['code_categorie']])) {
             $statuts_par_code_categorie[$row['code_categorie']] = ['Statut_epreuve' => 4, 'nombre_classes' => 0];
         }
    }
    $resultats_bruts_sql = array_map(function($row) {
        return [
            'Code_bateau' => $row['code_bateau'], 'Dossard' => $row['dossard'], 'Club' => $row['club'],
            'Bateau' => $row['bateau'], 'Code_categorie' => $row['code_categorie'], 'Cltc' => $row['cltc'],
            'Rang_initial' => null, 'Tps_chrono' => $row['tps_chrono_cs'], 'Nom' => $row['nom'],
            'Prenom' => $row['prenom'], 'Sexe' => $row['sexe'], 'Code_nation' => $row['nation'] ?? null,
            'Source_csv' => $row['source'] ?? null 
        ];
    }, $resultats_manuels);
} else {
    $sql_competition = "SELECT Code, Codex, Nom, Ville, Date_debut, Date_fin FROM Competition WHERE Code = :code";
    $stmt_competition = $pdo->prepare($sql_competition);
    $stmt_competition->execute(['code' => $code_competition]);
    $competition_details = $stmt_competition->fetch(PDO::FETCH_ASSOC);
    if (!$competition_details) {
        $response['message'] = "Compétition non trouvée.";
        echo json_encode($response);
        exit;
    }
    $statuts_par_code_categorie = [];
        $sql_statuts_categories_req = "
            SELECT
            ccpem.Libelle_court AS Code_categorie,
            MAX(ccpem.Etat_programme_epreuve) AS Statut_epreuve,
            MAX(pee.Libelle_long) AS Nom_categorie
        FROM Competition_Course_Phase_Manche_Epreuve ccpem
        JOIN Competition c
            ON c.Code = ccpem.Code_competition
        LEFT JOIN Programme_Epreuve_Embarcation pee
            ON pee.Code_programme_epreuve = c.Code_programme_epreuve
            AND pee.Code_activite = c.Code_activite
            AND pee.Libelle_court = ccpem.Libelle_court
        WHERE ccpem.Code_competition = :code_competition
        GROUP BY ccpem.Libelle_court";
    $stmt_statuts_req = $pdo->prepare($sql_statuts_categories_req);
    $stmt_statuts_req->execute(['code_competition' => $code_competition]);
    $statuts_categories_raw_req = $stmt_statuts_req->fetchAll(PDO::FETCH_ASSOC);
    foreach ($statuts_categories_raw_req as $statut_cat_item) {
        $statuts_par_code_categorie[$statut_cat_item['Code_categorie']] = [
            'Statut_epreuve' => (int)$statut_cat_item['Statut_epreuve'],
            'Nom_categorie' => $statut_cat_item['Nom_categorie'] ?? null,
            'nombre_classes' => 0 
        ];
    }
    $sql_resultats = "
        SELECT 
            r.Code_bateau, r.Dossard, r.Club, r.Bateau,
            rc.Code_categorie, rc.Cltc, rc.Rang AS Rang_initial, rc.Tps_chrono,
            re.Nom, re.Prenom, re.Code_equipier , re.Sexe, re.Matric, r.Code_nation
        FROM Resultat r
        JOIN Resultat_Course rc ON r.Code_competition = rc.Code_competition AND r.Code_bateau = rc.Code_bateau
        LEFT JOIN Resultat_Equipier re ON r.Code_competition = re.Code_competition AND r.Code_bateau = re.Code_bateau
        WHERE r.Code_competition = :code_competition
        ORDER BY rc.Code_categorie, r.Code_bateau, re.Code_equipier 
    ";
    $stmt_resultats = $pdo->prepare($sql_resultats);
    $stmt_resultats->execute(['code_competition' => $code_competition]);
    $resultats_bruts_sql = $stmt_resultats->fetchAll(PDO::FETCH_ASSOC);
}
    $resultats_par_categorie_temp = []; 
    foreach ($resultats_bruts_sql as $row) {
        $code_categorie = $row['Code_categorie'] ?: 'SANS_CATEGORIE';
        $code_bateau = $row['Code_bateau'];
        $nom_normalise = $row['Nom'] ? mb_strtoupper($row['Nom'], 'UTF-8') : ''; 
        $prenom_normalise = $row['Prenom'] ? mb_convert_case($row['Prenom'], MB_CASE_TITLE, 'UTF-8') : ''; 
        if (!isset($resultats_par_categorie_temp[$code_categorie])) {
            $resultats_par_categorie_temp[$code_categorie] = [];
        }
        $resultats_par_categorie_temp[$code_categorie][$code_bateau] = [
            'Code_bateau'    => $row['Code_bateau'], 
            'Dossard'        => $row['Dossard'],
            'Club'           => $row['Club'],
            'Bateau'         => $row['Bateau'], 
            'Code_categorie' => $row['Code_categorie'], 
            'Cltc'           => $row['Cltc'] !== null ? (int)$row['Cltc'] : null,
            'Rang_initial'   => $row['Rang_initial'] !== null ? (int)$row['Rang_initial'] : null,
            'Tps_chrono'     => $row['Tps_chrono'] !== null ? (float)$row['Tps_chrono'] : null,
            'Nom'            => $nom_normalise,
            'Prenom'         => $prenom_normalise,
            'Sexe'             => $row['Sexe'],
            'Matric'             => $row['Matric'],
            'Nation'             => $row['Code_nation'],
            'Source_csv'         => $row['Source_csv'] ?? null,
            'calculated_rang'=> null,
            'selected'=> false 
        ];
    }
$resultats_finaux_pour_json = []; 
$resultats_finaux_pour_json = [];
foreach ($resultats_par_categorie_temp as $code_cat => $bateaux_assoc){ 
    $liste_bateaux = array_values($bateaux_assoc);
    usort($liste_bateaux, function ($a, $b) use ($tri_non_classes_priorites, $priorite_autres_negatifs, $priorite_zero_ou_null) {
        $tps_a_val = $a['Tps_chrono'];
        $tps_b_val = $b['Tps_chrono'];
        $a_has_positive_time = $tps_a_val !== null && $tps_a_val > 0;
        $b_has_positive_time = $tps_b_val !== null && $tps_b_val > 0;
        if ($a_has_positive_time && $b_has_positive_time) {
            $cltc_a = $a['Cltc'] === null ? PHP_INT_MAX : $a['Cltc'];
            $cltc_b = $b['Cltc'] === null ? PHP_INT_MAX : $b['Cltc'];
            if ($cltc_a !== $cltc_b) return $cltc_a <=> $cltc_b;
            if ($tps_a_val !== $tps_b_val) return $tps_a_val <=> $tps_b_val;
            return strcmp((string)$a['Bateau'], (string)$b['Bateau']);
        } elseif ($a_has_positive_time) {
            return -1;
        } elseif ($b_has_positive_time) {
            return 1;
        }
        $get_priority = function ($tps_val) use ($tri_non_classes_priorites, $priorite_autres_negatifs, $priorite_zero_ou_null) {
            if (isset($tri_non_classes_priorites[$tps_val])) {
                return $tri_non_classes_priorites[$tps_val];
            } elseif ($tps_val !== null && $tps_val < 0) { 
                return $priorite_autres_negatifs;
            }
            return $priorite_zero_ou_null; 
        };
        $priority_a = $get_priority($tps_a_val);
        $priority_b = $get_priority($tps_b_val);
        if ($priority_a !== $priority_b) {
            return $priority_a <=> $priority_b;
        }
        return strcmp((string)$a['Bateau'], (string)$b['Bateau']);
    });
    $nombre_classes_categorie = 0; 
    foreach ($liste_bateaux as $index => &$bateau_ref) {
        $bateau_ref['calculated_rang'] = $index + 1;
        if ($bateau_ref['Tps_chrono'] !== null && $bateau_ref['Tps_chrono'] > 0) {
            $bateau_ref['selected'] = true;
            $nombre_classes_categorie++;
        } else {
            if (isset($code_select[$bateau_ref['Tps_chrono']]) && $code_select[$bateau_ref['Tps_chrono']] === true) {
                $bateau_ref['selected'] = true;
                $nombre_classes_categorie++;
            } else {
                $bateau_ref['selected'] = false;
            }
        }
        if ($bateau_ref['Tps_chrono'] !== null && $bateau_ref['Tps_chrono'] <= 0) {
            if (isset($status_code_map[$bateau_ref['Tps_chrono']])) {
                $bateau_ref['Tps_chrono'] = $status_code_map[$bateau_ref['Tps_chrono']];
            }
        }
    }
    unset($bateau_ref); 
    if (isset($statuts_par_code_categorie[$code_cat])) {
        $statuts_par_code_categorie[$code_cat]['nombre_classes'] = $nombre_classes_categorie;
    } elseif ($code_cat === 'SANS_CATEGORIE' && !isset($statuts_par_code_categorie['SANS_CATEGORIE'])) {
        $statuts_par_code_categorie['SANS_CATEGORIE'] = [
            'Statut_epreuve' => 0,
            'Nom_categorie' => null,
            'nombre_classes' => $nombre_classes_categorie
        ];
    }    
    $resultats_finaux_pour_json[$code_cat] = $liste_bateaux; 
}
$response['success'] = true;
$response['message'] = "Données de la compétition chargées avec succès.";
$response['data'] = [
    'competition_details' => $competition_details,
    'statuts_categories' => $statuts_par_code_categorie, 
    'resultats_par_categorie' => $resultats_finaux_pour_json 
];
echo json_encode($response);
exit;
?>