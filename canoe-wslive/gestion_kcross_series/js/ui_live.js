import{HeatState,DEFAULT_POLL_DELAY,SpecialStatus,statusOrder}from'./constants.js?v=2.2.0';import{BasePeripheriqueUI}from'./base_peripherique_ui.js?v=2.2.0';import{escapeHtml,createPenaltySummaryHTML,changerOrientation,log}from'./utils.js?v=2.2.0';import{loadLanguage}from'./languageManager.js?v=2.2.0';class LiveUI extends BasePeripheriqueUI{constructor(){super();this.appName='live';this.container=document.getElementById('start-list-container');this.gateCount=8;this.rollZone=2;this._currentHeatFingerprint=null;this._stickyHeatId=null;}
_configureFetchParameters(){this.nbSerieCache=0;this.fetchState=`${HeatState.PRET},${HeatState.INCOMPLET},${HeatState.PRET_A_VALIDER},${HeatState.OFFICIEL}`;this.fetchClubInfo=true;this.noHeatsMessage=window.APP_TEXTS.live.noHeatsAvailable;}
_postProcessHeats(heatsFromAPI){const realHeats=(heatsFromAPI||[]).filter(h=>h.name!=='_TEST_RESEAU_');if(realHeats&&realHeats.length>0){this.gateCount=realHeats[0].gateCount||8;this.rollZone=realHeats[0].rollZoneAfterGate!==null?realHeats[0].rollZoneAfterGate:2;}
return realHeats;}
_postProcessSingleHeat(heat){if(heat.gateCount)this.gateCount=heat.gateCount;return heat;}
async tick(){try{const fetchResult=await this.peripheriquesPersistenceManager.getNextHeats(0,this.fetchState,this.fetchClubInfo,-1);if(fetchResult&&fetchResult.unchanged===true){return;}
const heatsArray=fetchResult.heats||[];this.upcomingHeats=this._postProcessHeats(heatsArray);const selected=this._selectHeatToDisplay();if(selected){this._stickyHeatId=selected.id;this.currentHeatIndex=this.upcomingHeats.indexOf(selected);this.renderSingleHeat(selected);}else{this._stickyHeatId=null;this._renderNoHeatsMessage();}}catch(e){log.warn("[Live] Tick failed:",e);}}
_selectHeatToDisplay(){const heats=this.upcomingHeats;if(!heats||heats.length===0)return null;const enCours=heats.find(h=>h.etat===HeatState.INCOMPLET);if(enCours)return enCours;if(this._stickyHeatId){const sticky=heats.find(h=>h.id===this._stickyHeatId);if(sticky)return sticky;}
const pret=heats.find(h=>h.etat===HeatState.PRET);if(pret)return pret;const officielles=heats.filter(h=>h.etat===HeatState.OFFICIEL);if(officielles.length>0)return officielles[officielles.length-1];return null;}
_computeHeatFingerprint(heat){if(!heat)return"null";let signature=`${heat.id}_${heat.etat}_${heat.startTime}`;heat.slots.forEach(slot=>{if(slot.participant){signature+=`_${slot.participant.id}_${slot.participant.ordre_arrivee || ''}_${slot.participant.specialStatus || ''}_${slot.participant.penalite || ''}_${slot.participant.finalRank || ''}`;}});return signature;}
renderSingleHeat(heat){const newFingerprint=this._computeHeatFingerprint(heat);if(this._currentHeatFingerprint===newFingerprint)return;this._currentHeatFingerprint=newFingerprint;super.renderSingleHeat(heat);}
_getStatusLed(heat){const statusMap={1:{text:window.APP_TEXTS.status1,class:'led-attente'},2:{text:window.APP_TEXTS.status2,class:'led-programme'},3:{text:window.APP_TEXTS.status3,class:'led-en-cours'},4:{text:window.APP_TEXTS.status4,class:'led-termine'},5:{text:window.APP_TEXTS.status5,class:'led-officiel'},6:{text:window.APP_TEXTS.status6,class:'led-officiel'}};const statusInfo=statusMap[heat.etat]||statusMap[1];return`<div class="heat-status-led-speaker ${statusInfo.class}" title="${statusInfo.text}"></div>`;}
_renderTable(heat){if(heat.slots.length===0){return`<div class="waiting-for-qualifiers">
                        ${window.APP_TEXTS.speaker.waitingForParticipants || "Série en attente de qualifiés..."}
                    </div>`;}
const prioColorsClasses=['prio-red','prio-green','prio-blue','prio-yellow'];const prioLetters=['R','V','B','J'];let rowsHtml='';let slotsToRender=heat.slots;if(heat.etat===HeatState.OFFICIEL){slotsToRender=[...heat.slots].sort((a,b)=>{if(!a.participant||!b.participant)return 0;const statusA=statusOrder[a.participant.specialStatus]||0;const statusB=statusOrder[b.participant.specialStatus]||0;if(statusA!==statusB)return statusA-statusB;const rankA=parseInt(a.participant.finalRank,10);const rankB=parseInt(b.participant.finalRank,10);if(!isNaN(rankA)&&!isNaN(rankB))return rankA-rankB;return 0;});}
slotsToRender.forEach(slot=>{if(!slot.participant||!slot.participant.id)return;const p=slot.participant;const colorIndex=(slot.prioDepart-1)%prioColorsClasses.length;let penaltyHtml='';if(p.specialStatus){penaltyHtml=`<div class="penalty-summary-box">${p.specialStatus}</div>`;}else{penaltyHtml=createPenaltySummaryHTML(p.penalite,{heatResult:{order:p.ordre_arrivee},gateCount:this.gateCount,rollZoneAfterGate:this.rollZone},'');}
const placeValue=p.ordre_arrivee?p.ordre_arrivee:'-';rowsHtml+=`
                <tr>
                    <td class="col-prio-start"><div class="couleur-box ${prioColorsClasses[colorIndex]}">${prioLetters[colorIndex]}</div></td>
                    <td class="col-bib-start">${escapeHtml(p.bib)}</td>
                    <td class="col-nom-speaker">${escapeHtml(p.name)}</td>
                    <td class="col-club-speaker">${escapeHtml(p.club)}</td>
                    <td class="col-pen-details-speaker">${penaltyHtml}</td>
                    <td class="col-place-speaker">${escapeHtml(placeValue)}</td>
                    <td class="col-clt-speaker">${escapeHtml(p.finalRank || '-')}</td>
                </tr>
            `;});return`
            <table class="heat-table-start live">
                <thead>
                    <tr>
                        <th class="col-prio-start">${window.APP_TEXTS.headerPrio}</th>
                        <th class="col-bib-start">${window.APP_TEXTS.headerBibBref}</th>
                        <th>${window.APP_TEXTS.headerName}</th>
                        <th>${window.APP_TEXTS.speaker.headerClub}</th>
                        <th class="col-pen-details-speaker">${window.APP_TEXTS.headerPenalties}</th>
                        <th class="col-place-speaker" style="text-align:center">${window.APP_TEXTS.headerPlace}</th>
                        <th class="col-clt-speaker">${window.APP_TEXTS.headerClt}</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>`;}
_getMainActionButtons(heat){return'';}
_renderActionButtons(heat){return'';}}
document.addEventListener('DOMContentLoaded',async()=>{changerOrientation('auto');await loadLanguage(['common','peripheriques']);const live=new LiveUI();live.initialize();});