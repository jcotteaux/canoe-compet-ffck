<?php
require_once __DIR__ . '/_bootstrap.php';
$payload = json_decode(file_get_contents('php://input'), true);
$enabled = isset($payload['enabled']) ? (bool)$payload['enabled'] : true;
try {
    $configFile = __DIR__ . '/config/config.php';
    if (!file_exists($configFile)) throw new Exception("Fichier config non trouvé.");
    $content = file_get_contents($configFile);
    $newContent = preg_replace(
        "/('audit'\s*=>\s*\[[^\]]*'enabled'\s*=>\s*)(true|false)/i",
        "$1" . ($enabled ? 'true' : 'false'),
        $content
    );
    if (file_put_contents($configFile, $newContent) !== false) {
        echo json_encode(['success' => true, 'enabled' => $enabled]);
    } else {
        throw new Exception("Erreur d'écriture dans le fichier config.");
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}