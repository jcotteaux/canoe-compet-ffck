<?php
class advTable
{
	var $m_t;
	
	public function __construct()
	{
		$this->m_t = NULL;
	}

    public static function JSON_TableUnique($jsonData, $name)
	{
        $instance = new self();

		$arrayJson = json_decode($jsonData, true);
		if (isset($arrayJson[$name.'<sqlTable>']))
		{
			$instance->m_t = $arrayJson[$name.'<sqlTable>'];
			$instance->m_t['name'] = $name;
		}
		
        return $instance;
    }
	
	public function IsOk()
	{
		if (gettype($this->m_t) == 'array')
		{
			if (gettype($this->m_t['rows']) == 'array')
				return true;
		}
		return false;
	}
	
	public function GetNbRows()
	{
		if (gettype($this->m_t) == 'array')
		{
			if (gettype($this->m_t['rows']) == 'array')
				return count($this->m_t['rows']);
		}
		return 0;
	}
	
	public function GetNbColumns()
	{
		if (gettype($this->m_t) == 'array')
		{
			if (gettype($this->m_t['columns']) == 'array')
				return count($this->m_t['columns']);
		}
		return 0;
	}

	public function GetIndexColumn($col)
	{
		if (is_int($col))
			return intval($col);
		else
		{
			for ($c=0;$c<$this->GetNbColumns();$c++)
			{
				if ($this->m_t['columns'][$c][0] == $col)
					return $c;
			}
			return -1;
		}
	}

	public function GetColumnName($col, $valDefault='')
	{
		$c = $this->GetIndexColumn($col);
		if ($c >= 0 && $c < $this->GetNbColumns())
			return $this->m_t['columns'][$c][0];
		else
			return $valDefault;
	}

	public function GetColumnLabel($col, $valDefault='')
	{
		$c = $this->GetIndexColumn($col);
		if ($c >= 0 && $c < $this->GetNbColumns())
			return $this->m_t['columns'][$c][1];
		else
			return $valDefault;
	}

	public function GetCell($col, $row, $valDefault='')
	{
		if ($this->GetNbRows() > $row)
		{
			$c = $this->GetIndexColumn($col);
			if ($c >= 0 && $c < $this->GetNbColumns())
				return $this->m_t['rows'][$row][$c];
		}
		return $valDefault;
	}

	public function AddRow($count=1)
	{
		for ($i=0;$i<$count;$i++)
		{
			$row = array();
			for ($c=0;$c<$this->GetNbColumns();$c++)
				array_push($row, '');

			array_push($this->m_t['rows'], $row);
		}
		return $this.GetNbRows()-1;
	}
}
?>
