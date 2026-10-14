<?php
return [
    'database' => [
        'host'     => 'localhost',
        'dbname'   => 'base_ffck',
        'username' => 'root',
        'password' => '',
        'port' => '3306',
        'charset'  => 'utf8mb4', 
        'auto_update' => false,    
    ],
    'audit' => [
        'enabled' => true,           
        'level'   => 'standard',     
        'retention_days' => 20       
    ],
    'judging' => [
        'juge_start' => true, 
    ],
    'live_web' => [
        'fonction_live_enabled' => true, 
        'mode' => 'Live', 
        'server_url' => 'https://livecompet.ffck.org/live_kcross/',
        'secret_key' => '' 
    ],
];
?>