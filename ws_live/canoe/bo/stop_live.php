<?php
header('Content-Type: application/json');

function sendIP($ipAddress, $portNumber, &$cmd, &$msg)
{
	if (($socket = @socket_create(AF_INET, SOCK_STREAM, SOL_TCP)) === false) 
	{
		$msg = "socket_create() a échoué : Raison : " . socket_strerror(socket_last_error());
		return false;
	}
	
	socket_set_nonblock($socket);
	socket_connect($socket, $ipAddress, $portNumber);

	$read = array($socket);
	$write = $except = array();
	$sec = 1;
	$usec = 0;
	
	if (!socket_select($read, $write, $except, $sec, $usec)) 
	{
		 $msg = "socket_select a échoué : Raison " . socket_strerror(socket_last_error($socket));
		 return false;
	}

	for (;;)
	{
		$read = socket_read($socket, 1024);
		if ($read == '')
			break;
	}

	socket_set_block($socket);
	
	// Ajout du code ASCII 0 pour la fin de Trame = endPacket
	$cmd .= chr(0);

	$count = socket_write($socket, $cmd, strlen($cmd)+1);
	if ($count === false)
	{
 		$msg = "socket_write a échoué : Raison " . socket_strerror(socket_last_error($socket));
 		return false;
	}
	
	$msg = $count;
	return true;
}

$port = 8082;
if (isset($_GET['port']))
	$port = intval($_GET['port'])+2;

$ipAddress = '127.0.0.1';
if (isset($_GET['url']))
{
	$url = $_GET['url'];
	if (substr($url,0,6) == 'wss://')
		$ipAddress = substr($url,6);
	elseif (substr($url,0,5) == 'ws://')
		$ipAddress = substr($url,5);
}
elseif (isset($_GET['ip']))
{
	$ipAddress = $_GET['ip'];
}

$cmd = json_encode(array("key" => "<stop>", "pwd" => "agil"));
$msg = '';
if (sendIP($ipAddress, $port, $cmd, $msg))
{
	echo json_encode(array("success" => true, "count" => $msg));
}
else
	echo json_encode(array("success" => false, "error" => $msg));
?>