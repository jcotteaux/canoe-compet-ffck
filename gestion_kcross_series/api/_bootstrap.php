<?php
error_reporting(0); 
ini_set('display_errors', 0);
if (!defined('HEAT_EN_ATTENTE'))      define('HEAT_EN_ATTENTE', 1);
if (!defined('HEAT_PRET'))            define('HEAT_PRET', 2);
if (!defined('HEAT_INCOMPLET'))       define('HEAT_INCOMPLET', 3);
if (!defined('HEAT_PRET_A_VALIDER'))  define('HEAT_PRET_A_VALIDER', 4);
if (!defined('HEAT_OFFICIEL'))        define('HEAT_OFFICIEL', 5);
if (!defined('HEAT_EN_MODIF'))        define('HEAT_EN_MODIF', 6);
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    exit(0);
}
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
require_once __DIR__ . '/_db_connect.php';
require_once __DIR__ . '/_audit.php';
$configPath = __DIR__ . '/config/config.php';
$config = file_exists($configPath) ? require $configPath : [];
$auditLogger = new AuditLogger($pdo, $config);
