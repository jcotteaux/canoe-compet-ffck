<?php
require_once __DIR__ . '/_bootstrap.php';
$sql = "SELECT 
           IF((SELECT COUNT(*) FROM {$tableSettings} WHERE Code_competition = CONCAT('I', mc.id)) > 0, CONCAT('I', mc.id), CONCAT('M', mc.id)) as Code, 
           DATE_FORMAT(date_debut, '%d/%m/%Y') AS Date_debut, 
           DATE_FORMAT(date_fin, '%d/%m/%Y') AS Date_fin, 
           nom as Nom, ville as Ville, etat as Etat
        FROM {$tableManualCompetitions} mc
        ORDER BY id DESC";
$stmt = $pdo->prepare($sql);
$stmt->execute();
$competitions = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo json_encode(['success' => true, 'data' => $competitions]);
?>