import{API_ENDPOINTS,API_ACTIONS}from'./constants.js?v=2.2.0';import{log}from'./utils.js?v=2.2.0';export class PeripheriquesPersistenceManager{_apiSavepoint=API_ENDPOINTS.SAVEPOINT;_apiGetNextHeatsEndpoint=API_ENDPOINTS.GET_NEXT_HEATS;_apiLoadStateEndpoint=API_ENDPOINTS.LOAD_STATE;_competitionCode;_deviceId='unknown';_lastKnownModified=0;constructor(competitionCode,deviceId='unknown'){if(!competitionCode){throw new Error("PeripheriquesPersistenceManager a besoin d'un code de compétition pour être initialisé.");}
this._competitionCode=competitionCode;this._deviceId=deviceId;}
setDeviceId(deviceId){this._deviceId=deviceId;}
async _post(action,data={}){const payload={action:action,competitionCode:this._competitionCode,modifiedBy:this._deviceId,...data};try{const response=await fetch(this._apiSavepoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok||!result.success){throw new Error(result.message||`Erreur API pour l'action '${action}'.`);}
log.info(`[Persistence] Action '${action}' réussie.`);return result;}catch(error){log.error(`[Persistence] Échec de l'action '${action}':`,error);throw error;}}
async validateHeatResults(heatId,slotsData){return this._post(API_ACTIONS.VALIDATE_HEAT_RESULTS,{heatId:heatId,slots:slotsData});}
async getNextHeats(limit=0,etat=2,club=false,zoneIndex=-1){const url=`${this._apiGetNextHeatsEndpoint}?competition=${this._competitionCode}${limit > 0 ? `&limit=${limit}` : ''}${etat ? `&etat=${etat}` : ''}${zoneIndex<0 ? '':`&zoneIndex=${zoneIndex}`}&club=${club}&last_modified=${this._lastKnownModified}`;try{const response=await fetch(url);if(response.status===304){return{unchanged:true};}
const textResponse=await response.text();if(!textResponse||textResponse.trim()===''){log.info("[Persistence] Réponse vide reçue (assimilation à 304 Unchanged)");return{unchanged:true};}
let result;try{result=JSON.parse(textResponse);}catch(e){throw new Error(`Données invalides reçues du serveur : ${textResponse.substring(0, 100)}...`);}
if(!response.ok||!result.success){throw new Error(result.message||"Erreur lors de la récupération des prochaines séries.");}
if(result.lastModified){this._lastKnownModified=result.lastModified;}
return{unchanged:false,heats:result.heats};}catch(error){if(error instanceof TypeError||error.name==='AbortError'){log.warn("[Persistence] Serveur injoignable (Hors-ligne)");return{unchanged:true,offline:true};}
throw error;}}
async updateHeatState(heatInfo,newState){return this._post(API_ACTIONS.UPDATE_HEAT_STATE,{heatInfo:heatInfo,newState:newState});}
async updateStatus(code_Serie,slot_Index,newStatus){return this._post(API_ACTIONS.UPDATE_STATUS,{code_Serie:code_Serie,slot_Index:slot_Index,newStatus:newStatus});}
async updatePenalite(code_Serie,slot_Index,newPenalty){return this._post(API_ACTIONS.UPDATE_PENALITE,{code_Serie:code_Serie,slot_Index:slot_Index,newValue:newPenalty});}
async validateZonePenalties(heatId,zoneIndex,penalties){return this._post(API_ACTIONS.VALIDATE_ZONE_PENALTIES,{heatId:heatId,zoneIndex:zoneIndex,penalties:penalties});}
async updateOrdreArrivee(code_Serie,slot_Index,newValue){return this._post(API_ACTIONS.UPDATE_PLACE,{code_Serie:code_Serie,slot_Index:slot_Index,newValue:newValue});}
async forceValidateHeat(heatId){return this._post(API_ACTIONS.FORCE_VALIDATE_HEAT,{heatId});}
async getHeatDetails(heatId){const url=`./api/api_get_heat_details.php?competition=${this._competitionCode}&heat_id=${heatId}`;try{const response=await fetch(url);const result=await response.json();if(!response.ok||!result.success){throw new Error(result.message||"Erreur récupération détails série.");}
return result.heat;}catch(error){log.error("[Persistence] Échec getHeatDetails:",error);throw error;}}
async getHeatStatus(heatId){const url=`${this._apiLoadStateEndpoint}?action=load_heat_status&heatId=${heatId}&competition=${this._competitionCode}`;const response=await fetch(url);return await response.json();}}