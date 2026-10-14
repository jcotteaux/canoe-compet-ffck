import{notifyError,changerOrientation,escapeHtml,log}from'./utils.js?v=2.2.0';import{BasePeripheriqueUI}from'./base_peripherique_ui.js?v=2.2.0';import{SpecialStatus,DEFAULT_POLL_DELAY,HeatState}from'./constants.js?v=2.2.0';import{loadLanguage}from'./languageManager.js?v=2.2.0';class PenaliteUI extends BasePeripheriqueUI{constructor(){super();this.appName='penalite';this.container=document.getElementById('start-list-container');this.nbSerieCache=20;this.pollingTimerId=null;this.delay=DEFAULT_POLL_DELAY;this.competitionCode=null;this.zoneIndex=null;this.zoneName="Zone";this.useSyncManager=true;}
_configureFetchParameters(){this.fetchState=`${HeatState.INCOMPLET},${HeatState.PRET_A_VALIDER}`;this.fetchZone=this.zoneIndex;this.noHeatsMessage=`${window.APP_TEXTS.penalite.headerTitle} : ${escapeHtml(this.zoneName)}</br>${window.APP_TEXTS.penalite.noHeatsAvailable}`;}
_renderTable(heat){const prioColors=['--color-prio-red','--color-prio-green','--color-prio-blue','--color-prio-yellow'];const prioColorsText=['--color-text-light','--color-text-light','--color-text-light','--color-text-dark'];const prioColorsClasses=['prio-red','prio-green','prio-blue','prio-yellow'];const prioLetters=['R','V','B','J'];const PENALTY_VALUES=[{label:'CLR',value:'0'},{label:'FLT',value:'2'},{label:'RAL',value:'5'}];let rowsHtml='';heat.slots.forEach(slot=>{if(!slot.participant||!slot.participant.id)return;const colorIndex=(slot.prioDepart-1)%prioColorsClasses.length;const letter=prioLetters[colorIndex];if(slot.participant.specialStatus===SpecialStatus.DNS){rowsHtml+=`
                    <tr class="is-dns">
                        <td class="col-prio-start">
                            <div class="couleur-box ${prioColorsClasses[colorIndex]}">${letter}</div>
                        </td>
                        <td class="col-bib-start">${escapeHtml(slot.participant.bib)}</td>
                        <td class="col-rank-buttons"></td>
                    </tr>`;}else{const currentPenaltyValue=slot.participant.penalite?slot.participant.penalite[this.zoneIndex]||'0':'0';let penaltyButtonsHtml=`<div class="rank-button-group">`;PENALTY_VALUES.forEach(pen=>{const checked=(pen.value===currentPenaltyValue)?'checked':'';penaltyButtonsHtml+=`
                        <label>
                            <input type="radio" name="penalty-${slot.participant.id}" value="${pen.value}" ${checked} 
                                    data-action="update-local-penalty"
                                    data-slot-index="${slot.prioDepart}">
                            <span class="penalty-btn-${pen.label.toLowerCase()}">${pen.label}</span>
                        </label>`;});penaltyButtonsHtml+=`</div>`;rowsHtml+=`
                    <tr style="--prio-color: var(${prioColors[colorIndex]});--prio-text-color: var(${prioColorsText[colorIndex]});">
                        <td class="col-prio-start">
                            <div class="couleur-box ${prioColorsClasses[colorIndex]}">${letter}</div>
                        </td>
                        <td class="col-bib-start">${escapeHtml(slot.participant.bib)}</td>
                        <td class="col-rank-buttons">${penaltyButtonsHtml}</td>
                    </tr>`;}});return`
            <table class="heat-table-start">
                <thead>
                    <tr>
                        <th class="col-prio-start">${window.APP_TEXTS.headerPrio}</th>
                        <th class="col-bib-start">${window.APP_TEXTS.headerBibBref}</th>
                        <th class="col-rank">${window.APP_TEXTS.penalite.headerPenaltyAction}</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>`;}
_getMainActionButtons(heat){return`<div class="main-action-wrapper"><button class="btn-en-place btn-validate" data-action="validate-penalties">${window.APP_TEXTS.penalite.btnValidate}</button></div>`;}
handleLocalPenaltyChange(target){const slotIndex=parseInt(target.dataset.slotIndex,10);const newValue=target.value;const heat=this.upcomingHeats[this.currentHeatIndex];if(heat){const slot=heat.slots.find(s=>s.prioDepart===slotIndex);if(slot&&slot.participant){let pen_array=(slot.participant.penalite||'0'.repeat(10)).split('');pen_array[this.zoneIndex]=newValue;slot.participant.penalite=pen_array.join('');}}}
async handleValidatePenalties(){const button=this.container.querySelector('[data-action="validate-penalties"]');if(button.disabled)return;const heatToValidate=this.upcomingHeats[this.currentHeatIndex];if(!heatToValidate)return;button.disabled=true;button.textContent="Validation...";const penaltiesToSave=heatToValidate.slots.filter(slot=>slot.participant&&slot.participant.id).map(slot=>({slotIndex:slot.prioDepart,newValue:(slot.participant.penalite||'0')[this.zoneIndex]||'0',expectedLastModified:slot.lastModified||null}));if(this.syncManager){this.syncManager.enqueue('validate_zone_penalties',{heatId:heatToValidate.id,zoneIndex:this.zoneIndex,penalties:penaltiesToSave},null);this.handleExternalCompletion(heatToValidate.id);}else{try{await this.peripheriquesPersistenceManager.validateZonePenalties(heatToValidate.id,this.zoneIndex,penaltiesToSave);this.handleExternalCompletion(heatToValidate.id);}catch(error){notifyError(`${window.APP_TEXTS.penalite.alertErrorSaving} ${error.message}`);button.disabled=false;button.textContent=window.APP_TEXTS.penalite.btnValidate;}}}}
document.addEventListener('DOMContentLoaded',async()=>{changerOrientation('portrait');await loadLanguage(['common','peripheriques']);const penaliteApp=new PenaliteUI();document.body.addEventListener('click',(event)=>{const target=event.target.closest('button[data-action]');if(!target)return;const action=target.dataset.action;switch(action){case'next-heat':penaliteApp.handleNextHeat();break;case'previous-heat':penaliteApp.handlePreviousHeat();break;case'validate-penalties':penaliteApp.handleValidatePenalties();break;}});document.body.addEventListener('change',(event)=>{const target=event.target.closest('input[data-action="update-local-penalty"]');if(target){penaliteApp.handleLocalPenaltyChange(target);}});penaliteApp.initialize();});