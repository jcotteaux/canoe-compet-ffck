<?php
header('Content-Type: application/json');
function getLocalIP() {
    $ip = null;
    $os = strtoupper(substr(PHP_OS, 0, 3));
    $is_windows = ($os === 'WIN');
    if ($is_windows) {
        $output = [];
        exec("ipconfig", $output);
        foreach ($output as $line) {
            if (strpos($line, "IPv4") !== false || strpos($line, "Adresse IPv4") !== false) {
                preg_match('/\d+\.\d+\.\d+\.\d+/', $line, $matches);
                return $matches[0] ?? null;
            }
        }
    } else {
        $output = [];
        exec("hostname -I", $output);
        if (!empty($output[0])) {
            $ips = explode(' ', trim($output[0]));
            foreach ($ips as $candidate) {
                if (filter_var($candidate, FILTER_VALIDATE_IP)) {
                    return $candidate;
                }
            }
        }
        $output = [];
        exec("ifconfig", $output);
        foreach ($output as $line) {
            if (preg_match('/inet\s+(\d+\.\d+\.\d+\.\d+)/', $line, $matches)) {
                $candidate = $matches[1];
                if ($candidate != '127.0.0.1') {
                    return $candidate;
                }
            }
        }
    }
    return '127.0.0.1';
}
function getBaseUrl() {
    $uri = $_SERVER['REQUEST_URI'];
    $base_path = explode("/api", $uri)[0];
    return "$base_path";
}
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
$ip_serveur = getLocalIP();
$path = getBaseUrl();
$url_racine = "$scheme://$ip_serveur";
    echo json_encode([
        'success' => true,
        'data' => ['ip_server' => $ip_serveur,"url_racine" => $url_racine,'path' => $path]
    ]);
?>