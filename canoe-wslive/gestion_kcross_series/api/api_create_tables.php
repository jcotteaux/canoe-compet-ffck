<?php
require_once __DIR__ . '/_bootstrap.php';
$requiredCharset = 'utf8mb4';
$requiredCollation = 'utf8mb4_general_ci';
$mode = $_GET['mode'] ?? 'manual'; 
if ($mode === 'auto' && empty($config['database']['auto_update'])) {
    echo json_encode(['success' => true, 'message' => 'Aucune mise à jour requise.', 'status' => 'skipped']);
    exit;
}
$schema = [
    $tableSettings => "CREATE TABLE `{$tableSettings}` (
        `Code_competition` VARCHAR(50) NOT NULL,
        `Format` VARCHAR(100) DEFAULT NULL,
        `Nombre_portes` INT(11) DEFAULT NULL,
        `Detail_portes` VARCHAR(20) DEFAULT NULL, -- defini les portes Rouges
        `Roll_Zone` INT(11) DEFAULT NULL,
        `Ecart_Series_Global` INT(11) DEFAULT NULL,
        `Ecart_Categories_Global` INT(11) DEFAULT NULL,
        PRIMARY KEY (`Code_competition`)
    ) ENGINE=InnoDB DEFAULT CHARSET={$requiredCharset} COLLATE={$requiredCollation};",
    $tableCategories => "CREATE TABLE `{$tableCategories}` (
        `Code_Categorie` INT(11) NOT NULL AUTO_INCREMENT,
        `Code_competition` VARCHAR(50) NOT NULL,
        `Nom_Categorie` VARCHAR(50) NOT NULL,
        `Nb_Bateau` INT(11) DEFAULT NULL,
        `Nom_Variante` VARCHAR(100) DEFAULT NULL,
        `Ordre` INT(6) DEFAULT NULL,
        PRIMARY KEY (`Code_Categorie`),
        KEY `idx_competition` (`Code_competition`) 
    ) ENGINE=InnoDB DEFAULT CHARSET={$requiredCharset} COLLATE={$requiredCollation};",
    $tableRanking => "CREATE TABLE `{$tableRanking}` (
        `Code_competition` VARCHAR(50) NOT NULL,
        `Code_Categorie` INT(11) NOT NULL,
        `Code_bateau` VARCHAR(150) NOT NULL, 
        `Cltc` INT(11) DEFAULT NULL,
        `Serie_Source` VARCHAR(150) NOT NULL,
        PRIMARY KEY (`Code_competition`, `Code_Categorie`, `Code_bateau`)
    ) ENGINE=InnoDB DEFAULT CHARSET={$requiredCharset} COLLATE={$requiredCollation};",
    $tableHeats => "CREATE TABLE `{$tableHeats}` (
        `Code_competition` VARCHAR(50) NOT NULL,
        `Code_Serie` INT(11) NOT NULL AUTO_INCREMENT,
        `Code_Categorie` INT(11) NOT NULL,
        `Nom_Tour` VARCHAR(50) NOT NULL,
        `Nom_Serie` VARCHAR(50) NOT NULL,
        `H_depart` VARCHAR(10) DEFAULT NULL,
        `Etat` TINYINT(1) NOT NULL DEFAULT 1,
        `Zones_Jugees` VARCHAR(30) DEFAULT NULL,
        `Num_Serie_Global` INT(11) DEFAULT NULL,
        `Last_Modified` BIGINT(13) DEFAULT NULL,
        `Modified_By` VARCHAR(50) DEFAULT NULL,
        PRIMARY KEY (`Code_Serie`),
        KEY `idx_competition_categorie` (`Code_competition`, `Code_Categorie`)
    ) ENGINE=InnoDB DEFAULT CHARSET={$requiredCharset} COLLATE={$requiredCollation};",
    $tableSlots => "CREATE TABLE `{$tableSlots}` (
        `Code_competition` VARCHAR(50) NOT NULL,
        `Code_Serie` INT(11) NOT NULL,
        `Slot_Index` INT(11) NOT NULL,
        `Code_bateau` CHAR(150) DEFAULT NULL,
        `Ordre_arrivee` INT(11) DEFAULT NULL,
        `Penalite` VARCHAR(100) DEFAULT NULL,
        `Statut_Special` VARCHAR(5) DEFAULT NULL, -- DSQ DNS DNF DQB
        `Clt` INT(11) DEFAULT NULL,
        `Last_Modified` BIGINT(13) DEFAULT NULL,
        `Modified_By` VARCHAR(50) DEFAULT NULL,
        PRIMARY KEY (`Code_competition`, `Code_Serie`, `Slot_Index`)
    ) ENGINE=InnoDB DEFAULT CHARSET={$requiredCharset} COLLATE={$requiredCollation};",
    $tableSchedules => "CREATE TABLE `{$tableSchedules}` (
        `Code_competition` VARCHAR(50) NOT NULL,
        `Data_horaires` TEXT DEFAULT NULL,
        PRIMARY KEY (`Code_competition`) 
    ) ENGINE=InnoDB DEFAULT CHARSET={$requiredCharset} COLLATE={$requiredCollation};",
    $tableManualCompetitions => "CREATE TABLE `{$tableManualCompetitions}` (
        `id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
        `Codex` VARCHAR(16) DEFAULT NULL,
        `nom` VARCHAR(255) NOT NULL,
        `ville` VARCHAR(255) NOT NULL,
        `date_debut` DATE NOT NULL,
        `date_fin` DATE NOT NULL,
        `etat` INT(1) NOT NULL DEFAULT 4,
        PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET={$requiredCharset} COLLATE={$requiredCollation};",
    $tableManualResults => "CREATE TABLE `{$tableManualResults}` (
        `id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
        `id_competition` INT(11) UNSIGNED NOT NULL,
        `dossard` VARCHAR(10) NOT NULL,
        `nom` VARCHAR(100) DEFAULT NULL,
        `prenom` VARCHAR(100) DEFAULT NULL,
        `club` VARCHAR(255) DEFAULT NULL,
        `sexe` CHAR(1) DEFAULT NULL,
        `code_categorie` VARCHAR(50) NOT NULL,
        `tps_chrono_cs` INT(11) DEFAULT NULL,
        `cltc` INT(11) DEFAULT NULL,
        `code_bateau` VARCHAR(150) NOT NULL,
        `bateau` VARCHAR(255) NOT NULL,
        `nation` VARCHAR(10) DEFAULT NULL,
        `licence` VARCHAR(50) DEFAULT NULL,
        `source` VARCHAR(100) DEFAULT NULL,
        PRIMARY KEY (`id`),
        KEY `idx_comp_manual` (`id_competition`)
    ) ENGINE=InnoDB DEFAULT CHARSET={$requiredCharset} COLLATE={$requiredCollation};",
    $tableAuditLog => "CREATE TABLE `{$tableAuditLog}` (
        `id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
        `timestamp` BIGINT(13) NOT NULL,
        `Code_competition` VARCHAR(50) DEFAULT NULL,
        `action` VARCHAR(100) NOT NULL,
        `modified_by` VARCHAR(50) DEFAULT NULL,
        `ip_address` VARCHAR(45) DEFAULT NULL,
        `user_agent` VARCHAR(255) DEFAULT NULL,
        `tables_affected` VARCHAR(255) DEFAULT NULL,
        `records_affected` INT(11) DEFAULT 0,
        `payload_summary` TEXT DEFAULT NULL,
        `old_values` TEXT DEFAULT NULL,
        `new_values` TEXT DEFAULT NULL,
        `duration_ms` INT(11) DEFAULT NULL,
        `success` TINYINT(1) DEFAULT 1,
        `error_message` TEXT DEFAULT NULL,
        PRIMARY KEY (`id`),
        KEY `idx_audit_competition` (`Code_competition`),
        KEY `idx_audit_action` (`action`),
        KEY `idx_audit_timestamp` (`timestamp`),
        KEY `idx_audit_modified_by` (`modified_by`)
    ) ENGINE=InnoDB DEFAULT CHARSET={$requiredCharset} COLLATE={$requiredCollation};" 
];
$report = [];
$migrations = [
    [
        'table' => $tableHeats,
        'column' => 'Last_Modified',
        'definition' => 'BIGINT(13) DEFAULT NULL',
        'after' => 'Num_Serie_Global'
    ],
    [
        'table' => $tableHeats,
        'column' => 'Modified_By',
        'definition' => 'VARCHAR(50) DEFAULT NULL',
        'after' => 'Last_Modified'
    ],
    [
        'table' => $tableSlots,
        'column' => 'Last_Modified',
        'definition' => 'BIGINT(13) DEFAULT NULL',
        'after' => 'Clt'
    ],
    [
        'table' => $tableSlots,
        'column' => 'Modified_By',
        'definition' => 'VARCHAR(50) DEFAULT NULL',
        'after' => 'Last_Modified'
    ],
    [
        'table' => $tableManualResults,
        'column' => 'nation',
        'definition' => 'VARCHAR(10) DEFAULT NULL',
        'after' => 'bateau'
    ],
    [
        'table' => $tableManualResults,
        'column' => 'licence',
        'definition' => 'VARCHAR(50) DEFAULT NULL',
        'after' => 'nation'
    ],
    [
        'table' => $tableManualResults,
        'column' => 'source',
        'definition' => 'VARCHAR(100) DEFAULT NULL',
        'after' => 'licence'
    ],
    [
        'table' => $tableManualCompetitions,
        'column' => 'Codex',
        'definition' => 'VARCHAR(16) DEFAULT NULL',
        'after' => 'id'
    ],
];
$report = [];
function columnExists($pdo, $tableName, $columnName) {
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM `{$tableName}`");
        $columns = $stmt->fetchAll(PDO::FETCH_COLUMN, 0); 
        return in_array($columnName, $columns);
    } catch (Exception $e) {
        return false;
    }
}
function disableAutoUpdateInConfig() {
    $configFile = __DIR__ . '/config/config.php';
    if (!file_exists($configFile)) return false;
    $content = file_get_contents($configFile);
    $newContent = preg_replace("/('auto_update'\s*=>\s*)true/i", "$1false", $content);
    if ($content !== $newContent) {
        return file_put_contents($configFile, $newContent) !== false;
    }
    return true;
}
function migrateTablesCollation() {
    global $pdo, $tables, $requiredCharset, $requiredCollation, $report;
    foreach ($tables as $key => $tableName) {
        $stmt = $pdo->query("SHOW TABLES LIKE '{$tableName}'");
        if ($stmt->rowCount() > 0) {
            $stmtCollation = $pdo->prepare("
                SELECT TABLE_COLLATION 
                FROM information_schema.TABLES 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = :tableName
            ");
            $stmtCollation->execute(['tableName' => $tableName]);
            $currentCollation = $stmtCollation->fetchColumn();
            if ($currentCollation !== $requiredCollation) {
                try {
                    $sqlConvert = "ALTER TABLE `{$tableName}` CONVERT TO CHARACTER SET {$requiredCharset} COLLATE {$requiredCollation}";
                    $pdo->exec($sqlConvert);
                    $report[] = "Migration : Table '{$tableName}' convertie de '{$currentCollation}' vers '{$requiredCollation}'.";
                    if ($tableName === $tables['audit_log']) {
                        $pdo->exec("ALTER TABLE `{$tableName}` MODIFY `payload_summary` TEXT, MODIFY `old_values` TEXT, MODIFY `new_values` TEXT, MODIFY `error_message` TEXT");
                    }
                    if ($tableName === $tables['schedules']) {
                        $pdo->exec("ALTER TABLE `{$tableName}` MODIFY `Data_horaires` TEXT");
                    }
                } catch (Exception $e) {
                    $report[] = "Erreur : Impossible de convertir la table '{$tableName}' : " . $e->getMessage();
                }
            }
        }
    }
}
function indexExists($pdo, $tableName, $indexName) {
    try {
        $stmt = $pdo->query("SHOW INDEX FROM `{$tableName}` WHERE Key_name = '{$indexName}'");
        return $stmt->rowCount() > 0;
    } catch (Exception $e) {
        return false;
    }
}
try {
    foreach ($schema as $tableName => $createQuery) {
        $stmt = $pdo->query("SHOW TABLES LIKE '{$tableName}'");
        if ($stmt->rowCount() == 0) {
            $pdo->exec($createQuery);
            $report[] = "Table '{$tableName}' créée avec succès.";
        } else {
            if ($mode === 'manual') {
                $report[] = "Table '{$tableName}' existe déjà.";
            }
        }
    }
    migrateTablesCollation();
    foreach ($migrations as $migration) {
        $tableName = $migration['table'];
        $columnName = $migration['column'];
        $stmt = $pdo->query("SHOW TABLES LIKE '{$tableName}'");
        if ($stmt->rowCount() == 0) continue;
        if (!columnExists($pdo, $tableName, $columnName)) {
            $afterClause = isset($migration['after']) ? "AFTER `{$migration['after']}`" : '';
            $sql = "ALTER TABLE `{$tableName}` ADD COLUMN `{$columnName}` {$migration['definition']} {$afterClause}";
            $pdo->exec($sql);
            $report[] = "Migration : Colonne '{$columnName}' ajoutée à '{$tableName}'.";
        }
    }
    $indexMigrations = [
        [
            'table' => $tableHeats, 
            'index' => 'idx_comp_lastmod', 
            'columns' => '`Code_competition`, `Last_Modified`'
        ],
        [
            'table' => $tableSlots, 
            'index' => 'idx_comp_lastmod', 
            'columns' => '`Code_competition`, `Last_Modified`'
        ]
    ];
    foreach ($indexMigrations as $idxMigration) {
        $tableName = $idxMigration['table'];
        $indexName = $idxMigration['index'];
        $columns = $idxMigration['columns'];
        $stmt = $pdo->query("SHOW TABLES LIKE '{$tableName}'");
        if ($stmt->rowCount() > 0) {
            if (!indexExists($pdo, $tableName, $indexName)) {
                try {
                    $sql = "ALTER TABLE `{$tableName}` ADD INDEX `{$indexName}` ({$columns})";
                    $pdo->exec($sql);
                    $report[] = "Migration : Index '{$indexName}' ajouté à la table '{$tableName}'.";
                } catch (Exception $e) {
                    $report[] = "Erreur : Impossible d'ajouter l'index '{$indexName}' sur '{$tableName}' : " . $e->getMessage();
                }
            }
        }
    }
    $configUpdated = false;
    if ($mode === 'auto') {
        $configUpdated = disableAutoUpdateInConfig();
        if ($configUpdated) {
            $report[] = "Configuration mise à jour : auto_update désactivé.";
        } else {
            $report[] = "Attention : Impossible de mettre à jour config.php (permissions ?).";
        }
    }
    if ($mode === 'manual') {
        $report[] = "Vérification terminée.";
    }
    echo json_encode(['success' => true, 'report' => $report, 'mode' => $mode]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => "Erreur : " . $e->getMessage(), 'report' => $report]);
}
?>