<?php
// advPage : Class de Base pour la génération des pages HTML
include_once(__DIR__.'/adv.php');

define("VERSION_BOOTSTRAP_DEFAULT", "5.3.6");
define("VERSION_JQUERY_DEFAULT", "");

define("KEY_CFG", 'cfg');

class advPage
{
	protected array $m_params;					// Tableau des Paramètres constructeur
	protected array $m_paramsJs;				// Tableau des Paramètres Javascript
	protected array $m_paramsServer;			// Tableau des Paramètres Serveur
	
	protected int $m_level;						// Niveau de protection
	
	protected string $m_head_title;				// Information Balise <title>
	protected string $m_head_icon;				// shortcut icon
	protected array $m_head_css;				// Tableau des css
	
	protected string $m_version_jquery;			// Version jQuery
	protected string $m_version_bootstrap;		// Version Bootstrap

	protected bool $m_minify;					// Flag minify

	function __construct(&$params)
	{
		if (session_status() == PHP_SESSION_NONE)
			session_start();
		
		if (!isset($_SESSION['session_id']))
 			$_SESSION['session_id'] = session_id();
		
		$this->Init($params);

		if ($this->m_minify)
			ob_start(function($html) {
				return preg_replace('/\r?\n\t*/','',$html);
			});
		else
			ob_start();

		$this->Display();
		ob_flush();
    }
	
	function Init(&$params)
	{
		$this->m_params = &$params;
		$this->m_paramsJs = array();
		$this->m_paramsServer = array();

		$this->m_minify = false;
		$this->m_level = 0;

		$this->m_version_bootstrap = VERSION_BOOTSTRAP_DEFAULT;
		$this->m_version_jquery = VERSION_JQUERY_DEFAULT;

		$this->m_head_title = 'Agil';
		$this->m_head_icon = './16x16_agil.png';
		$this->m_head_css = array();

		$this->SetConfigServer();
		
		if ($this->IsParam('css'))
			$this->AddHeadCSS($this->GetParam('css'));
	}
	
	// Param ...
    function IsParam($key)
    {
		return isset($this->m_params[$key]);
    }

    function GetParam($key, $defaultValue='')
    {
        return adv::GetKey($this->m_params, $key, $defaultValue);
    }
	
    function GetParamBool($key, $defaultValue=false)
    {
        return adv::GetKeyBool($this->m_params, $key, $defaultValue);
    }
	
    function GetParamInt($key, $defaultValue=-1)
    {
        return adv::GetKeyInt($this->m_params, $key, $defaultValue);
    }

    function GetParamDouble($key, $defaultValue=0.0)
    {
        return adv::GetKeyDouble($this->m_params, $key, $defaultValue);
    }
	
	function SetConfigServer()
	{
		$key = $this->GetParam(KEY_CFG);
		if ($key != '')
		{
			$server_config = $this->GetParam('server_config');
			if ($server_config != '' && file_exists($server_config))
			{
				$jsonConfig = json_decode(file_get_contents($server_config), true);
				if (is_array($jsonConfig))
				{
					if (isset($jsonConfig[$key]) && is_array($jsonConfig[$key]))
					{
						$this->m_paramsServer = $jsonConfig[$key];

						if (isset($this->m_paramsServer['version_bootstrap']))
							$this->m_version_bootstrap = $this->m_paramsServer['version_bootstrap'];

						if (isset($this->m_paramsServer['version_jquery']))
							$this->m_version_jquery = $this->m_paramsServer['version_jquery'];

						if (isset($this->m_paramsServer['title']))
							$this->m_head_title = $this->m_paramsServer['title'];

						if (isset($this->m_paramsServer['icon']))
							$this->m_head_icon = $this->m_paramsServer['icon'];

						if (isset($this->m_paramsServer['css']))
							$this->AddHeadCSS($this->m_paramsServer['css']);
					}
				}
			}
		}
	}

	function AddParamJavascript(string $key, $value)
	{
		$this->m_paramsJs[$key] = $value;
	}

	function AddParamsJavascript(array $params)
	{
		if (!empty($params)) 
		{
			foreach ($params as $key => $value) 
				$this->AddParamJavascript($key, $value);
		}
	}

    // Affichage de la Page ...
    function Display()
    {		
        $this->Html();
		
        echo "<head>\n";
        $this->Head();
		echo "</head>\n";
		
        echo "<body>\n";
        $this->Header();
        $this->Main();
        $this->Footer();
		$this->Script();
        echo "</body>\n";

        echo "</html>";
    }
	
    function Html()
    {
		?><!DOCTYPE html><html lang="fr"><?php
    }
	
	function Head()
	{
		?>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">

		<link rel="icon" href="<?=$this->m_head_icon?>">
		<title><?=$this->m_head_title?></title>

		<?php if ($this->m_version_bootstrap != '') /* bootstrap */ {?>
		<link href="./tv_inrace_assets/js/bootstrap/v<?php echo $this->m_version_bootstrap;?>/css/bootstrap.min.css" rel="stylesheet">
		<link href="./tv_inrace_assets/js/bootstrap/v<?php echo $this->m_version_bootstrap;?>/choices/styles/choices.min.css" rel="stylesheet">
		<?php } ?>

		<?php 
		for ($i=0;$i<count($this->m_head_css);$i++) 
			self::AddCSS($this->m_head_css[$i]);
    }

	function header()
    {
    }
	
	function Main()
    {
    }

	function Footer()
	{   
	}
	
	function Script()
	{
		if ($this->m_version_bootstrap != '') 
		{
			// bootstrap ...
			self::AddScript('./tv_inrace_assets/js/bootstrap/v'.$this->m_version_bootstrap.'/js/bootstrap.min.js');
		}
	
		// adv 
		self::AddScript('./tv_inrace_assets/js/adv.js?v3');
		self::AddScript('./tv_inrace_assets/js/adv_table.js?v3');
		self::AddScript('./tv_inrace_assets/js/adv_dom.js?v3');
	}

	function AddHeadCSS($cssParams)
	{
		if (is_array($cssParams))
		{	
			for ($i=0;$i<count($cssParams);$i++)
				$this->m_head_css[] = $cssParams[$i];
		}
		else
		{
			$this->m_head_css[] = $cssParams;
		}
	}

	static function AddCSS(string $cssFile)
	{
		?><link href="<?=$cssFile?>" rel="stylesheet"><?php
	}

	static function AddScript(string $jsFile)
	{
		?><script src="<?=$jsFile?>"></script><?php
	}

	function ScriptInit()
	{
		// Ajout final JS Config Server ...
		if (isset($this->m_paramsServer['js']))
		{
			if (is_array($this->m_paramsServer['js']))
			{
				for ($i=0;$i<count($this->m_paramsServer['js']);$i++)
					self::AddScript($this->m_paramsServer['js'][$i]);
			}
			else
			{
				self::AddScript($this->m_paramsServer['js']);
			}
		}

		$jsonInit = json_encode($this->m_paramsJs);
		?><script>document.addEventListener('DOMContentLoaded', function() { Init(<?php echo $jsonInit;?>); })</script><?php
	}

	public static function Table(object $table, array $params): void
	{
		?>
		<table 
			class="<?=$table->GetDOM('table_class', 'table table-striped table-bordered table-hover table-condensed')?>" 
			id="<?=$table->GetDOM('table_id')?>"
		>
			<thead><?=static::TableHead($table, $params)?></thead>
			<tbody><?=static::TableBody($table, $params)?></tbody>
		</table>
		
		<script>
			document.addEventListener('DOMContentLoaded', () => { 
				new Tablesort(document.getElementById('<?=$table->GetDOM('table_id')?>'));
			});
		</script>
		<?php 
	}

	public static function TableHead(object $table, array $params): void
	{
		$visible_columns = $table->GetVisibleColumns();
		
		?><tr><?php 
		for ($j=0;$j<count($visible_columns);$j++)
		{
			static::TableCell($table, $visible_columns[$j], -1);
		}
		?></tr><?php 
	}

	public static function TableBody(object $table, array $params): void
	{
		$visible_columns = $table->GetVisibleColumns();
		for ($i=0;$i<$table->GetNbRows();$i++)
		{
			?><tr <?=static::TableData($table, 'tr_data', -1, $i)?>><?php
			for ($j=0;$j<count($visible_columns);$j++)
			{
				static::TableCell($table, $visible_columns[$j], $i);
			}
			?></tr><?php
		}
	}

	public static function TableCell(object $table, int $col, int $row)
	{
		if ($row < 0)
		{
			// Head
			?><th><?=$table->GetColumnLabel($col)?></th><?php
		}
		else
		{
			// Body
			$fmt = $table->GetColumnFormat($col);
			?><td><?=$table->GetCellFormat($col, $row, $fmt)?></td><?php
		}
	}

	public static function TableData(object $table, string $key, int $col=-1, int $row=-1)
	{
		$data = $table->GetDOM($key, null);
		if (is_array($data))
		{
			for ($i=0;$i<count($data);$i++)
			{
				if (is_string($data[$i]))
				{
					$code = $data[$i];
					if ($row >= 0)
					{
						if ($col >= 0)
							echo ' data-'.$code.'="'.$table->GetCell($col, $row).'" ';
						else
							echo ' data-'.$code.'="'.$table->GetCell($code, $row).'" ';
					}
					elseif ($col >= 0)
					{
						echo ' data-'.$code.'="'.$table->GetColumnName($col).'" ';
					}
				}
				elseif (is_array($data[$i]))
				{
					$key = $data[$i]['key'];
					$value = $data[$i]['value'];
					echo ' data-'.$key.'="'.$value.'" ';
				}
			}
		}
	}

	// $pagination : size, current, count, class_attr;
	public static function PaginationNav(array $pagination)
	{
		$pagination_min = $pagination['nav_min'] ?? 0;
		if ($pagination_min > $pagination['max'])
			$pagination_min = $pagination['max'];
		
		$navigation_class = $pagination['class_attr'] ?? 'pagination justify-content-center';
		?>
		<nav>
			<ul class="<?=$navigation_class?>" 
				data-pagination_max="<?=$pagination['max'];?>"
				data-pagination_size="<?=$pagination['size'];?>"
				data-pagination_current="<?=$pagination['current'];?>"
			>
				<li class="page-item <?php if ($pagination['current'] == 1) echo 'disabled';?>">
					<a class="page-link" onclick="adv.PaginationStep(this)" data-pagination_action="p"><i class="bi bi-chevron-left"></i></a>
				</li>
				<?php for ($page=1;$page<=$pagination_min;$page++) {?>
					<li class="page-item">
						<a class="page-link" onclick="adv.PaginationStep(this)" data-pagination_action="<?=$page;?>">
							<?=$page;?>
						</a>
					</li>
				<?php }?>
				
				<li class="page-item <?php if ($pagination['current'] == $pagination['max']) echo 'disabled';?>">
					<a class="page-link" onclick="adv.PaginationStep(this)" data-pagination_action="n"><i class="bi bi-chevron-right"></i></a>
				</li>
			</ul>
		</nav>
		<?php
	}
	
	public static function PaginationStep(array $params): array 
	{
		$pagination = [];
		
		$pagination['size'] = adv::GetKeyInt($params, 'pagination_size', 10);
		$pagination['current'] = adv::GetKeyInt($params, 'pagination_current', 1);
		$pagination['count'] = adv::GetKeyInt($params, 'pagination_count', -1);
		$pagination['action'] = adv::GetKey($params, 'pagination_action', '1');

		$pagination['max'] = intdiv($pagination['count'], $pagination['size']);
		if ($pagination['count'] % $pagination['size'] > 0)
			++$pagination['max'];

		if ($pagination['action'] == 'n')
			++$pagination['current'];
		elseif ($pagination['action'] == 'p')
			--$pagination['current'];
		else
			$pagination['current'] = intval($pagination['action']);

		if ($pagination['current'] > $pagination['max'])
			$pagination['current'] = $pagination['max'];
		if ($pagination['current'] <= 0)
			$pagination['current'] = 1;
		
		return $pagination;
	}

	static function DownloadPDF($pdfFile)
	{
		// Vérifie si le fichier existe
		if (file_exists($pdfFile)) 
		{
			// Définir les en-têtes HTTP pour afficher le PDF dans le navigateur
			header('Content-Description: File Transfer');

			header('Content-Type: application/pdf'); // Indique au navigateur qu'il s'agit d'un PDF
			header('Content-Disposition: inline; filename="' . basename($pdfFile) . '"'); // Affiche le PDF directement dans le navigateur
			header('Content-Transfer-Encoding: binary'); // Pour le transfert binaire du fichier
			header('Accept-Ranges: bytes'); // Permet au fichier d'être chargé par morceaux (utile pour le streaming)

			header('Expires: 0');
			header('Cache-Control: must-revalidate');
			header('Pragma: public');
			header('Content-Length: ' . filesize($pdfFile));

			// Lire le fichier et l'envoyer au navigateur
			readfile($pdfFile);
			exit;
		} 
		else 
		{
			echo "Le fichier PDF $pdfFile n'existe pas.";
		}
	}

	static function DownloadSAV($savFile)
	{
		// Vérifie si le fichier existe
		if (file_exists($savFile)) 
		{
			// Définir les en-têtes HTTP pour afficher le PDF dans le navigateur
			header('Content-Description: File Transfer');

			header('Content-Type: text/plain'); // Indique au navigateur qu'il s'agit d'un PDF
			header('Content-Disposition: inline; filename="' . basename($savFile) . '"'); // Affiche le SAV directement dans le navigateur
			header('Content-Transfer-Encoding: binary'); // Pour le transfert binaire du fichier
			header('Accept-Ranges: bytes'); // Permet au fichier d'être chargé par morceaux (utile pour le streaming)

			header('Expires: 0');
			header('Cache-Control: must-revalidate');
			header('Pragma: public');
			header('Content-Length: ' . filesize($savFile));

			// Lire le fichier et l'envoyer au navigateur
			readfile($savFile);
			exit;
		} 
		else 
		{
			echo "Le fichier SAV $savFile n'existe pas.";
		}
	}
}
?>