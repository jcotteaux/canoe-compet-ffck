<?php
include_once('adv.php');

define("VERSION_BOOTSTRAP", "5.3.3");
define("VERSION_JQUERY", "");

// Classe de Base pour toutes les Pages ...
class advPage
{
	var $m_arrayParams;				// Tableau des Paramètres constructeur
	var $m_arrayJavascriptParams;	// Tableau des Paramètres Javascript
	var $m_level;					// Niveau de protection
	
	var $m_head_title;				// Information Balise <title>
	var $m_head_icon;				// shortcut icon
	var $m_head_css;				// Table link css
	
	var $m_jquery_version;			// Version jQuery
	var $m_bootstrap_version;		// Version Bootstrap
	
	function __construct(&$arrayParams)
	{
		session_start();
		$this->Init($arrayParams);
		$this->Display();
    }
	
	function Init(&$arrayParams)
	{
		$this->m_arrayParams = &$arrayParams;

		$this->m_head_title = 'Agil';
		$this->m_head_icon = './16x16_agil.png';
		$this->m_head_css = array();
		
		$this->m_arrayJavascriptParams = array();
		
		$this->m_level = 0;
	
		$this->m_bootstrap_version = VERSION_BOOTSTRAP;
		$this->m_jquery_version = VERSION_JQUERY;

		$_SESSION['context_menu'] = 'PUBLIC' ; 
	}
	
    // GetParam ...
    function GetParam($key, $defaultValue='')
    {
        return adv::GetString($this->m_arrayParams, $key, $defaultValue);
    }
	
    function GetParamBool($key, $defaultValue=false)
    {
        return adv::GetBool($this->m_arrayParams, $key, $defaultValue);
    }
	
    function GetParamInt($key, $defaultValue=-1)
    {
        return adv::GetInt($this->m_arrayParams, $key, $defaultValue);
    }

    function GetParamDouble($key, $defaultValue=0.0)
    {
        return adv::GetDouble($this->m_arrayParams, $key, $defaultValue);
    }
	
    static public function GetUserName()
    {
        if (!isset($_SESSION['user_bo'])) return '';
        if (!isset($_SESSION['user_bo']['name'])) return '';
        return $_SESSION['user_bo']['name'];
    }
	
    static public function GetUserProfile()
    {
        if (!isset($_SESSION['user_bo'])) return '';
        if (!isset($_SESSION['user_bo']['profile'])) return '';
        return $_SESSION['user_bo']['profile'];
    }

    static public function GetUserLevel()
    {
        if (!isset($_SESSION['user_bo'])) return 0;
        if (!isset($_SESSION['user_bo']['name'])) return 0;
        if (!isset($_SESSION['user_bo']['level'])) return 0;
        return $_SESSION['user_bo']['level']; 	
    }
	
    static public function GetContextMenu()
    {
        if (!isset($_SESSION['context_menu'])) return 'PUB';
        return $_SESSION['context_menu'];
    }
	
	function AddJavascriptParam($key, $value)
	{
		$this->m_arrayJavascriptParams[$key] = $value;
	}
	
	function GetJavascriptParam($key, $defaultValue='')
	{
		if (isset($this->m_arrayJavascriptParams[$key]))
			return $this->m_arrayJavascriptParams[$key];
		else
			return $defaultValue;
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
    ?>
        <!DOCTYPE html>
		<html lang="fr">
    <?php
    }
	
	function Head()
	{
		?>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		
		<?php if ($this->m_bootstrap_version != '') {?>
		<link href="../bootstrap/v<?php echo $this->m_bootstrap_version;?>/css/bootstrap.min.css" rel="stylesheet">
		<link href="../bootstrap/v<?php echo $this->m_bootstrap_version;?>/choices/styles/choices.min.css" rel="stylesheet">
		<?php } ?>
		
		<?php for ($i=0;$i<count($this->m_head_css);$i++) {?>
			<link href="<?php echo $this->m_head_css[$i];?>" rel="stylesheet">
		<?php } ?>
		
		<link rel="shortcut icon" href="<?php echo $this->m_head_icon;?>">
		<link rel="icon" href="<?php echo $this->m_head_icon;?>">
		
		<title><?php echo $this->m_head_title;?></title>
		<?php
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
		?>
		<script src="../bootstrap/v<?php echo $this->m_bootstrap_version;?>/js/bootstrap.min.js"></script>
		<script src="../bootstrap/v<?php echo  $this->m_bootstrap_version;?>/choices/scripts/choices.min.js"></script>
		
		<script src="../adv/ws.js"></script>
		<script src="../adv/ws_params.js"></script>
		<script src="../adv/adv.js"></script>
		<?php
	}
	
	function ScriptInit($arrayJavascriptParams=null)
	{
		if (is_null($arrayJavascriptParams)) 
			$jsonInit = json_encode($this->m_arrayJavascriptParams);
		else
			$jsonInit = json_encode($arrayJavascriptParams);
		?>
		<script>document.addEventListener('DOMContentLoaded', Init(<?php echo $jsonInit;?>))</script>
		<?php
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