<?php
require_once __DIR__ . '/_bootstrap.php';
$competitionFilter = isset($_GET['competition']) ? trim($_GET['competition']) : null;
if ($competitionFilter) {
    $backupFileName = 'database_backup_comp' . $competitionFilter . '_' . date('Y-m-d_H-i-s') . '.sql';
} else {
    $backupFileName = 'database_backup_' . date('Y-m-d_H-i-s') . '.sql';
}
try {
    $pdo = getDbConnection();
    global $tables;
    $allTableNames = array_values($tables);
    $tablesWithCompetition = [
        $tables['settings'],      
        $tables['categories'],    
        $tables['schedules'],     
        $tables['heats'],         
        $tables['slots'],         
        $tables['ranking'],       
        $tables['audit_log']      
    ];
    $sqlContent = "-- Sauvegarde KCross - " . date('Y-m-d H:i:s') . "\n";
    if ($competitionFilter) {
        $sqlContent .= "-- FILTRÉE pour la compétition: {$competitionFilter}\n";
    }
    $sqlContent .= "SET NAMES utf8;\n";
    $sqlContent .= "SET FOREIGN_KEY_CHECKS = 0;\n\n";
    foreach ($allTableNames as $tableName) {
        $checkStmt = $pdo->query("SHOW TABLES LIKE '{$tableName}'");
        if ($checkStmt->rowCount() === 0) {
            continue; 
        }
        $sqlContent .= "-- Structure de la table: `{$tableName}` --\n";
        $sqlContent .= "DROP TABLE IF EXISTS `{$tableName}`;\n";
        $stmt = $pdo->query("SHOW CREATE TABLE `{$tableName}`");
        $row = $stmt->fetch(PDO::FETCH_NUM);
        $sqlContent .= $row[1] . ";\n\n";
        $shouldFilter = $competitionFilter && in_array($tableName, $tablesWithCompetition);
        if ($shouldFilter) {
            $stmt = $pdo->prepare("SELECT * FROM `{$tableName}` WHERE `Code_competition` = ?");
            $stmt->execute([$competitionFilter]);
        } else {
            $stmt = $pdo->query("SELECT * FROM `{$tableName}`");
        }
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (count($rows) > 0) {
            $sqlContent .= "-- Données de la table: `{$tableName}`";
            if ($shouldFilter) {
                $sqlContent .= " (filtré: Code_competition = {$competitionFilter})";
            }
            $sqlContent .= " --\n";
            $firstRow = $rows[0];
            $columns = array_keys($firstRow);
            $columnNames = implode('`, `', $columns);
            foreach ($rows as $row) {
                $values = [];
                foreach ($row as $value) {
                    if ($value === null) {
                        $values[] = "NULL";
                    } else {
                        $values[] = $pdo->quote($value);
                    }
                }
                $valueString = implode(', ', $values);
                $sqlContent .= "INSERT INTO `{$tableName}` (`{$columnNames}`) VALUES ({$valueString});\n";
            }
            $sqlContent .= "\n";
        }
    }
    $sqlContent .= "SET FOREIGN_KEY_CHECKS = 1;\n";
    header('Content-Type: text/plain; charset=utf-8');
    header('Content-Length: ' . strlen($sqlContent));
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');
    echo $sqlContent;
    exit;
} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    exit;
}
?>