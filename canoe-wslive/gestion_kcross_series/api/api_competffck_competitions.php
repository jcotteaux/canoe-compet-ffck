<?php
require_once __DIR__ . '/_bootstrap.php';
try {
    $sql = "SELECT Code, 
                   DATE_FORMAT(Date_debut, '%d/%m/%Y') AS Date_debut, 
                   DATE_FORMAT(Date_fin, '%d/%m/%Y') AS Date_fin, 
                   Nom, Ville,Etat,Codex
            FROM Competition 
            WHERE Code_activite = 'EXS' 
            ORDER BY Code ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $competitions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($competitions);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Erreur de base de données : ' . $e->getMessage()]);
}
?>