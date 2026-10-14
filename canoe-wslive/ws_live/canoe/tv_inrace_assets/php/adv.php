<?php
// adv : fonctions boite à outils
define("CHRONO_OK", 1);	
define("CHRONO_ZERO", 0);	
define("CHRONO_KO", -1);	
define("CHRONO_DNF", -500);	
define("CHRONO_DNS", -600);	
define("CHRONO_DES", -700);	
define("CHRONO_DSQ", -800);	

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

	static function IsMailOk($email): bool
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
	
	static function GetDay(string $usDate): string
	{
		if (strlen($usDate) == 10)
			return substr($usDate, 8, 2);
		else
			return '';
	}

	static function GetMonth(string $usDate): string
	{
		if (strlen($usDate) == 10)
			return substr($usDate, 5, 2);
		else
			return '';
	}

	static function GetYear(string $usDate): string
	{
		if (strlen($usDate) == 10)
			return substr($usDate, 0, 4);
		else
			return '';
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

	static function GetKey(&$arrayParams, $key, $default = '')
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
	
	static function GetRealKey(&$arrayParams, $key, $default = '')
	{
		if (isset($arrayParams[$key]))
			return $arrayParams[$key];
		else
			return $default;
	}
	
	static function GetKeyBool(&$arrayParams, $key, $default = false)
	{
		if (isset($arrayParams[$key]))
		{
			switch(gettype($arrayParams[$key]))
			{
				case 'boolean':
				return $arrayParams[$key];

				case 'integer':
				return ($arrayParams[$key] == 0) ? false : true;

				case 'string':
				return (intval($arrayParams[$key]) == 0) ? false : true;

				default:
				break;
			}
		}
		return $default;
	}

	static function GetKeyInt(&$arrayParams, $key, $default = -1)
	{
		if (isset($arrayParams[$key]))
			return intval($arrayParams[$key]);
		else
			return $default;
	}	
	
	static function GetKeyDouble(&$arrayParams, $key, $default = 0.0)
	{
		if (isset($arrayParams[$key]))
			return floatval($arrayParams[$key]);
		else
			return $default;
	}

	static function GetKeyPoint(&$arrayParams, $key, $default='')
	{
		if (isset($arrayParams[$key]))
			return sprintf('%-.2lf', floatval($arrayParams[$key]));
		else
			return $default;
	}

	static function GetKeyArray(&$arrayParams, $key)
	{
		if (isset($arrayParams[$key]))
		{
			if (gettype($arrayParams[$key]) == 'array')
				return $arrayParams[$key];
		}
		return array();
	}

	static function SearchKey($arraySearchParams, $key, $default = '')
	{
		for ($i=0;$i<count($arraySearchParams);$i++)
		{
			if (isset($arraySearchParams[$i][$key]))
				return $arraySearchParams[$i][$key];
		}
		return $default;
	}
	
	static function EscapeString($string)
	{
		return addslashes($string);
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

	static function GetChronoStatus(int $ms, $valDefault='-'): string
	{
		if ($ms >= CHRONO_OK) return "Ok";
		else if ($ms == CHRONO_DNF) return "DNF";
		else if ($ms == CHRONO_DNS) return "DNS";
		else if ($ms == CHRONO_DES) return "DES";
		else if ($ms == CHRONO_DSQ) return "DSQ";
		else return $valDefault;
	}

	static function GetChronoOrder(int $ms, $valDefault='-'): int
	{
		if ($ms >= CHRONO_OK) return 1;
		else if ($ms == CHRONO_DNF) return 2;
		else if ($ms == CHRONO_DES) return 3;
		else if ($ms == CHRONO_DSQ) return 4;
		else if ($ms == CHRONO_DNS) return 5;
		else return 6;
	}
	
	static function GetChrono(int $ms, string $fmt='HHMMSSCC', $valDefault='-'): string
	{
		if ($fmt == 'HHMMSSCC') return adv::GetChronoHHMMSSCC($ms, $valDefault);
		elseif ($fmt == 'HHMMSSD') return adv::GetChronoHHMMSSD($ms, $valDefault);
		elseif ($fmt == 'HHMMSS') return adv::GetChronoHHMMSS($ms, $valDefault);
		elseif ($fmt == '2H2M2S') return adv::GetChrono2H2M2S($ms, $valDefault);
		elseif ($fmt == 'XSCC') return adv::GetChronoXSCC($ms, $valDefault);
		else return adv::GetChronoHHMMSSMMM($ms, $valDefault);
	}

	static function GetChronoHHMMSSD(int $ms, $valDefault='-'): string
	{
		if ($ms >= CHRONO_OK)
		{
			$h = intdiv($ms, 3600000);
			$m = intdiv($ms - $h*3600000, 60000);
			$s = intdiv($ms - $h*3600000 - $m*60000, 1000);
			$d = intdiv($ms - $h*3600000 - $m*60000 - $s*1000, 100);

			if ($h > 0)
				return sprintf('%d', $h).'h'.sprintf('%02d',$m).':'.sprintf('%02d', $s).'.'.sprintf('%01d', $d);
			else if ($m > 0)
				return sprintf('%d', $m).':'.sprintf('%02d', $s).'.'.sprintf('%01d', $d);
			else 
				return sprintf('%d', $s).'.'.sprintf('%01d', $d);
		}
		else
		{
			return adv::GetChronoStatus($ms, $valDefault);
		}
	}
	
	static function GetChronoHHMMSSCC(int $ms, $valDefault='-'): string
	{
		if ($ms >= CHRONO_OK)
		{
			$h = intdiv($ms, 3600000);
			$m = intdiv($ms - $h*3600000, 60000);
			$s = intdiv($ms - $h*3600000 - $m*60000, 1000);
			$c = intdiv($ms - $h*3600000 - $m*60000 - $s*1000, 10);

			if ($h > 0)
				return sprintf('%d', $h).'h'.sprintf('%02d',$m).':'.sprintf('%02d', $s).'.'.sprintf('%02d', $c);
			else if ($m > 0)
				return sprintf('%d', $m).':'.sprintf('%02d', $s).'.'.sprintf('%02d', $c);
			else 
				return sprintf('%d', $s).'.'.sprintf('%02d', $c);
		}
		else
		{
			return adv::GetChronoStatus($ms, $valDefault);
		}
	}
	
	static function GetChronoHHMMSS(int $ms, $valDefault='-'): string
	{
		if ($ms >= CHRONO_OK)
		{
			$h = intdiv($ms, 3600000);
			$m = intdiv($ms - $h*3600000, 60000);
			$s = intdiv($ms - $h*3600000 - $m*60000, 1000);
	
			if ($h > 0)
				return sprintf('%d', $h).'h'.sprintf('%02d',$m).':'.sprintf('%02d', $s);
			else if ($m > 0)
				return sprintf('%d', $m).':'.sprintf('%02d', $s);
			else 
				return sprintf('%d', $s);
		}
		else
		{
			return adv::GetChronoStatus($ms, $valDefault);
		}
	}

	static function GetChronoXSCC(int $ms, $valDefault='-'): string
	{
		if ($ms >= CHRONO_OK)
		{
			$s = intdiv($ms, 1000);
			$c = intdiv($ms - $s*1000, 10);
			return sprintf('%d', $s).'.'.sprintf('%02d', $c);
		}
		else
		{
			return adv::GetChronoStatus($ms, $valDefault);
		}
	}
	
	static function GetChronoHHMMSSMMM(int $ms, $valDefault='-'): string
	{
		if ($ms >= CHRONO_OK)
		{
			$h = intdiv($ms, 3600000);
			$m = intdiv($ms - $h*3600000, 60000);
			$s = intdiv($ms - $h*3600000 - $m*60000, 1000);
			$milli = $ms - $h*3600000 - $m*60000 - $s*1000;

			if ($h > 0)
				return sprintf('%d', $h).'h'.sprintf('%02d',$m).':'.sprintf('%02d', $s).'.'.sprintf('%03d', $milli);
			else if ($m > 0)
				return sprintf('%d', $m).':'.sprintf('%02d', $s).'.'.sprintf('%03d', $milli);
			else 
				return sprintf('%d', $s).'.'.sprintf('%03d', $milli);
		}
		else
		{
			return adv::GetChronoStatus($ms, $valDefault);
		}
	}

	static function GetChronoDiff(int $diff, string $fmt='MMSSCC', $valDefault='-'): string
	{
		if ($fmt == 'HHMMSSMMM') return adv::GetChronoDiffHHMMSSMMM($diff);
		elseif ($fmt == 'HHMMSSD') return adv::GetChronoDiffHHMMSSD($diff);
		elseif ($fmt == 'MMSSD') return adv::GetChronoDiffMMSSD($diff);
		elseif ($fmt == 'XSCC') return adv::GetChronoDiffXSCC($diff);
		else return adv::GetChronoDiffMMSSCC($diff);
	}

	static function GetChronoDiffMMSSCC(int $ms): string
	{
		if ($ms == 0)
			return '';
			
		$sign = '';
		if ($ms > 0)
		{
			$sign = '+';
		}
		else
		{
			$sign = '-';
			$ms = abs($ms);
		}

		$m = intdiv($ms, 60000);
		$s = intdiv($ms - $m*60000, 1000);
		$c = intdiv($ms - $m*60000 - $s*1000, 10);
			
		if ($m > 0)
			return $sign.sprintf('%d', $m).':'.sprintf('%02d', $s).'.'.sprintf('%02d', $c);
		else
			return $sign.sprintf('%d', $s).'.'.sprintf('%02d', $c);
	}

	static function GetChronoDiffMMSSMMM(int $ms): string
	{
		if ($ms == 0)
			return '';
			
		$sign = '';
		if ($ms > 0)
		{
			$sign = '+';
		}
		else
		{
			$sign = '-';
			$ms = abs($ms);
		}

		$m = intdiv($ms, 60000);
		$s = intdiv($ms - $m*60000, 1000);
		$milli = $ms - $m*60000 - $s*1000;
			
		if ($m > 0)
			return $sign.sprintf('%d', $m).':'.sprintf('%02d', $s).'.'.sprintf('%03d', $milli);
		else
			return $sign.sprintf('%d', $s).'.'.sprintf('%03d', $milli);
	}

	static function GetChronoDiffMMSSD(int $ms): string
	{
		if ($ms == 0)
			return '';
			
		$sign = '';
		if ($ms > 0)
		{
			$sign = '+';
		}
		else
		{
			$sign = '-';
			$ms = abs($ms);
		}

		$m = intdiv($ms, 60000);
		$s = intdiv($ms - $m*60000, 1000);
		$d = intdiv($ms - $m*60000 - $s*1000, 100);
			
		if ($m > 0)
			return $sign.sprintf('%d', $m).':'.sprintf('%02d', $s).'.'.sprintf('%01d', $d);
		else
			return $sign.sprintf('%d', $s).'.'.sprintf('%01d', $d);
	}
	
	static function GetChronoDiffXSCC(int $ms): string
	{
		if ($ms == 0)
			return '';
			
		$sign = '';
		if ($ms > 0)
		{
			$sign = '+';
		}
		else
		{
			$sign = '-';
			$ms = abs($ms);
		}

		$s = intdiv($ms, 1000);
		$c = intdiv($ms-$s*1000, 10);
			
		return $sign.sprintf('%d', $s).'.'.sprintf('%02d', $c);
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

	static function ArrayToString(&$array, $quotation_mark=true)
	{
		$count = count($array);

		$lst = '';
		for ($i=0;$i<$count;$i++)
		{
			if ($i > 0) $lst .= ',';

			if ($quotation_mark)
				$lst .= "'".$array[$i]."'";
			else
				$lst .= $array[$i];
		}
		return $lst;
	}

	static function EchoSelectOption($value, $label, $value_selected)
	{
		$selected = ($value == $value_selected) ? 'selected' : '';
		echo "<option value='$value' $selected>$label</option>";
	}

	static function EchoChecked($value, $value_checked)
	{
		if ($value == $value_checked)
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

	static function GetPathComposer()
	{
		if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') 
			return '/composer';
		else
			return '../../../clubesf';
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
