import{ConfigurationPenalites}from'./engine.js?v=2.2.0';import{HeatState}from'./constants.js?v=2.2.0';import{log}from'./utils.js?v=2.2.0';const TEXTS=window.APP_TEXTS&&window.APP_TEXTS.status?window.APP_TEXTS:null;export class RaceMonitorWidget{constructor(parentElement,position='top',options={}){this.parentElement=parentElement;this.position=position;this.options={showForceButton:false,onForceClick:null,showHeader:true,showGlobalNumber:false,showStatusBadge:false,widgetPersistenceManager:null,penaltyZonesOnly:false,pollingInterval:0,title:null,...options};this.pollingTimerId=null;this._lastHeatId=null;this._lastEtat=null;this._lastZonesJugees=null;this.widgetContainer=document.createElement('div');this.widgetContainer.className='race-monitor-container';if(this.position==='top'){this.parentElement.insertBefore(this.widgetContainer,this.parentElement.firstChild);}else{this.parentElement.appendChild(this.widgetContainer);}}
async _handleDefaultForceClick(heat){const pm=this.options.widgetPersistenceManager;if(!pm)return;log.info(`[Widget] Demande de validation forcée pour la série ${heat.id}`);try{const result=await pm.forceValidateHeat(heat.id);}catch(e){log.error(`[Widget] ERREUR lors du forçage:`,e);alert(`Erreur lors du forçage : ${e.message}`);}}
update(heat,config){if(!heat){this._lastHeatId=null;this._lastEtat=null;this._lastZonesJugees=null;this.widgetContainer.innerHTML='<div class="race-monitor-widget"><p style="text-align:center; margin:0; color:#666;">En attente de série...</p></div>';return;}
const zonesJugees=heat.zonesJugees||'';const hasChanged=(heat.id!==this._lastHeatId||heat.etat!==this._lastEtat||zonesJugees!==this._lastZonesJugees);if(!hasChanged){return;}
this._lastHeatId=heat.id;this._lastEtat=heat.etat;this._lastZonesJugees=zonesJugees;const html=this._buildHTML(heat,config);this.widgetContainer.innerHTML=html;const forceBtn=this.widgetContainer.querySelector('.monitor-force-btn');if(forceBtn){forceBtn.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();if(typeof this.options.onForceClick==='function'){this.options.onForceClick(heat);}
else if(this.options.widgetPersistenceManager){this._handleDefaultForceClick(heat);}});}}
_buildHTML(heat,config){const detailPortes=config.detailPortes||null;const zones=ConfigurationPenalites.genererSequenceZones(config.gateCount,config.rollZoneAfterGate,detailPortes);const zonesJugeesStr=heat.zonesJugees||'0'.repeat(zones.length);const isStartOk=heat.etat>=HeatState.INCOMPLET;const activeSlots=heat.slots.filter(s=>s.participant&&s.participant.id);const hasActiveSlots=activeSlots.length>0;const allArrivalsEntered=hasActiveSlots&&activeSlots.every(s=>s.participant.ordre_arrivee||s.participant.specialStatus);const finishZoneIndex=zonesJugeesStr.length-1;const finishZoneJudged=finishZoneIndex>=0&&zonesJugeesStr[finishZoneIndex]!=='0';const isFinishOk=allArrivalsEntered||(heat.etat>=HeatState.PRET_A_VALIDER);let stepsHtml='';if(!this.options.penaltyZonesOnly){stepsHtml+=this._createStepHtml('Dép.',isStartOk?'status-ok':'status-waiting','step-terminal');}
zones.forEach((zone,index)=>{const zoneState=zonesJugeesStr[index]||'0';const isZoneOk=zoneState!=='0';const isZoneForced=zoneState==='2';let label=zone.nomAffichage;let colorClass='';if(zone.type==='START'){label='J. Dép';colorClass='color-default';}else if(zone.type==='PORTE'){label=`${zone.numeroPorte}`;colorClass=zone.couleurPorte==='1'?'color-red':'color-green';}else if(zone.type==='ROLL'){label='R';colorClass='color-orange';}
const statusClass=isZoneForced?'status-forced':(isZoneOk?'status-ok':'status-waiting');const tooltip=isZoneForced?'Pénalité non reçue - Zone forcée':'';stepsHtml+=this._createStepHtml(label,statusClass,'step-judge',colorClass,tooltip);});if(!this.options.penaltyZonesOnly){stepsHtml+=this._createStepHtml('Arr.',isFinishOk?'status-ok':'status-waiting','step-terminal');}
let forceBtnHtml='';if(this.options.showForceButton&&heat.etat<HeatState.OFFICIEL&&hasActiveSlots){forceBtnHtml=`<button class="monitor-force-btn">Forcer Validation</button>`;}
const etatText=this._getEtatLabel(heat.etat);const etatClass=heat.etat>=HeatState.PRET_A_VALIDER?'text-success':'text-warning';const globalHeatNumberHTML=heat.globalHeatNumber?`<span class="global-heat-number-widget" title="Série n°${heat.globalHeatNumber} de la journée">${heat.globalHeatNumber}</span>`:'';const heatTitleText=`${heat.categoryKey || ''} - ${heat.roundKey} - ${heat.name}`;const headerHtml=this.options.showHeader?`
            <div class="race-monitor-header">
                <div class="race-monitor-title">
                    ${globalHeatNumberHTML}
                    <span class="race-monitor-title-text">${heatTitleText}</span>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span class="status-badge ${this._getStatusColorClass(heat.etat)}">${etatText}</span>
                    ${forceBtnHtml}
                </div>
            </div>
        `:'';const inlineGlobalNumberHtml=this.options.showGlobalNumber&&heat.globalHeatNumber?`<span class="global-heat-number-inline" title="Série n°${heat.globalHeatNumber} de la journée">${heat.globalHeatNumber}</span>`:'';const statusBadgeHtml=this.options.showStatusBadge?`<span class="status-badge status-badge-inline ${this._getStatusColorClass(heat.etat)}">${etatText}</span>`:'';const mainTitleHtml=this.options.title?`<div class="race-monitor-main-title">${this.options.title}</div>`:'';return`
            <div class="race-monitor-widget">
                ${mainTitleHtml} 
                ${headerHtml}
                <div class="race-monitor-steps-row">
                    ${inlineGlobalNumberHtml}
                    <div class="race-monitor-steps">
                        ${stepsHtml}
                    </div>
                    ${statusBadgeHtml}
                </div>
            </div>
        `;}
_getEtatLabel(etat){if(window.APP_TEXTS){switch(etat){case 1:return window.APP_TEXTS.status1||"En attente";case 2:return window.APP_TEXTS.status2||"Programmé";case 3:return window.APP_TEXTS.status3||"En cours";case 4:return window.APP_TEXTS.status4||"Terminé";case 5:return window.APP_TEXTS.status5||"Officiel";case 6:return window.APP_TEXTS.status6||"Modif";}}
const labels={1:'En attente',2:'Programmé',3:'En cours',4:'Terminé',5:'Officiel',6:'Modification'};return labels[etat]||`État ${etat}`;}
_getStatusColorClass(etat){switch(etat){case 1:return'led-attente';case 2:return'led-programme';case 3:return'led-en-cours';case 4:return'led-termine';case 5:return'led-officiel';case 6:return'led-attente';default:return'led-attente';}}
_createStepHtml(label,statusClass,stepType='step-judge',colorClass='color-default',tooltip=''){const titleAttr=tooltip?`title="${tooltip}"`:'';return`
            <div class="monitor-step ${statusClass} ${stepType} ${colorClass}" ${titleAttr}>
                <span class="monitor-label">${label}</span>
                <div class="monitor-dot"></div>
            </div>
        `;}
startPolling(fetchCallback=null){if(this.options.pollingInterval<=0)return;const callback=fetchCallback||(this.options.widgetPersistenceManager?()=>this._defaultFetchData():null);if(!callback)return;this.stopPolling();this._pollOnce(callback);this.pollingTimerId=setInterval(()=>{this._pollOnce(callback);},this.options.pollingInterval);}
async _defaultFetchData(){try{const pm=this.options.widgetPersistenceManager;if(!pm||typeof pm.getNextHeats!=='function'){return{heat:null,config:{}};}
const fetchResult=await pm.getNextHeats(1,'2,3,4',false,-1);let heats;if(Array.isArray(fetchResult)){heats=fetchResult;}else if(fetchResult&&fetchResult.unchanged){return{unchanged:true};}else{heats=fetchResult?.heats||[];}
if(heats&&heats.length>0){const heat=heats[0];return{heat:heat,config:{gateCount:heat.gateCount||8,rollZoneAfterGate:heat.rollZoneAfterGate!==null?heat.rollZoneAfterGate:2,detailPortes:heat.detailPortes||null}};}
return{heat:null,config:{}};}catch(e){console.warn('[RaceMonitorWidget] Default fetch error:',e);return{heat:null,config:{}};}}
async _pollOnce(fetchCallback){try{const result=await fetchCallback();if(result&&result.heat!==undefined){this.update(result.heat,result.config||{});}}catch(error){log.warn('[RaceMonitorWidget] Polling error:',error);}}
async refreshOnce(){if(!this.options.widgetPersistenceManager){log.warn('[RaceMonitorWidget] refreshOnce: widgetPersistenceManager non défini');return;}
await this._pollOnce(()=>this._defaultFetchData());}
stopPolling(){if(this.pollingTimerId){clearInterval(this.pollingTimerId);this.pollingTimerId=null;}}
destroy(){this.stopPolling();if(this.widgetContainer&&this.widgetContainer.parentNode){this.widgetContainer.parentNode.removeChild(this.widgetContainer);}}}