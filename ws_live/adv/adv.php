<?php

class adv
{
	static function GetTxtSize($size)
	{
		$size = (int) $size;
		if ($size < 1024)
		{
			$size .= 'o';
			return $size;		
		}

		$size /= 1024;
		$size = (int) $taille;

		if ($size < 1024)
			$size .= 'Ko';
		else
		{
			$size = (int) ($taille/1024);
			$size .= 'Mo';
		}

		return $size;
	}

	static function IsMailOk($email)
	{
		if (filter_var($email, FILTER_VALIDATE_EMAIL))
			return true;
		else
			return false;
	}

	// Transformation Date Us : YYYY-MM-DD en Date Fr Long : dddd DD mmmm YYYY
	static function DateUsToFrLong($dateUs, $separator = "-")
	{
		$tab_dmy = explode($separator, $dateUs);
		$prefix = "";
		$tab_month = array(0, "janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre");
		$tab_day = array("dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi");
		settype($tab_dmy[1], integer);
		$day = date("w", mktime(0, 0, 0, $tab_dmy[1], $tab_dmy[2], $tab_dmy[0]));
		
		$frDate .= $prefix . $tab_day[$day] . " " . $tab_dmy[2] . " ";
		$frDate .= $tab_month[$tab_dmy[1]] . " " . $tab_dmy[0] . " ";
		return $frDate;
	}

	// Transformation Date Us : YYYY-MM-DD en Date Fr : DD/MM/YYYY
	static function DateUsToFr($dateUs, $separator = "-")
	{
		$hms = '';
		if (strlen($dateUs) > 10) 
		{
			$time = substr($dateUs,10);
			$dateUs = substr($dateUs,0,10);
			
			if ($bHour)
				$hms .= ' '.substr($time,1, 2);
			
			if ($bMinute)
				$hms .= 'h'.substr($time,4, 2);

			if ($bSecond)
				$hms .= '.'.substr($time,7, 2);
		}

		$data = explode($separaror,$dateUs);
		if (count($data) == 3)
			return $data[2].'/'.$data[1].'/'.$data[0].$hms;

		return $dateUs;
	}

	// Transformation Date Fr : DD/MM/YYYY en Date Us : YYYY-MM-DD
	static function DateFrToUs($dateUs, $separator = "-")
	{
		$data = explode($separaror,$dateFr);
		if (count($data) == 3)
			return $data[2].'-'.$data[1].'-'.$data[0];

		return $dateFr; 
	}

	static function YearOfDate($dateUs)
	{
		$data = explode('-',$dateUs);
		if (count($data) == 3)
			return (int) $data[0];

		return 0;
	}

	static function DateCmpFr($date1, $date2)
	{
		$data1 = explode('/',$date1);
		$data2 = explode('/',$date2);

		// Comparaison Annee
		if ( (int) $data1[3] != (int) $data2[3] )
			return (int) $data1[3] - (int) $data2[3];

		// Comparaison Mois
		if ( (int) $data1[2] != (int) $data2[2] )
			return (int) $data1[2] - (int) $data2[2];

		// Comparaison Jour
		return (int) $data1[0] - (int) $data2[0];
	}

	static function DateMonth3C($date1, $date2)
	{
		switch((int)$month)
		{
			case 1:
			return 'JAN';

			case 2:
			return 'FEV';

			case 3:
			return 'MAR';
			
			case 4:
			return 'AVR';

			case 5:
			return 'MAI';

			case 6:
			return 'JUN';

			case 7:
			return 'JUL';

			case 8:
			return 'AOU';

			case 9:
			return 'SEP';

			case 10:
			return 'OCT';

			case 11:
			return 'NOV';

			case 12:
			return 'DEC';
			
			default:
			break;
		}
		return $month;
	}

	static function TimeInterval($time, $interval)
	{
		$data = explode(':',$time);
		if (count($data) == 2)
		{
			$hour = (int) $data[0];
			$minute = (int) $data[1];

			$minute += (int) $interval;

			$hour += (int) ($minute/60);
			$minute %= 60;

			return sprintf("%02d:%02d", $hour, $minute);
		}

		return $time;
	}

	static function GetSession($param, $default = '')
	{
		return adv::GetString($_SESSION, $param, $default);
	}

	static function GetSessionInt($key, $default = -1)
	{
		return adv::GetInt($_SESSION, $key, $default);
	}

	static function GetSessionArray($key)
	{
		if (isset($_SESSION[$key]))
			return $_SESSION[$key];
		else
			return array();
	}

	static function GetArraySession($array, $field, $default = '')
	{
		if (isset($_SESSION[$array]))
			if (isset($_SESSION[$array][$field]))
				return $_SESSION[$array][$field];

		return $default;
	}

	static function SetSession($param, $value)
	{
		$_SESSION[$param] = $value;
	}

	static function RemoveSession($param)
	{
		if (isset($_SESSION[$param]))
			unset($_SESSION[$param]);
	} 

	static function GetString(&$arrayParams, $key, $default = '')
	{
		if (isset($arrayParams[$key]))
		{
			$str = $arrayParams[$key];
			for ($i=0;$i<strlen($str);$i++)
			{
				$ch = $str[$i];
				if (ord($ch) < 32)
					return $default;
			}
			
			if (strpos($str, ';') === false)
				if (strpos($str, '\'') === false)
					if (strpos($str, '#') === false)
						if (strpos($str, '‘') === false)
							if (strpos($str, ')') === false)
								if (strpos($str, '«') === false)
									if (strpos($str, '&') === false)
										return $str;
		}
		return $default;
	}

	static function GetParam(&$arrayParams, $key, $default = '')
	{
		if (isset($arrayParams[$key]))
		{
			$str = $arrayParams[$key];
			return $str;
		}
		return $default;
	}

	static function GetArray(&$arrayParams, $key)
	{
		if (isset($arrayParams[$key]))
			return $arrayParams[$key];
		return array();
	}

	static function GetBool(&$arrayParams, $key, $default = false)
	{
		if (isset($arrayParams[$key]))
		{
			if ((int) $arrayParams[$key] == 0) 
				return false;
			else 
				return true;
		}
		return $default;
	}

	static function GetInt(&$arrayParams, $key, $default = -1)
	{
		if (isset($arrayParams[$key]))
			return intval($arrayParams[$key]);
		else
			return $default;
	}	
	
	static function GetDouble(&$arrayParams, $key, $default = 0.0)
	{
		if (isset($arrayParams[$key]))
			return (double) $arrayParams[$key];
		else
			return $default;
	}

	static function GetPoint(&$arrayParams, $key, $default='')
	{
		if (isset($arrayParams[$key]))
			return sprintf('%-.2lf', (double) $arrayParams[$key]);
		else
			return $default;
	}

	static function GetCookie($param, $default = '')
	{
		return adv::GetString($_COOKIE, $param, $default);
	}

	static function SetCookie($param, $value, $time = '')
	{
		if ($time == '')
			setcookie($param, $value, time()+30*24*3600);
		else
			setcookie($param, $value, $time);
	}

	static function RemoveCookie($param)
	{
		setcookie($param);
	} 

	static function PostToSession($param)
	{
		$_SESSION[$param] = $_POST;
	}

	// GetToSession
	static function GetToSession($param)
	{
		$_SESSION[$param] = $_GET;
	}

	static function StringQuote($string)
	{
	/*
		if (get_magic_quotes_gpc())
			$string = stripslashes($string);
	*/
	//	return mysql_real_escape_string($string);

		$newstring = "";
		for ($i=0;$i<strlen($string);$i++)
		{
			$newstring .= $string[$i];
			if ($string[$i] == '\'')
				$newstring .= '\'';
		}
		
	//	return $newstring;
		return str_replace("\''", "''", $newstring);	// A AMELIORER ...
	}

	static function DateFrLong($time, $fmt='Y')
	{
		$NomDuJour = array ("Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi");
		$NomDuMois = array ("Janvier", "F&eacute;vrier", "Mars", "Avril", "Mai", "Juin", "Juillet", "Ao&ucirc;t", "Septembre", "Octobre", "Novembre", "D&eacute;cembre");

		$lejour = date("d",$time);
		$lemois = date("m",$time);

		$ladatefr = $NomDuJour[ date('w',$time) ]." ";

		if ($lejour == '01') {$ladatefr.=" 1er "; }
		else if($lejour<10) { $ladatefr.=" $lejour[1] "; }
		else { $ladatefr.= date (" d ",$time); }

		$ladatefr .= $NomDuMois[$lemois-1]." ".date($fmt,$time);

		return $ladatefr;
	}

	static function DateFrShort($time)
	{
		$NomDuJour = array ("Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam");
		$NomDuMois = array ("Jan", "F&eacute;v", "Mar", "Avr", "Mai", "Juin", "Juil", "Ao&ucirc;t", "Sept", "Oct", "Nov", "D&eacute;c");

		return $NomDuJour[ date('w',$time) ]." ".date('d',$time)." ".$NomDuMois[date("m",$time)-1];
	}

	static function SaturdayTime($time)
	{
		$day = date('w',$time);
		if ($day < 6)
			$time = mktime(0, 0, 0, date("m",$time), date("d",$time)-$day-1, date("Y",$time));

		return $time;
	}

	static function AddDays($time, $nbdays)
	{
		return mktime(0, 0, 0, date("m",$time), date("d",$time)+$nbdays, date("Y",$time));
	}

	static function CreatePassword($length) 
	{
		$chars = "234567890abcdefghijkmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
		$max = strlen($chars)-1;

		$i = 0;
		$password = "";
		while ($i <= $length) 
		{
			$password .= $chars[mt_rand(0,$max)];
			$i++;
		}
		return $password;
	}

	static function UpperStd($string)
	{
		$txt = $string;
		
		$separator = array(' ', '-', '_', ',', '.', ':', '\'', '"', '&', '=');
		$txt = str_replace($separator, '', $txt);
		
		$letterA = array('à', 'â', 'ä', 'Ä', 'Â');
		$txt = str_replace($letterA, 'A', $txt);

		$letterC = array('ç', 'Ç');
		$txt = str_replace($letterC, 'C', $txt);

		$letterE = array('é', 'è', 'ê', 'ë', 'Ê', 'Ë');
		$txt = str_replace($letterE, 'E', $txt);

		$letterI = array('ï','î', 'Î', 'Ï');
		$txt = str_replace($letterI, 'I', $txt);
		
		$letterO = array('ô', 'ö', 'Ô', 'Ö');
		$txt = str_replace($letterO, 'O', $txt);

		$letterU = array('ù', 'ü', 'û', 'Ü', 'Û');
		$txt = str_replace($letterU, 'U', $txt);
		
		return strtoupper($txt);
	}

	static function FilterUnique(&$table, $colname, &$arraycolumns, $bSort=true)
	{
		$arraycolumns = array();

		$nb = count($table);
		for ($i=0;$i<$nb;$i++)
		{
			if (isset($table[$i][$colname]))
			{
				$value = trim($table[$i][$colname]);
				if ($value == '') continue;
				
				$bNew = true;
				for ($j=0;$j<count($arraycolumns);$j++)
				{
					if ($arraycolumns[$j] == $value)
					{
						$bNew = false;
						break;
					}
				}
				if ($bNew)
					array_push($arraycolumns, $value);
			}
		}
			
		if ($bSort)
			sort($arraycolumns);
	}

	static function ListToInSql($lst)
	{
		return "'".str_replace(",", "','", $lst)."'";
	}

	static function ArrayToInSql(&$array)
	{
		$count = count($array);
		$lst = '';
		for ($i=0;$i<$count;$i++)
		{
			if ($i > 0) $lst .= ',';
			$lst .= "'".$array[$i]."'";
		}
		return $lst;
	}

	static function EchoSelected(&$arrayParams, $key, $value)
	{
		if ($value == adv::GetString($arrayParams, $key)) 
			echo ' selected ';
	}

	static function EchoMultiSelected(&$arrayParams, $key, $value)
	{
		if (!isset($arrayParams[$key]))
			return;

		$count = count($arrayParams[$key]);
		for ($i=0;$i<$count;$i++)
		{
			if ($value == $arrayParams[$key][$i]) 
			{
				echo ' selected ';
				return;
			}
		}
	}

	static function EchoChecked(&$arrayParams, $key)
	{
		if (adv::GetString($arrayParams, $key, '(null)') != '(null)')
			echo ' checked ';
	}

	static function GetStringArray(&$arrayParams, $key, $default = '')
	{
		if (isset($arrayParams[$key]))
		{
			$count = count($arrayParams[$key]);
			$lst = '';
			for ($i=0;$i<$count;$i++)
			{
				if ($i > 0) $lst .= ',';
				$lst .= "'".$arrayParams[$key][$i]."'";
			}
			return $lst;
		}
		return $default;
	}

	static function ArrayRemoveRow(&$array, $row)
	{
		for ($i = $row; $i < count($array)-1; $i++)  
		{ 
			$array[$i] = $array[$i + 1]; 
		} 
		
		unset($array[count($array) - 1]);
	}
	
	static function GetTickCount()
	{
		return intval(microtime(true) * 1000) % 86400000;
	}
	
	static function SocketSend($ipAddress, $portNumber, &$cmd, &$arrayJson)
	{
		$arrayJson['success'] = false;
		if (($socket = @socket_create(AF_INET, SOCK_STREAM, SOL_TCP)) === false) 
		{
			$arrayJson['error'] = "error socket_create() : " . socket_strerror(socket_last_error());
			return false;
		}
		
		socket_set_nonblock($socket);
		@socket_connect($socket, $ipAddress, $portNumber);
		
		$write = array($socket);
		$read = array($socket);

		$except = array();
		$sec = 2;
		$usec = 0;
		
		if (!socket_select($read, $write, $except, $sec, $usec)) 
		{
			$arrayJson['error'] = "error socket_select() : " . socket_strerror(socket_last_error());
			return false;
		} 

		socket_set_block($socket);
		
		// Ajout du code ASCII 0 pour la fin de Trame
		$cmd .= chr(0);
		$count_wr = socket_write($socket, $cmd , strlen($cmd)+1);
		if ($count_wr === false)
		{
			$arrayJson['error'] = "error socket_write() : " . socket_strerror(socket_last_error());
			return false;
		}

		$arrayJson['send'] = $count_wr;

		$start = adv::GetTickCount();
		$response = '';

		socket_set_nonblock($socket);
		for (;;)
		{
			$response .= socket_read($socket, 2048);
			if (strlen($response) > 0)
				break;
			
			$end = adv::GetTickCount();
			if ($end > $start+1500)	// max 1,5sec
				break;

			// on attend 1ms ...
			usleep(1000);
		}
		
		$arrayJson['response'] = $response;
		socket_close($socket);
		
		$arrayJson['success'] = true;
		return true;
	}
}

?>
