<?php
header('Content-Type: application/json');
header('Cache-Control: no-cache');
$cssDir = __DIR__ . '/../video/css/';
$styles = [];
$styles[] = [
    'file'  => 'incrustation.css',
    'label' => 'Défaut'
];
$files = glob($cssDir . 'incrustation_*.css');
if ($files) {
    sort($files); 
    foreach ($files as $filepath) {
        $filename = basename($filepath);
        if (preg_match('/incrustation_(.+)\.css$/', $filename, $matches)) {
            $label = ucfirst($matches[1]); 
            $styles[] = [
                'file'  => $filename,
                'label' => $label
            ];
        }
    }
}
echo json_encode($styles);