<?php
define("VERSION_BOOTSTRAP", "5.3.3");
?>

<!DOCTYPE HTML>
<html lang="fr">
	<head>
		<title>Pénalité Biathlon</title>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		
		<link href="../bootstrap/v<?php echo VERSION_BOOTSTRAP;?>/css/bootstrap.min.css" rel="stylesheet">
		<link href="../bootstrap/v<?php echo VERSION_BOOTSTRAP;?>/choices/styles/choices.min.css" rel="stylesheet">
		
		<link href="./css/pena_biathlon.css?v2" rel="stylesheet">
		
		<link rel="shortcut icon" href="./16x16_ffs.png" />
		<link rel="icon" href="./16x16_ffs.png"/>
	</head>

	<body>
		<header id="header" class="page-header">
			<h3 id="title">&nbsp;</h3>
			<h4 id="sub_title">&nbsp;</h4>
		</header>

		<main id="main" class="container">
		</main>
		
		<div id="message">
		</div>

		<footer>
		</footer>
		
		<script src="../bootstrap/v<?php echo VERSION_BOOTSTRAP;?>/js/bootstrap.min.js"></script>
		<script src="../bootstrap/v<?php echo VERSION_BOOTSTRAP;?>/choices/scripts/choices.min.js"></script>

		<script src="../adv/ws.js"></script>
		<script src="../adv/ws_params.js"></script>
		<script src="../adv/adv.js"></script>
		<script src="../adv/adv_table.js"></script>
		<script src="../adv/ski.js"></script>
		
		<script src="./js/pena_biathlon.js?v2"></script>
		
		<script>document.addEventListener('DOMContentLoaded', function() {Init();})</script>
	</body>
</html>
