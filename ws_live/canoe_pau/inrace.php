<?php
	$iframe = '';
	if (isset($_GET['iframe']))
		$iframe = $_GET['iframe'];
?>

<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>inrace</title>

	<link rel="shortcut icon" href="./16x16_ffck.png" />
	<link rel="icon" href="./16x16_ffck.png"/>
	
	<link href="./css/head.css?v1" rel="stylesheet">
	<link href="./css/inrace.css?v1" rel="stylesheet">
	
	<?php 
	if ($iframe == '1') {
	?>
		<link href="./css/iframe.css" rel="stylesheet" />
	<?php 
	}?>

</head>
<body> 
	<div id="block_running">
		<div class="bib"></div>
		<div class="identity"></div>
		<div class="nation"></div>

		<div class="pena"></div>
	
		<div class="rank"></div>
		<div class="time"></div>
		<div class="diff"></div>
	<div>

	<script src="./bootstrap-5.0.1/js/bootstrap.min.js"></script>
	<script src="./adv/ws.js"></script>
	<script src="./adv/adv.js"></script>
	<script src="./adv/canoe.js"></script>
	
	<script src="./js/ws_params.js"></script>
	<script src="./js/inrace.js"></script>
	
	<script>document.addEventListener('DOMContentLoaded', function() {Init();})</script>
</body>
</html>
