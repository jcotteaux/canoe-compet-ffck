<?php
require_once __DIR__ . '/_bootstrap.php';
$response = ['success' => false];
$competitionCode = isset($_GET['competition']) ? (int)$_GET['competition'] : 0;
if ($competitionCode <= 0) {
    $response['message'] = 'Code de compétition invalide.';
    echo json_encode($response);
    exit;
}
try {
    $sql = "SELECT Code, 
                   DATE_FORMAT(Date_debut, '%d/%m/%Y') AS Date_debut, 
                   DATE_FORMAT(Date_fin, '%d/%m/%Y') AS Date_fin, 
                   Nom, Ville, Etat,Codex
            FROM Competition 
            WHERE Code = :code";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':code' => $competitionCode]);
    $competitions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (empty($competitions)) {
        $response['message'] = 'Aucune compétition trouvée.';
        echo json_encode($response);
        exit;
    }
    echo json_encode([
        'success' => true,
        'infos' => array_values($competitions)
    ]);
} catch (PDOException $e) {
    $response['message'] = 'Erreur lors de la récupération des données : ' . $e->getMessage();
    echo json_encode($response);
}