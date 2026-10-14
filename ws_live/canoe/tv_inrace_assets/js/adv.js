const adv = {
	chrono : {OK:1, KO:-1, DNF:-500, DNS:-600, DES:-700, DSQ:-800, AUTO:-99},
	passage: {START:0, FINISH:-1, INTER1:1, INTER2:2 },
	align_horz : {LEFT:0, RIGHT:0x0200, CENTER:0x0100 },
	align_vert : {TOP:0, BOTTOM:0x0400, CENTER:0x0800 },
	index_type : {NULL:0, CHAR:1, VARCHAR:2, TEXT:3, SHORT:4, LONG:5, DOUBLE:6, CHRONO:7,  CHRONO_INV:8, RANKING:9, DATE:10, SMALLDATETIME:11, DATETIME:12},
	msg : { STD:0, INFO:1, SUCCESS:2, WARNING:3, ERROR:4}
}

Object.freeze(adv.chrono);
Object.freeze(adv.align_horz);
Object.freeze(adv.align_vert);
Object.freeze(adv.index_type);
Object.freeze(adv.msg);

/*
adv.ParseBibAndLap = function(bibLab, arrayBibLab)
{
	arrayBibLab.length = 0;
	
	const len = bibLap.length;
	if (len > 0)
	{
		var startLap = 0;
		for (startLap = 0; startLap < len; startLap++)
		{
			if (bibLap.charAt(startLap) < '0' || bibLap.charAt(startLap) > '9')
				break;
		}

		if (startLap > 0)
		{
			str.substring(1, 3)
			bib = parseInt(bibLap.substring(0, startLap-1));
			if (bib > 0)
			{
				if (startLap < len)
				{
					advString txtLap = bibLap.substring(startLap);
					advTools::Base26ToNumber(txtLap, lap);
				}
				
				arrayBibLab.push(bib);
				arrayBibLab.push(lap);
				return true;
			}
		}
	}

	return false;
}
*/

adv.toNumber = function(val)
{
	if (typeof val === 'number') return val;
	else if (typeof val === 'string') return parseInt(val);
	else null;
}

adv.GetChronoStatus = function(ms, valDefault='-')
{
	ms = adv.toNumber(ms);
	if (ms == null) return valDefault;
	else if (ms >= adv.chrono.OK) return "Ok";
	else if (ms == adv.chrono.DNF) return "DNF";
	else if (ms == adv.chrono.DNS) return "DNS";
	else if (ms == adv.chrono.DES) return "DES";
	else if (ms == adv.chrono.DSQ) return "DSQ";
	else return valDefault;
}

adv.GetChronoOrder = function(ms)
{
	if (ms >= adv.chrono.OK) return 1;
	else if (ms == adv.chrono.DNF)	return 2;
	else if (ms == adv.chrono.DES)	return 3;
	else if (ms == adv.chrono.DSQ) return 4;
	else if (ms == adv.chrono.DNS)	return 5;
	else return 6;
}

adv.GetChrono = function(ms, fmt='HHMMSSCC', valDefault='-')
{
	if (fmt == 'HHMMSSD') return adv.GetChronoHHMMSSD(ms, valDefault);
	else if (fmt == 'HHMMSS') return adv.GetChronoHHMMSS(ms, valDefault);
	else if (fmt == '2H2M2S') return adv.GetChrono2H2M2S(ms, valDefault);
	else if (fmt == 'XSCC') return adv.GetChronoXSCC(ms, valDefault);
	else return adv.GetChronoHHMMSSCC(ms);
}

adv.GetChronoHHMMSSD = function(ms, valDefault='-')
{
	ms = adv.toNumber(ms);
	if (ms !== null && ms >= adv.chrono.OK)
	{
		const h = Math.floor(ms/3600000);
		const m = Math.floor((ms - h*3600000)/60000);
		const s = Math.floor((ms - h*3600000 - m*60000)/1000);
		const d = Math.floor((ms - h*3600000 - m*60000 - s*1000)/100);

		if (h > 0)
			return h.toString() + 'h' + ("0" + m).slice(-2) + ':' + ("0" + s).slice(-2) + '.' + ("0" + d).slice(-1);
		else if (m > 0)
			return m.toString() + ':' + ("0" + s).slice(-2) + '.' + ("0" + d).slice(-1);
		else 
			return s.toString() + '.' + ("0" + d).slice(-1);
	}
	else
	{
		return adv.GetChronoStatus(ms, valDefault);
	}
}

adv.GetChronoHHMMSSCC = function(ms, valDefault='-')
{
	ms = adv.toNumber(ms);
	if (ms !== null && ms >= adv.chrono.OK)
	{
		const h = Math.floor(ms/3600000);
		const m = Math.floor((ms - h*3600000)/60000);
		const s = Math.floor((ms - h*3600000 - m*60000)/1000);
		const c = Math.floor((ms - h*3600000 - m*60000 - s*1000)/10);

		if (h > 0)
			return h.toString() + 'h' + ("0" + m).slice(-2) + ':' + ("0" + s).slice(-2) + '.' + ("0" + c).slice(-2);
		else if (m > 0)
			return m.toString() + ':' + ("0" + s).slice(-2) + '.' + ("0" + c).slice(-2);
		else 
			return s.toString() + '.' + ("0" + c).slice(-2);
	}
	else
	{
		return adv.GetChronoStatus(ms, valDefault);
	}
}

adv.GetChronoHHMMSS = function(ms, valDefault='-')
{
	ms = adv.toNumber(ms);
	if (ms !== null && ms >= adv.chrono.OK)
	{
		const h = Math.floor(ms/3600000);
		const m = Math.floor((ms - h*3600000)/60000);
		const s = Math.floor((ms - h*3600000 - m*60000)/1000);
		
		if (h > 0)
			return h.toString() + 'h' + ("0" + m).slice(-2) + ':' + ("0" + s).slice(-2);
		else if (m > 0)
			return m.toString() + ':' + ("0" + s).slice(-2);
		else 
			return s.toString();
	}
	else
	{
		return adv.GetChronoStatus(ms, valDefault);
	}
}

adv.GetChrono2H2M2S = function(ms, valDefault='-')
{
	ms = adv.toNumber(ms);
	if (ms !== null && ms >= adv.chrono.OK)
	{
		const h = Math.floor(ms/3600000);
		const m = Math.floor((ms - h*3600000)/60000);
		const s = Math.floor((ms - h*3600000 - m*60000)/1000);
		
		return ("0" + h).slice(-2) + 'h' + ("0" + m).slice(-2) + ':' + ("0" + s).slice(-2);
	}
	else
	{
		return adv.GetChronoStatus(ms, valDefault);
	}
}

adv.GetChronoXSCC = function(ms, valDefault='-')
{
	ms = adv.toNumber(ms);
	if (ms !== null && ms >= adv.chrono.OK)
	{
		const s = Math.floor(ms/1000);
		const c = Math.floor((ms - s*1000)/10);
		return s.toString() + ',' + ("0" + c).slice(-2);
	}
	else
	{
		return adv.GetChronoStatus(ms, valDefault);
	}
}

adv.GetChronoHHMMSSMMM = function(ms, valDefault='-')
{
	ms = adv.toNumber(ms);
	if (ms !== null && ms >= adv.chrono.OK)
	{
		const h = Math.floor(ms/3600000);
		const m = Math.floor((ms - h*3600000)/60000);
		const s = Math.floor((ms - h*3600000 - m*60000)/1000);
		const f = ms - h*3600000 - m*60000 - s*1000;

		if (h > 0)
			return h.toString() + 'h' + ("0" + m).slice(-2) + ':' + ("0" + s).slice(-2) + '.' + ("00" + f).slice(-3);
		else if (m > 0)
			return m.toString() + ':' + ("0" + s).slice(-2) + '.' + ("00" + f).slice(-3);
		else 
			return s.toString() + '.' + ("00" + f).slice(-3);
	}
	else
	{
		return adv.GetChronoStatus(ms, valDefault);
	}
}

adv.GetChronoDiff = function(diff, fmt='MMSSCC')
{
	if (fmt == 'HHMMSSD') return adv.GetChronoDiffHHMMSSD(diff);
	else if (fmt == 'MMSSD') return adv.GetChronoDiffMMSSD(diff);
	else if (fmt == 'XSCC') return adv.GetChronoDiffXSCC(diff);
	else return adv.GetChronoDiffMMSSCC(diff);
}

adv.GetChronoDiffMMSSCC = function(diff)
{
	diff = adv.toNumber(diff);
	if (diff !== null)
	{
		if (diff == 0)
			return '';
		
		var signDiff = '';
		if (diff > 0)
		{
			signDiff = '+';
		}
		else
		{
			signDiff = '-';
			diff = Math.abs(diff);
		}

		const m = Math.floor(diff/60000);
		const s = Math.floor((diff - m*60000)/1000);
		const c = Math.floor((diff - m*60000 - s*1000)/10);
		
		if (m > 0)
			return signDiff + m.toString() + ':' + ("0" + s).slice(-2)+ '.' + ("0" + c).slice(-2);
		else
			return signDiff + s.toString() + '.' + ("0" + c).slice(-2);
	}

	return '';
}
	
adv.GetChronoDiffMMSSD = function(diff)
{
	diff = adv.toNumber(diff);
	if (diff !== null)
	{
		if (diff == 0)
			return '';
			
		var signDiff = '';
		if (diff > 0)
		{
			signDiff = '+';
		}
		else
		{
			signDiff = '-';
			diff = Math.abs(diff);
		}

		const m = Math.floor(diff/60000);
		const s = Math.floor((diff - m*60000)/1000);
		const d = Math.floor((diff - m*60000 - s*1000)/100);
		
		if (m > 0)
			return signDiff + m.toString() + ':' + ("0" + s).slice(-2)+ '.' + ("0" + d).slice(-1);
		else
			return signDiff + s.toString() + '.' + ("0" + d).slice(-1);
	}
}

adv.GetChronoDiffHHMMSSD = function(diff)
{
	diff = adv.toNumber(diff);
	if (diff !== null)
	{
		if (diff == 0)
			return '';
			
		var signDiff = '';
		if (diff > 0)
		{
			signDiff = '+';
		}
		else
		{
			signDiff = '-';
			diff = Math.abs(diff);
		}

		const h = Math.floor(diff/3600000);
		const m = Math.floor((diff - h*3600000)/60000);
		var s = Math.floor((diff - h*3600000 - m*60000)/1000);
		const d = Math.floor((diff - h*3600000 - m*60000 - s*1000)/100);

		if (h > 0)
			return signDiff + h.toString() + 'h' + ("0" + m).slice(-2) + ':' + ("0" + s).slice(-2) + '.' + ("0" + d).slice(-1);
		else if (m > 0)
			return signDiff + m.toString() + ':' + ("0" + s).slice(-2) + '.' + ("0" + d).slice(-1);
		else 
			return signDiff + s.toString() + '.' + ("0" + d).slice(-1);
	}
}

adv.GetChronoDiffXSCC = function(diff)
{
	diff = adv.toNumber(diff);
	if (diff !== null)
	{
		if (diff == 0)
			return '';
			
		var signDiff = '';
		if (diff > 0)
		{
			signDiff = '+';
		}
		else
		{
			signDiff = '-';
			diff = Math.abs(diff);
		}

		const s = Math.floor(diff/1000);
		const c = Math.floor((diff - s*1000)/10);
		return signDiff + s.toString() + ',' + ("0" + c).slice(-2);
	}
}

adv.FormatInteger = function(number, len, valDefault=' ')
{
	const str = number.toString();
	while (str.length < len)
		str = valDefault+str;
	
	return str;
}

adv.FormatPoint = function(pts, decimal=2, valDefault='')
{
	if (typeof pts === 'string' && pts.length > 0)
		return parseFloat(Math.round(parseFloat(pts)*100)/100).toFixed(decimal);
	else if (typeof pts === 'number')
		return parseFloat(Math.round(pts*100)/100).toFixed(decimal);
	else
		return valDefault;
}

adv.GetAlignHorz = function(align)
{
	if (align & adv.align_horz.CENTER)
		return adv.align_horz.CENTER;
	else if (align & adv.align_horz.RIGHT)
		return adv.align_horz.RIGHT;
	else
		return adv.align_horz.LEFT;
}

adv.GetAlignVert = function(align)
{
	if (align & adv.align_vert.CENTER)
		return adv.align_vert.CENTER;
	else if (align & adv.align_vert.BOTTOM)
		return adv.align_horz.BOTTOM;
	else
		return adv.align_horz.TOP;
}

adv.ToBase64 = function(data) 
{
	if (data instanceof ArrayBuffer) 
	{
		var bytearray = new Uint8Array(data);
		var len = bytearray.length;

		var biStr = [];
		while (len--) { biStr[len] = String.fromCharCode(bytearray[len]);  }
		return base64 = window.btoa(biStr.join(''));
	}
	
	return null;
}

adv.GetDay = function(usDate) 
{
	if (usDate.length == 10)
		return usDate.substring(8, 10);
	else
		return '';
}

adv.GetMonth = function(usDate) 
{
	if (usDate.length == 10)
		return usDate.substring(5, 7);
	else
		return '';
}

adv.GetMonth3C = function(monthNumber) 
{
	if (monthNumber.length > 0)
	{
		monthNumber = parseInt(monthNumber);
		switch(monthNumber)
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
			return 'JUI';
			
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
	}
	
	return '';
}

adv.GetYear = function(usDate) 
{
	if (usDate.length == 10)
		return usDate.substring(0, 4);
	else
		return '';
}

adv.GetSelected = function(valA, valB)
{
	if (valA == valB)
		return 'selected';
	else
		return '';
}

adv.GetParamBool = function(objJSON, param, defaultValue=false)
{
	if (objJSON && typeof objJSON === "object") 
	{
		const type_param = typeof objJSON[param];
		if (type_param !== undefined)
		{
			if (type_param == "boolean") return objJSON[param];
			else if (type_param == "number")
			{
				if (objJSON[param] == 0)
					return false;
				else
					return true;
			}
			else if (type_param == "string")
			{
				if (objJSON[param] == 'true' || objJSON[param] == '1')
					return true;
				else
					return false;
			}
		}
	}
	
	return defaultValue;
}

adv.GetParamInt = function(objJSON, param, defaultValue=0)
{
	if (objJSON && typeof objJSON === "object") 
	{
		const type_param = typeof objJSON[param];
		if (type_param !== undefined)
		{
			if (type_param == "number") return objJSON[param];
			else return parseInt(objJSON[param]);
		}
	}
	
	return defaultValue;
}

adv.GetParam = function(objJSON, param, defaultValue='')
{
	if (objJSON && typeof objJSON === "object") 
	{
		const type_param = typeof objJSON[param];
		if (type_param !== undefined)
		{
			return objJSON[param];
		}
	}

	return defaultValue;
}

adv.TruncateString = function(str, len, endString='...')
{
	if (len > 0)
	{
		if (str.length > len)
			return str.substring(0, len)+endString;
	}
	
	return str;
}

