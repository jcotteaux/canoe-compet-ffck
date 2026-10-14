<?php
require_once __DIR__ . '/_bootstrap.php';
$response = [
    'tables_exist' => false,
    'error' => null
];
try {
    $stmt = $pdo->query('SHOW TABLES');
    $existingTables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    $requiredTables = array_values($tables);
    $allTablesExist = true;
    foreach ($requiredTables as $requiredTable) {
        if (!in_array($requiredTable, $existingTables)) {
            $allTablesExist = false;
            break; 
        }
    }
    $response['tables_exist'] = $allTablesExist;
} catch (PDOException $e) {
    http_response_code(500); 
    $response['error'] = 'Erreur lors de la vérification des tables: ' . $e->getMessage();
}
 echo json_encode($response);
?>