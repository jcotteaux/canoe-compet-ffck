<?php
require_once __DIR__ . '/_bootstrap.php';
if (isset($_GET['debug']) && $_GET['debug'] === '1') {
    error_reporting(E_ALL);
    ini_set('display_errors', 1);
}
$action = $_GET['action'] ?? $_POST['action'] ?? '';
try {
    switch ($action) {
        case 'parse_backup':
            handleParseBackup();
            break;
        case 'preview_import':
            handlePreviewImport();
            break;
        case 'execute_import':
            handleExecuteImport($pdo, $tables, $auditLogger);
            break;
        default:
            echo json_encode(['success' => false, 'error' => 'Unknown action: ' . $action]);
    }
} catch (Throwable $e) {
    http_response_code(200); 
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'file' => basename($e->getFile()),
        'line' => $e->getLine()
    ]);
}
function handleParseBackup() {
    if (!isset($_FILES['backup_file'])) {
        echo json_encode(['success' => false, 'error' => 'No file uploaded']);
        return;
    }
    $file = $_FILES['backup_file'];
    $tmpPath = $file['tmp_name'];
    $originalName = $file['name'];
    $sqlContent = '';
    if (strtolower(pathinfo($originalName, PATHINFO_EXTENSION)) === 'zip') {
        $zip = new ZipArchive();
        if ($zip->open($tmpPath) === true) {
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $name = $zip->getNameIndex($i);
                if (strtolower(pathinfo($name, PATHINFO_EXTENSION)) === 'sql') {
                    $sqlContent = $zip->getFromIndex($i);
                    break;
                }
            }
            $zip->close();
            if (empty($sqlContent)) {
                echo json_encode(['success' => false, 'error' => 'No .sql file found in ZIP']);
                return;
            }
        } else {
            echo json_encode(['success' => false, 'error' => 'Failed to open ZIP file']);
            return;
        }
    } else {
        $sqlContent = file_get_contents($tmpPath);
    }
    $tempId = uniqid('backup_', true);
    $tempDir = sys_get_temp_dir() . '/kcross_imports';
    if (!is_dir($tempDir)) mkdir($tempDir, 0777, true);
    file_put_contents("$tempDir/$tempId.sql", $sqlContent);
    $competitions = parseCompetitionsFromSQL($sqlContent);
    $tableNames = [
        'KCross_Competitions', 'KCross_Competition_Categories', 'KCross_Competition_Horaires', 
        'KCross_Series', 'KCross_Slots_Serie', 'KCross_Competitions_Classement', 'KCross_Audit_Log'
    ];
    foreach ($competitions as $code => &$comp) {
        $counts = [];
        foreach ($tableNames as $table) {
            $counts[$table] = countRecordsForCompetition($sqlContent, $table, $code);
        }
        $comp['record_counts'] = $counts;
    }
    echo json_encode([
        'success' => true,
        'temp_id' => $tempId,
        'competitions' => $competitions,
        'filename' => $originalName
    ]);
}
function parseCompetitionsFromSQL($sql) {
    $competitions = [];
    $pattern = "/INSERT INTO `KCross_Competitions`[^;]*?VALUES\s*\(([^;]+)\)/is";
    if (preg_match_all($pattern, $sql, $matches)) {
        foreach ($matches[1] as $valuesPart) {
            $valuesPart = trim($valuesPart, " \t\r\n;)");
            $values = parseSQLValues($valuesPart);
            if (count($values) >= 7) {
                $competitions[$values[0]] = [
                    'Code_competition' => $values[0],
                    'Format' => $values[1],
                    'Nombre_portes' => $values[2],
                    'Detail_portes' => $values[3],
                    'Roll_Zone' => $values[4]
                ];
            }
        }
    }
    $catPattern = "/INSERT INTO `KCross_Competition_Categories`[^;]*?VALUES\s*\(([^;]+)\)/is";
    if (preg_match_all($catPattern, $sql, $catMatches)) {
        foreach ($catMatches[1] as $valuesPart) {
            $valuesPart = trim($valuesPart, " \t\r\n;)");
            $values = parseSQLValues($valuesPart);
            if (count($values) >= 6 && isset($competitions[$values[1]])) {
                $competitions[$values[1]]['categories'][] = $values[2];
            }
        }
    }
    return $competitions;
}
function countRecordsForCompetition($sql, $table, $compCode) {
    $count = 0;
    $lines = explode("\n", $sql);
    foreach ($lines as $line) {
        if (strpos($line, "INSERT INTO `$table`") !== false && strpos($line, "'$compCode'") !== false) {
            $count++;
        }
    }
    return $count;
}
function handlePreviewImport() {
    $input = json_decode(file_get_contents('php://input'), true);
    $tempId = $input['temp_id'] ?? '';
    $sourceCode = $input['source_code'] ?? '';
    $importMode = $input['import_mode'] ?? 'all';
    $sqlPath = sys_get_temp_dir() . "/kcross_imports/$tempId.sql";
    if (!file_exists($sqlPath)) {
        echo json_encode(['success' => false, 'error' => 'Backup expiré. Veuillez re-uploader.']);
        return;
    }
    $sql = file_get_contents($sqlPath);
    $tableNames = getTableNamesForMode($importMode);
    $preview = [];
    foreach ($tableNames as $table) {
        $preview[$table] = ['import_count' => countRecordsForCompetition($sql, $table, $sourceCode)];
    }
    echo json_encode([
        'success' => true,
        'source_code' => $sourceCode,
        'target_code' => $input['target_code'] ?? '',
        'import_mode' => $importMode,
        'tables' => $preview
    ]);
}
function getTableNamesForMode($mode) {
    if ($mode === 'logs_only') {
        return ['KCross_Audit_Log'];
    }
    return [
        'KCross_Competitions', 'KCross_Competition_Categories', 'KCross_Competition_Horaires',
        'KCross_Series', 'KCross_Slots_Serie', 'KCross_Competitions_Classement', 'KCross_Audit_Log'
    ];
}
function handleExecuteImport($pdo, $tables, $auditLogger) {
    $input = json_decode(file_get_contents('php://input'), true);
    $tempId = $input['temp_id'] ?? '';
    $sourceCode = $input['source_code'] ?? '';
    $targetCode = $input['target_code'] ?? '';
    $importMode = $input['import_mode'] ?? 'all';
    if (empty($tempId) || empty($sourceCode) || empty($targetCode)) {
        echo json_encode(['success' => false, 'error' => 'Paramètres manquants (temp_id, source_code, target_code)']);
        return;
    }
    $sqlPath = sys_get_temp_dir() . "/kcross_imports/$tempId.sql";
    if (!file_exists($sqlPath)) {
        echo json_encode(['success' => false, 'error' => 'Backup expiré. Veuillez re-uploader.']);
        return;
    }
    $sqlLines = file($sqlPath, FILE_IGNORE_NEW_LINES);
    if ($sqlLines === false) {
        echo json_encode(['success' => false, 'error' => 'Impossible de lire le fichier backup.']);
        return;
    }
    $log = [];
    try {
        $pdo->beginTransaction();
        if ($importMode === 'logs_only') {
            $deleteList = [$tables['audit_log']];
        } else {
            $deleteList = [
                $tables['slots'],
                $tables['ranking'],
                $tables['heats'],
                $tables['categories'],
                $tables['schedules'],
                $tables['settings'],
                $tables['audit_log'],
            ];
        }
        foreach ($deleteList as $tableName) {
            $stmt = $pdo->prepare("DELETE FROM `$tableName` WHERE `Code_competition` = :code");
            $stmt->execute([':code' => $targetCode]);
            $log[] = "DELETE $tableName: {$stmt->rowCount()} rows supprimées";
        }
        if ($importMode === 'logs_only') {
            $count = importAuditLogs($pdo, $sqlLines, $sourceCode, $targetCode, $tables['audit_log'], [], []);
            $log[] = "INSERT {$tables['audit_log']}: $count rows importées";
        } else {
            $importLog = importFullCompetition($pdo, $sqlLines, $sourceCode, $targetCode, $tables);
            $log = array_merge($log, $importLog);
        }
        $pdo->commit();
        try {
            if ($auditLogger && $auditLogger->isEnabled()) {
                $auditLogger->startAction($targetCode, 'import_from_backup', 'import_tool', [
                    'source_code' => $sourceCode,
                    'target_code' => $targetCode,
                    'import_mode' => $importMode
                ]);
                $auditLogger->recordTableChange('import', count($log));
                if (method_exists($auditLogger, 'endAction')) {
                    $auditLogger->endAction(true);
                }
            }
        } catch (Throwable $e) {
        }
        @unlink($sqlPath);
        echo json_encode([
            'success' => true,
            'log' => $log,
            'message' => "Import terminé avec succès"
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage() . ' (line ' . $e->getLine() . ')',
            'log' => $log
        ]);
    }
}
function importFullCompetition($pdo, $sqlLines, $sourceCode, $targetCode, $tables) {
    $log = [];
    $rows = extractTableRows($sqlLines, 'KCross_Competitions', $sourceCode, 0);
    foreach ($rows as $values) {
        if (count($values) < 7) continue;
        $stmt = $pdo->prepare("INSERT INTO `{$tables['settings']}` 
            (`Code_competition`, `Format`, `Nombre_portes`, `Detail_portes`, `Roll_Zone`, `Ecart_Series_Global`, `Ecart_Categories_Global`) 
            VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$targetCode, $values[1], $values[2], $values[3], $values[4], $values[5], $values[6]]);
    }
    $log[] = "INSERT {$tables['settings']}: " . count($rows) . " rows";
    $rows = extractTableRows($sqlLines, 'KCross_Competition_Categories', $sourceCode, 1);
    $categoryMap = [];
    foreach ($rows as $values) {
        if (count($values) < 6) continue;
        $oldCatId = $values[0];
        $stmt = $pdo->prepare("INSERT INTO `{$tables['categories']}` 
            (`Code_competition`, `Nom_Categorie`, `Nb_Bateau`, `Nom_Variante`, `Ordre`) 
            VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$targetCode, $values[2], $values[3], $values[4], $values[5]]);
        $categoryMap[$oldCatId] = $pdo->lastInsertId();
    }
    $log[] = "INSERT {$tables['categories']}: " . count($rows) . " rows (Code_Categorie remappé)";
    $count = importHoraires($pdo, $sqlLines, $sourceCode, $targetCode, $tables['schedules']);
    $log[] = "INSERT {$tables['schedules']}: $count rows";
    $rows = extractTableRows($sqlLines, 'KCross_Series', $sourceCode, 0);
    $serieMap = [];
    foreach ($rows as $values) {
        if (count($values) < 11) continue;
        $oldSerieId = $values[1];
        $newCatId = $categoryMap[$values[2]] ?? $values[2];
        $stmt = $pdo->prepare("INSERT INTO `{$tables['heats']}` 
            (`Code_competition`, `Code_Categorie`, `Nom_Tour`, `Nom_Serie`, `H_depart`, `Etat`, `Zones_Jugees`, `Num_Serie_Global`, `Last_Modified`, `Modified_By`) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $targetCode, $newCatId, $values[3], $values[4],
            nullVal($values[5]), $values[6], nullVal($values[7]),
            nullVal($values[8]), nullVal($values[9]), nullVal($values[10])
        ]);
        $serieMap[$oldSerieId] = $pdo->lastInsertId();
    }
    $log[] = "INSERT {$tables['heats']}: " . count($rows) . " rows (Code_Serie + Code_Categorie remappés)";
    $rows = extractTableRows($sqlLines, 'KCross_Slots_Serie', $sourceCode, 0);
    $slotsCount = 0;
    foreach ($rows as $values) {
        if (count($values) < 10) continue;
        $newSerieId = $serieMap[$values[1]] ?? $values[1];
        $stmt = $pdo->prepare("INSERT INTO `{$tables['slots']}` 
            (`Code_competition`, `Code_Serie`, `Slot_Index`, `Code_bateau`, `Ordre_arrivee`, `Penalite`, `Statut_Special`, `Clt`, `Last_Modified`, `Modified_By`) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $targetCode, $newSerieId, $values[2],
            nullVal($values[3]), nullVal($values[4]), nullVal($values[5]),
            nullVal($values[6]), nullVal($values[7]), nullVal($values[8]), nullVal($values[9])
        ]);
        $slotsCount++;
    }
    $log[] = "INSERT {$tables['slots']}: $slotsCount rows (Code_Serie remappé)";
    $rows = extractTableRows($sqlLines, 'KCross_Competitions_Classement', $sourceCode, 0);
    $classCount = 0;
    foreach ($rows as $values) {
        if (count($values) < 5) continue;
        $newCatId = $categoryMap[$values[1]] ?? $values[1];
        $stmt = $pdo->prepare("INSERT INTO `{$tables['ranking']}` 
            (`Code_competition`, `Code_Categorie`, `Code_bateau`, `Cltc`, `Serie_Source`) 
            VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$targetCode, $newCatId, $values[2], $values[3], $values[4]]);
        $classCount++;
    }
    $log[] = "INSERT {$tables['ranking']}: $classCount rows (Code_Categorie remappé)";
    $auditCount = importAuditLogs($pdo, $sqlLines, $sourceCode, $targetCode, $tables['audit_log'], $serieMap, $categoryMap);
    $log[] = "INSERT {$tables['audit_log']}: $auditCount rows (IDs transposés dans payload_summary)";
    return $log;
}
function extractTableRows($sqlLines, $tableName, $compCode, $compColumnIndex = 0) {
    $results = [];
    foreach ($sqlLines as $line) {
        if (strpos($line, "INSERT INTO `$tableName`") === false) continue;
        if (strpos($line, "'$compCode'") === false) continue;
        $pos = strpos($line, 'VALUES');
        if ($pos === false) continue;
        $valuesPart = substr($line, $pos + 6);
        $valuesPart = trim($valuesPart, " \t\r\n;");
        if (isset($valuesPart[0]) && $valuesPart[0] === '(') $valuesPart = substr($valuesPart, 1);
        if (substr($valuesPart, -1) === ')') $valuesPart = substr($valuesPart, 0, -1);
        $values = parseSQLValues($valuesPart);
        if (isset($values[$compColumnIndex]) && $values[$compColumnIndex] === $compCode) {
            $results[] = $values;
        }
    }
    return $results;
}
function importHoraires($pdo, $sqlLines, $sourceCode, $targetCode, $tableName) {
    $count = 0;
    $fullSql = implode("\n", $sqlLines);
    $pattern = "/INSERT INTO `KCross_Competition_Horaires`[^V]*VALUES\s*\('([^']*)',\s*'((?:[^'\\\\]|\\\\.)*)'\)/s";
    preg_match_all($pattern, $fullSql, $matches, PREG_SET_ORDER);
    foreach ($matches as $m) {
        if ($m[1] === $sourceCode) {
            $stmt = $pdo->prepare("INSERT INTO `$tableName` (`Code_competition`, `Data_horaires`) VALUES (?, ?)");
            $stmt->execute([$targetCode, stripslashes($m[2])]);
            $count++;
        }
    }
    return $count;
}
function importAuditLogs($pdo, $sqlLines, $sourceCode, $targetCode, $tableName, $serieMap, $categoryMap) {
    $count = 0;
    foreach ($sqlLines as $line) {
        if (strpos($line, "INSERT INTO `KCross_Audit_Log`") === false) continue;
        if (strpos($line, "'$sourceCode'") === false) continue;
        $pos = strpos($line, 'VALUES');
        if ($pos === false) continue;
        $valuesPart = substr($line, $pos + 6);
        $valuesPart = trim($valuesPart, " \t\r\n;");
        if (isset($valuesPart[0]) && $valuesPart[0] === '(') $valuesPart = substr($valuesPart, 1);
        if (substr($valuesPart, -1) === ')') $valuesPart = substr($valuesPart, 0, -1);
        $values = parseSQLValues($valuesPart);
        if (count($values) < 15) continue;
        if ($values[2] !== $sourceCode) continue;
        try {
            $payloadSummary = transposeIdsInJson($values[9], $serieMap, $categoryMap);
            $oldValues = transposeIdsInJson($values[10], $serieMap, $categoryMap);
            $newValues = transposeIdsInJson($values[11], $serieMap, $categoryMap);
            $stmt = $pdo->prepare("INSERT INTO `$tableName` 
                (`timestamp`, `Code_competition`, `action`, `modified_by`, `ip_address`, `user_agent`, 
                 `tables_affected`, `records_affected`, `payload_summary`, `old_values`, `new_values`, 
                 `duration_ms`, `success`, `error_message`) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $values[1], $targetCode, $values[3], $values[4], $values[5], $values[6],
                $values[7], $values[8],
                nullVal($payloadSummary), nullVal($oldValues), nullVal($newValues),
                nullVal($values[12]), $values[13], nullVal($values[14])
            ]);
            $count++;
        } catch (Throwable $e) {
            continue;
        }
    }
    return $count;
}
function transposeIdsInJson($jsonString, $serieMap, $categoryMap) {
    if ($jsonString === 'NULL' || $jsonString === null || empty($jsonString)) {
        return null;
    }
    if (empty($serieMap) && empty($categoryMap)) {
        return $jsonString;
    }
    $data = json_decode($jsonString, true);
    if ($data === null) {
        return $jsonString;
    }
    $transposed = transposeIdsRecursive($data, $serieMap, $categoryMap);
    return json_encode($transposed, JSON_UNESCAPED_UNICODE);
}
function transposeIdsRecursive($data, $serieMap, $categoryMap) {
    if (!is_array($data)) {
        return $data;
    }
    $serieKeys = ['heatId', 'code_Serie', 'Code_Serie', 'heatInfo'];
    $categoryKeys = ['Code_Categorie', 'categoryId'];
    foreach ($data as $key => $value) {
        if (in_array($key, $serieKeys, true) && !is_array($value)) {
            $oldId = (string)$value;
            if (isset($serieMap[$oldId])) {
                $data[$key] = (int)$serieMap[$oldId];
            }
        }
        elseif (in_array($key, $categoryKeys, true) && !is_array($value)) {
            $oldId = (string)$value;
            if (isset($categoryMap[$oldId])) {
                $data[$key] = (int)$categoryMap[$oldId];
            }
        }
        elseif (is_array($value)) {
            $data[$key] = transposeIdsRecursive($value, $serieMap, $categoryMap);
        }
    }
    return $data;
}
function nullVal($val) {
    return ($val === 'NULL' || $val === null) ? null : $val;
}
function parseSQLValues($str) {
    $values = [];
    $current = '';
    $inQuote = false;
    $escaped = false;
    $len = strlen($str);
    for ($i = 0; $i < $len; $i++) {
        $ch = $str[$i];
        if ($escaped) {
            $current .= $ch;
            $escaped = false;
            continue;
        }
        if ($ch === '\\' && $inQuote) {
            $escaped = true;
            continue;
        }
        if ($ch === "'" && !$inQuote) {
            $inQuote = true;
            continue;
        }
        if ($ch === "'" && $inQuote) {
            if ($i + 1 < $len && $str[$i + 1] === "'") {
                $current .= "'";
                $i++;
                continue;
            }
            $inQuote = false;
            continue;
        }
        if ($ch === ',' && !$inQuote) {
            $val = trim($current);
            $values[] = ($val === 'NULL') ? 'NULL' : $val;
            $current = '';
            continue;
        }
        $current .= $ch;
    }
    $val = trim($current);
    $values[] = ($val === 'NULL') ? 'NULL' : $val;
    return $values;
}