<?php
include_once('base.php');
define("VERSION", "Version 1.03");
define("VERSION_BOOTSTRAP", "-3.2.5");

// Classe de Base pour toutes les Pages ...
class MyPage
{
	var $m_arrayParams;		// Tableau des Paramètres
	var $m_level;			// Niveau de protection
	var $m_menu;			// Tableau associatif Informations Menu
	var $m_directory;		// Repertoire principal
	
	// Constructeur ...
	function __construct(&$arrayParams)
	{
		session_start();
		$_SESSION['context_menu'] = 'PUBLIC' ; 

		if (strstr($_SERVER['DOCUMENT_ROOT'],'devWEB') == false)
			$this->m_directory = '';					// Production
		else
			$this->m_directory = '/inscription_ffs';	// Dev Local
	
		$this->m_arrayParams = &$arrayParams;
		$this->m_level = 0;

		$this->Display();
    }
	
    // GetParam ...
    function GetParam($key, $defaultValue='')
    {
        return utyGetString($this->m_arrayParams, $key, $defaultValue);
    }
	
    function GetParamBool($key, $defaultValue=false)
    {
        return utyGetBool($this->m_arrayParams, $key, $defaultValue);
    }
	
    function GetParamInt($key, $defaultValue=-1)
    {
        return utyGetInt($this->m_arrayParams, $key, $defaultValue);
    }

    function GetParamDouble($key, $defaultValue=0.0)
    {
        return utyGetDouble($this->m_arrayParams, $key, $defaultValue);
    }

    function IsDiplay()
    {
        return $this->GetParamBool('display', true);
    }

    // Affichage Classique de la Page ...
    function Display()
    {		
        // Affichage Classique ...
        $this->Html();
        $this->Head();
			
        echo "<body>\n";
        $this->Body();
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
		<head>
		
		<meta charset="utf-8">
		<meta http-equiv="X-UA-Compatible" content="IE=edge">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<meta name="description" content="Agil Informatique - Agil Electronic">
		<meta name="Keywords" content="agil, ffski, ffcanoe, classcimes, chrono, puce, ski, esf, ffs, ffck, ffme" />
		<meta name="author" content="Agil Informatique">
		<meta name="rating" content="general">
		<meta name="Robots" content="all">
		<link rel="icon" href="./favicon.ico">

		<?php $this->HeadTitle(); ?>
		
		<!-- Bootstrap core CSS bootstrap.min_cerulean 1) ou _slate 2) -->
		<link href="<?php echo '/bootstrap'.VERSION_BOOTSTRAP;?>/css/bootstrap.min_cerulean.css" rel="stylesheet"/>
		<link href="<?php echo '/bootstrap'.VERSION_BOOTSTRAP;?>/datepicker/css/datepicker3.css" rel="stylesheet"/>

		<link href="<?php echo '/bootstrap'.VERSION_BOOTSTRAP;?>/select2/select2.css" rel="stylesheet"/>
		<link href="<?php echo '/bootstrap'.VERSION_BOOTSTRAP;?>/select2/select2-bootstrap.css" rel="stylesheet"/>

		<link href="<?php echo '/bootstrap'.VERSION_BOOTSTRAP;?>/bootstrapvalidator/css/bootstrapValidator.min.css" rel="stylesheet"/>

		<!-- Global -->
		<link href="<?php echo $this->m_directory;?>/css/global.css" rel="stylesheet">

		</head>
		<?php
    }

	function HeadTitle()
	{
		?><title>INSCRIPTION F.F.S.</title><?php
	}
	
	function Body()
	{   
		$this->Menu();
		?>
		<div class="container-fluid">
		<?php
			$this->Header();
			$this->Content();
		?>
		</div>
		<?php
		// div container end ...
		$this->ModalWaitProgress();
		$this->Footer();
		$this->Script();
	 }

	 // Header ...
	function Header()
	{
	}
	
	function ModalWaitProgress()
	{
	?>
		<div class="modal" id="modal_wait_progress" tabindex="-1" role="dialog" aria-labelledby="modal_wait_progress" aria-hidden="true">
			<div class="modal-dialog modal-sm">
				<div class="modal-content">
				<div class="modal-header">
					<h3>Patientez...</h3>
				</div>
				<div class="modal-body">
					<div class="progress progress-striped active">
					<div class="progress-bar progress-bar-striped active" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100" style="width: 100%">
					</div>
					</div>
				</div>
				</div>
			</div>
		</div>
	<?php
	}

    // GetUserName
    static public function GetUserName()
    {
        if (!isset($_SESSION['user_bo'])) return '';
        if (!isset($_SESSION['user_bo']['name'])) return '';
        return $_SESSION['user_bo']['name'];
    }
	
    // GetUserProfile
    static public function GetUserProfile()
    {
        if (!isset($_SESSION['user_bo'])) return '';
        if (!isset($_SESSION['user_bo']['profile'])) return '';
        return $_SESSION['user_bo']['profile'];
    }

    // GetUserLevel
    static public function GetUserLevel()
    {
        if (!isset($_SESSION['user_bo'])) return 0;
        if (!isset($_SESSION['user_bo']['name'])) return 0;
        if (!isset($_SESSION['user_bo']['level'])) return 0;
        return $_SESSION['user_bo']['level']; 	
    }
	
    // GetContextMenu
    static public function GetContextMenu()
    {
        if (!isset($_SESSION['context_menu'])) return 'PUB';
        return $_SESSION['context_menu'];
    }

    // Menu ...
    function Menu()
    {
        $menu = &$this->m_menu;
        $level = $this->GetUserLevel();
    }

    // Section Content ...
    function Content()
    {
    }
	
	public static function GetInfoLogin()
	{
		$login = utyGetSession('ffs_login');
		if ($login == '') return '';
		
		$group = utyGetSession('ffs_group');
		if ($group == 'FFS') return $login.' (FFS)';

		return $login.' ('.utyGetSession('ffs_access').')';
	}
	
    // Section Footer ...
    function Footer()
    {
		?>		
		<footer id="footer" class="top-space">

		<div class="footer1">
			<div class="container">
				<div class="row">
					
					<div class="col-md-3 widget">
						<h3 class="widget-title">Contact</h3>
						<div class="widget-body">
							<p>(+33) 4 50 51 40 34<br>
								<a href="mailto:#">inscriptioncourse@ffs.fr</a><br>
								<br>
								50 Rue des Marquisats, 74000 ANNECY
							</p>	
						</div>
					</div>
					
					<div class="col-md-3 widget">
						<h3 class="widget-title">Identification</h3>
						<div class="widget-body">
							<p><?php echo MyPage::GetInfoLogin();?></p>
						</div>
					</div>
				</div> <!-- /row of widgets -->
			</div>
		</div>

		<div class="footer2">
			<div class="container">
				<div class="row">
					
					<div class="col-md-6 widget">
						<div class="widget-body">
							<p class="simplenav">
								<a href="#">Accueil</a> | 
								<a href="#">A Propos de</a>
							</p>
						</div>
					</div>

					<div class="col-md-6 widget">
						<div class="widget-body">
							<p class="text-right">
								Copyright &copy; 2020, F.F.S. - Agil Informatique.
							</p>
						</div>
					</div>

				</div> <!-- /row of widgets -->
			</div>
		</div>
	</footer>	
	<?php
    }

    function Script()
    {
    ?>
		<script type="text/javascript" src="<?php echo '/bootstrap'.VERSION_BOOTSTRAP;?>/js/jquery.js"></script>
		<script type="text/javascript" src="<?php echo '/bootstrap'.VERSION_BOOTSTRAP;?>/js/bootstrap.min.js"></script>

		<script type="text/javascript" src="<?php echo '/bootstrap'.VERSION_BOOTSTRAP;?>/js/bootbox.min.js"></script>
		
		<script type="text/javascript" src="<?php echo '/bootstrap'.VERSION_BOOTSTRAP;?>/datepicker/js/bootstrap-datepicker.js"></script>
		<script type="text/javascript" src="<?php echo '/bootstrap'.VERSION_BOOTSTRAP;?>/datepicker/js/locales/bootstrap-datepicker.fr.js" charset="UTF-8"></script>

		<script type="text/javascript" src="<?php echo '/bootstrap'.VERSION_BOOTSTRAP;?>/select2/select2.js"></script>
		<script type="text/javascript" src="<?php echo '/bootstrap'.VERSION_BOOTSTRAP;?>/select2/select2_locale_fr.js"></script>

		<script type="text/javascript" src="<?php echo '/bootstrap'.VERSION_BOOTSTRAP;?>/bootstrapvalidator/js/bootstrapValidator.min.js"></script>
		<script type="text/javascript" src="<?php echo '/bootstrap'.VERSION_BOOTSTRAP;?>/bootstrapvalidator/js/language/fr_FR.js"></script>

		<script type="text/javascript" src="<?php echo $this->m_directory;?>/js/wait_progress.js" ></script>
		<script type="text/javascript" src="<?php echo $this->m_directory;?>/js/messagebox.js" ></script>

	<?php
	}
}

?>

