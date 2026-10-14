<?php
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST");
$competition = isset($_GET['competition']) ? preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['competition']) : '';
if (empty($competition)) {
    echo json_encode(['success' => false, 'message' => 'Code compétition manquant']);
    exit;
}
$stateFile = "../data/overlay_state_" . $competition . ".json";
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $inputJSON = file_get_contents('php://input');
    $data = json_decode($inputJSON, true);
    if (isset($data['action']) && $data['action'] === 'DELETE') {
        if (file_exists($stateFile)) {
             @unlink($stateFile); 
        }
        echo json_encode(['success' => true]);
        exit;
    }
    if (!is_dir('../data')) {
        @mkdir('../data', 0777, true);
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
    if ($content !== null) {
        echo $content;
    } else {
        echo json_encode([
            'success' => true, 
            'mode' => 'HIDDEN', 
            'title' => '',
            'slots' => []
        ]);
    }
}
?>