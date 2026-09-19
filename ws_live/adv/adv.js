const adv = {
	table : {},
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

adv.table = function(name=null, t=null)
{
	if (t && typeof t === 'object' && typeof t.columns === 'object' && typeof t.rows === 'object') 
	{
		this.t = t;
	}
	else
	{
		this.t = {};
		this.t.columns = new Array();
		this.t.rows = new Array();
	}

	if (name && typeof name == 'string')
		this.t.name = name;
}

adv.table.prototype.Clone = function(onlyColumns = false)
{
	const t = {};
	t.columns = new Array();
	t.rows = new Array();

	for (let c = 0; c < this.t.columns.length; c++)
	{
		t.columns.push(this.t.columns[c].slice());
	}

	if (!onlyColumns)
	{
		for (let r = 0; r < this.t.rows.length; r++)
		{
			t.rows.push(this.t.rows[r].slice());
		}
	}

	return new adv.table(this.name, t);
}

adv.table.prototype.PushRow = function(tScr, row)
{
	if (row >= 0 && row < tScr.GetNbRows())
		this.t.rows.push(tScr.t.rows[row].slice());
}

adv.table.prototype.IsOk = function()
{
	if (this.t && typeof this.t === 'object' && typeof this.t.rows === 'object') 
		return true;
	else
		return false;
}

adv.table.prototype.GetNbRows = function()
{
	if (typeof this.t.rows.length === 'undefined')
		return 0;
	else
		return this.t.rows.length;
}

adv.table.prototype.GetIndexRow = function(col, value)
{
	const c = this.GetIndexColumn(col);
	if (c >= 0 && c < this.GetNbColumns())
	{
		const t = this.t;
		const nb = t.rows.length;
		for (let r = 0; r < nb; r++)
		{
			if (t.rows[r][c] == value)
				return r;
		}
	}
	
	return -1;
}

adv.table.prototype.GetNbColumns = function()
{
	return this.t.columns.length;
}

adv.table.prototype.GetIndexColumn = function(col)
{
	if (Number.isInteger(col))
		return parseInt(col);
	else
	{
		for (let c = 0; c < this.t.columns.length; c++)
		{
			if (this.t.columns[c][0] == col)
				return c;
		}
		return -1;
	}
}

adv.table.prototype.GetColumnName = function(col, valDefault='')
{
	const c = this.GetIndexColumn(col);
	if (c >= 0 && c < this.t.columns.length)
		return this.t.columns[c][0];
	else
		valDefault;
}

adv.table.prototype.GetColumnLabel = function(col, valDefault='')
{
	const c = this.GetIndexColumn(col);
	if (c >= 0 && c < this.t.columns.length)
		return this.t.columns[c][1];
	else
		valDefault;
}

adv.table.prototype.GetColumnFormat = function(col, valDefault='')
{
	const c = this.GetIndexColumn(col);
	if (c >= 0 && c < this.t.columns.length)
		return this.t.columns[c][2];
	else
		valDefault;
}

adv.table.prototype.GetColumnType = function(col)
{
	const c = this.GetIndexColumn(col);
	if (c >= 0 && c < this.t.columns.length)
		return parseInt(this.t.columns[c][5]);
	else
		return 0;
}

adv.table.prototype.GetColumnTypeName = function(col)
{
	const c = this.GetIndexColumn(col);
	const columnType = this.GetColumnType(c);
	if (columnType > 0)
	{
		const key = adv.table.sql_type.get(columnType);
		if (key && typeof key == 'object')
			return key.name;
	}

	return '?';
}

adv.table.prototype.GetColumnAlignment = function(col)
{
	const c = this.GetIndexColumn(col);
	if (c >= 0 && c < this.t.columns.length)
		return parseInt(this.t.columns[c][9]);
	else
		return 0;
}

adv.table.prototype.GetColumnAlignmentHorz = function(col)
{
	return adv.GetAlignHorz(this.GetColumnAlignment(col));
}

adv.table.prototype.GetColumnAlignmentVert = function(col)
{
	return adv.GetAlignVert(this.GetColumnAlignment(col));
}

adv.table.prototype.GetCell = function(col, row, valDefault='')
{
	const t = this.t;
	if (row >= 0 && row < t.rows.length)
	{
		const c = this.GetIndexColumn(col);
		if (c >= 0 && c < t.columns.length)
			return t.rows[row][c];
	}

	return valDefault;
}

adv.table.prototype.GetCellInt = function(col, row, valDefault=0)
{
	const value = this.GetCell(col, row);
	if (value == '')
		return valDefault;
	else
		return parseInt(value);
}

adv.table.prototype.GetCellFloat = function(col, row, valDefault=0.0)
{
	return parseFloat(this.GetCell(col, row, valDefault.toString()));
}

adv.table.prototype.GetCellChrono = function(col, row, fmt='HHMMSSCC')
{
	var value = this.GetCell(col, row);
	if (typeof value == 'string') value = parseInt(value);
	else if (typeof value !== 'number') value = chrono.KO;

	return adv.GetChrono(value, fmt);
}

adv.table.prototype.GetCellChronoDiff = function(col, row, fmt='MMSSCC')
{
	var value = this.GetCell(col, row);
	if (typeof value == 'string' && value != '')
		return adv.GetChronoDiff(parseInt(value), fmt);
	else if (typeof value == 'number')
		return adv.GetChronoDiff(value, fmt);
	else
		return '';
}

adv.table.prototype.GetCellRank = function(col, row, valDefault='')
{
	var rk = this.GetCell(col, row, '0');
	if (typeof rk == 'string') rk = parseInt(rk);
	else if (typeof rk !== 'number') rk = 0;
	
	if (rk > 0)
		return rk;
	else
		return valDefault;
}

adv.table.prototype.GetCellDouble = function(col, row, fmt='', valDefault='')
{
	var val = this.GetCell(col, row, valDefault);
	if (fmt == '' || val == valDefault)
		return val;
	
	if (typeof val == 'string') 
	{
		val = parseFloat(val);
		fmt = parseInt(fmt);
		return val.toFixed(fmt);
	}

	return valDefault;
}

adv.table.prototype.GetCellDate = function(col, row, fmt='YYYYMMDD', valDefault='')
{
	var val = this.GetCell(col, row, valDefault);
	if (val.length == 10)
	{
		// YYYY/MM/DD
		if (fmt == 'DDMMYYYY')
			return adv.GetDay(val)+'/'+ adv.GetMonth(val)+'/'+adv.GetYear(val);
		else if (fmt == 'DDMMYY')
			return adv.GetDay(val)+'/'+ adv.GetMonth(val)+'/'+adv.GetYear(val).substring(2,4);
		else if (fmt == 'YYMMDD')
			return adv.GetYear(val).substring(2,4)+'/'+ adv.GetMonth(val)+'/'+adv.GetDay(val);
	}
	return val;
}

adv.table.prototype.GetCellFormat = function(col, row, fmt='', valDefault='')
{
	const c = this.GetIndexColumn(col);
	const cType = this.GetColumnType(c);
	
	switch(cType)
	{
		case adv.index_type.CHRONO:
		case adv.index_type.CHRONO_INV:
		return this.GetCellChrono(c, row, fmt);

		case adv.index_type.DATE:
		return this.GetCellDate(c, row, fmt);

		case adv.index_type.RANKING:
		return this.GetCellRank(c, row, valDefault);
		
		case adv.index_type.DOUBLE:
		return this.GetCellDouble(c, row, fmt, valDefault);
	
		default:
		return this.GetCell(c, row, valDefault);
	}
}

adv.table.prototype.GetCellFunction = function(fn, row, extraData)
{
	if (typeof fn === 'function')
		return fn(this, row, extraData);
	else if (typeof fn === 'string')
	{
		if (typeof window[fn] == 'function')
			return window[fn](this, row, extraData);
		else
			return this.GetCell(fn, row);
	}
	
	console.log('adv.table.GetCellFunction error');
	return '';
}

adv.table.prototype.GetString = function(itemRow, col, valDefault='')
{
	const t = this.t;
	if (Number.isInteger(col))
	{
		if (t.columns.length > col)
			return itemRow[col];
	}
	else
	{
		for (let c = 0; c < t.columns.length; c++)
		{
			if (t.columns[c][0] == col)
			{
				return itemRow[c];
			}
		}
	}
	return valDefault;
}

adv.table.prototype.GetInt = function(itemRow, col, valDefault=0)
{
	return parseInt(this.GetString(itemRow, col, valDefault.toString()));
}

adv.table.prototype.GetFloat = function(itemRow, col, valDefault=0.0)
{
	return parseFloat(this.GetString(itemRow, col, valDefault.toString()));
}

adv.table.prototype.GetChrono = function(itemRow, col, fmt='HHMMSSCC')
{
	var value = this.GetString(itemRow, col);
	if (typeof value == 'string') value = parseInt(value);
	else if (typeof value !== 'number') value = chrono.KO;
	
	return adv.GetChrono(value, fmt);
}

adv.table.prototype.GetRank = function(itemRow, col, valDefault='')
{
	var rk = this.GetString(itemRow, col, '0');
	if (typeof rk == 'string') rk = parseInt(rk);
	else if (typeof rk !== 'number') rk = 0;
	
	if (rk > 0)
		return rk;
	else
		return valDefault;
}

adv.table.prototype.SetCell = function(col, row, value)
{
	const t = this.t;
	if (row >= 0 && row < t.rows.length)
	{
		const c = this.GetIndexColumn(col);
		if (c >= 0 && c < t.columns.length)
		{
			t.rows[row][c] = value;
			return true;
		}
	}
	return false;
}

adv.table.prototype.SetColumnToNull = function(col, nullValue='')
{
	const c = this.GetIndexColumn(col);
	if (c >= 0 && c < this.GetNbColumns())
	{
		const rows = this.t.rows;
		for (let r=0;r<rows.length;r++)
			rows[r][c] = nullValue;
		
		return true;
	}
	
	return false;
}

adv.table.prototype.SetColumnName = function(col, name)
{
	const c = this.GetIndexColumn(col);
	if (c >= 0 && c < this.t.columns.length)
	{
		this.t.columns[c][0] = name;
		return true;
	}
	else
	{
		return false;
	}
}

adv.table.prototype.SetColumnLabel = function(col, label)
{
	const c = this.GetIndexColumn(col);
	if (c >= 0 && c < this.t.columns.length)
	{
		this.t.columns[c][1] = label;
		return true;
	}
	else
	{
		return false;
	}
}

adv.table.prototype.SetColumnType = function(col, sqlType)
{
	const c = this.GetIndexColumn(col);
	if (c >= 0 && c < this.t.columns.length)
	{
		this.t.columns[c][5] = sqlType;
		return true;
	}
	else
	{
		return false;
	}
}

adv.table.prototype.SetColumnAlignment = function(col, align)
{
	const c = this.GetIndexColumn(col);
	if (c >= 0 && c < this.t.columns.length)
	{
		this.t.columns[c][9] = align;
		return true;
	}
	else
	{
		return false;
	}
}

adv.table.prototype.SetColumnJSON = function(col, json)
{
	const c = this.GetIndexColumn(col);
	if (c >= 0 && c < this.t.columns.length)
	{
		while (this.t.columns[c].length < 11)
			this.t.columns[c].push(0);

		this.t.columns[c][10] = json;
		return true;
	}
	else
	{
		return false;
	}
}

adv.table.prototype.GetColumnJSON = function(col)
{
	const c = this.GetIndexColumn(col);
	if (c >= 0 && c < this.t.columns.length)
	{
		if (this.t.columns[c].length >= 11)
		{
			return this.t.columns[c][10];
		}
	}

	return undefined;
}

adv.table.prototype.AddColumn = function(name, sqlType=adv.index_type.CHAR)
{
	// 0=name, 1=label, 2=format, 3=style, 4=typeName, 5=sqlType, 6=storageSize, 7=widthDefault, 8=widthActive, 9=alignment, 10=json
	const c = this.t.columns.push([name, name, '', -1, '', sqlType, -1, -1, -1, 0]);

	const rows = this.t.rows;
	for (let r = 0; r < rows.length; r++)
		rows[r].push('');

	return c;
}

adv.table.prototype.AddRow = function(count=1)
{
	for (let i=0;i<count;i++)
	{
		var row = new Array();
		for (let c=0;c<this.GetNbColumns();c++)
			row.push('');

		this.t.rows.push(row);
	}
	return this.GetNbRows()-1;
}

adv.table.prototype.RemoveColumnAt = function(col, count=1)
{
	if (col >= 0 && col < this.GetNbColumns())
	{
		this.t.columns.splice(col, count);
		for (let r=0;r<this.GetNbRows();r++)
			this.t.rows[r].splice(col, count);
		return true;
	}
	else
		return false;
}

adv.table.prototype.RemoveRowAt = function(row, count=1)
{
	if (row >= 0 && row < this.GetNbRows())
	{
		this.t.rows.splice(row, count);
		return true;
	}
	else
		return false;
}

adv.table.prototype.RemoveAllColumns = function()
{
	this.t.columns = [];
	for (let r=0;r<this.GetNbRows();r++)
		this.t.rows[r] = [];
}

adv.table.prototype.RemoveAllRows = function()
{
	this.t.rows = [];
}

adv.table.prototype.SetNbRows = function(nb)
{
	const nbCurrent = this.GetNbRows();
	if (nbCurrent > nb)
	{
		this.RemoveRowAt(nb, nbCurrent-nb);
	}
	else if (nbCurrent < nb)
	{
		for (let i=0;i<nb-nbCurrent;i++)
			this.AddRow();
	}
}

adv.table.prototype.ToHTML = function()
{
	const t = this.t;
	var html;

	html  = '<table>';
	html += '<thead><tr>';
	for (let c = 0; c < t.columns.length; c++)
		html += '<th>'+t.columns[c][0]+'</th>';
	html += '</tr></thead>';

	html += '<tbody>';
	for (let r = 0; r < t.rows.length; r++)
	{
		html += '<tr>';
		for (let c = 0; c < t.columns.length; c++)
			html += '<td>'+t.rows[r][c]+'</td>';
		html += '</tr>';
	}
	html += '</tbody>';
	html += '</table>';
	return html;
}

adv.table.CmpString = function(a, b)
{
	return a.toString().localeCompare(b.toString());
}

adv.table.CmpInt = function(a, b)
{
	return parseInt(a)-parseInt(b);
}

adv.table.CmpFloat = function(a, b)
{
	return parseFloat(a)-parseFloat(b);
}

adv.table.CmpChrono = function(a, b)
{
	const chronoA = parseInt(a);
	const chronoB = parseInt(b);
	
	if ((chronoA >= adv.chrono.OK) && (chronoB >= adv.chrono.OK))
	{
		return chronoA - chronoB;
	}
	else
	{
		const orderA = adv.GetChronoOrder(chronoA);
		const orderB = adv.GetChronoOrder(chronoB);
		return orderA - orderB;
	}
}

adv.table.CmpRanking = function(a, b)
{
	const rkA = parseInt(a);
	const rkB = parseInt(b);
	
	if (rkA > 0 && rkB > 0)
	{
		return rkA - rkB;
	}
	else
	{
		if (rkA <= 0 && rkB <= 0)
			return 0;
		else if (rkA > 0)
			return -1;
		else
			return 1;
	}
}

adv.table.IsOkString = function(a)
{
	return true;
}

adv.table.IsOkInt = function(a)
{
	if (a == null || a == '') 
		return false;
	else
		return true;
}

adv.table.IsOkFloat = function(a)
{
	if (a == null || a == '') 
		return false;
	else
		return true;
}

adv.table.IsOkChrono = function(a)
{
	if (a == null || a == '') 
		return false;
	else if (parseInt(a) >= adv.chrono.OK)
		return true;
	else
		return false;
}

adv.table.IsOkRanking = function(a)
{
	if (a == null || a == '') 
		return false;
	else if (parseInt(a) >= 1)
		return true;
	else
		return false;
}

adv.table.Cmp = function(table)
{
	return function(a, b) {
		const t = table.t;
		for (let k = 0; k < t.order_array.length; k++)
		{
			const col = t.order_array[k].col;
			const fnCmp = t.order_array[k].cmp;
			const cmp = fnCmp(a[col], b[col]);
			if (cmp != 0) 
			{
				if (t.order_array[k].asc)
					return cmp;
				else
					return -cmp;
			}
		}
		return 0;
	}
}

adv.table.sql_type = new Map();
adv.table.sql_type.set(adv.index_type.CHAR, {name : 'CHAR', cmp : adv.table.CmpString, ok : adv.table.IsOkString});
adv.table.sql_type.set(adv.index_type.VARCHAR, {name : 'VARCHAR', cmp : adv.table.CmpString, ok : adv.table.IsOkString});
adv.table.sql_type.set(adv.index_type.TEXT, {name : 'TEXT', cmp : adv.table.CmpString, ok : adv.table.IsOkString});

adv.table.sql_type.set(adv.index_type.SHORT, {name : 'SHORT', cmp : adv.table.CmpInt, ok : adv.table.IsOkInt});
adv.table.sql_type.set(adv.index_type.LONG, {name : 'LONG', cmp : adv.table.CmpInt, ok : adv.table.IsOkInt});
adv.table.sql_type.set(adv.index_type.DOUBLE, {name : 'DOUBLE', cmp : adv.table.CmpFloat, ok : adv.table.IsOkFloat});

adv.table.sql_type.set(adv.index_type.CHRONO, {name : 'CHRONO', cmp : adv.table.CmpChrono, ok : adv.table.IsOkChrono});
adv.table.sql_type.set(adv.index_type.CHRONO_INV, {name : 'CHRONO_INV', cmp : adv.table.CmpChrono, ok : adv.table.IsOkChrono});
adv.table.sql_type.set(adv.index_type.RANKING, {name : 'RANKING', cmp : adv.table.CmpRanking, ok : adv.table.IsOkRanking});

adv.table.GetType = function(typeName)
{
	const it = adv.table.sql_type.entries();
	let n = it.next();
	while (n.done == false)
	{
		if (n.value[1].name == typeName)
			return n.value[0];
		n = it.next();
	}
	return 0;
}

adv.table.prototype.GetOrderArray = function(expr)
{
	const order_array = new Array();

	const tokens = expr.split(',');
	for (let i = 0; i < tokens.length; i++)
	{
		const token = tokens[i].trim().split(' ');
		const c = this.GetIndexColumn(token[0].trim());
		if (c >= 0)
		{
			const orderItem = {col : c, asc : true, cmp : adv.table.CmpString, ok : adv.table.IsOkString};
			if (token.length > 1)
			{
				const asc = token[1].trim().toUpperCase();
				if (asc == "DESC")
					orderItem.asc = false;
			}

			const columnType = this.GetColumnType(c);
			const key = adv.table.sql_type.get(columnType);
			if (key && typeof key == 'object')
			{
				if (typeof key.cmp == 'function')
					orderItem.cmp = key.cmp;
				if (typeof key.ok == 'function')
					orderItem.ok = key.ok;
			}

			order_array.push(orderItem);
		}
	}
	
	return order_array;
}

adv.table.prototype.GetOrderArrayInt = function(expr)
{
	const order_array = new Array();

	const tokens = expr.split(',');
	for (let i = 0; i < tokens.length; i++)
	{
		const token = tokens[i].trim().split(' ');
		const c = this.GetIndexColumn(token[0].trim());
		if (c >= 0)
		{
			const orderItem = {col : c, asc : true, cmp : adv.table.CmpInt, ok : adv.table.IsOkString};
			if (token.length > 1)
			{
				const asc = token[1].trim().toUpperCase();
				if (asc == "DESC")
					orderItem.asc = false;
			}
			order_array.push(orderItem);
		}
	}
	
	return order_array;
}

adv.table.prototype.OrderBy = function(expr)
{
	const t = this.t;
	t.order_array = this.GetOrderArray(expr);
	if (typeof t.rows.sort == 'function')
		t.rows.sort(adv.table.Cmp(this));
}

adv.table.prototype.OrderByInteger = function(expr)
{
	const t = this.t;
	t.order_array = this.GetOrderArrayInt(expr);
	if (typeof t.rows.sort == 'function')
		t.rows.sort(adv.table.Cmp(this));
}

adv.table.prototype.SortHeaderColumn = function(col)
{
	const c = this.GetIndexColumn(col);

	const t = this.t;
	if (t.sort_header_column == c)
	{
		if (t.sort_header_asc)
			t.sort_header_asc = false;
		else
			t.sort_header_asc = true;
	}
	else
	{
		t.sort_header_column = c;
		t.sort_header_asc = true;
	}

	const order_array = [ { col : c, asc : t.sort_header_asc, cmp : adv.table.CmpString, ok : adv.table.IsOkString} ];
	const key = adv.table.sql_type.get(this.GetColumnType(c));
	if (key && typeof key == 'object')
	{
		if (typeof key.cmp == 'function')
			order_array[0].cmp = key.cmp;
		if (typeof key.ok == 'function')
			order_array[0].ok = key.ok;
	}

	t.order_array =  order_array;
	t.rows.sort(adv.table.Cmp(this));
}

adv.table.prototype.GetSortHeaderImageHTML = function(col)
{
	const c = this.GetIndexColumn(col);

	const t = this.t;
	if (t.sort_header_column == c)
	{
		if (t.sort_header_asc)
			return '<img src="./img/arrow-asc.png" alt="" width="13" height="13">';
		else
			return '<img src="./img/arrow-desc.png" alt="" width="13" height="13">';
	}
	else
	{
		return '<img src="./img/arrow-sortable_white.png" alt="" width="13" height="13">';
	}
}

adv.table.FilterRow = function(table)
{
	return function(itemRow) {
		return table.t.fn_filter(table, itemRow);
	}
}

adv.table.prototype.Filter = function(fnFilter)
{
	if (fnFilter && typeof(fnFilter) == 'function')
	{
		this.t.fn_filter = fnFilter;
		this.t.rows = this.t.rows.filter(adv.table.FilterRow(this));
	}
}

adv.table.prototype.SetRanking = function(colRk, exprOrder)
{
	if (typeof colRk === 'string') colRk = this.GetIndexColumn(colRk);
	if (typeof colRk === 'number' && colRk >= 0 && colRk < this.GetNbColumns())
	{
		this.OrderBy(exprOrder);
		const rows = this.t.rows;
		const order_array = this.t.order_array;

		var rk = 1;
		var keyPrev;
		
		for (let i = 0; i < rows.length; i++)
		{
			var key = '';
			var isOk = true;
			for (let k = 0; k < order_array.length; k++)
			{
				var value = rows[i][order_array[k].col];
				if (typeof order_array[k].ok == 'function')
					if (!order_array[k].ok(value))
						isOk = false;

				key += value+'|';
			}

			if (key != keyPrev)
			{
				keyPrev = key;
				rk = i+1;
			}

			if (isOk)
				rows[i][colRk] = rk;
			else
				rows[i][colRk] = 0;
		}
	}
}

adv.table.prototype.SetRankingGroup = function(colRk, exprOrder, exprGroup)
{
	if (typeof colRk === 'string') colRk = this.GetIndexColumn(colRk);
	if (typeof colRk === 'number' && colRk >= 0 && colRk < this.GetNbColumns())
	{
		const order_array = this.GetOrderArray(exprOrder);
		const group_array = this.GetOrderArray(exprGroup);

		// Tri suivant Group puis Order ...
		const order_total_array = new Array();
		for (let c = 0;c < group_array.length; c++) order_total_array.push(group_array[c]);
		for (let c = 0;c < order_array.length; c++) order_total_array.push(order_array[c]);

		const t = this.t;
		t.order_array = order_total_array;
		t.rows.sort(adv.table.Cmp(this));

		const rows = t.rows;
	
		var rk = 1;
		var countGroup = 0;
		var keyPrev, keyGroupPrev;
	
		for (let i = 0; i < rows.length; i++)
		{
			var keyGroup = '';
			for (let k = 0; k < group_array.length; k++)
				keyGroup += rows[i][group_array[k].col]+'|';

			if (keyGroup == keyGroupPrev)
			{
				++countGroup;
			}
			else
			{
				countGroup = 1;
				keyGroupPrev = keyGroup;
				keyPrev = '';
			}

			var key = '';
			var isOk = true;
			for (let k = 0; k < order_array.length; k++)
			{
				var value = rows[i][order_array[k].col];
				if (typeof order_array[k].ok == 'function')
					if (!order_array[k].ok(value))
						isOk = false;

				key += value+'|';
			}

			if (key != keyPrev)
			{
				keyPrev = key;
				rk = countGroup;
			}

			if (isOk)
				rows[i][colRk] = rk;
			else
				rows[i][colRk] = 0;
		}
	}
}

adv.table.prototype.DeleteRankingTime = function(row, colTime, colRank, oldTime)
{
	if (oldTime >= adv.chrono.OK)
	{
		for (let r=0;r<this.GetNbRows(); r++)
		{
			if (r != row)
			{
				var time = this.GetCellInt(colTime, r);
				if (time > oldTime)
				{
					this.SetCell(colRank, r, this.GetCellInt(colRank, r)-1);
				}
			}
		}
	}
}

adv.table.prototype.InsertRankingTime = function(row, colTime, colRank, newTime)
{
	this.SetCell(colTime, row, newTime);
	
	if (newTime < adv.chrono.OK)
	{
		// Temps Non Ok => Aucune Influence sur le classement ...
		this.SetCell(colRank, row, 0); 
	}
	else
	{
		var countBest = 0;
		for (let r=0;r<this.GetNbRows(); r++)
		{
			if (r != row)
			{
				var time = this.GetCellInt(colTime, r);
				if (time >= adv.chrono.OK)
				{
					if (time < newTime)
					{
						++countBest;
					}
					else if (time > newTime)
					{
						this.SetCell(colRank, r, this.GetCellInt(colRank, r)+1);
					}
				}
			}
		}

		this.SetCell(colRank, row, countBest+1);
	}
}

adv.table.prototype.UpdateRankingTime = function(rowCurrent, colTime, colRank, oldTime, newTime)
{
	if (rowCurrent >= 0 && rowCurrent < this.GetNbRows())
	{
		this.DeleteRankingTime(rowCurrent, colTime, colRank, oldTime);
		this.InsertRankingTime(rowCurrent, colTime, colRank, newTime);
	}
}

adv.table.prototype.DeleteRankingGroupTime = function(row, colTime, colRank, oldTime, group_array, keyCurrentGroup)
{
	if (oldTime >= adv.chrono.OK)
	{
		for (let r=0;r<this.GetNbRows(); r++)
		{
			if (r != row)
			{
				var time = this.GetCellInt(colTime, r);
				if (time > oldTime)
				{
					var keyGroup = '';
					for (let k = 0; k < group_array.length; k++)
						keyGroup += this.GetCell(group_array[k].col, r)+'|';

					if (keyGroup == keyCurrentGroup)
						this.SetCell(colRank, r, this.GetCellInt(colRank, r)-1);
				}
			}
		}
	}
}

adv.table.prototype.InsertRankingGroupTime = function(row, colTime, colRank, newTime, group_array, keyCurrentGroup)
{
	this.SetCell(colTime, row, newTime);
	
	if (newTime < adv.chrono.OK)
	{
		// Temps Non Ok => Aucune Influence sur le classement ...
		this.SetCell(colRank, row, 0); 
	}
	else
	{
		var countBest = 0;
		for (let r=0;r<this.GetNbRows(); r++)
		{
			if (r != row)
			{
				var time = this.GetCellInt(colTime, r);
				if (time >= adv.chrono.OK)
				{
					var keyGroup = '';
					for (let k = 0; k < group_array.length; k++)
						keyGroup += this.GetCell(group_array[k].col, r)+'|';

					if (keyGroup == keyCurrentGroup)
					{
						if (time < newTime)
						{
							++countBest;
						}
						else if (time > newTime)
						{
							this.SetCell(colRank, r, this.GetCellInt(colRank, r)+1);
						}
					}
				}
			}
		}

		this.SetCell(colRank, row, countBest+1);
	}
}

adv.table.prototype.UpdateRankingGroupTime = function(rowCurrent, colTime, colRank, oldTime, newTime, exprGroup)
{
	const group_array = this.GetOrderArray(exprGroup);
	if (rowCurrent >= 0 && rowCurrent < this.GetNbRows())
	{
		var keyCurrentGroup = '';
		for (let k = 0; k < group_array.length; k++)
			keyCurrentGroup += this.GetCell(group_array[k].col, rowCurrent)+'|';

		this.DeleteRankingGroupTime(rowCurrent, colTime, colRank, oldTime, group_array, keyCurrentGroup);
		this.InsertRankingGroupTime(rowCurrent, colTime, colRank, newTime, group_array, keyCurrentGroup);
	}
}

adv.table.prototype.ComputeRankBib = function(colTime, bib, colCateg='', colBib='Dossard')
{
	var cBib = this.GetIndexColumn(colBib);
	if (cBib >= 0 && cBib < this.GetNbColumns())
	{
		for (let r=0;r<this.GetNbRows(); r++)
		{
			if (this.GetCell(cBib, r) == bib)
				return this.ComputeRank(colTime, r, colCateg); 
		}
	}

	return '';
}

adv.table.prototype.ComputeRank = function(colTime, row, colCateg='')
{
	var cTime = this.GetIndexColumn(colTime);

	var cCateg = this.GetIndexColumn(colCateg);
	if (cCateg >= 0)
		valueCateg = this.GetCell(cCateg, row);
	
	if (cTime >= 0 && cTime < this.GetNbColumns())
	{
		const curTime = this.GetCellInt(cTime, row);
		if (curTime < adv.chrono.OK)
			return '';

		var rk = 1;
		for (let r=0;r<this.GetNbRows(); r++)
		{
			if (r == row)
			{
				continue;
			}
			
			if (cCateg >= 0 && valueCateg != '')
			{
				if (this.GetCell(cCateg, r) != valueCateg)
					continue;
			}
			
			var time = this.GetCellInt(cTime, r);
			if (time >= adv.chrono.OK && time < curTime)
			{
				++rk;
			}
		}
		
		return rk;
	}
	
	return '';
}

adv.table.prototype.GetBestTime = function(colTime, colCateg='', valueCateg='', colBib='Dossard', bib='')
{
	var cTime = this.GetIndexColumn(colTime);
	var cCateg = this.GetIndexColumn(colCateg);
	var cBib = this.GetIndexColumn(colBib);

	var bestTime = adv.chrono.KO;
	if (cTime >= 0 && cTime < this.GetNbColumns())
	{
		for (let r=0;r<this.GetNbRows(); r++)
		{
			if (cBib >= 0 && bib != '')
			{
				if (this.GetCell(cBib, r) == bib)
					continue;
			}
			
			if (cCateg >= 0 && valueCateg != '')
			{
				if (this.GetCell(cCateg, r) != valueCateg)
					continue;
			}
			
			var time = this.GetCellInt(cTime, r);
			if (time >= adv.chrono.OK)
			{
				if (bestTime == adv.chrono.KO || bestTime > time)
					bestTime = time;
			}
		}
	}

	return bestTime;
}

adv.table.prototype.GetDiffTime = function(columnTime, row, columnCateg='', columnBib='Dossard')
{
	var colTime = this.GetIndexColumn(columnTime);
	var colCateg = this.GetIndexColumn(columnCateg);
	var colBib = this.GetIndexColumn(columnBib);
	var valueCateg = '';
	
	if (colCateg >= 0)
		valueCateg = this.GetCell(colCateg, row);

	var bestTime = this.GetBestTime(colTime, colCateg, valueCateg, colBib, this.GetCell(colBib, row));
	if (bestTime >= adv.chrono.OK)
	{
		const bibTime = this.GetCellInt(colTime, row);
		if (bibTime >= adv.chrono.OK)
			return bibTime - bestTime;
	}
	
	return null;
}

adv.table.prototype.ComputeDiffTime = function(colTime, colDiff)
{
	var cTime = this.GetIndexColumn(colTime);
	var cDiff = this.GetIndexColumn(colDiff);
	
	if (cTime >= 0 && cTime < this.GetNbColumns() && cDiff >= 0 && cDiff < this.GetNbColumns())
	{
		const timeBest = this.GetBestTime(cTime);
		if (timeBest >= adv.chrono.OK)
		{
			for (let i=0;i<this.GetNbRows();i++)
			{
				const time = this.GetCell(cTime,i);
				if (time >= adv.chrono.OK)
					this.SetCell(cDiff,i, time-timeBest);
				else
					this.SetCell(cDiff,i,'');
			}
		}
		else
		{
			for (let i=0;i<this.GetNbRows();i++)
			{
				this.SetCell(cDiff,i,'');
			}
		}
		return true;
	}
	else
	{
		return false;
	}
}

/**
 * Ces deux accesseurs retournent TOUJOURS une adv.table exploitable.
 *
 * Auparavant GetTable levait une exception si la trame n'avait pas de `tables`
 * et GetTableUnique retournait null : comme la grande majorite des appelants
 * enchainent directement sur .GetNbRows() ou .GetCell(), toute trame arrivant
 * avant le chargement de la course plantait la page. Une table vide se rend
 * comme "pas encore de donnees", ce qui est le comportement voulu.
 *
 * Pour distinguer reellement "absente" de "vide", utiliser adv.IsTableUnique
 * ou tester canoe.notify_race / canoe.notify_ranking.
 */
adv.GetTable = function(objBase, tName)
{
	if (objBase && typeof objBase === 'object' && objBase.tables && typeof objBase.tables === 'object')
		return new adv.table(tName, objBase.tables[tName+'<sqlTable>']);

	return new adv.table(tName);
}

adv.GetTableUnique = function(objBase, tName)
{
	if (objBase && typeof objBase === 'object')
		return new adv.table(tName, objBase[tName+'<sqlTable>']);

	return new adv.table(tName);
}

adv.IsTableUnique = function(objBase, tName)
{
	// objBase peut etre undefined tant que rien n'est charge : on repond faux
	// au lieu de lever une exception.
	if (!objBase || typeof objBase !== 'object')
		return false;

	return typeof objBase[tName+'<sqlTable>'] === 'object';
}

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

adv.table.prototype.ToTableHTML = function()
{
	var html;
	html  = '<table class="table table-striped">';
	html += '<thead class="table-dark">';
	html += '<tr>';

	for (let col=0;col<this.GetNbColumns();col++)
	{
		html += '<th class="text-center" data-sort-header="'+name+'">';
		html += this.GetColumnLabel(col);
		html += '</th>';
	}
	
	html += '</tr>';
	html += '</thead>';

	html += '<tbody>'
	for (let row = 0; row < this.GetNbRows(); row++)
	{
		html += '<tr>';
		for (let col=0;col<this.GetNbColumns();col++)
		{
			html += '<td';
			var alignHorz =  this.GetColumnAlignmentHorz(col);
			if (alignHorz == adv.align_horz.CENTER)
				html += ' class="text-center"';
			else if (alignHorz == adv.align_horz.RIGHT)
				html += ' class="text-end"';
			html += '>';
			html += this.GetCell(col, row);
			html += '</td>';
		}
		html += '</tr>';
	}
	html += '</tbody>';
	html += '</table>';
	return html;
}

adv.table.prototype.ToHTML_Bootstrap = function(lstColumns)
{
	const t = this.t;

	var html;
	html  = '<table class="table table-striped">';
	html += '<thead class="table-dark">';
	html += '<tr>';

	for (let j=0;j<lstColumns.length;j++)
	{
		const name = lstColumns[j];
		const col = this.GetIndexColumn(name);
		if (col >= 0)
		{
			html += '<th class="text-center" data-sort-header="'+name+'">';
			html += this.GetColumnLabel(col);
			html += '</th>';
		}
	}
	
	html += '</tr>';
	html += '</thead>';

	html += '<tbody>'
	for (let row = 0; row < this.GetNbRows(); row++)
	{
		html += '<tr>';
		for (let j=0;j<lstColumns.length;j++)
		{
			const name = lstColumns[j];
			const col = this.GetIndexColumn(name);
			if (col >= 0)
			{
				html += '<td';
				var alignHorz =  this.GetColumnAlignmentHorz(col);
				if (alignHorz == adv.align_horz.CENTER)
					html += ' class="text-center"';
				else if (alignHorz == adv.align_horz.RIGHT)
					html += ' class="text-end"';
				html += '>';
				html += this.GetCell(col, row);
				html += '</td>';
			}
		}
		html += '</tr>';
	}
	html += '</tbody>';
	html += '</table>';
	return html;

/*
	document.getElementById("main").innerHTML = html;
	[].forEach.call(document.querySelectorAll('#main table thead th[data-sort-header]'), function(el) {
		const sortColumn = el.getAttribute("data-sort-header");
		el.innerHTML += '&nbsp;'+tRanking.GetSortHeaderImageHTML(sortColumn);
		el.style.cursor = "pointer";
		el.addEventListener('click', function() {
			tRanking.SortHeaderColumn(sortColumn);
			SetBodyRanking();
		})
	});
*/
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

adv.SetMessage = function(objJSON, elLine)
{
	if (objJSON && typeof objJSON === "object") 
	{
		if (objJSON.action == 'add')
		{
			if (typeof elLine === "object")
			{
				elLine.classList.remove('error');
				elLine.classList.remove('warning');
				elLine.classList.remove('success');
				elLine.classList.remove('info');
				if (objJSON.type == adv.msg.ERROR)
					elLine.classList.add('error');
				else if (objJSON.type == adv.msg.WARNING)
					elLine.classList.add('warning');
				else if (objJSON.type == adv.msg.SUCCESS)
					elLine.classList.add('succes');
				else if (objJSON.type == adv.msg.INFO)
					elLine.classList.add('info');

				elLine.innerHTML = objJSON.line;
			}
		}
		else if (objJSON.action == 'progression')
		{
			if (typeof elLine === "object")
				elLine.innerHTML = objJSON.line;
		}
	}
}

adv.SetMessageBootstrap = function(objJSON, elLine, elhisto)
{
	if (objJSON && typeof objJSON === "object") 
	{
		if (objJSON.action == 'add')
		{
			if (typeof elLine === "object")
			{
				elLine.classList.remove('alert-danger');
				elLine.classList.remove('alert-warning');
				elLine.classList.remove('alert-success');
				elLine.classList.remove('alert-info"');
				
				if (objJSON.type == adv.msg.ERROR)
					elLine.classList.add('alert-danger');
				else if (objJSON.type == adv.msg.WARNING)
					elLine.classList.add('alert-warning');
				else if (objJSON.type == adv.msg.SUCCESS)
					elLine.classList.add('alert-success');
				else if (objJSON.type == adv.msg.INFO)
					elLine.classList.add('alert-info"');

				if (objJSON.line == '')
					elLine.innerHTML = '&nbsp;';
				else
					elLine.innerHTML = objJSON.line;
			}
			
			if (typeof elhisto === "object")
			{
				var html = '<li class="list-group-item';
				if (objJSON.type == adv.msg.ERROR)
					html += ' list-group-item-danger';
				else if (objJSON.type == adv.msg.WARNING)
					html += ' list-group-item-warning';
				else if (objJSON.type == adv.msg.SUCCESS)
					html += ' list-group-item-success';
				else if (objJSON.type == adv.msg.INFO)
					html += ' list-group-item-info';
				html += '">';

				if (objJSON.line == '')
					html += '&nbsp;';
				else
					html += objJSON.line;

				html += '</li>';
				
				elhisto.innerHTML = html + elhisto.innerHTML;
			}
		}
		else if (objJSON.action == 'progression')
		{
			if (typeof elLine === "object")
				elLine.innerHTML = objJSON.line;
		}
	}
}

adv.GetNavigatorWidth = function()
{
	return window.innerWidth;
}
