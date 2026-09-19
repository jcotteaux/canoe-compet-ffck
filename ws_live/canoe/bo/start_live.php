<?php
header('Content-Type: application/json');

if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') 
{
	// Windows 
	echo json_encode(array("success" => true, "os" => PHP_OS));
}
else
{
	// Linux
	$cmd = "/var/www/html/ws/bo/start_live > /dev/null 2>&1 &";
	exec($cmd);

	echo json_encode(array("success" => true, "os" => PHP_OS, "cmd" => $cmd));
}
?>
