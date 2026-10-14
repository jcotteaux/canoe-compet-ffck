import{notifyError,changerOrientation,escapeHtml,log}from'./utils.js?v=2.2.0';import{SpecialStatus,DEFAULT_POLL_DELAY,HeatState}from'./constants.js?v=2.2.0';import{BasePeripheriqueUI}from'./base_peripherique_ui.js?v=2.2.0';import{loadLanguage}from'./languageManager.js?v=2.2.0';class ArriveeUI extends BasePeripheriqueUI{constructor(){super();this.appName='arrivee';this.container=document.getElementById('start-list-container');this.nbSerieCache=20;this.pollingTimerId=null;this.delay=DEFAULT_POLL_DELAY;this.competitionCode=null;this.useSyncManager=true;}
_configureFetchParameters(){this.fetchState=HeatState.INCOMPLET;this.noHeatsMessage=window.APP_TEXTS.arrivee.noHeatsAvailable;}
_renderTable(heat){const prioColors=['--color-prio-red','--color-prio-green','--color-prio-blue','--color-prio-yellow'];const prioColorsText=['--color-text-light','--color-text-light','--color-text-light','--color-text-dark'];const prioColorsClasses=['prio-red','prio-green','prio-blue','prio-yellow'];const prioLetters=['R','V','B','J'];const activeParticipantsCount=heat.slots.filter(slot=>slot.participant&&slot.participant.id&&slot.participant.specialStatus!==SpecialStatus.DNS).length;const RANKS=[];for(let i=1;i<=activeParticipantsCount;i++){RANKS.push(String(i));}
RANKS.push(SpecialStatus.DNF);let rowsHtml='';heat.slots.forEach(slot=>{if(!slot.participant||!slot.participant.id)return;const colorIndex=(slot.prioDepart-1)%prioColorsClasses.length;const letter=prioLetters[colorIndex];if(slot.participant.specialStatus===SpecialStatus.DNS){rowsHtml+=`
                    <tr class="is-dns">
                        <td class="col-prio-start">
                            <div class="couleur-box ${prioColorsClasses[colorIndex]}">${letter}</div>
                        </td>
                        <td class="col-bib-start">${escapeHtml(slot.participant.bib)}</td>
                        <td class="col-rank-buttons"></td>
                    </tr>`;}else{let rankButtonsHtml=`<div class="rank-button-group">`;const initialRank=slot.participant.ordre_arrivee||'';const initialStatus=slot.participant.specialStatus||null;RANKS.forEach(rank=>{let checked='';const isDnfAndShouldBeChecked=(rank===SpecialStatus.DNF&&initialStatus===SpecialStatus.DNF);const isRankAndShouldBeChecked=(rank!==SpecialStatus.DNF&&initialRank!=null&&String(initialRank)===rank);if(isDnfAndShouldBeChecked||isRankAndShouldBeChecked){checked='checked';}
rankButtonsHtml+=`
                        <label>
                            <input type="radio" name="rank-${slot.participant.id}" value="${rank}" 
                                data-initial-rank="${initialRank || ''}"
                                data-initial-status="${initialStatus || ''}"
                                ${checked}>
                            <span>${rank}</span>
                        </label>`;});rankButtonsHtml+=`</div>`;rowsHtml+=`
                    <tr style="--prio-color: var(${prioColors[colorIndex]});--prio-text-color: var(${prioColorsText[colorIndex]});" data-participant-id="${slot.participant.id}" data-rankable="true"> 
                        <td class="col-prio-start">
                            <div class="couleur-box ${prioColorsClasses[colorIndex]}">${letter}</div>
                        </td>
                        <td class="col-bib-start">${escapeHtml(slot.participant.bib)}</td>
                        <td class="col-rank-buttons">${rankButtonsHtml}</td>
                    </tr>`;}});return`
            <table class="heat-table-start">
                <thead>
                    <tr>
                        <th class="col-prio-start">${window.APP_TEXTS.headerPrio}</th>
                        <th class="col-bib-start">${window.APP_TEXTS.headerBibBref}</th>
                        <th class="col-rank">${window.APP_TEXTS.arrivee.headerRank}</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>`;}
_getMainActionButtons(heat){return`<button class="btn-en-place btn-validate" data-action="validate-ranks" data-heat-id="${heat.id}">${window.APP_TEXTS.arrivee.btnValidate}</button>`;}
async handleValidateRanksClick(heatId){const button=this.container.querySelector('[data-action="validate-ranks"]');const rankableRows=this.container.querySelectorAll('tr[data-rankable="true"]');const rankedCount=this.container.querySelectorAll('input[type="radio"]:checked').length;if(rankedCount<rankableRows.length){notifyError(window.APP_TEXTS.arrivee.alertIncompleteRanks);return;}
button.disabled=true;button.textContent=window.APP_TEXTS.btnValidating;const heatToValidate=this.upcomingHeats[this.currentHeatIndex];const heatLastModified=heatToValidate?heatToValidate.lastModified:null;const arrivalsPayload=[];rankableRows.forEach(row=>{const participantId=row.dataset.participantId;const slotIndex=this.findSlotIndexForParticipant(participantId);if(!slotIndex)return;const checkedRadio=row.querySelector('input[type="radio"]:checked');const currentSelectedValue=checkedRadio?checkedRadio.value:null;let newRankValue=null;let newStatusValue=null;if(currentSelectedValue===SpecialStatus.DNF){newStatusValue=SpecialStatus.DNF;}else if(currentSelectedValue){newRankValue=currentSelectedValue;}
arrivalsPayload.push({slotIndex,newRank:newRankValue,newStatus:newStatusValue});});if(this.syncManager){this.syncManager.enqueue('record_arrivals',{heatId:parseInt(heatId,10),newState:4,arrivals:arrivalsPayload},heatLastModified);this.handleExternalCompletion(parseInt(heatId,10));}else{try{await this.peripheriquesPersistenceManager.recordArrivals(parseInt(heatId,10),4,arrivalsPayload);this.handleExternalCompletion(parseInt(heatId,10));}catch(error){notifyError(`${window.APP_TEXTS.arrivee.alertErrorSavingRanks} ${error.message}`);button.disabled=false;button.textContent=window.APP_TEXTS.arrivee.btnValidate;}}}
findSlotIndexForParticipant(participantId){const heat=this.upcomingHeats[this.currentHeatIndex];const slot=heat.slots.find(s=>s.participant&&String(s.participant.id)===String(participantId));return slot?slot.prioDepart:null;}}
document.addEventListener('DOMContentLoaded',async()=>{changerOrientation('auto');await loadLanguage(['common','peripheriques']);const arriveeApp=new ArriveeUI();document.body.addEventListener('click',(event)=>{const target=event.target.closest('button[data-action], input[data-action]');if(!target)return;const action=target.dataset.action;switch(action){case'validate-ranks':arriveeApp.handleValidateRanksClick(target.dataset.heatId);break;case'next-heat':arriveeApp.handleNextHeat();break;case'previous-heat':arriveeApp.handlePreviousHeat();break;}});window.addEventListener('beforeunload',()=>arriveeApp.destroy());arriveeApp.initialize();});