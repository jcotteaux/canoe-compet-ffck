<?php
require_once __DIR__ . '/_bootstrap.php';
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    try {
        $stmt = $pdo->query("SHOW TABLES LIKE '{$tableAuditLog}'");
        if ($stmt->rowCount() == 0) {
            echo json_encode([
                'success' => false,
                'message' => "La table d'audit n'existe pas."
            ]);
            exit;
        }
        $competitionFilter = $_GET['competition'] ?? null;
        if ($competitionFilter) {
            $countStmt = $pdo->prepare("SELECT COUNT(*) FROM {$tableAuditLog} WHERE Code_competition = ?");
            $countStmt->execute([$competitionFilter]);
            $deletedCount = (int)$countStmt->fetchColumn();
            $deleteStmt = $pdo->prepare("DELETE FROM {$tableAuditLog} WHERE Code_competition = ?");
            $deleteStmt->execute([$competitionFilter]);
            echo json_encode([
                'success' => true,
                'message' => "Logs de la compétition {$competitionFilter} supprimés.",
                'deletedCount' => $deletedCount,
                'competition' => $competitionFilter
            ]);
        } else {
            $countStmt = $pdo->query("SELECT COUNT(*) FROM {$tableAuditLog}");
            $deletedCount = (int)$countStmt->fetchColumn();
            $pdo->exec("TRUNCATE TABLE {$tableAuditLog}");
            echo json_encode([
                'success' => true,
                'message' => "Tous les logs ont été supprimés.",
                'deletedCount' => $deletedCount
            ]);
        }
        exit;
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Erreur lors de la suppression des logs: ' . $e->getMessage()
        ]);
        exit;
    }
}
$competitionCode = $_GET['competition'] ?? null;
$action = $_GET['action'] ?? null;
$modifiedBy = $_GET['modified_by'] ?? null;
$success = isset($_GET['success']) ? (int)$_GET['success'] : null;
$fromTimestamp = isset($_GET['from']) ? (int)$_GET['from'] : null;
$toTimestamp = isset($_GET['to']) ? (int)$_GET['to'] : null;
$limit = min((int)($_GET['limit'] ?? 100), 500);
$offset = (int)($_GET['offset'] ?? 0);
try {
    $stmt = $pdo->query("SHOW TABLES LIKE '{$tableAuditLog}'");
    if ($stmt->rowCount() == 0) {
        echo json_encode([
            'success' => false,
            'message' => "La table d'audit n'existe pas. Exécutez api_create_tables.php pour la créer."
        ]);
        exit;
    }
    $where = [];
    $params = [];
    if ($competitionCode !== null) {
        $where[] = "Code_competition = ?";
        $params[] = $competitionCode;
    }
    if ($action !== null) {
        $where[] = "action = ?";
        $params[] = $action;
    }
    if ($modifiedBy !== null) {
        $where[] = "modified_by LIKE ?";
        $params[] = "%{$modifiedBy}%";
    }
    if ($success !== null) {
        $where[] = "success = ?";
        $params[] = $success;
    }
    if ($fromTimestamp !== null) {
        $where[] = "timestamp >= ?";
        $params[] = $fromTimestamp;
    }
    if ($toTimestamp !== null) {
        $where[] = "timestamp <= ?";
        $params[] = $toTimestamp;
    }
    $whereClause = !empty($where) ? "WHERE " . implode(" AND ", $where) : "";
    $countSql = "SELECT COUNT(*) FROM {$tableAuditLog} {$whereClause}";
    $countStmt = $pdo->prepare($countSql);
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();
    $sql = "SELECT
                id,
                timestamp,
                Code_competition,
                action,
                modified_by,
                ip_address,
                user_agent,
                tables_affected,
                records_affected,
                payload_summary,
                old_values,
                new_values,
                duration_ms,
                success,
                error_message
            FROM {$tableAuditLog}
            {$whereClause}
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?";
    $params[] = $limit;
    $params[] = $offset;
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $heatCache = []; 
    $stmtHeatName = $pdo->prepare("SELECT Nom_Tour, Nom_Serie, Code_Categorie FROM {$tableHeats} WHERE Code_Serie = ?");
    $stmtCatName = $pdo->prepare("SELECT Nom_Categorie FROM {$tableCategories} WHERE Code_Categorie = ?");
    $prioColors = [
        1 => ['label' => 'Rouge', 'hex' => '#dc3545', 'text' => '#fff'],
        2 => ['label' => 'Vert',  'hex' => '#28a745', 'text' => '#fff'],
        3 => ['label' => 'Bleu',  'hex' => '#007bff', 'text' => '#fff'],
        4 => ['label' => 'Jaune', 'hex' => '#ffc107', 'text' => '#000']
    ];
    $heatStates = [
        1 => 'En attente',
        2 => 'Programmé',
        3 => 'En cours',
        4 => 'Terminé (Officieux)',
        5 => 'Officiel',
        6 => 'En modification'
    ];
    foreach ($logs as &$log) {
        $log['old_values'] = !empty($log['old_values']) ? json_decode($log['old_values'], true) : null;
        $log['new_values'] = !empty($log['new_values']) ? json_decode($log['new_values'], true) : null;
        $payload = !empty($log['payload_summary']) ? json_decode($log['payload_summary'], true) : null;
        $log['payload_summary'] = $payload;
        $log['success'] = (bool)$log['success'];
        $log['human_context'] = null;
        $targetActions = [
            'validate_heat_results', 'update_heat_state', 'update_status', 
            'update_penalite', 'validate_zone_penalties', 'update_place', 'launch_heat', 'record_arrivals'
        ];
        if (in_array($log['action'], $targetActions) && $payload) {
            $heatId = $payload['heatId'] ?? $payload['code_Serie'] ?? $payload['heatInfo'] ?? null;
            $slotIndex = $payload['slotIndex'] ?? $payload['slot_Index'] ?? $payload['slotPrio'] ?? null;
            if ($heatId) {
                if (!isset($heatCache[$heatId])) {
                    $stmtHeatName->execute([$heatId]);
                    $heatData = $stmtHeatName->fetch(PDO::FETCH_ASSOC);
                    if ($heatData) {
                        $stmtCatName->execute([$heatData['Code_Categorie']]);
                        $heatData['Nom_Categorie'] = $stmtCatName->fetchColumn();
                    }
                    $heatCache[$heatId] = $heatData;
                }
                $heatInfo = $heatCache[$heatId];
                if ($heatInfo) {
                    $context = [
                        'serie' => "{$heatInfo['Nom_Categorie']} - {$heatInfo['Nom_Tour']} - {$heatInfo['Nom_Serie']}",
                        'serie_short' => $heatInfo['Nom_Serie']
                    ];
                    if ($slotIndex !== null && isset($prioColors[(int)$slotIndex])) {
                        $context['slot'] = $prioColors[(int)$slotIndex];
                    }
                    $changeInfo = null;
                    switch ($log['action']) {
                        case 'update_place': 
                            $val = $payload['newValue'] ?? null;
                            $changeInfo = ['label' => 'Classement Arrivée', 'value' => $val ? "Place n°$val" : "Non classé"];
                            break;
                        case 'update_status': 
                            $val = $payload['newStatus'] ?? null;
                            $changeInfo = ['label' => 'Statut Spécial', 'value' => $val ? $val : "Normal (OK)"];
                            break;
                        case 'update_penalite': 
                            $val = $payload['newValue'] ?? '';
                            $penMap = ['0' => '0 (CLR)', '2' => '2 (FLT)', '5' => '5 (RAL)'];
                            $displayVal = (strlen($val) === 1 && isset($penMap[$val])) ? $penMap[$val] : $val;
                            $changeInfo = ['label' => 'Pénalité saisie', 'value' => $displayVal];
                            break;
                        case 'update_heat_state': 
                            $st = $payload['newState'] ?? 0;
                            $changeInfo = ['label' => 'Nouvel État Série', 'value' => $heatStates[$st] ?? "État $st"];
                            break;
                        case 'launch_heat': 
                            $st = $payload['newState'] ?? 0;
                            $dnsCount = count($payload['dnsSlots'] ?? []);
                            $penCount  = count($payload['penaltyInit'] ?? []);
                            $stateLabel = $heatStates[$st] ?? "État $st";
                            $changeInfo = [
                                'label' => 'Lancement Série',
                                'value' => "$stateLabel · $dnsCount DNS/DNF · $penCount pénalités initialisées"
                            ];
                            break;
                        case 'record_arrivals':
                            $st = $payload['newState'] ?? 0;
                            $count = count($payload['arrivals'] ?? []);
                            $stateLabel = $heatStates[$st] ?? "État $st";
                            $changeInfo = [
                                'label' => 'Validation Arrivée',
                                'value' => "$stateLabel · $count bateaux classés"
                            ];
                            break;
                        case 'validate_zone_penalties': 
                            $zone = $payload['zoneIndex'] ?? '?';
                            $changeInfo = ['label' => "Validation Zone $zone"];
                            if (!empty($payload['penalties']) && is_array($payload['penalties'])) {
                                $details = [];
                                $penMap = ['0' => '0 (CLR)', '2' => '2 (FLT)', '5' => '5 (RAL)'];
                                foreach ($payload['penalties'] as $p) {
                                    $idx = (int)($p['slotIndex'] ?? 0);
                                    $val = (string)($p['newValue'] ?? '0');
                                    $colorInfo = $prioColors[$idx] ?? ['label' => "Slot $idx", 'hex' => '#6c757d', 'text' => '#fff'];
                                    $details[] = [
                                        'slot_hex'   => $colorInfo['hex'],
                                        'slot_text'  => $colorInfo['text'],
                                        'slot_label' => $colorInfo['label'],
                                        'penalty'    => $penMap[$val] ?? $val
                                    ];
                                }
                                $changeInfo['table_data'] = $details;
                            } else {
                                $changeInfo['value'] = "Aucune pénalité transmise";
                            }
                            break;
                        case 'validate_heat_results': 
                            $changeInfo = ['label' => 'Action', 'value' => "Validation et Calcul Progression"];
                            break;
                    }
                    if ($changeInfo) {
                        $context['change'] = $changeInfo;
                    }
                    $log['human_context'] = $context;
                }
            }
        }
    }
    echo json_encode([
        'success' => true,
        'total' => $total,
        'auditEnabled' => $auditLogger->isEnabled(),
        'limit' => $limit,
        'offset' => $offset,
        'competition' => $competitionCode, 
        'logs' => $logs
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erreur lors de la récupération des logs: ' . $e->getMessage()
    ]);
}
