import{SyncStatus}from'./syncManager.js?v=2.2.0';import{log}from'./utils.js?v=2.2.0';const NETWORK_ICON_SVG=`
<svg class="sync-network-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path class="signal-bar signal-bar-1" d="M3 18h3v4H3z"/>
    <path class="signal-bar signal-bar-2" d="M8 14h3v8H8z"/>
    <path class="signal-bar signal-bar-3" d="M13 10h3v12h-3z"/>
    <path class="signal-bar signal-bar-4" d="M18 6h3v16h-3z"/>
</svg>`;const TOOLTIPS={synced:'Connecté - Données synchronisées',pending:'Connecté - {count} opération(s) en attente',offline:'Hors ligne - Les modifications seront envoyées au retour de la connexion',syncing:'Synchronisation en cours...'};export class SyncIndicator{constructor(containerId=null,inline=false){this.container=containerId?document.getElementById(containerId):null;this.inline=inline;this.element=null;this.currentStatus=null;this._createDOM();}
_createDOM(){this.element=document.createElement('div');this.element.className='sync-indicator sync-synced';if(this.inline){this.element.classList.add('sync-indicator-inline');}
this.element.innerHTML=`
            <span class="sync-icon">${NETWORK_ICON_SVG}</span>
            <span class="sync-text"></span>
        `;this._updateTooltip('synced',0);if(this.container){this.container.appendChild(this.element);}else if(!this.inline){document.body.appendChild(this.element);}}
_updateTooltip(statusKey,count=0){let tooltip=TOOLTIPS[statusKey]||'';if(window.APP_TEXTS?.syncIndicator?.[statusKey]){tooltip=window.APP_TEXTS.syncIndicator[statusKey];}
tooltip=tooltip.replace('{count}',count);this.element.setAttribute('title',tooltip);this.element.setAttribute('aria-label',tooltip);}
update(status,pendingCount=0){const text=this.element.querySelector('.sync-text');this.currentStatus=status;this.element.className='sync-indicator';if(this.inline){this.element.classList.add('sync-indicator-inline');}
switch(status){case SyncStatus.SYNCED:this.element.classList.add('sync-synced');text.textContent='';this._updateTooltip('synced');break;case SyncStatus.PENDING:this.element.classList.add('sync-pending');text.textContent=pendingCount>0?`${pendingCount}`:'';this._updateTooltip('pending',pendingCount);break;case SyncStatus.OFFLINE:this.element.classList.add('sync-offline');text.textContent='';this._updateTooltip('offline');break;case SyncStatus.SYNCING:this.element.classList.add('sync-syncing');text.textContent='';this._updateTooltip('syncing');break;default:this.element.classList.add('sync-synced');text.textContent='';this._updateTooltip('synced');}}
showConflict(message){const notification=document.createElement('div');notification.className='sync-conflict-notification';notification.textContent=message;document.body.appendChild(notification);requestAnimationFrame(()=>{notification.classList.add('visible');});setTimeout(()=>{notification.classList.remove('visible');setTimeout(()=>notification.remove(),300);},3000);}
destroy(){if(this.element&&this.element.parentNode){this.element.parentNode.removeChild(this.element);}}}