import{escapeHtml,changerOrientation,log}from'./utils.js?v=2.2.0';import{BasePeripheriqueUI}from'./base_peripherique_ui.js?v=2.2.0';import{DEFAULT_POLL_DELAY,HeatState}from'./constants.js?v=2.2.0';import{loadLanguage}from'./languageManager.js?v=2.2.0';class PreDepartUI extends BasePeripheriqueUI{constructor(){super()
this.appName='pre_depart';this.container=document.getElementById('start-list-container');this.nbSerieCache=0;this.pollingTimerId=null;this.delay=DEFAULT_POLL_DELAY;this.competitionCode=null;this.clockIntervalId=null;}
_configureFetchParameters(){this.fetchState=`${HeatState.EN_ATTENTE},${HeatState.PRET}`;this.noHeatsMessage=window.APP_TEXTS.pre_depart.noHeatsAvailable;}
async initialize(pass=false){await super.initialize(pass);this.startLiveClock();}
async checkCurrentHeatStatus(heat){try{const result=await this.peripheriquesPersistenceManager.getHeatStatus(heat.id);if(this.syncManager)this.syncManager.reportServerStatus(true);if(!result.success)return;if(result.etat>HeatState.PRET){log.info(`[Pre-Depart] La série ${heat.id} est partie. Passage à la suivante.`);this.handleExternalCompletion(heat.id);return;}
if(heat.etat===HeatState.EN_ATTENTE&&result.etat===HeatState.PRET){log.info(`[Pre-Depart] La série ${heat.id} est devenue PRÊTE. Rechargement des noms...`);await this.fetchAndDisplayHeats();}}catch(e){log.warn("Erreur Heartbeat check:",e);if(this.syncManager)this.syncManager.reportServerStatus(false);}}
renderCurrentHeat(){super.renderCurrentHeat();const nextButton=this.container.querySelector('[data-action="next-heat"]');if(nextButton){if(this.currentHeatIndex>=this.upcomingHeats.length-1){nextButton.style.display='none';}else{nextButton.style.display='inline-block';}}}
startLiveClock(){if(this.clockIntervalId){clearInterval(this.clockIntervalId);}
if(this.clockIntervalId){clearInterval(this.clockIntervalId);}
this.clockIntervalId=setInterval(()=>{const clockElement=document.getElementById('live-clock-display');if(clockElement){const now=new Date();const hours=String(now.getHours()).padStart(2,'0');const minutes=String(now.getMinutes()).padStart(2,'0');const seconds=String(now.getSeconds()).padStart(2,'0');clockElement.textContent=`${hours}:${minutes}:${seconds}`;}},1000);}
_renderTable(heat){const isEmpty=!heat.slots.some(s=>s.participant&&s.participant.id);if(heat.etat===HeatState.EN_ATTENTE||isEmpty){return`
                <div class="waiting-for-qualifiers">
                <h3>⏳ ${window.APP_TEXTS.speaker.waitingForParticipants || "Série en attente de qualifiés..."}</h3>
                </div>`;}
const prioColorsClasses=['prio-red','prio-green','prio-blue','prio-yellow'];const prioLetters=['R','V','B','J'];let rowsHtml='';heat.slots.forEach(slot=>{if(!slot.participant||!slot.participant.id)return;const colorIndex=(slot.prioDepart-1)%prioColorsClasses.length;rowsHtml+=`
                <tr>
                    <td class="col-prio-start"><div class="couleur-box ${prioColorsClasses[colorIndex]}">${prioLetters[colorIndex]}</div></td>
                    <td class="col-bib-start">${escapeHtml(slot.participant.bib)}</td>
                    <td>${escapeHtml(slot.participant.name)}</td>
                </tr>`;});return`
            <table class="heat-table-start">
                <thead>
                    <tr>
                        <th class="col-prio-start">${window.APP_TEXTS.headerPrio}</th>
                        <th class="col-bib-start">${window.APP_TEXTS.headerBibBref}</th>
                        <th>${window.APP_TEXTS.headerName}</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>`;}
_renderActionButtons(heat){return`
            <div class="action-button-container">
                <div class="action-zone-nav">
                    <button class="btn-nav btn-nav-left" data-action="previous-heat" title="${window.APP_TEXTS.btnBack}"></button>
                </div>

                <div class="action-zone-center">
                    <div id="live-clock-display" class="live-clock"></div>
                    <button class="btn-sync" data-action="refresh-data" title="${window.APP_TEXTS.jugement.btnRefresh}" style="margin-top: 10px;">
                        <span class="material-icons">sync</span>
                    </button>
                </div>

                <div class="action-zone-nav">
                    <button class="btn-nav btn-nav-right" data-action="next-heat" title="${window.APP_TEXTS.btnForward}"></button>
                </div>
            </div>
                `;}
_getMainActionButtons(heat){return'';}}
document.addEventListener('DOMContentLoaded',async()=>{changerOrientation('paysage');await loadLanguage(['common','peripheriques']);const preStart=new PreDepartUI();document.body.addEventListener('click',(event)=>{const target=event.target.closest('button[data-action], input[data-action]');if(!target)return;const action=target.dataset.action;switch(action){case'next-heat':preStart.handleNextHeat();break;case'previous-heat':preStart.handlePreviousHeat();break;case'refresh-data':preStart.fetchAndDisplayHeats();break;}});window.addEventListener('beforeunload',()=>preStart.destroy());preStart.initialize();});