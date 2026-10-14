<?php
require_once __DIR__ . '/_bootstrap.php';
$competition = isset($_GET['competition']) ? preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['competition']) : '';
if (empty($competition)) {
    echo json_encode(['success' => false, 'message' => 'Code compétition manquant']);
    exit;
}
$stmtCheck = $pdo->prepare("SELECT COUNT(*) FROM {$tableSettings} WHERE Code_competition = ?");
$stmtCheck->execute([$competition]);
if ((int)$stmtCheck->fetchColumn() === 0) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Accès refusé : Compétition non configurée.']);
    exit;
}
$stateFile = "../data/display_state_" . $competition . ".json";
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $inputJSON = file_get_contents('php://input');
    if (!is_dir('../data')) {
        mkdir('../data', 0777, true);
    }
    $success = false;
    $fp = @fopen($stateFile, 'c'); 
    if ($fp) {
        if (flock($fp, LOCK_EX)) { 
            ftruncate($fp, 0);     
            fwrite($fp, $inputJSON);
            fflush($fp);           
            flock($fp, LOCK_UN);   
            $success = true;
        }
        fclose($fp);
    }
    if ($success) {
        echo json_encode(['success' => true]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => "Erreur d'écriture sur le disque (conflit de verrou)."]);
    }
} else {
    $content = null;
    if (file_exists($stateFile)) {
        $fp = @fopen($stateFile, 'r');
        if ($fp) {
            if (flock($fp, LOCK_SH)) { 
                $content = stream_get_contents($fp);
                flock($fp, LOCK_UN);   
            }
            fclose($fp);
        }
    }
    if ($content !== null && $content !== '') {
        echo $content; 
    } else {
        echo json_encode(['success' => true, 'state' => null]);
    }
}
?>