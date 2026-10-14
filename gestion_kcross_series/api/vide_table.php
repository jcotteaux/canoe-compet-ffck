<?php
require_once __DIR__ . '/_bootstrap.php';
$allowedIPs = ['127.0.0.1', '::1'];
if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', $allowedIPs, true)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Accès restreint aux connexions locales.']);
    exit;
}
try {
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 0;");
    foreach ($tables as $table) {
        $sql = "TRUNCATE TABLE `$table`";
        $stmt = $pdo->prepare($sql);
        $stmt->execute();
    }
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1;");
    echo json_encode(['success' => true, 'message' => 'Données supprimées avec succès.']);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}