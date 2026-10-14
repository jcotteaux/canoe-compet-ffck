<?php
$prefix_manual = 'KCross_Manual_';
$tableManualCompetitions = $prefix_manual . 'Competitions';
$tableManualResults = $prefix_manual . 'Results';
$prefix = 'KCross_';
$tableSettings  = $prefix . 'Competitions';
$tableCategories = $prefix . 'Competition_Categories';
$tableSchedules  = $prefix . 'Competition_Horaires';
$tableHeats      = $prefix . 'Series';
$tableSlots      = $prefix . 'Slots_Serie';
$tableRanking    = $prefix . 'Competitions_Classement';
$tableAuditLog   = $prefix . 'Audit_Log';
$tables = [
    'settings'    => $tableSettings,
    'categories'  => $tableCategories,
    'schedules'   => $tableSchedules,
    'heats'       => $tableHeats,
    'slots'       => $tableSlots,
    'ranking'       => $tableRanking,
    'manual_competitions' => $tableManualCompetitions,
    'manual_results'      => $tableManualResults,
    'audit_log'      => $tableAuditLog,
];
function getDbConnection() {
    static $pdo = null;
    if ($pdo === null) {
        $configPath = __DIR__ . '/config/config.php'; 
        if (!file_exists($configPath)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Erreur critique: Fichier de configuration introuvable.']);
            exit;
        }
        $config = require $configPath;
        $host     = $config['database']['host'];
        $dbname   = $config['database']['dbname'];
        $username = $config['database']['username'];
        $password = $config['database']['password'];
        $charset  = $config['database']['charset'] ?? 'utf8mb4';
        $port  = $config['database']['port'] ?? '3306';
        try {
            $dsn = "mysql:host=$host;dbname=$dbname;charset=$charset;port=$port";
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ];
            $pdo = new PDO($dsn, $username, $password, $options);    
        } catch(PDOException $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Erreur de connexion à la base de données.']);
            exit;
        }
    }
    return $pdo;
}
$pdo = getDbConnection();