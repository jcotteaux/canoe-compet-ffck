import{DEFAULT_POLL_DELAY,HeatState}from'./constants.js?v=2.2.0';import{PeripheriquesPersistenceManager}from'./peripheriquesManager.js?v=2.2.0';import{decrypt_AES,notifyError,injectPasswordDialog,log}from'./utils.js?v=2.2.0';import{SyncManager,SyncStatus}from'./syncManager.js?v=2.2.0';import{SyncIndicator}from'./syncIndicator.js?v=2.2.0';export class BasePeripheriqueUI{constructor(){this.delay=DEFAULT_POLL_DELAY;this.competitionCode=null;this.peripheriquesPersistenceManager=null;this.pollingTimerId=null;this.zoneIndex=null;this.zoneName=null;this.__pollFn=null;this.__visibilityHandlerAttached=false;this.upcomingHeats=[];this.currentHeatIndex=0;this.nbSerieCache=5;this.fetchState=null;this.fetchClubInfo=false;this.fetchZone=-1;this.noHeatsMessage="";this.syncManager=null;this.syncIndicator=null;this.useSyncManager=false;this._isShowingNoHeats=false;}
destroy(){this.stopPolling();if(this._boundVisibilityHandler){document.removeEventListener('visibilitychange',this._boundVisibilityHandler);this._boundVisibilityHandler=null;this.__visibilityHandlerAttached=false;}
if(this.clockIntervalId){clearInterval(this.clockIntervalId);this.clockIntervalId=null;}
if(this.syncManager){this.syncManager._stopRecoveryProbing();}
if(this.syncIndicator){this.syncIndicator.destroy();}}
createPersistenceManager(){const deviceId=this.zoneIndex!==null?`${this.appName}_zone${this.zoneIndex}`:this.appName;return new PeripheriquesPersistenceManager(this.competitionCode,deviceId);}
async setupFromUrl(forcePasswordPrompt=false){const urlParams=new URLSearchParams(window.location.search);let paramSource=urlParams;if(urlParams.has('p')){let password='';const requirePass=urlParams.has('pass')||forcePasswordPrompt;if(requirePass){password=await this.demanderMotDePasse();}
const decrypted=decrypt_AES(urlParams.get('p'),password);const params=new URLSearchParams(decrypted);if(!params.has('competition')){throw new Error(window.APP_TEXTS.passwordfail);}
this.competitionCode=params.get('competition');paramSource=params;}else{this.competitionCode=urlParams.get('competition');paramSource=urlParams;}
if(paramSource){const z=paramSource.get('zone');if(z!==null){const zi=Number(z);if(!Number.isNaN(zi))this.zoneIndex=zi;}
const zn=paramSource.get('nom_zone');if(zn!==null&&zn!=='')this.zoneName=zn;}}
demanderMotDePasse(){const dialog=document.getElementById('password-dialog');const form=document.getElementById('password-form');const cancelButton=document.getElementById('cancel-button');const passwordInput=document.getElementById('password-input');if(!dialog||!form||!cancelButton||!passwordInput){const pwd=window.prompt(window.APP_TEXTS.passwordDialog.label)||'';return Promise.resolve(pwd);}
dialog.showModal();try{passwordInput.focus();}catch(_){}
return new Promise((resolve,reject)=>{const handleSubmit=(event)=>{event.preventDefault();const pwd=passwordInput.value||'';cleanup();resolve(pwd);};const handleCancel=()=>{cleanup();window.close();reject(new Error(window.APP_TEXTS.passwordDialog.canceled));};const cleanup=()=>{try{dialog.close();}catch(_){}
try{form.removeEventListener('submit',handleSubmit);}catch(_){}
try{cancelButton.removeEventListener('click',handleCancel);}catch(_){}
try{form.reset();}catch(_){}};form.addEventListener('submit',handleSubmit);cancelButton.addEventListener('click',handleCancel);});}
async initialize(pass=false){injectPasswordDialog();try{await this.setupFromUrl(pass);}catch(error){notifyError(window.APP_TEXTS.passwordfail);await this.initialize(true);return;}
if(!this.competitionCode){this.container.innerHTML=`<h1>${window.APP_TEXTS.errorMissingCompCode}</h1>`;return;}
this._initThemeToggle();this.peripheriquesPersistenceManager=this.createPersistenceManager();document.title=window.APP_TEXTS[this.appName].pageTitle;this._configureFetchParameters();if(this.useSyncManager){await this._initSyncManager();}
this.startPolling(()=>this.tick());this.tick();}
_initThemeToggle(){let savedTheme=localStorage.getItem('kcross_theme');if(!savedTheme){const prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;savedTheme=prefersDark?'dark':'light';}
if(savedTheme==='dark'){document.body.classList.add('dark-mode');}
const btn=document.createElement('button');btn.className='theme-toggle-btn';const tooltipText=window.APP_TEXTS?.themeToggle||"Mode Sombre / Clair";btn.title=tooltipText;const isDark=document.body.classList.contains('dark-mode');btn.innerHTML=`<span class="emoji-theme">${isDark ? '☀️' : '🌙'}</span>`;btn.style.fontSize='20px';btn.addEventListener('click',()=>{document.body.classList.toggle('dark-mode');const currentlyDark=document.body.classList.contains('dark-mode');btn.innerHTML=`<span class="emoji-theme">${currentlyDark ? '☀️' : '🌙'}</span>`;localStorage.setItem('kcross_theme',currentlyDark?'dark':'light');btn.blur();});document.body.appendChild(btn);}
async tick(){const currentHeat=this.upcomingHeats[this.currentHeatIndex];if(!currentHeat){await this.fetchAndDisplayHeats();}else{await this.checkCurrentHeatStatus(currentHeat);}}
async checkCurrentHeatStatus(heat){try{const result=await this.peripheriquesPersistenceManager.getHeatStatus(heat.id);if(this.syncManager)this.syncManager.reportServerStatus(true);if(!result.success)return;let isFinishedElsewhere=false;if(this.appName==='depart'&&result.etat>HeatState.PRET)isFinishedElsewhere=true;if(this.appName==='arrivee'&&result.etat>HeatState.INCOMPLET)isFinishedElsewhere=true;if(this.appName==='penalite'&&this.zoneIndex!==null){const zones=result.zonesJugees||"";if(zones[this.zoneIndex]!=='0')isFinishedElsewhere=true;if(result.etat>=HeatState.OFFICIEL)isFinishedElsewhere=true;}
if(isFinishedElsewhere){log.info(`[Heartbeat] La série ${heat.id} n'est plus à traiter ici. Refresh...`);this.handleExternalCompletion(heat.id);}}catch(e){log.warn("Erreur Heartbeat check:",e);if(this.syncManager)this.syncManager.reportServerStatus(false);}}
handleExternalCompletion(finishedHeatId=null){let indexToRemove=this.currentHeatIndex;if(finishedHeatId!==null){const found=this.upcomingHeats.findIndex(h=>String(h.id)===String(finishedHeatId));if(found===-1){log.info(`[Heartbeat] Série ${finishedHeatId} déjà absente du cache, ignoré.`);return;}
indexToRemove=found;}
this.upcomingHeats.splice(indexToRemove,1);if(this.upcomingHeats.length>0){if(this.currentHeatIndex>=this.upcomingHeats.length){this.currentHeatIndex=this.upcomingHeats.length-1;}
this.renderCurrentHeat();}else{this.currentHeatIndex=0;this._isShowingNoHeats=false;this._renderNoHeatsMessage();if(!this.syncManager||this.syncManager.isOnline){this.fetchAndDisplayHeats();}}}
async fetchAndDisplayHeats(){let currentHeatIdBeforeRefresh=null;if(this.upcomingHeats&&this.upcomingHeats.length>0&&this.upcomingHeats[this.currentHeatIndex]){currentHeatIdBeforeRefresh=this.upcomingHeats[this.currentHeatIndex].id;}
try{if(this.syncManager&&!this.syncManager.isOnline){this._renderNoHeatsMessage();return;}
const fetchResult=await this.peripheriquesPersistenceManager.getNextHeats(this.nbSerieCache,this.fetchState,this.fetchClubInfo,this.fetchZone);if(this.syncManager)this.syncManager.reportServerStatus(true);if(fetchResult&&fetchResult.unchanged===true){return;}
const rawHeats=fetchResult.heats||[];let filteredHeats=rawHeats;if(this.syncManager){filteredHeats=rawHeats.filter(heat=>{const hasPendingState=this.syncManager.hasPendingOperation('update_heat_state',{heatId:heat.id})||this.syncManager.hasPendingOperation('launch_heat',{heatId:heat.id})||this.syncManager.hasPendingOperation('record_arrivals',{heatId:heat.id});const hasPendingZone=this.syncManager.hasPendingOperation('validate_zone_penalties',{heatId:heat.id,zoneIndex:this.zoneIndex});return!hasPendingState&&!hasPendingZone;});}
this.upcomingHeats=this._postProcessHeats(filteredHeats);let newIndex=-1;if(currentHeatIdBeforeRefresh!==null){newIndex=this.upcomingHeats.findIndex(heat=>heat.id===currentHeatIdBeforeRefresh);}
this.currentHeatIndex=(newIndex!==-1)?newIndex:0;if(this.upcomingHeats&&this.upcomingHeats.length>0){this.renderCurrentHeat();}else{this._renderNoHeatsMessage();}}catch(error){log.error("Fetch error:",error);if(this.syncManager)this.syncManager.reportServerStatus(false);}}
renderCurrentHeat(){if(!this.upcomingHeats||this.currentHeatIndex>=this.upcomingHeats.length){this._renderNoHeatsMessage();return;}
const heatToRender=this.upcomingHeats[this.currentHeatIndex];this.renderSingleHeat(heatToRender);const prevButton=this.container.querySelector('[data-action="previous-heat"]');const nextButton=this.container.querySelector('[data-action="next-heat"]');if(prevButton)prevButton.classList.toggle('hidden',this.currentHeatIndex===0);if(nextButton)nextButton.classList.toggle('hidden',this.currentHeatIndex>=this.upcomingHeats.length-1);}
async _initSyncManager(){const deviceId=this.zoneIndex!==null?`${this.appName}_zone${this.zoneIndex}`:this.appName;this.syncManager=new SyncManager(this.competitionCode,deviceId);this.syncIndicator=new SyncIndicator(null,true);this.syncManager.onStatusChange=(status,count)=>{this.syncIndicator.update(status,count);};this.syncManager.onConflict=(conflict)=>{log.info('[BasePeripheriqueUI] Conflit résolu:',conflict.message);this.syncIndicator.showConflict(conflict.message);this.fetchAndDisplayHeats();};await this.syncManager.init();}
_getSyncIndicatorHTML(){if(!this.syncIndicator||!this.syncIndicator.element){return'';}
return this.syncIndicator.element.outerHTML;}
_reattachSyncIndicator(){if(!this.syncIndicator)return;const placeholder=this.container.querySelector('.sync-indicator-placeholder');if(placeholder&&this.syncIndicator.element){placeholder.replaceWith(this.syncIndicator.element);}}
_renderNoHeatsMessage(){if(this._isShowingNoHeats){return;}
this._isShowingNoHeats=true;const syncIndicatorHTML=this.syncIndicator?'<span class="sync-indicator-placeholder"></span>':'';this.container.innerHTML=`
          <div id="no-heats-message">
              <div class="no-heats-header">
                  ${syncIndicatorHTML}
              </div>
              <div class="no-heats-content">
                  ${this.noHeatsMessage}
                  <div id="waiting-widget-container"></div>
              </div>
          </div>
      `;this._reattachSyncIndicator();this._onNoHeatsRendered();}
_onNoHeatsRendered(){}
_configureFetchParameters(){}
_postProcessHeats(heats){return heats.map(heat=>{if(heat.name==='_TEST_RESEAU_'){heat.categoryKey="FORMATION";heat.roundKey="Test";heat.name="";heat.slots.forEach((slot,index)=>{if(!slot.participant||!slot.participant.id||!slot.participant.bib){slot.participant={id:'TEST_BATEAU_'+(index+1),bib:(90+index+1).toString(),name:'Bateau Test '+(index+1),rankTT:index+1,ordre_arrivee:slot.heatResult?slot.heatResult.order:null,specialStatus:slot.heatResult?slot.heatResult.specialStatus:null,penalite:slot.heatResult?slot.heatResult.penalty:null};}});}
return heat;});}
renderSingleHeat(heat){this._isShowingNoHeats=false;const finalHtml=`
        <div class="heat-block-start">
            ${this._renderHeader(heat)}
            ${this._renderTable(heat)}
            ${this._renderActionButtons(heat)}
        </div>
    `;this.container.innerHTML=finalHtml;this._reattachSyncIndicator();const prevButton=this.container.querySelector('[data-action="previous-heat"]');const nextButton=this.container.querySelector('[data-action="next-heat"]');if(prevButton)prevButton.classList.toggle('hidden',this.currentHeatIndex===0);if(nextButton)nextButton.classList.toggle('hidden',this.currentHeatIndex>=this.upcomingHeats.length-1);}
_renderHeader(heat){const displayTime=heat.startTime?heat.startTime.substring(0,5):'--:--';const globalHeatNumberHTML=heat.globalHeatNumber?`<span class="global-heat-number_periph" title="Série n°${heat.globalHeatNumber} de la journée">${heat.globalHeatNumber}</span>`:'';const subtitle=window.APP_TEXTS[this.appName].headerTitle+(this.zoneName?` : ${this.zoneName}`:'');const statusLedHTML=this._getStatusLed?this._getStatusLed(heat):'';const syncIndicatorHTML=this.syncIndicator?'<span class="sync-indicator-placeholder"></span>':'';return`
        <div class="heat-header-start">
            <div class="heat-header-info-start">
                ${globalHeatNumberHTML}
                <div class="heat-title-group">
                    <h2 class="heat-title">${heat.categoryKey} - ${heat.roundKey}<span class="heat-name"> - ${heat.name}</span></h2>
                    <h2 class="page-subtitle">${subtitle}</h2>
                </div>
            </div>
            <div class="heat-header-right-content">
                ${statusLedHTML}
                ${syncIndicatorHTML}
                <span class="heat-time">${displayTime}</span>
            </div>
        </div>`;}
_renderTable(heat){throw new Error("La méthode '_renderTable' doit être implémentée par la classe enfant.");}
_renderActionButtons(heat){return`
        <div class="action-button-container">
            <button class="btn-nav btn-nav-left" data-action="previous-heat" title="${window.APP_TEXTS.btnBack}"></button>
            ${this._getMainActionButtons(heat)}
            <button class="btn-nav btn-nav-right" data-action="next-heat" title="${window.APP_TEXTS.btnForward}"></button>
        </div>
    `;}
_getMainActionButtons(heat){throw new Error("La méthode '_getMainActionButtons' doit être implémentée par la classe enfant.");}
_getStatusLed(heat){return'';}
handleNextHeat(){if(this.currentHeatIndex<this.upcomingHeats.length-1){this.currentHeatIndex++;this.renderCurrentHeat();}}
handlePreviousHeat(){if(this.currentHeatIndex>0){this.currentHeatIndex--;this.renderCurrentHeat();}}
onVisibilityChange(){if(typeof document==='undefined')return;if(document.hidden){if(this.pollingTimerId){clearInterval(this.pollingTimerId);this.pollingTimerId=null;}
if(this.clockIntervalId){clearInterval(this.clockIntervalId);this.clockIntervalId=null;}}else{if(!this.pollingTimerId&&this.__pollFn){this.pollingTimerId=setInterval(()=>{try{this.__pollFn();}catch(e){log.error(e);}},this.delay);}
if(typeof this.startLiveClock==='function'){this.startLiveClock();}}}
startPolling(fn){this.stopPolling();this.__pollFn=fn;if(typeof document!=='undefined'&&!this.__visibilityHandlerAttached){try{this._boundVisibilityHandler=this.onVisibilityChange.bind(this);document.addEventListener('visibilitychange',this._boundVisibilityHandler);this.__visibilityHandlerAttached=true;}catch(_){}}
this.pollingTimerId=setInterval(()=>{try{fn();}catch(e){log.error(e);}},this.delay);}
stopPolling(){if(this.pollingTimerId){clearInterval(this.pollingTimerId);this.pollingTimerId=null;}
this.__pollFn=null;}}