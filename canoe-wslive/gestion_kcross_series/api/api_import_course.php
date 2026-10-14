<?php
require_once __DIR__ . '/_bootstrap.php';
ini_set('memory_limit', '512M');
set_time_limit(300); 
header('Content-Type: application/json; charset=utf-8');
try {
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);
    if ($input === null) {
        throw new Exception('JSON invalide dans la requete (Probleme de decodage)');
    }
    $targetCode = trim($input['target_code'] ?? '');
    $exportData = $input['export_data'] ?? null;
    if (empty($targetCode)) {
        throw new Exception('Code competition cible requis (target_code)');
    }
    if (empty($exportData)) {
        throw new Exception('Donnees d\'export manquantes (export_data)');
    }
    $structureErrors = validateStructure($exportData);
    if (!empty($structureErrors)) {
        throw new Exception('Structure invalide: ' . implode('; ', $structureErrors));
    }
    $data = $exportData['data'] ?? $exportData;
    if (isset($data['series']) && isset($data['slots'])) {
        $validSeriesIds = [];
        foreach ($data['series'] as $serie) {
            $validSeriesIds[$serie['Code_Serie']] = true;
        }
        $filteredSlots = [];
        foreach ($data['slots'] as $slot) {
            if (isset($slot['Code_Serie']) && isset($validSeriesIds[$slot['Code_Serie']])) {
                $filteredSlots[] = $slot;
            }
        }
        $data['slots'] = $filteredSlots;
        $exportData['data']['slots'] = $filteredSlots; 
    }
    $coherenceErrors = validateCoherence($data);
    if (!empty($coherenceErrors)) {
        throw new Exception('Donnees incoherentes: ' . implode('; ', array_slice($coherenceErrors, 0, 5)));
    }
    global $tables, $auditLogger;
    $pdo = getDbConnection();
    $result = executeImport($pdo, $tables, $exportData, $targetCode);
    try {
        if ($auditLogger && $auditLogger->isEnabled()) {
            $sourceCode = $exportData['kcross_export']['competition_code'] ?? 'unknown';
            $auditLogger->startAction($targetCode, 'import_course', 'admin_import', [
                'source_code' => $sourceCode
            ]);
            $auditLogger->recordTableChange('import', $result['total_records']);
            if (method_exists($auditLogger, 'endAction')) {
                $auditLogger->endAction(true);
            }
        }
    } catch (Throwable $e) {
    }
    $response = [
        'success' => true,
        'message' => 'Import réussi',
        'log' => $result['log'],
        'total_records' => $result['total_records'],
        'target_code' => $result['target_code'] ?? $targetCode
    ];
    $jsonOutput = json_encode($response, JSON_INVALID_UTF8_SUBSTITUTE);
    if ($jsonOutput === false) {
        throw new Exception("Erreur d'encodage JSON de la reponse : " . json_last_error_msg());
    }
    echo $jsonOutput;
} catch (Throwable $e) {
    http_response_code(500); 
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ], JSON_INVALID_UTF8_SUBSTITUTE);
}
function validateStructure($exportData) {
    $errors = [];
    if (!isset($exportData['kcross_export'])) {
        $errors[] = "En-tete 'kcross_export' manquant";
        return $errors;
    }
    if (!isset($exportData['kcross_export']['format']) || $exportData['kcross_export']['format'] !== 'kcross_course') {
        $errors[] = "Format invalide (attendu: kcross_course)";
    }
    $data = $exportData['data'] ?? null;
    if (!$data) {
        $errors[] = "Section 'data' manquante";
        return $errors;
    }
    if (!isset($data['competition']) || empty($data['competition'])) {
        $errors[] = "Section 'data.competition' manquante ou vide";
    }
    if (!isset($data['categories']) || !is_array($data['categories'])) {
        $errors[] = "Section 'data.categories' manquante ou invalide";
    }
    if (!isset($data['series']) || !is_array($data['series'])) {
        $errors[] = "Section 'data.series' manquante ou invalide";
    }
    if (!isset($data['slots']) || !is_array($data['slots'])) {
        $errors[] = "Section 'data.slots' manquante ou invalide";
    }
    return $errors;
}
function validateCoherence($data) {
    $errors = [];
    $categoryIds = [];
    foreach ($data['categories'] ?? [] as $idx => $cat) {
        if (!isset($cat['Code_Categorie'])) {
            $errors[] = "Categorie #$idx: Code_Categorie manquant";
            continue;
        }
        $categoryIds[$cat['Code_Categorie']] = true;
    }
    $serieIds = [];
    foreach ($data['series'] ?? [] as $idx => $serie) {
        if (!isset($serie['Code_Serie'])) {
            $errors[] = "Serie #$idx: Code_Serie manquant";
            continue;
        }
        if (isset($serie['Code_Categorie']) && !isset($categoryIds[$serie['Code_Categorie']])) {
            $errors[] = "Serie {$serie['Code_Serie']}: categorie inexistante";
        }
        $serieIds[$serie['Code_Serie']] = true;
    }
    foreach ($data['slots'] ?? [] as $idx => $slot) {
        if (isset($slot['Code_Serie']) && !isset($serieIds[$slot['Code_Serie']])) {
            $errors[] = "Slot #$idx: serie inexistante";
        }
    }
    return $errors;
}
function executeImport($pdo, $tables, $exportData, $targetCode) {
    $log = [];
    $data = $exportData['data'];
    $createNew = ($targetCode === 'CREATE_NEW'); 
    $pdo->beginTransaction();
    try {
        $boatMap = []; 
        if ($createNew) {
            $meta = $data['meta'] ?? [];
            $originName = $meta['Nom'] ?? ('Course ' . ($exportData['kcross_export']['competition_code'] ?? ''));
            $compName = $originName;
            $compCity = $meta['Ville'] ?? 'Inconnue';
            $dateDebut = $meta['Date_debut'] ?? date('Y-m-d');
            $dateFin = $meta['Date_fin'] ?? date('Y-m-d');
            $codex = $meta['Codex'] ?? null;
            if (empty($codex)) {
                $annee = date('Y', strtotime($dateDebut));
                $codex = "GCKC" . $annee . str_pad(mt_rand(1, 9999), 4, '0', STR_PAD_LEFT);
            }
            $stmt = $pdo->prepare("INSERT INTO {$tables['manual_competitions']} (Codex, nom, ville, date_debut, date_fin, etat) VALUES (?, ?, ?, ?, ?, 4)");
            $stmt->execute([$codex, $compName, $compCity, $dateDebut, $dateFin]);
            $manualCompId = $pdo->lastInsertId();
            $targetCode = 'I' . $manualCompId; 
            $log[] = "CREATE nouvelle course: $targetCode";
            if (!empty($data['participants'])) {
                $stmtPart = $pdo->prepare("INSERT INTO {$tables['manual_results']} 
                    (id_competition, dossard, nom, prenom, club, sexe, code_categorie, tps_chrono_cs, cltc, code_bateau, bateau, nation, licence) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $partCount = 0;
                foreach ($data['participants'] as $p) {
                    $oldCodeBateau = $p['code_bateau'];
                    $dossardStr = preg_replace('/[^a-zA-Z0-9]/', '', $p['dossard'] ?: $partCount);
                    $newCodeBateau = $targetCode . '-' . $dossardStr;
                    if ($oldCodeBateau) {
                        $boatMap[$oldCodeBateau] = $newCodeBateau;
                    }
                    $stmtPart->execute([
                        $manualCompId, $p['dossard'] ?? '', $p['nom'] ?? null, $p['prenom'] ?? null,
                        $p['club'] ?? null, $p['sexe'] ?? null, $p['code_categorie'] ?? '',
                        $p['tps_chrono_cs'] ?? null, $p['cltc'] ?? null, $newCodeBateau,
                        $p['bateau'] ?? '', $p['nation'] ?? null, $p['licence'] ?? null
                    ]);
                    $partCount++;
                }
                $log[] = "INSERT participants: $partCount";
            }
        } else {
            $deleteOrder = ['slots', 'ranking', 'heats', 'categories', 'schedules', 'settings'];
            foreach ($deleteOrder as $key) {
                $stmt = $pdo->prepare("DELETE FROM {$tables[$key]} WHERE Code_competition = ?");
                $stmt->execute([$targetCode]);
                $count = $stmt->rowCount();
                if ($count > 0) $log[] = "DELETE {$tables[$key]}: $count";
            }
        }
        if (!empty($data['competition'])) {
            $comp = $data['competition'];
            $stmt = $pdo->prepare("INSERT INTO {$tables['settings']} 
                (Code_competition, Format, Nombre_portes, Detail_portes, Roll_Zone, Ecart_Series_Global, Ecart_Categories_Global) 
                VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $targetCode, $comp['Format'] ?? null, $comp['Nombre_portes'] ?? null,
                $comp['Detail_portes'] ?? null, $comp['Roll_Zone'] ?? null,
                $comp['Ecart_Series_Global'] ?? null, $comp['Ecart_Categories_Global'] ?? null
            ]);
            $log[] = "INSERT settings: 1";
        }
        if (!empty($data['horaires'])) {
            $stmt = $pdo->prepare("INSERT INTO {$tables['schedules']} (Code_competition, Data_horaires) VALUES (?, ?)");
            $stmt->execute([$targetCode, $data['horaires']]);
            $log[] = "INSERT schedules: 1";
        }
        $categoryMap = []; 
        foreach ($data['categories'] ?? [] as $cat) {
            $oldId = $cat['Code_Categorie'];
            $stmt = $pdo->prepare("INSERT INTO {$tables['categories']} 
                (Code_competition, Nom_Categorie, Nb_Bateau, Nom_Variante, Ordre) 
                VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([
                $targetCode, $cat['Nom_Categorie'], $cat['Nb_Bateau'] ?? null,
                $cat['Nom_Variante'] ?? null, $cat['Ordre'] ?? null
            ]);
            $categoryMap[$oldId] = $pdo->lastInsertId();
        }
        $log[] = "INSERT categories: " . count($data['categories'] ?? []);
        $serieMap = []; 
        foreach ($data['series'] ?? [] as $serie) {
            $oldSerieId = $serie['Code_Serie'];
            $newCatId = $categoryMap[$serie['Code_Categorie']] ?? $serie['Code_Categorie'];
            $stmt = $pdo->prepare("INSERT INTO {$tables['heats']} 
                (Code_competition, Code_Categorie, Nom_Tour, Nom_Serie, H_depart, Etat, Zones_Jugees, Num_Serie_Global) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $targetCode, $newCatId, $serie['Nom_Tour'] ?? '', $serie['Nom_Serie'] ?? '',
                $serie['H_depart'] ?? null, $serie['Etat'] ?? HEAT_EN_ATTENTE, $serie['Zones_Jugees'] ?? null,
                $serie['Num_Serie_Global'] ?? null
            ]);
            $serieMap[$oldSerieId] = $pdo->lastInsertId();
        }
        $log[] = "INSERT series: " . count($data['series'] ?? []);
        $slotsCount = 0;
        foreach ($data['slots'] ?? [] as $slot) {
            $newSerieId = $serieMap[$slot['Code_Serie']] ?? $slot['Code_Serie'];
            $codeBateau = $slot['Code_bateau'];
            if ($createNew && $codeBateau && isset($boatMap[$codeBateau])) {
                $codeBateau = $boatMap[$codeBateau];
            }
            $stmt = $pdo->prepare("INSERT INTO {$tables['slots']} 
                (Code_competition, Code_Serie, Slot_Index, Code_bateau, Ordre_arrivee, Penalite, Statut_Special, Clt) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $targetCode, $newSerieId, $slot['Slot_Index'], $codeBateau ?? null,
                $slot['Ordre_arrivee'] ?? null, $slot['Penalite'] ?? null,
                $slot['Statut_Special'] ?? null, $slot['Clt'] ?? null
            ]);
            $slotsCount++;
        }
        $log[] = "INSERT slots: $slotsCount";
        $classCount = 0;
        foreach ($data['classement'] ?? [] as $rank) {
            $newCatId = $categoryMap[$rank['Code_Categorie']] ?? $rank['Code_Categorie'];
            $codeBateau = $rank['Code_bateau'];
            if ($createNew && $codeBateau && isset($boatMap[$codeBateau])) {
                $codeBateau = $boatMap[$codeBateau];
            }
            $stmt = $pdo->prepare("INSERT INTO {$tables['ranking']} 
                (Code_competition, Code_Categorie, Code_bateau, Cltc, Serie_Source) 
                VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([
                $targetCode, $newCatId, $codeBateau ?? '',
                $rank['Cltc'] ?? null, $rank['Serie_Source'] ?? ''
            ]);
            $classCount++;
        }
        $log[] = "INSERT classement: $classCount";
        $pdo->commit();
        return [
            'log' => $log,
            'total_records' => count($log),
            'target_code' => $targetCode 
        ];
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw new Exception('Erreur import: ' . $e->getMessage());
    }
}