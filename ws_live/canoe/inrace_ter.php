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
	<link href="./css/inrace_ter.css?v3" rel="stylesheet">
	
	<?php 
	if ($iframe == '1') {
	?>
		<link href="./css/iframe.css" rel="stylesheet" />
	<?php 
	}?>

	<style>
		.running-panel .rank[data-inter] {
			font-size: 32px;
		}
			.running-panel .time.next-start {
			left: 0;
			width: 100%;
			font-size: 28px;
			color: #69F0AE;
		}
	</style>
</head>
<body>
	<div id="block_running" class="running-panel">
		<div class="bib"></div>
		<div class="identity"></div>
		<div class="nation"></div>
		<div class="pena"></div>
		<div class="rank"></div>
		<div class="time"></div>
		<div class="diff"></div>
	</div>

	<div id="block_running_copy" class="running-panel" aria-hidden="true">
		<div class="bib"></div>
		<div class="identity"></div>
		<div class="nation"></div>
		<div class="pena"></div>
		<div class="rank"></div>
		<div class="time"></div>
		<div class="diff"></div>
	</div>

	<script src="../bootstrap-5.0.1/js/bootstrap.min.js"></script>
	<script src="../adv/ws_params.js"></script>
	<script src="../adv/ws.js"></script>
	<script src="../adv/adv.js"></script>
	<script src="../adv/adv_table.js"></script>
	<script src="../adv/canoe.js"></script>
	<script src="./js/inrace_ter.js?v=20261014-chrono4"></script>
	
	<script>
		// Afficher le passage dans la case de classement pendant un intermediaire.
		(function() {
			let currentPassage = null;
			const originalBroadcastInter = DoBroadcastBibTimeInter;
			const originalShowInter = ShowRunningInter;

			DoBroadcastBibTimeInter = function(objJSON, passage) {
				const previousPassage = currentPassage;
				currentPassage = Number(passage);
				try {
					return originalBroadcastInter.apply(this, arguments);
				} finally {
					currentPassage = previousPassage;
				}
			};

			ShowRunningInter = function() {
				const result = originalShowInter.apply(this, arguments);
				const rank = document.querySelector('#block_running .rank');
				if (rank && Number.isInteger(currentPassage) && currentPassage >= 1 && currentPassage <= 3) {
					rank.textContent = 'Inter ' + currentPassage;
					rank.setAttribute('data-inter', String(currentPassage));
					rank.style.display = 'flex';
				}
				return result;
			};

			// Retirer le style de l'intermediaire a la reprise ou a l'arrivee.
			['HideRunningInter', 'ShowRunningFinish', 'ShowRunning', 'ClearRunning'].forEach(function(name) {
				const original = window[name];
				window[name] = function() {
					const rank = document.querySelector('#block_running .rank');
					if (rank) {
						rank.removeAttribute('data-inter');
					}
					return original.apply(this, arguments);
				};
			});
		})();

		function syncRunningBlocks() {
			const original = document.getElementById('block_running');
			const copy = document.getElementById('block_running_copy');

			if (!original || !copy) {
				return;
			}

			const classNames = ['bib', 'identity', 'nation', 'pena', 'rank', 'time', 'diff'];
			classNames.forEach(function(className) {
				const source = original.querySelector('.' + className);
				const target = copy.querySelector('.' + className);

				if (!source || !target) {
					return;
				}

				target.className = source.className;
				target.innerHTML = source.innerHTML;

				if (source.hasAttribute('data-inter')) {
					target.setAttribute('data-inter', source.getAttribute('data-inter'));
				} else {
					target.removeAttribute('data-inter');
				}

				if (source.hasAttribute('style')) {
					target.setAttribute('style', source.getAttribute('style'));
				} else {
					target.removeAttribute('style');
				}
			});
		}

		function initMirrorObserver() {
			const original = document.getElementById('block_running');
			if (!original) {
				return;
			}

			syncRunningBlocks();

			const observer = new MutationObserver(function() {
				syncRunningBlocks();
			});

			observer.observe(original, {
				attributes: true,
				attributeFilter: ['class', 'style', 'data-pen', 'data-inter'],
				childList: true,
				characterData: true,
				subtree: true
			});
		}

		document.addEventListener('DOMContentLoaded', function() {
			Init();
			initMirrorObserver();
			window.setTimeout(syncRunningBlocks, 0);
			window.setTimeout(syncRunningBlocks, 100);
		});
	</script>
</body>
</html>
