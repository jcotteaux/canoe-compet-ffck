<?php
include_once('../adv/advPage.php');

class MyPageNotationFreestyle extends advPage
{
	function Title()
	{
		?>
		<title>Notation Freestyle</title>
		<?php
	}

	function Head()
	{
		parent::Head();
		?>
		<link href="./css/notation_fs.css?v2" rel="stylesheet">

		<link rel="shortcut icon" href="./16x16_ffs.png" />
		<link rel="icon" href="./16x16_ffs.png"/>
		<?php
    }

	function Header()
	{
		?>
		<header id="header" class="page-header">
		</header>
		<?php
	}

	function Main()
	{
		?>

		<div id="navigation" class="container">
		</div>

		<div id="notation" class="container">
		</div>

		<main id="main" class="container">
		</main>

		<div id="message">
		</div>
		<?php
	}
	
	function Script()
    {
		parent::Script();
		?>
		<script src="../adv/ski.js"></script>
		<script src="./js/notation_fs.js?v4"></script>
		<script>document.addEventListener('DOMContentLoaded', function() {Init();})</script>
		<?php
	}
}

new MyPageNotationFreestyle($_GET);
?>
