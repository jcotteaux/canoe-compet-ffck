<?php
require_once __DIR__ . '/_bootstrap.php';
function getCurrentTimestamp() {
    return round(microtime(true) * 1000);
}
function checkHeatLocked($pdo, $tableHeats, $competitionCode, $heatId) {
    $sql = "SELECT Etat FROM {$tableHeats} WHERE Code_competition = ? AND Code_Serie = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$competitionCode, $heatId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return ['locked' => false, 'state' => null, 'message' => null];
    }
    $state = (int)$row['Etat'];
    if ($state === HEAT_OFFICIEL) { 
        return [
            'locked' => true,
            'state' => $state,
            'message' => 'Série validée. Modification impossible depuis ce périphérique.'
        ];
    }
    if ($state === HEAT_EN_MODIF) { 
        return [
            'locked' => true,
            'state' => $state,
            'message' => 'Série en cours de modification par le gestionnaire.'
        ];
    }
    return ['locked' => false, 'state' => $state, 'message' => null];
}
function sendLockedResponse($lockInfo, $auditLogger = null) {
    global $pdo;
    if ($pdo && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if ($auditLogger) {
        $auditLogger->endAction(false, "VERROUILLE: {$lockInfo['message']}");
    }
    echo json_encode([
        'success' => false,
        'locked' => true,
        'state' => $lockInfo['state'],
        'message' => $lockInfo['message']
    ]);
    exit;
}
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
$modifiedBy = $payload['modifiedBy'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$auditLogger->startAction($competitionCode, $action, $modifiedBy, $payload ?? []);
try {
    $pdo->beginTransaction();
    $response_data = null;
    switch ($action) {
        case 'save_full_config':
            $response_data = saveFullConfiguration($pdo, $payload, $competitionCode, $tableSettings, $tableCategories, $tableSchedules, $tableHeats, $tableSlots,$tableRanking, $auditLogger);
            break;
        case 'update_global_settings_schedule':
            updateGlobalSettingsSchedule($pdo, $payload, $competitionCode, $tableSettings, $auditLogger);
            break;
        case 'save_schedules':
            saveSchedules($pdo, $payload, $competitionCode, $tableSchedules, $tableHeats, $tableCategories, $auditLogger);
            break;
        case 'save_heat_results':
            saveHeatResults($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $tableCategories, $tableRanking, $auditLogger);
            break;
        case 'save_progression':
            saveProgression($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $tableCategories, $tableRanking, $auditLogger);
            break;
        case 'validate_heat_results':
            validateHeatResults($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $auditLogger);
            break;
        case 'update_heat_state':
            $response_data = updateHeatState($pdo, $payload,$competitionCode,$tableHeats, $auditLogger);
            break;
        case 'launch_heat':
            $response_data = launchHeat($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $auditLogger);
            break;
        case 'record_arrivals':
            $response_data = recordArrivals($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $auditLogger);
            break;
        case 'update_status':
            $response_data = updateStatus($pdo, $payload, $competitionCode, $tableSlots, $auditLogger);
            break;
        case 'update_penalite':
            $response_data = updatePenalite($pdo, $payload, $competitionCode, $tableSlots, $auditLogger);
            break;
        case 'validate_zone_penalties':
            $response_data = validateZonePenalties($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $auditLogger);
            break;
        case 'update_place':
            $response_data = updateOrdreArrivee($pdo, $payload, $competitionCode, $tableSlots, $auditLogger);
            break;
        case 'update_slot_penalties':
            updateSlotPenalties($pdo, $payload, $competitionCode, $tableSlots, $auditLogger);
            break;
        case 'save_updated_heats':
            saveUpdatedHeats($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $auditLogger);
            break;
        case 'force_validate_heat':
            $response_data = forceValidateHeat($pdo, $payload, $competitionCode, $tableHeats, $tableSettings, $auditLogger);
            break;
        case 'reset_competition':
            resetCompetition($pdo, $payload, $competitionCode, $tableSettings, $tableCategories, $tableSchedules, $tableHeats, $tableSlots, $tableRanking, $auditLogger);
            break;
        case 'save_progression_peripherique':
            saveClientCalculatedProgression($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $tableCategories, $tableRanking, $auditLogger);
            break;
        case 'toggle_test_heat':
            $response_data = toggleTestHeat($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $tableCategories, $tableSettings, $auditLogger);
            break;
        default:
            throw new Exception("Action non reconnue: " . $action);
    }
    $pdo->commit();
    $auditLogger->endAction(true);
    echo json_encode(array_merge(['success' => true, 'message' => 'Action réussie.'], $response_data ?? []));
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $auditLogger->endAction(false, "DB_ERROR: " . $e->getMessage());
    http_response_code(500); 
    echo json_encode(['success' => false, 'message' => 'Erreur critique base de données.']);
} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $auditLogger->endAction(false, "VALIDATION_ERROR: " . $e->getMessage());
    http_response_code(400); 
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
function saveFullConfiguration($pdo, $payload, $competitionCode, $tableSettings, $tableCategories, $tableSchedules, $tableHeats, $tableSlots,$tableRanking, $auditLogger) {
    $nombrePortes = (int)($payload['gateCount'] ?? 8);
    $hasRollZone = isset($payload['rollZoneAfterGate']) && (int)$payload['rollZoneAfterGate'] !== -1;
    $nombreZones = $nombrePortes + ($hasRollZone ? 2 : 1);
    $zonesJugeesInitial = str_repeat('0', $nombreZones);
    $stmt = $pdo->prepare("DELETE FROM {$tableSlots} WHERE Code_competition = ?");
    $stmt->execute([$competitionCode]);
    $auditLogger->recordTableChange($tableSlots, $stmt->rowCount());
    $stmt = $pdo->prepare("DELETE FROM {$tableHeats} WHERE Code_competition = ?");
    $stmt->execute([$competitionCode]);
    $auditLogger->recordTableChange($tableHeats, $stmt->rowCount());
    $stmt = $pdo->prepare("DELETE FROM {$tableCategories} WHERE Code_competition = ?");
    $stmt->execute([$competitionCode]);
    $auditLogger->recordTableChange($tableCategories, $stmt->rowCount());
    $stmt = $pdo->prepare("DELETE FROM {$tableSettings} WHERE Code_competition = ?");
    $stmt->execute([$competitionCode]);
    $auditLogger->recordTableChange($tableSettings, $stmt->rowCount());
    $stmt = $pdo->prepare("DELETE FROM {$tableSchedules} WHERE Code_competition = ?");
    $stmt->execute([$competitionCode]);
    $auditLogger->recordTableChange($tableSchedules, $stmt->rowCount());
    $stmt = $pdo->prepare("DELETE FROM {$tableRanking} WHERE Code_competition = ?");
    $stmt->execute([$competitionCode]);
    $auditLogger->recordTableChange($tableRanking, $stmt->rowCount());
    $stmt = $pdo->prepare("INSERT INTO {$tableSettings} (Code_competition, Format, Nombre_portes, Detail_portes,Roll_Zone, Ecart_Series_Global, Ecart_Categories_Global) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([
        $competitionCode,
        $payload['formatKey'],
        $payload['gateCount'],
        $payload['gateProfil'],
        $payload['rollZoneAfterGate'],
        $payload['globalScheduleSettings']['defaultEcartSeriesGlobal'],
        $payload['globalScheduleSettings']['defaultEcartCategoriesGlobal']
    ]);
    $auditLogger->recordTableChange($tableSettings, $stmt->rowCount());
    $stmt = $pdo->prepare("INSERT INTO {$tableSchedules} (Code_competition, Data_horaires) VALUES (?, ?)");
    $stmt->execute([$competitionCode, json_encode($payload['schedulesData'])]);
    $auditLogger->recordTableChange($tableSchedules, $stmt->rowCount());
    $idMapping = ['heats' => []];
    foreach ($payload['categoriesData'] as $catKey => $category) {
        $stmtCat = $pdo->prepare("INSERT INTO {$tableCategories} (Code_competition, Nom_Categorie, Nb_Bateau, Nom_Variante, Ordre) VALUES (?, ?, ?, ?, ?)");
        $stmtCat->execute([
            $competitionCode,
            $catKey,
            $category['numCompetitorsInHeats'],
            $category['nomVariante'] ?? null,
            $category['ordre'] ?? 999
        ]);
        $categoryId = $pdo->lastInsertId();
        if (isset($category['finalRanking'])) {
            saveFinalRankingForCategory($pdo, $competitionCode, $categoryId, $category['finalRanking'], $tableRanking);
        }
        foreach ($category['rounds'] as $roundKey => $round) {
            foreach ($round['heats'] as $heat) {
                $stmtHeat = $pdo->prepare("INSERT INTO {$tableHeats} (Code_competition, Code_Categorie, Nom_Tour, Nom_Serie, H_depart, Etat,Num_Serie_Global, Zones_Jugees) VALUES (?,?,?, ?, ?, ?, ?, ?)");
                $stmtHeat->execute([
                    $competitionCode,
                    $categoryId,
                    $roundKey,
                    $heat['name'],
                    $heat['startTime'] ?: null,
                    $heat['etat'] ?? HEAT_EN_ATTENTE,
                    $heat['globalHeatNumber'] ?? null,
                    $zonesJugeesInitial
                ]);
                $heatId = $pdo->lastInsertId();
                $clientHeatKey = "{$catKey}_{$roundKey}_{$heat['name']}";
                $idMapping['heats'][$clientHeatKey] = (int)$heatId;
                foreach ($heat['slots'] as $slotIndex => $slot) {
                    if (isset($slot['participant']) && $slot['participant']['rankTT'] > 0) {
                        $stmtSlot = $pdo->prepare("INSERT INTO {$tableSlots} (Code_competition, Code_Serie, Slot_Index, Code_bateau, Ordre_arrivee, Penalite, Statut_Special, Clt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                        $stmtSlot->execute([
                            $competitionCode,
                            $heatId,
                            $slot['prioDepart'], 
                            $slot['participant']['codeBateau'] ?? $slot['participant']['id'], 
                            $slot['heatResult']['order'],
                            $slot['heatResult']['penalty'],
                            $slot['heatResult']['specialStatus'] ?? null,
                            is_numeric($slot['heatResult']['finalRank']) ? $slot['heatResult']['finalRank'] : 0 
                        ]);
                    }
                }
            }
        }
    }
    $stmtCat = $pdo->prepare("INSERT INTO {$tableCategories} (Code_competition, Nom_Categorie, Nb_Bateau, Nom_Variante, Ordre) VALUES (?, ?, ?, ?, ?)");
    $stmtCat->execute([$competitionCode, '_TEST_RESEAU_', 4, '0', 9999]);
    $testCatId = $pdo->lastInsertId();
    $stmtHeat = $pdo->prepare("INSERT INTO {$tableHeats} (Code_competition, Code_Categorie, Nom_Tour, Nom_Serie, H_depart, Etat, Num_Serie_Global, Zones_Jugees) VALUES (?,?,?, ?, ?, ?, ?, ?)");
    $stmtHeat->execute([$competitionCode, $testCatId, 'TEST', '_TEST_RESEAU_', null, 5, 0, $zonesJugeesInitial]);
    $testHeatId = $pdo->lastInsertId();
    $stmtSlot = $pdo->prepare("INSERT INTO {$tableSlots} (Code_competition, Code_Serie, Slot_Index, Code_bateau, Ordre_arrivee, Penalite, Statut_Special, Clt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for ($i = 1; $i <= 4; $i++) {
        $stmtSlot->execute([$competitionCode, $testHeatId, $i, 'TEST_BATEAU_'.$i, null, null, null, 0]);
    }
    return ['idMapping' => $idMapping];
}
function updateGlobalSettingsSchedule($pdo, $payload, $competitionCode, $tableSettings, $auditLogger) {
    $stmt = $pdo->prepare(
        "UPDATE {$tableSettings} SET
            Ecart_Series_Global = ?,
            Ecart_Categories_Global = ?
        WHERE Code_competition = ?"
    );
    $ecartSeries = $payload['globalScheduleSettings']['defaultEcartSeriesGlobal'];
    $ecartCategories = $payload['globalScheduleSettings']['defaultEcartCategoriesGlobal'];
    $stmt->execute([
        $ecartSeries,
        $ecartCategories,
        $competitionCode
    ]);
    $auditLogger->recordTableChange($tableSettings, $stmt->rowCount());
}
function saveSchedules($pdo, $payload, $competitionCode, $tableSchedules, $tableHeats, $tableCategories, $auditLogger) {
    $stmt = $pdo->prepare("UPDATE {$tableSchedules} SET Data_horaires = ? WHERE Code_competition = ?");
    $stmt->execute([json_encode($payload['schedulesData']), $competitionCode]);
    $auditLogger->recordTableChange($tableSchedules, $stmt->rowCount());
    $stmtHeats = $pdo->prepare("UPDATE {$tableHeats} SET H_depart = ?, Num_Serie_Global = ? WHERE Code_competition = ? AND Code_Categorie = ? AND Nom_Tour = ? AND Nom_Serie = ?");
    $stmtCatId = $pdo->prepare("SELECT Code_Categorie FROM {$tableCategories} WHERE Code_competition = ? AND Nom_Categorie = ?");
    $heatsUpdated = 0;
    foreach ($payload['categoriesData'] as $catKey => $category) {
        $stmtCatId->execute([$competitionCode, $catKey]);
        $categoryId = $stmtCatId->fetchColumn();
        if ($categoryId) {
            foreach ($category['rounds'] as $roundKey => $round) {
                foreach ($round['heats'] as $heat) {
                    $stmtHeats->execute([$heat['startTime'] ?: null,$heat['globalHeatNumber'] ?? null, $competitionCode,$categoryId, $roundKey, $heat['name']]);
                    $heatsUpdated += $stmtHeats->rowCount();
                }
            }
        }
    }
    $auditLogger->recordTableChange($tableHeats, $heatsUpdated);
}
function saveHeatResults($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $tableCategories, $tableRanking, $auditLogger) {
    updateSingleHeatAndSlots($pdo, $payload['heatData'], $competitionCode, $tableHeats, $tableSlots, $auditLogger);
    $stmtCatId = $pdo->prepare("SELECT Code_Categorie FROM {$tableCategories} WHERE Code_competition = ? AND Nom_Categorie = ?");
    $stmtCatId->execute([$competitionCode, $payload['heatData']['categoryKey']]);
    $categoryId = $stmtCatId->fetchColumn();
    if ($categoryId && isset($payload['finalRanking'])) {
        saveFinalRankingForCategory($pdo, $competitionCode, $categoryId, $payload['finalRanking'], $tableRanking, $auditLogger);
    }
}
function saveProgression($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $tableCategories, $tableRanking, $auditLogger) {
    $sourceHeat = $payload['sourceHeat'];
    $targetHeats = $payload['targetHeats'];
    $now = getCurrentTimestamp();
    $modifiedBy = $payload['modifiedBy'] ?? 'unknown';
    updateSingleHeatAndSlots($pdo, $sourceHeat, $competitionCode, $tableHeats, $tableSlots, $auditLogger);
    $stmtUpsertSlot = $pdo->prepare(
        "INSERT INTO {$tableSlots} (Code_competition, Code_Serie, Slot_Index, Code_bateau, Ordre_arrivee, Penalite, Statut_Special, Clt, Last_Modified, Modified_By)
         VALUES (:competitionCode, :heatId, :slotIndex, :codeBateau, NULL, NULL, NULL, 0, :now, :modifiedBy)
         ON DUPLICATE KEY UPDATE Code_bateau = VALUES(Code_bateau), Ordre_arrivee = NULL, Penalite = NULL, Statut_Special = NULL, Clt = 0, Last_Modified = VALUES(Last_Modified), Modified_By = VALUES(Modified_By)"
    );
    $heatsUpdated = 0;
    $slotsUpdated = 0;
    foreach ($targetHeats as $targetHeat) {
        $stmtUpdateHeatState = $pdo->prepare("UPDATE {$tableHeats} SET Etat = ?, Last_Modified = ?, Modified_By = ? WHERE Code_Serie = ? AND Code_competition = ?");
        $stmtUpdateHeatState->execute([$targetHeat['etat'], $now, $modifiedBy, $targetHeat['id'], $competitionCode]);
        $heatsUpdated += $stmtUpdateHeatState->rowCount();
        foreach ($targetHeat['slots'] as $slot) {
             if (isset($slot['participant']) && $slot['participant']['rankTT'] > 0) {
                $stmtUpsertSlot->execute([
                    ':competitionCode' => $competitionCode,
                    ':heatId' => $targetHeat['id'],
                    ':slotIndex' => $slot['prioDepart'],
                    ':codeBateau' => $slot['participant']['codeBateau'] ?? $slot['participant']['id'],
                    ':now' => $now,
                    ':modifiedBy' => $modifiedBy                    
                ]);
                $slotsUpdated += $stmtUpsertSlot->rowCount();
            }
        }
    }
    $auditLogger->recordTableChange($tableHeats, $heatsUpdated);
    $auditLogger->recordTableChange($tableSlots, $slotsUpdated);
    $stmtCatId = $pdo->prepare("SELECT Code_Categorie FROM {$tableCategories} WHERE Code_competition = ? AND Nom_Categorie = ?");
    $stmtCatId->execute([$competitionCode, $sourceHeat['categoryKey']]);
    $categoryId = $stmtCatId->fetchColumn();
    if ($categoryId && isset($payload['finalRanking'])) {
        saveFinalRankingForCategory($pdo, $competitionCode, $categoryId, $payload['finalRanking'], $tableRanking, $auditLogger);
    }
}
function updateSingleHeatAndSlots($pdo, $heatData, $competitionCode, $tableHeats, $tableSlots, $auditLogger) {
    global $payload;
    $heatId = $heatData['id'];
    $now = getCurrentTimestamp();
    $modifiedBy = $payload['modifiedBy'] ?? 'admin';
    $stmtUpdateHeat = $pdo->prepare(
        "UPDATE {$tableHeats} SET H_depart = ?, Etat = ?, Num_Serie_Global = ?, Last_Modified = ?, Modified_By = ?
         WHERE Code_competition = ? AND Code_Serie = ?"
    );
    $stmtUpdateHeat->execute([
        $heatData['startTime'] ?: null,
        $heatData['etat'] ??  HEAT_EN_ATTENTE,
        $heatData['globalHeatNumber'] ?? null,
        $now,
        $modifiedBy,
        $competitionCode,
        $heatId
    ]);
    $auditLogger->recordTableChange($tableHeats, $stmtUpdateHeat->rowCount());
    $stmtDelete = $pdo->prepare("DELETE FROM {$tableSlots} WHERE Code_Serie = ? AND Code_competition = ?");
    $stmtDelete->execute([$heatId, $competitionCode]);
    $stmtInsertSlot = $pdo->prepare(
        "INSERT INTO {$tableSlots} (Code_competition, Code_Serie, Slot_Index, Code_bateau, Ordre_arrivee, Penalite, Statut_Special, Clt,Last_Modified, Modified_By)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $slotsInserted = 0;
    foreach ($heatData['slots'] as $slot) {
        if (isset($slot['participant']) && $slot['participant']['rankTT'] > 0) {
            $stmtInsertSlot->execute([
                $competitionCode,
                $heatId,
                $slot['prioDepart'],
                $slot['participant']['codeBateau'] ?? $slot['participant']['id'],
                $slot['heatResult']['order'],
                $slot['heatResult']['penalty'],
                $slot['heatResult']['specialStatus'] ?? null,
                is_numeric($slot['heatResult']['finalRank']) ? $slot['heatResult']['finalRank'] : 0,
                $now,
                $modifiedBy                
            ]);
            $slotsInserted++;
        }
    }
    $auditLogger->recordTableChange($tableSlots, $stmtDelete->rowCount() + $slotsInserted);
}
function saveSingleHeat($pdo, $heatData, $competitionCode, $tableHeats, $tableSlots, $tableCategories) {
    $stmtCatId = $pdo->prepare("SELECT Code_Categorie FROM {$tableCategories} WHERE Code_competition = ? AND Nom_Categorie = ?");
    $stmtCatId->execute([$competitionCode, $heatData['categoryKey']]);
    $categoryId = $stmtCatId->fetchColumn();
    if (!$categoryId) throw new Exception("Catégorie {$heatData['categoryKey']} non trouvée en base pour la série {$heatData['name']}.");
    $stmtHeat = $pdo->prepare("SELECT Code_Serie FROM {$tableHeats} WHERE  Code_competition = ? AND Code_Categorie = ? AND Nom_Tour = ? AND Nom_Serie = ?");
    $stmtHeat->execute([$competitionCode, $categoryId, $heatData['roundKey'], $heatData['name']]);
    $heatId = $stmtHeat->fetchColumn();
    if (!$heatId) {
        $stmtInsertHeat = $pdo->prepare(
            "INSERT INTO {$tableHeats} (Code_competition, Code_Categorie, Nom_Tour, Nom_Serie, H_depart, Etat, Num_Serie_Global) 
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        $stmtInsertHeat->execute([
            $competitionCode, $categoryId, $heatData['roundKey'], $heatData['name'], 
            $heatData['startTime'] ?: null, $heatData['etat'] ??  HEAT_EN_ATTENTE, $heatData['globalHeatNumber'] ?? null
        ]);
        $heatId = $pdo->lastInsertId();
    } else {
        $stmtUpdateHeat = $pdo->prepare(
            "UPDATE {$tableHeats} SET H_depart = ?, Etat = ?, Num_Serie_Global = ? 
             WHERE Code_competition = ? AND Code_Serie = ?"
        );
        $stmtUpdateHeat->execute([
            $heatData['startTime'] ?: null, 
            $heatData['etat'] ??  HEAT_EN_ATTENTE, 
            $heatData['globalHeatNumber'] ?? null, 
            $competitionCode, 
            $heatId
        ]);
    }
    $pdo->prepare("DELETE FROM {$tableSlots} WHERE Code_Serie = ? AND Code_competition = ?")->execute([$heatId, $competitionCode]);
    $stmtInsertSlot = $pdo->prepare(
        "INSERT INTO {$tableSlots} (Code_competition, Code_Serie, Slot_Index, Code_bateau, Ordre_arrivee, Penalite, Statut_Special, Clt) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    foreach ($heatData['slots'] as $slot) {
        if (isset($slot['participant']) && $slot['participant']['rankTT'] > 0) {
            $stmtInsertSlot->execute([
                $competitionCode,
                $heatId,
                $slot['prioDepart'],
                $slot['participant']['codeBateau'] ?? $slot['participant']['id'],
                $slot['heatResult']['order'],
                $slot['heatResult']['penalty'],
                $slot['heatResult']['specialStatus'] ?? null, 
                is_numeric($slot['heatResult']['finalRank']) ? $slot['heatResult']['finalRank'] : 0
            ]);
        }
    }
}
function validateHeatResults($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $auditLogger) {
    if (!isset($payload['heatId']) || !isset($payload['slots'])) {
        throw new Exception("Données manquantes pour 'validate_heat_results'.");
    }
    $heatId = (int)$payload['heatId'];
    $slots = $payload['slots'];
    $now = getCurrentTimestamp();
    $modifiedBy = $payload['modifiedBy'] ?? 'unknown';
    $stmtHeat = $pdo->prepare(
        "UPDATE {$tableHeats} SET Etat =  " . HEAT_OFFICIEL . ", Last_Modified = ?, Modified_By = ? WHERE Code_competition = ? AND Code_Serie = ?"
    );
    $stmtHeat->execute([$now, $modifiedBy, $competitionCode, $heatId]);
    $auditLogger->recordTableChange($tableHeats, $stmtHeat->rowCount());    
    $stmtSlot = $pdo->prepare(
        "UPDATE {$tableSlots} SET
            Ordre_arrivee = :order,
            Penalite = :penalty,
            Statut_Special = :status,
            Clt = :clt,
            Last_Modified = :lastMod,
            Modified_By = :modBy
         WHERE Code_competition = :competition AND Code_Serie = :heat AND Slot_Index = :prio"
    );
    $slotsUpdated = 0;
    foreach($slots as $slotData) {
        $heatResult = $slotData['heatResult'];
        $stmtSlot->execute([
            ':order' => $heatResult['order'] ?? null,
            ':penalty' => $heatResult['penalty'],
            ':status' => $heatResult['specialStatus'] ?? null,
            ':clt' => is_numeric($heatResult['finalRank']) ? (int)$heatResult['finalRank'] : 0,
            ':lastMod' => $now,
            ':modBy' => $modifiedBy,            
            ':competition' => $competitionCode,
            ':heat' => $heatId,
            ':prio' => (int)$slotData['prioDepart']
        ]);
        $slotsUpdated += $stmtSlot->rowCount();
    }
    $auditLogger->recordTableChange($tableSlots, $slotsUpdated);
}
function saveUpdatedHeats($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $auditLogger) {
    $heatsToUpdate = $payload['heats'] ?? [];
    if (empty($heatsToUpdate)) {
        return;
    }
    $stmtUpdateHeat = $pdo->prepare(
        "UPDATE {$tableHeats} SET Etat = :etat WHERE Code_Serie = :id AND Code_competition = :competitionCode"
    );
    $stmtUpsertSlot = $pdo->prepare(
        "INSERT INTO {$tableSlots} (Code_competition, Code_Serie, Slot_Index, Code_bateau, Ordre_arrivee, Penalite, Statut_Special, Clt, Last_Modified, Modified_By)
        VALUES (:competitionCode, :heatId, :slotIndex, :codeBateau, NULL, NULL, NULL, 0, :now, :modifiedBy)
        ON DUPLICATE KEY UPDATE 
            Ordre_arrivee  = IF(Code_bateau <> VALUES(Code_bateau), NULL, Ordre_arrivee),
            Penalite       = IF(Code_bateau <> VALUES(Code_bateau), NULL, Penalite),
            Statut_Special = IF(Code_bateau <> VALUES(Code_bateau), NULL, Statut_Special),
            Clt            = IF(Code_bateau <> VALUES(Code_bateau), 0, Clt),
            Last_Modified  = IF(Code_bateau <> VALUES(Code_bateau), VALUES(Last_Modified), Last_Modified),
            Modified_By    = IF(Code_bateau <> VALUES(Code_bateau), VALUES(Modified_By), Modified_By),
            Code_bateau    = VALUES(Code_bateau)"
    );
    $heatsUpdated = 0;
    $slotsUpdated = 0;
    foreach ($heatsToUpdate as $heat) {
        $heatId = $heat['id'];
        $stmtUpdateHeat->execute([
            ':etat' => $heat['etat'],
            ':id' => $heatId,
            ':competitionCode' => $competitionCode
        ]);
        $heatsUpdated += $stmtUpdateHeat->rowCount();
        foreach ($heat['slots'] as $slot) {
            $codeBateau = null;
            if (isset($slot['participant']) && $slot['participant']['rankTT'] > 0) {
                $codeBateau = $slot['participant']['codeBateau'] ?? $slot['participant']['id'];
            }
            $stmtUpsertSlot->execute([
                ':competitionCode' => $competitionCode,
                ':heatId' => $heatId,
                ':slotIndex' => $slot['prioDepart'],
                ':codeBateau' => $codeBateau,
                ':now' => getCurrentTimestamp(),
                ':modifiedBy' => 'engine_progression'                
            ]);
            $slotsUpdated += $stmtUpsertSlot->rowCount();
        }
    }
    $auditLogger->recordTableChange($tableHeats, $heatsUpdated);
    $auditLogger->recordTableChange($tableSlots, $slotsUpdated);
}
function saveFinalRankingForCategory($pdo, $competitionCode, $categoryId, $finalRankingData, $tableRanking, $auditLogger = null) {
    if (empty($finalRankingData)) {
        return;
    }
    $stmtDelete = $pdo->prepare("DELETE FROM {$tableRanking} WHERE Code_competition = ? AND Code_Categorie = ?");
    $stmtDelete->execute([$competitionCode, $categoryId]);
    $deletedCount = $stmtDelete->rowCount();
    $stmtInsert = $pdo->prepare(
        "INSERT INTO {$tableRanking} (Code_competition, Code_Categorie, Code_bateau, Cltc, Serie_Source)
         VALUES (?, ?, ?, ?, ?)"
    );
    $insertedCount = 0;
    foreach ($finalRankingData as $rankItem) {
        if (isset($rankItem['participant']) && $rankItem['participant']) {
            $participant = $rankItem['participant'];
            $stmtInsert->execute([
                $competitionCode,
                $categoryId,
                $participant['codeBateau'] ?? $participant['id'], 
                $rankItem['rangFinal'],
                $rankItem['detailsSource']
            ]);
            $insertedCount++;
        }
    }
    if ($auditLogger) {
        $auditLogger->recordTableChange($tableRanking, $deletedCount + $insertedCount);
    }
}
function updateHeatState($pdo, $payload,$competitionCode, $table, $auditLogger) {
    if (!isset($payload['heatInfo']) || !isset($payload['newState'])) {
        throw new Exception("Données manquantes pour 'update_heat_state'.");
    }
    $heatInfo = (int)$payload['heatInfo'];
    $newState = (int)$payload['newState'];
    $modifiedBy = $payload['modifiedBy'] ?? 'unknown';
    $lockInfo = checkHeatLocked($pdo, $table, $competitionCode, $heatInfo);
    if ($lockInfo['locked']) {
        sendLockedResponse($lockInfo, $auditLogger);
    }
    $now = getCurrentTimestamp();
    $stmtUpdate = $pdo->prepare(
        "UPDATE {$table}
         SET Etat = ?, Last_Modified = ?, Modified_By = ?
         WHERE Code_Serie = ? AND Code_competition = ?"
    );
    $stmtUpdate->execute([$newState, $now, $modifiedBy, $heatInfo, $competitionCode]);
    $auditLogger->recordTableChange($table, $stmtUpdate->rowCount());
    return ['newLastModified' => $now];
}
function launchHeat($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $auditLogger) {
    if (!isset($payload['heatId']) || !isset($payload['newState'])) {
        throw new Exception("Données manquantes pour 'launch_heat'.");
    }
    $heatId     = (int)$payload['heatId'];
    $newState   = (int)$payload['newState'];
    $modifiedBy = $payload['modifiedBy'] ?? 'unknown';
    $now        = getCurrentTimestamp();
    $lockInfo = checkHeatLocked($pdo, $tableHeats, $competitionCode, $heatId);
    if ($lockInfo['locked']) {
        sendLockedResponse($lockInfo, $auditLogger);
    }
    $stmt = $pdo->prepare(
        "UPDATE {$tableHeats} SET Etat = ?, Last_Modified = ?, Modified_By = ?
         WHERE Code_Serie = ? AND Code_competition = ?"
    );
    $stmt->execute([$newState, $now, $modifiedBy, $heatId, $competitionCode]);
    $auditLogger->recordTableChange($tableHeats, $stmt->rowCount());
    if (!empty($payload['dnsSlots'])) {
        $stmtDns = $pdo->prepare(
            "UPDATE {$tableSlots} SET Statut_Special  = ?, Last_Modified = ?, Modified_By = ?
             WHERE Code_Serie = ? AND Code_competition = ? AND Slot_Index  = ?"
        );
        foreach ($payload['dnsSlots'] as $dns) {
            $stmtDns->execute([$dns['newStatus'], $now, $modifiedBy, $heatId, $competitionCode, $dns['slotIndex']]);
            $auditLogger->recordTableChange($tableSlots, $stmtDns->rowCount());
        }
    }
    if (!empty($payload['penaltyInit'])) {
        $stmtPen = $pdo->prepare(
            "UPDATE {$tableSlots} SET Penalite = ?, Last_Modified = ?, Modified_By = ?
             WHERE Code_Serie = ? AND Code_competition = ? AND Slot_Index  = ?"
        );
        foreach ($payload['penaltyInit'] as $pen) {
            $stmtPen->execute([$pen['value'], $now, $modifiedBy, $heatId, $competitionCode, $pen['slotIndex']]);
            $auditLogger->recordTableChange($tableSlots, $stmtPen->rowCount());
        }
    }
    return ['newLastModified' => $now];
}
function recordArrivals($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $auditLogger) {
    if (!isset($payload['heatId']) || !isset($payload['newState']) || !isset($payload['arrivals'])) {
        throw new Exception("Données manquantes pour 'record_arrivals'.");
    }
    $heatId = (int)$payload['heatId'];
    $newState = (int)$payload['newState'];
    $modifiedBy = $payload['modifiedBy'] ?? 'unknown';
    $now = getCurrentTimestamp();
    $lockInfo = checkHeatLocked($pdo, $tableHeats, $competitionCode, $heatId);
    if ($lockInfo['locked']) {
        sendLockedResponse($lockInfo, $auditLogger);
    }
    $stmtSlots = $pdo->prepare(
        "UPDATE {$tableSlots} SET Ordre_arrivee = ?, Statut_Special = ?, Last_Modified = ?, Modified_By = ?
         WHERE Code_Serie = ? AND Code_competition = ? AND Slot_Index = ?"
    );
    $slotsUpdated = 0;
    foreach ($payload['arrivals'] as $arr) {
        $stmtSlots->execute([$arr['newRank'], $arr['newStatus'], $now, $modifiedBy, $heatId, $competitionCode, $arr['slotIndex']]);
        $slotsUpdated += $stmtSlots->rowCount();
    }
    $auditLogger->recordTableChange($tableSlots, $slotsUpdated);
    $stmtHeat = $pdo->prepare(
        "UPDATE {$tableHeats} SET Etat = ?, Last_Modified = ?, Modified_By = ?
         WHERE Code_Serie = ? AND Code_competition = ?"
    );
    $stmtHeat->execute([$newState, $now, $modifiedBy, $heatId, $competitionCode]);
    $auditLogger->recordTableChange($tableHeats, $stmtHeat->rowCount());
    return ['newLastModified' => $now];
}
function updateStatus($pdo, $payload, $competitionCode, $tableSlots, $auditLogger) {
    global $tableHeats;
    if (!isset($payload['code_Serie']) || !isset($payload['slot_Index']) || !array_key_exists('newStatus', $payload)) {
        throw new Exception("Données manquantes pour 'update_status'.");
    }
    $codeSerie = (int)$payload['code_Serie'];
    $slotIndex = (int)$payload['slot_Index'];
    $newStatus = $payload['newStatus']; 
    $modifiedBy = $payload['modifiedBy'] ?? 'unknown';
    $lockInfo = checkHeatLocked($pdo, $tableHeats, $competitionCode, $codeSerie);
    if ($lockInfo['locked']) {
        sendLockedResponse($lockInfo, $auditLogger);
    }
    if ($lockInfo['state'] >= HEAT_PRET_A_VALIDER) {
        sendLockedResponse([
            'locked' => true,
            'state' => $lockInfo['state'],
            'message' => 'Arrivée validée. Modification du statut impossible.'
        ], $auditLogger);
    }
    $now = getCurrentTimestamp();
    if ($newStatus === 'DNS' || $newStatus === 'DNF' || $newStatus === 'DQB' || $newStatus === 'DSQ') {
        $stmtUpdate = $pdo->prepare(
            "UPDATE {$tableSlots}
             SET Statut_Special = :status, Ordre_arrivee = NULL, Last_Modified = :lastMod, Modified_By = :modBy
             WHERE Code_competition = :competition AND Code_Serie = :serie AND Slot_Index = :slot"
        );
        $stmtUpdate->execute([
            ':status' => $newStatus,
            ':lastMod' => $now,
            ':modBy' => $modifiedBy,
            ':competition' => $competitionCode,
            ':serie' => $codeSerie,
            ':slot' => $slotIndex
        ]);
    } else {
        $stmtUpdate = $pdo->prepare(
            "UPDATE {$tableSlots}
             SET Statut_Special = NULL, Last_Modified = :lastMod, Modified_By = :modBy
             WHERE Code_competition = :competition AND Code_Serie = :serie AND Slot_Index = :slot"
        );
         $stmtUpdate->execute([
            ':lastMod' => $now,
            ':modBy' => $modifiedBy,
            ':competition' => $competitionCode,
            ':serie' => $codeSerie,
            ':slot' => $slotIndex
        ]);
    }
    $auditLogger->recordTableChange($tableSlots, $stmtUpdate->rowCount());
    return ['newLastModified' => $now];
}
function updatePenalite($pdo, $payload, $competitionCode, $table, $auditLogger) {
    global $tableHeats;
    if (!isset($payload['code_Serie']) || !isset($payload['slot_Index']) || !array_key_exists('newValue', $payload)) {
        throw new Exception("Données manquantes pour 'update_penalite'.");
    }
    $Code_Serie = (int)$payload['code_Serie'];
    $Slot_Index = (int)$payload['slot_Index'];
    $NewValue = $payload['newValue'];
    $modifiedBy = $payload['modifiedBy'] ?? 'unknown';
    $lockInfo = checkHeatLocked($pdo, $tableHeats, $competitionCode, $Code_Serie);
    if ($lockInfo['locked']) {
        sendLockedResponse($lockInfo, $auditLogger);
    }
    $stmtZones = $pdo->prepare("SELECT Zones_Jugees FROM {$tableHeats} WHERE Code_Serie = ? AND Code_competition = ?");
    $stmtZones->execute([$Code_Serie, $competitionCode]);
    $zonesJugees = $stmtZones->fetchColumn();
    global $config; 
    $jugeStart = isset($config['judging']['juge_start']) ? $config['judging']['juge_start'] : false;
    $zonesToCheck = $zonesJugees;
    if (!$jugeStart && $zonesJugees && strlen($zonesJugees) > 0) {
        $zonesToCheck = substr($zonesJugees, 1);
    }
    if ($zonesToCheck && strpos($zonesToCheck, '0') === false) {
        sendLockedResponse([
            'locked' => true,
            'state' => $lockInfo['state'],
            'message' => 'Toutes les zones requises ont été jugées. Modification impossible.'
        ], $auditLogger);
    }
    $isPrivileged = in_array($modifiedBy, ['jugement', 'gestionnaire', 'admin']);
    if (!$isPrivileged && $zonesJugees) {
        $stmtCurrentPenalty = $pdo->prepare(
            "SELECT Penalite FROM {$table}
             WHERE Code_competition = ? AND Code_Serie = ? AND Slot_Index = ?
             FOR UPDATE" 
        );
        $stmtCurrentPenalty->execute([$competitionCode, $Code_Serie, $Slot_Index]);
        $currentPenalty = $stmtCurrentPenalty->fetchColumn() ?: '';
        $maxLen = max(strlen($currentPenalty), strlen($NewValue), strlen($zonesJugees));
        for ($i = 0; $i < $maxLen; $i++) {
            $oldChar = $currentPenalty[$i] ?? '0';
            $newChar = $NewValue[$i] ?? '0';
            $zoneValidee = ($zonesJugees[$i] ?? '0') !== '0'; 
            if ($zoneValidee && $oldChar !== $newChar) {
                sendLockedResponse([
                    'locked' => true,
                    'state' => $lockInfo['state'],
                    'message' => "Zone " . ($i + 1) . " déjà validée. Seul le jugement peut la modifier."
                ], $auditLogger);
            }
        }
    }
    $now = getCurrentTimestamp();
    $stmtUpdate = $pdo->prepare(
        "UPDATE {$table}
        SET Penalite = ?, Last_Modified = ?, Modified_By = ?
        WHERE Code_competition = ? AND Code_Serie = ? AND Slot_Index = ?"
    );
    $stmtUpdate->execute([$NewValue, $now, $modifiedBy, $competitionCode, $Code_Serie, $Slot_Index]);
    $auditLogger->recordTableChange($table, $stmtUpdate->rowCount());
    return ['newLastModified' => $now];
}
function _updateSectorPenalty($pdo, $payload, $competitionCode, $tableSlots) {
    if (!isset($payload['heatId'], $payload['slotIndex'], $payload['sectorIndex'], $payload['newValue'])) {
        throw new Exception("Données manquantes pour 'update_single_penalty'.");
    }
    $heatId = (int)$payload['heatId'];
    $slotIndex = (int)$payload['slotIndex'];
    $sectorIndex = (int)$payload['sectorIndex'];
    $newValue = (string)$payload['newValue'];
    $lastModified = $payload['lastModified'] ?? getCurrentTimestamp();
    $modifiedBy = $payload['modifiedBy'] ?? 'unknown';
    if (!in_array($newValue, ['0', '2', '5'])) {
        throw new Exception("La nouvelle valeur de pénalité est invalide.");
    }
    $stmtSelect = $pdo->prepare(
        "SELECT Penalite FROM {$tableSlots}
         WHERE Code_competition = ? AND Code_Serie = ? AND Slot_Index = ?
         FOR UPDATE"
    );
    $stmtSelect->execute([$competitionCode, $heatId, $slotIndex]);
    $currentPenalty = $stmtSelect->fetchColumn();
    if ($currentPenalty === false) {
        throw new Exception("Le slot demandé n'existe pas. Vérifiez les identifiants.");
    }
    if (strlen($currentPenalty) <= $sectorIndex) {
       $currentPenalty = str_pad($currentPenalty, $sectorIndex + 1, '0', STR_PAD_RIGHT);
    }
    $currentPenalty = substr_replace($currentPenalty, $newValue, $sectorIndex, 1);
    $stmtUpdate = $pdo->prepare(
        "UPDATE {$tableSlots} SET Penalite = ?, Last_Modified = ?, Modified_By = ?
         WHERE Code_competition = ? AND Code_Serie = ? AND Slot_Index = ?"
    );
    $stmtUpdate->execute([$currentPenalty, $lastModified, $modifiedBy, $competitionCode, $heatId, $slotIndex]);
}
function validateZonePenalties($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $auditLogger) {
    if (!isset($payload['heatId'], $payload['zoneIndex']) || !is_array($payload['penalties'])) {
        throw new Exception("Données manquantes pour 'validate_zone_penalties'.");
    }
    $heatId = (int)$payload['heatId'];
    $zoneIndex = (int)$payload['zoneIndex'];
    $penalties = $payload['penalties']; 
    $modifiedBy = $payload['modifiedBy'] ?? 'unknown';
    $now = getCurrentTimestamp();
    $lockInfo = checkHeatLocked($pdo, $tableHeats, $competitionCode, $heatId);
    if ($lockInfo['locked']) {
        sendLockedResponse($lockInfo, $auditLogger);
    }
    $stmtSelect = $pdo->prepare("SELECT Zones_Jugees FROM {$tableHeats} WHERE Code_Serie = ? FOR UPDATE");
    $stmtSelect->execute([$heatId]);
    $currentZonesJugees = $stmtSelect->fetchColumn()?: '';
    if ($currentZonesJugees !== false) {
        $isAlreadyJudged = (isset($currentZonesJugees[$zoneIndex]) && $currentZonesJugees[$zoneIndex] !== '0');
        $isPrivileged = in_array($modifiedBy, ['jugement', 'gestionnaire', 'admin']);
        if ($isAlreadyJudged && !$isPrivileged) {
            sendLockedResponse([
                'locked' => true,
                'state' => $lockInfo['state'],
                'message' => "La zone " . ($zoneIndex) . " est déjà validée. Seul le poste de jugement peut la modifier."
            ], $auditLogger);
        }
        $slotsUpdated = 0;
        foreach ($penalties as $penaltyData) {
            $slotIndex = (int)$penaltyData['slotIndex'];
            $newValue = (string)$penaltyData['newValue'];
            _updateSectorPenalty($pdo, [
                'heatId' => $heatId,
                'slotIndex' => $slotIndex,
                'sectorIndex' => $zoneIndex,
                'newValue' => $newValue,
                'lastModified' => $now,
                'modifiedBy' => $modifiedBy
            ], $competitionCode, $tableSlots);
            $slotsUpdated++;
        }
        $auditLogger->recordTableChange($tableSlots, $slotsUpdated);
        $currentZonesJugees[$zoneIndex] = '1';
        $stmtUpdate = $pdo->prepare("UPDATE {$tableHeats} SET Zones_Jugees = ?, Last_Modified = ?, Modified_By = ? WHERE Code_Serie = ?");
        $stmtUpdate->execute([$currentZonesJugees, $now, $modifiedBy, $heatId]);
        $auditLogger->recordTableChange($tableHeats, $stmtUpdate->rowCount());
    }
    return ['newLastModified' => $now];
}
function updateOrdreArrivee($pdo, $payload, $competitionCode, $table, $auditLogger) {
    global $tableHeats;
    if (!isset($payload['code_Serie']) || !isset($payload['slot_Index']) || !array_key_exists('newValue', $payload)) {
        throw new Exception("Données manquantes pour 'update_ordre arrivée'.");
    }
    $Code_Serie = (int)$payload['code_Serie'];
    $Slot_Index = (int)$payload['slot_Index'];
    $NewValue = $payload['newValue'] !== null ? (int)$payload['newValue'] : null;
    $modifiedBy = $payload['modifiedBy'] ?? 'unknown';
    $lockInfo = checkHeatLocked($pdo, $tableHeats, $competitionCode, $Code_Serie);
    if ($lockInfo['locked']) {
        sendLockedResponse($lockInfo, $auditLogger);
    }
    if ($lockInfo['state'] >= HEAT_PRET_A_VALIDER) {
        sendLockedResponse([
            'locked' => true,
            'state' => $lockInfo['state'],
            'message' => 'Arrivée validée. Modification de l\'ordre impossible.'
        ], $auditLogger);
    }
    $now = getCurrentTimestamp();
    $stmtUpdate = $pdo->prepare(
        "UPDATE {$table}
         SET Ordre_arrivee = ?, Last_Modified = ?, Modified_By = ?
         WHERE Code_competition = ? AND Code_Serie = ? AND Slot_Index = ?"
    );
    $stmtUpdate->execute([$NewValue, $now, $modifiedBy, $competitionCode, $Code_Serie, $Slot_Index]);
    $auditLogger->recordTableChange($table, $stmtUpdate->rowCount());
    return ['newLastModified' => $now];
}
function resetCompetition($pdo, $payload, $competitionCode, $tableSettings, $tableCategories, $tableSchedules, $tableHeats, $tableSlots, $tableRanking, $auditLogger) {
    $stmt = $pdo->prepare("DELETE FROM {$tableSlots} WHERE Code_competition = ?");
    $stmt->execute([$competitionCode]);
    $auditLogger->recordTableChange($tableSlots, $stmt->rowCount());
    $stmt = $pdo->prepare("DELETE FROM {$tableHeats} WHERE Code_competition = ?");
    $stmt->execute([$competitionCode]);
    $auditLogger->recordTableChange($tableHeats, $stmt->rowCount());
    $stmt = $pdo->prepare("DELETE FROM {$tableRanking} WHERE Code_competition = ?");
    $stmt->execute([$competitionCode]);
    $auditLogger->recordTableChange($tableRanking, $stmt->rowCount());
    $stmt = $pdo->prepare("DELETE FROM {$tableCategories} WHERE Code_competition = ?");
    $stmt->execute([$competitionCode]);
    $auditLogger->recordTableChange($tableCategories, $stmt->rowCount());
    $stmt = $pdo->prepare("DELETE FROM {$tableSchedules} WHERE Code_competition = ?");
    $stmt->execute([$competitionCode]);
    $auditLogger->recordTableChange($tableSchedules, $stmt->rowCount());
    $stmt = $pdo->prepare("DELETE FROM {$tableSettings} WHERE Code_competition = ?");
    $stmt->execute([$competitionCode]);
    $auditLogger->recordTableChange($tableSettings, $stmt->rowCount());
}
function saveClientCalculatedProgression($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $tableCategories, $tableRanking, $auditLogger) {
    $sourceHeatData = $payload['sourceHeat'];
    $targetHeatsUpdates = $payload['targetHeatsUpdates'];
    $stateUpdates = $payload['stateUpdates'] ?? [];
    $now = getCurrentTimestamp();
    $modifiedBy = $payload['modifiedBy'] ?? 'unknown';
    $stmtUpdateSource = $pdo->prepare("UPDATE {$tableHeats} SET Etat = " . HEAT_OFFICIEL . " , Last_Modified = ?, Modified_By = ? WHERE Code_Serie = ? AND Code_competition = ?");
    $stmtUpdateSource->execute([$now, $modifiedBy, $sourceHeatData['id'], $competitionCode]);
    $heatsUpdated = $stmtUpdateSource->rowCount();
    $stmtUpdateSlot = $pdo->prepare("UPDATE {$tableSlots} SET Clt = ?, Ordre_arrivee = ?, Penalite = ?, Last_Modified = ?, Modified_By = ? WHERE Code_Serie = ? AND Slot_Index = ? AND Code_competition = ?");
    $slotsUpdated = 0;
    foreach($sourceHeatData['slots'] as $slot) {
         if (!$slot['participant'] || !$slot['participant']['id']) continue;
         $finalRank = $slot['participant']['finalRank'];
         $cltToSave = is_numeric($finalRank) ? (int)$finalRank : 0;
         $orderToSave = $slot['participant']['ordre_arrivee'] ?? null;
         $penaltyToSave = $slot['participant']['penalite'] ?? null;
         $stmtUpdateSlot->execute([$cltToSave, $orderToSave, $penaltyToSave, $now, $modifiedBy, $sourceHeatData['id'], $slot['prioDepart'], $competitionCode]);
         $slotsUpdated += $stmtUpdateSlot->rowCount();
    }
    $stmtUpdateTarget = $pdo->prepare(
        "UPDATE {$tableSlots} SET Code_bateau = ?, Last_Modified = ?, Modified_By = ?
         WHERE Code_competition = ? AND Code_Serie = ? AND Slot_Index = ?"
    );
    $stmtInsertTarget = $pdo->prepare(
        "INSERT INTO {$tableSlots} (Code_competition, Code_Serie, Slot_Index, Code_bateau, Ordre_arrivee, Penalite, Statut_Special, Clt, Last_Modified, Modified_By)
         VALUES (?, ?, ?, ?, NULL, NULL, NULL, 0, ?, ?)"         
    );
    foreach ($targetHeatsUpdates as $update) {
        $participantId = $update['participantId'] ?? null;
        $heatId = (int)$update['heatId'];
        $slotIndex = $update['slotIndex'];
        $stmtUpdateTarget->execute([$participantId, $now, $modifiedBy, $competitionCode, $heatId, $slotIndex]);
        if ($stmtUpdateTarget->rowCount() === 0) {
            $stmtInsertTarget->execute([$competitionCode, $heatId, $slotIndex, $participantId, $now, $modifiedBy]);
        }
        $slotsUpdated++;
    }
    $stmtUpdateState = $pdo->prepare("UPDATE {$tableHeats} SET Etat = ?, Last_Modified = ?, Modified_By = ? WHERE Code_Serie = ? AND Code_competition = ?");
    foreach($stateUpdates as $update) {
        $stmtUpdateState->execute([$update['newState'], $now, $modifiedBy, $update['heatId'], $competitionCode]);
        $heatsUpdated += $stmtUpdateState->rowCount();
    }
    $auditLogger->recordTableChange($tableHeats, $heatsUpdated);
    $auditLogger->recordTableChange($tableSlots, $slotsUpdated);
}
function updateSlot($pdo, $payload, $competitionCode, $tableSlots) {
    if (!isset($payload['heatId']) || !isset($payload['slotPrio']) || !isset($payload['heatResult'])) {
        throw new Exception("Données manquantes pour 'update_slot_penalties'.");
    }
    $heatId = (int)$payload['heatId'];
    $slotPrio  = (int)$payload['slotPrio'];
    $heatResult = $payload['heatResult'];
    $stmt = $pdo->prepare(
        "UPDATE {$tableSlots} 
         SET Penalite = :penalty, Statut_Special = :status, Ordre_arrivee = :order, Clt = :clt
         WHERE Code_competition = :competition AND Code_Serie = :heat AND Slot_Index = :slot"
    );
    $stmt->execute([
        ':penalty' => $heatResult['penalty'],
        ':status' => $heatResult['specialStatus'],
        ':order' => $heatResult['order'],
        ':clt' => is_numeric($heatResult['finalRank']) ? (int)$heatResult['finalRank'] : 0,
        ':competition' => $competitionCode,
        ':heat' => $heatId,
        ':slot' => $slotPrio 
    ]);
    if ($stmt->rowCount() === 0) {
    }
}
function updateSlotPenalties($pdo, $payload, $competitionCode, $tableSlots, $auditLogger) {
    if (!isset($payload['heatId']) || !isset($payload['slotPrio']) || !isset($payload['heatResult'])) {
        throw new Exception("Données manquantes pour 'update_slot_penalties'.");
    }
    $heatId = (int)$payload['heatId'];
    $slotPrio  = (int)$payload['slotPrio'];
    $heatResult = $payload['heatResult'];
    $stmt = $pdo->prepare(
        "UPDATE {$tableSlots}
         SET Penalite = :penalty
         WHERE Code_competition = :competition AND Code_Serie = :heat AND Slot_Index = :slot"
    );
    $stmt->execute([
        ':penalty' => $heatResult['penalty'],
        ':competition' => $competitionCode,
        ':heat' => $heatId,
        ':slot' => $slotPrio
    ]);
    $auditLogger->recordTableChange($tableSlots, $stmt->rowCount());
}
function forceValidateHeat($pdo, $payload, $competitionCode, $tableHeats, $tableSettings, $auditLogger) {
    if (!isset($payload['heatId'])) {
        throw new Exception("Données manquantes pour 'force_validate_heat'.");
    }
    $heatId = (int)$payload['heatId'];
    $modifiedBy = $payload['modifiedBy'] ?? 'unknown';
    $now = getCurrentTimestamp();
    $stmtCurrent = $pdo->prepare("SELECT Zones_Jugees FROM {$tableHeats} WHERE Code_Serie = ? AND Code_competition = ?");
    $stmtCurrent->execute([$heatId, $competitionCode]);
    $currentZonesJugees = $stmtCurrent->fetchColumn();
    if ($currentZonesJugees === false || $currentZonesJugees === null) {
        $stmtSettings = $pdo->prepare("SELECT Nombre_portes FROM {$tableSettings} WHERE Code_competition = ?");
        $stmtSettings->execute([$competitionCode]);
        $settingsRow = $stmtSettings->fetch(PDO::FETCH_ASSOC);
        $nombrePortes = ($settingsRow && $settingsRow['Nombre_portes'] !== null) ? (int)$settingsRow['Nombre_portes'] : 8;
        $hasRollZone = ($settingsRow && (int)$settingsRow['Roll_Zone'] !== -1);
        $nombreZones = $nombrePortes + ($hasRollZone ? 2 : 1);
        $currentZonesJugees = str_repeat('0', $nombreZones);
    }
    $zonesJugeesFinal = str_replace('0', '2', $currentZonesJugees);
    $stmt = $pdo->prepare("
        UPDATE {$tableHeats}
        SET Etat = " . HEAT_PRET_A_VALIDER . ", 
            Zones_Jugees = ?,
            Last_Modified = ?,
            Modified_By = ?
        WHERE Code_Serie = ? AND Code_competition = ?
    ");
    $stmt->execute([$zonesJugeesFinal, $now, $modifiedBy, $heatId, $competitionCode]);
    $auditLogger->recordTableChange($tableHeats, $stmt->rowCount());
    return ['success' => true, 'newLastModified' => $now, 'zonesJugees' => $zonesJugeesFinal];
}
function toggleTestHeat($pdo, $payload, $competitionCode, $tableHeats, $tableSlots, $tableCategories, $tableSettings, $auditLogger) {
    $active = isset($payload['active']) ? (bool)$payload['active'] : false;
    $newState = $active ? HEAT_INCOMPLET : HEAT_OFFICIEL; 
    $now = getCurrentTimestamp();
    $modifiedBy = $payload['modifiedBy'] ?? 'admin';
    $stmt = $pdo->prepare("SELECT Code_Serie FROM {$tableHeats} WHERE Code_competition = ? AND Nom_Serie = '_TEST_RESEAU_'");
    $stmt->execute([$competitionCode]);
    $heatId = $stmt->fetchColumn();
    if (!$heatId) {
        throw new Exception("Série de test introuvable. Avez-vous validé la configuration ?");
    }
    if ($active) {
        $stmtSet = $pdo->prepare("SELECT Nombre_portes, Roll_Zone FROM {$tableSettings} WHERE Code_competition = ?");
        $stmtSet->execute([$competitionCode]);
        $settings = $stmtSet->fetch(PDO::FETCH_ASSOC);
        $nbPortes = $settings ? (int)$settings['Nombre_portes'] : 8;
        $hasRoll = $settings && (int)$settings['Roll_Zone'] !== -1;
        $zonesJugeesInitial = str_repeat('0', $nbPortes + ($hasRoll ? 2 : 1));
        $stmtUpdateHeat = $pdo->prepare("UPDATE {$tableHeats} SET Etat = ?, Zones_Jugees = ?, Last_Modified = ?, Modified_By = ? WHERE Code_Serie = ?");
        $stmtUpdateHeat->execute([$newState, $zonesJugeesInitial, $now, $modifiedBy, $heatId]);
        $stmtUpdateSlots = $pdo->prepare("UPDATE {$tableSlots} SET Ordre_arrivee = NULL, Penalite = NULL, Statut_Special = NULL, Clt = 0, Last_Modified = ?, Modified_By = ? WHERE Code_Serie = ?");
        $stmtUpdateSlots->execute([$now, $modifiedBy, $heatId]);
    } else {
        $stmtUpdateHeat = $pdo->prepare("UPDATE {$tableHeats} SET Etat = ?, Last_Modified = ?, Modified_By = ? WHERE Code_Serie = ?");
        $stmtUpdateHeat->execute([$newState, $now, $modifiedBy, $heatId]);
    }
    $auditLogger->recordTableChange($tableHeats, 1);
    return ['success' => true, 'heatId' => $heatId];
}
?>
