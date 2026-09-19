function OnCommandOrder(objJSON)
{
	if (objJSON !== null)
	{
		if (objJSON.action == 'tv' && objJSON.url !== null)
		{
			document.location.href = objJSON.url;
		}
	}
}

