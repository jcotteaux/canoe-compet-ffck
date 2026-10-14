import{log}from'./utils.js?v=2.2.0';export class AdminPersistenceManager{_apiSavepoint='./api/api_save_state.php';_apiLoadEndpoint='./api/api_load_state.php';_competitionCode;_deviceId='admin';_lastKnownModifiedLoad=0;_lastKnownModifiedHeats=0;constructor(competitionCodeWithPrefix,deviceId='admin'){if(!competitionCodeWithPrefix){throw new Error("AdminPersistenceManager a besoin d'un code de compétition pour être initialisé.");}
this._competitionCode=competitionCodeWithPrefix;this._deviceId=deviceId;}
async _post(action,data={}){const payload={action:action,competitionCode:this._competitionCode,modifiedBy:this._deviceId,...data};try{const response=await fetch(this._apiSavepoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok||!result.success){throw new Error(result.message||`Erreur API pour l'action '${action}'.`);}
log.info(`[Persistence] Action '${action}' réussie.`);return result;}catch(error){log.error(`[Persistence] Échec de l'action '${action}':`,error);throw error;}}
async _get(endpoint,params={}){const allParams={...params,competition:this._competitionCode,last_modified:this._lastKnownModifiedLoad};const queryString=new URLSearchParams(allParams).toString();const url=`${endpoint}?${queryString}`;try{const response=await fetch(url);if(response.status===304){return{unchanged:true};}
const textResponse=await response.text();if(!textResponse||textResponse.trim()===''){log.info("[Persistence] Réponse vide reçue (assimilation à 304 Unchanged)");return{unchanged:true};}
let result;try{result=JSON.parse(textResponse);}catch(e){throw new Error(`Données invalides reçues du serveur : ${textResponse.substring(0, 100)}...`);}
if(!response.ok||!result.success){throw new Error(result.message||`Erreur API pour la requête GET sur '${endpoint}'.`);}
if(result.lastModified){this._lastKnownModifiedLoad=result.lastModified;}
return result;}catch(error){throw error;}}
async saveFullConfiguration(configData){return this._post('save_full_config',configData);}
async updateGlobalSettingsSchedule(globalSettings){return this._post('update_global_settings_schedule',{globalScheduleSettings:globalSettings});}
async saveSchedules(scheduleData){return this._post('save_schedules',scheduleData);}
async saveHeatResults(heatData,finalRankingData){return this._post('save_heat_results',{heatData:heatData,finalRanking:finalRankingData});}
async launchHeat(heatId,newState,dnsSlots,penaltyInit){return this._post('launch_heat',{heatId:heatId,newState:newState,dnsSlots:dnsSlots,penaltyInit:penaltyInit});}
async recordArrivals(heatId,newState,arrivalsData){return this._post('record_arrivals',{heatId:heatId,newState:newState,arrivals:arrivalsData});}
async saveProgression(sourceHeatData,targetHeatsData,finalRankingData){return this._post('save_progression',{sourceHeat:sourceHeatData,targetHeats:targetHeatsData,finalRanking:finalRankingData});}
async updateSlotResults(heatId,slotPrio,heatResult){return this._post('update_slot_penalties',{heatId:heatId,slotPrio:slotPrio,heatResult:heatResult});}
async saveUpdatedHeats(heatsData){return this._post('save_updated_heats',{heats:heatsData});}
async forceValidateHeat(heatId){return this._post('force_validate_heat',{heatId});}
async loadFullState(){try{const params={action:'load_full_competition',competition:this._competitionCode};const result=await this._get(this._apiLoadEndpoint,params);if(result.unchanged){return{unchanged:true};}
return result.found?result.data:null;}catch(error){log.error("[Persistence] Échec du chargement de l'état:",error);throw error;}}
async loadCategoriesData(){try{const params={action:'load_full_competition',competition:this._competitionCode};const result=await this._get(this._apiLoadEndpoint,params);if(result.unchanged){return{unchanged:true};}
return result.found?result.data:null;}catch(error){log.error("[Persistence] Échec du chargement de l'état:",error);throw error;}}
async resetCompetitionData(){return this._post('reset_competition');}
async getNextHeats(limit=0,etat=2,club=false,zoneIndex=-1){const apiEndpoint='./api/api_get_next_heats.php';const url=`${apiEndpoint}?competition=${this._competitionCode}${limit > 0 ? `&limit=${limit}` : ''}${etat ? `&etat=${etat}` : ''}${zoneIndex < 0 ? '' : `&zoneIndex=${zoneIndex}`}&club=${club}&last_modified=${this._lastKnownModifiedHeats}`;try{const response=await fetch(url);if(response.status===304){return{unchanged:true};}
const textResponse=await response.text();if(!textResponse||textResponse.trim()===''){log.info("[Persistence] Réponse vide reçue (assimilation à 304 Unchanged)");return{unchanged:true};}
let result;try{result=JSON.parse(textResponse);}catch(e){throw new Error(`Données invalides reçues du serveur : ${textResponse.substring(0, 100)}...`);}
if(!response.ok||!result.success){throw new Error(result.message||"Erreur lors de la récupération des prochaines séries.");}
if(result.lastModified){this._lastKnownModifiedHeats=result.lastModified;}
return{unchanged:false,heats:result.heats};}catch(error){if(error instanceof TypeError||error.name==='AbortError'){log.warn("[Persistence] Serveur injoignable (Hors-ligne)");return{unchanged:true,offline:true};}
log.error("[Persistence] Échec de getNextHeats:",error);throw error;}}}