<?php
require_once __DIR__ . '/_bootstrap.php';
echo json_encode([
    'success' => true,
    'serverTime' => round(microtime(true) * 1000), 
    'serverTimeISO' => date('c')
]);
