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

adv.GetScreenWidth = function()
{
	return window.innerWidth;
}

adv.GetScreenHeight = function()
{
	return window.innerHeight;
}

adv.GetDisplayWidth = function()
{
	return window.screen.width;
}

adv.GetDisplayHeight = function()
{
	return window.screen.height;
}

adv.IsFullscreen = function()
{
	return document.fullscreenElement ||
		 document.mozFullScreenElement ||
		 document.webkitFullscreenElement ||
		 document.msFullscreenElement;
}

adv.ToggleFullscreen = function() 
{
	if (adv.IsFullscreen())
		adv.ExitFullscreen();
	else
		adv.EnterFullscreen();
}

adv.EnterFullscreen = function()
{
	const root = document.documentElement;
	if (root.requestFullscreen) 
	{
		root.requestFullscreen();
	} 
	else if (root.mozRequestFullScreen) 
	{ 
		/* Firefox */
		root.mozRequestFullScreen();
	} 
	else if (root.webkitRequestFullscreen) 
	{
		/* Chrome, Safari and Opera */
		root.webkitRequestFullscreen();
	} 
	else if (root.msRequestFullscreen) 
	{ 
		/* IE/Edge */
		root.msRequestFullscreen();
	}
}

adv.ExitFullscreen = function()
{
	if (document.exitFullscreen)
	{
		document.exitFullscreen();
	} 
	else if (document.mozCancelFullScreen) 
	{ 
		/* Firefox */
		document.mozCancelFullScreen();
	} 
	else if (document.webkitExitFullscreen) 
	{ 
		/* Chrome, Safari and Opera */
		document.webkitExitFullscreen();
	} 
	else if (document.msExitFullscreen) 
	{ 
		/* IE/Edge */
		document.msExitFullscreen();
	}
}

adv.OpenURL = function (url, data) 
{
	if (typeof data === 'object')
	{
		const form = document.createElement("form");
		form.method = "POST";
		form.action = url;

		// Ajouter chaque donnée en tant que champ input caché
		for (const key in data) 
		{
			if (data.hasOwnProperty(key)) 
			{
				const input = document.createElement("input");
				input.type = "hidden";
				input.name = key;
				input.value = data[key];
				form.appendChild(input);
			}
		}

		document.body.appendChild(form);
		form.submit();  // Soumission du formulaire -> Redirection POST
	}
	else
	{
		window.location.href  = url;
	}
}

adv.GetJSON = async function (txtUrl, elm=null) 
{
	try {
		const url = new URL(txtUrl);

		if (elm)
		{
			const dataset = elm.dataset;
			for (const key in dataset) 
			{
				if (dataset.hasOwnProperty(key)) 
					url.searchParams.append(key,dataset[key]);
			}
		}

		const response = await fetch(url.toString());
		if (!response.ok) {
			throw new Error(`Response status : ${response.status}`);
		}
		
		return await response.json();
	} 
	catch (error) {
		console.error(error.message);
	}
}

adv.GetHTML = async function(url) 
{
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error('adv.GetHTML() : network response ko');
		}
		const html = await response.text();
		return html;
	} 
	catch (error) {
		console.error('adv.GetHTML() : fetch operation error :', error);
	}
}

adv.SearchFirstInSameBlock = function(node, name) 
{
	while (node && node !== document) 
	{
		const search_node = node.querySelector(name);
		if (search_node) 
			return search_node; // on renvoie le premier !

		node = node.parentElement;
	}
	return null;   
}

adv.PaginationStep = async function(a) 
{
	try {
		const srcUrl = location.origin + location.pathname;
		const url = new URL(srcUrl);

		const url_params = new URLSearchParams();
		url.searchParams.set('api','pagination');
		
		const aDataset = a.dataset;
		for (const key in aDataset) 
		{
            if (aDataset.hasOwnProperty(key)) 
				url.searchParams.append(key,aDataset[key]);
        }

		const ul = adv.SearchFirstInSameBlock(a, 'ul');
		if (ul)
		{
			const ulDataset = ul.dataset;
			for (const key in ulDataset) 
			{
				if (ulDataset.hasOwnProperty(key)) 
					url.searchParams.append(key,ulDataset[key]);
			}
		
			const json = await adv.GetJSON(url.toString());
			const table = adv.SearchFirstInSameBlock(ul, 'table');
			if (table && json)
			{
				table.tBodies[0].innerHTML = json.html;
				adv.PaginationUpdate(ul, json.pagination_current);
			}
		}
	} 
	catch (error) {
		console.error(error.message);
	}
}

adv.PaginationUpdate = function(ul, pagination_current)
{
	if (ul)
	{
		ul.dataset.pagination_current = pagination_current;
		
		const liElements = ul.querySelectorAll('li');
		const liPrev = liElements[0];
		if (liPrev)
		{
			if (pagination_current == 1)
				liPrev.classList.add('disabled');     
			else
				liPrev.classList.remove('disabled');     
		}
		
		const liNext = liElements[liElements.length - 1];
		if (liNext)
		{
			if (pagination_current >= ul.dataset.pagination_max)
				liNext.classList.add('disabled');     
			else
				liNext.classList.remove('disabled');     
		}
		
		const counterElement = adv.SearchFirstInSameBlock(ul, '.pagination-page');
		if (counterElement)
			counterElement.innerHTML = 'Page '+pagination_current.toString()+'/'+ul.dataset.pagination_max.toString();
	}
}

adv.showToto = function () 
{
	Swal.fire({
	  title: "Good job!",
	  text: "You clicked the button!",
	  icon: "success"
	});
}

adv.showMessage = function (html, icon='info') 
{
	Swal.fire({
		title: 'Information',
		html: html,		// => '<div class="text-start">Votre opération a bien été effectuée.<br>Merci de votre confiance.</div>',
		icon: icon,		// => options : 'success', 'error', 'warning', 'question'
		confirmButtonText: 'Fermer',
		customClass: {
			confirmButton: 'btn btn-primary'
		},
		buttonsStyling: false  // Pour que Bootstrap remplace le style natif
	});
}

adv.showConfirm = function () 
{
	Swal.fire({
		title: 'Confirmer la suppression',
		text: 'Cette action est irréversible !',
		icon: 'warning',
		showCancelButton: true,
		confirmButtonText: 'Oui, supprimer',
		cancelButtonText: 'Annuler',
		customClass: {
			confirmButton: 'btn btn-danger',
			cancelButton: 'btn btn-secondary'
		},
		buttonsStyling: false
	}).then((result) => {
		if (result.isConfirmed) {
		  Swal.fire({
			title: 'Supprimé !',
			text: 'L\'élément a été supprimé.',
			icon: 'success',
			confirmButtonText: 'OK',
			customClass: {
			  confirmButton: 'btn btn-primary'
			},
			buttonsStyling: false
		  });
		}
	});
}
