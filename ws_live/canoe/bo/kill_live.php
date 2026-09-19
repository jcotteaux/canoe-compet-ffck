<?php
header('Content-Type: application/json');

$port = 8080;
if (isset($_GET['port']))
	$port = intval($_GET['port']);

if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') 
{
	// Windows 
	echo json_encode(array("success" => true, "os" => PHP_OS));
}
else
{
	// Linux
	$who =exec('whoami');
	
	$port_socket = $port+2;

	$cmd = "/var/www/html/ws/bo/kill_live $port $port_socket";
	shell_exec($cmd);

	echo json_encode(array("success" => true, "os" => PHP_OS, "cmd" => $cmd, "who" => $who));
}
?>