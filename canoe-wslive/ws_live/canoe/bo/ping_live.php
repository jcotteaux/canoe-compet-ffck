<?php
header('Content-Type: application/json');

function readIP($ipAddress, $portNumber, &$msg)
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
		 $errorCode = socket_last_error($socket);
		 $msg = "socket_select a échoué : Raison " . socket_strerror(socket_last_error());
		 return false;
	} 

	$jsonData = '';
	for (;;)
	{
		$read = socket_read($socket, 1024);
		if ($read != '')
			$jsonData .= $read;
		else
			break;
	}

	if ($jsonData == '')
	{
		 $errorCode = socket_last_error($socket);
		 $msg = "socket_read vide : Raison " . socket_strerror(socket_last_error());
		 return false;
	}
	
	if (substr($jsonData,-1) != "}")
	{
		// On enlève le code ASCII 0 = endPacket si il existe ...
		$msg = substr($jsonData,0, -1);
	}
	else
	{
		$msg = $jsonData;
	}
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

$msg = '';
if (readIP($ipAddress, $port, $msg))
{
	$json = json_decode($msg);
	echo json_encode(array("success" => true, "json" => json_encode($json)));
}
else
	echo json_encode(array('error' => 1, 'msg' => $msg));
	echo json_encode(array("success" => false, "error" => $msg));
?>