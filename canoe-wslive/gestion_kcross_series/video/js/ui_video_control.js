import{BasePeripheriqueUI}from'../../js/base_peripherique_ui.js?v=2.2.0';import{escapeHtml,changerOrientation,createPenaltySummaryHTML}from'../../js/utils.js?v=2.2.0';import{Serie,Participant}from'../../js/engine.js?v=2.2.0';import{RaceMonitorWidget}from'../../js/raceMonitorWidget.js?v=2.2.0';import{loadLanguage}from'../../js/languageManager.js?v=2.2.0';import{LanguageSelector}from'../../js/languageSelector.js?v=2.2.0';import{FORMATS_COMPETITION}from'../../js/format_competition.js?v=2.2.0';import{HeatState}from'../../js/constants.js?v=2.2.0';class OverlayControlUI extends BasePeripheriqueUI{constructor(){super();this.appName='overlay';this.container=document.getElementById('start-list-container');this.upcomingHeats=[];this.currentHeatIndex=0;this.gateCount=8;this.rollZone=2;this.rampSelection={1:null,2:null,3:null,4:null};this.liveOrder=[];this._lastLiveHeatId=null;this.activeOverlayMode='HIDDEN';this.draggedIndex=null;this.showLivePenalties=true;this.showResultPenalties=true;this.showNextHeat=false;this.showQualifiers=false;this.raceMonitor=null;this._styleSelectOpen=false;this.selectedStyle='incrustation.css';this.availableStyles=[{file:'incrustation.css',label:'Défaut'}];}
formatFullTitle(heat,numglobal=true){if(!heat)return"";const globalNum=heat.globalHeatNumber||'?';const cat=heat.categoryKey||'';const heatName=heat.name||'';const rawPhaseName=(window.APP_TEXTS.regie_video.roundNames)?(window.APP_TEXTS.regie_video.roundNames[heat.roundKey]||heat.roundKey):heat.roundKey;let title='';if(numglobal==true)
title=`${globalNum} | ${cat} | ${rawPhaseName} | ${heatName}`;else
title=`${cat} | ${rawPhaseName} | ${heatName}`;return title;}
_initThemeToggle(){}
createPersistenceManager(){const deviceId=this.zoneIndex!==null?`overlay_zone${this.zoneIndex}`:'overlay';const manager=super.createPersistenceManager();manager._apiGetNextHeatsEndpoint='../api/api_get_next_heats.php';manager._apiLoadStateEndpoint='../api/api_load_state.php';manager._apiGetHeatDetailsEndpoint='../api/api_get_heat_details.php';return manager;}
_configureFetchParameters(){this.nbSerieCache=0;this.fetchClubInfo=true;this.fetchState=`${HeatState.EN_ATTENTE},${HeatState.PRET},${HeatState.INCOMPLET},${HeatState.PRET_A_VALIDER},${HeatState.OFFICIEL},${HeatState.EN_MODIF}`;this.noHeatsMessage=window.APP_TEXTS.video.noHeatsMessage;}
handleNextHeat(){this.pushToOBS('HIDDEN',false);super.handleNextHeat();}
handlePreviousHeat(){this.pushToOBS('HIDDEN',false);super.handlePreviousHeat();}
_postProcessHeats(heatsFromAPI){const realHeats=(heatsFromAPI||[]).filter(h=>h.name!=='_TEST_RESEAU_');if(realHeats&&realHeats.length>0){this.gateCount=realHeats[0].gateCount||8;this.rollZone=realHeats[0].rollZoneAfterGate!==null?realHeats[0].rollZoneAfterGate:2;}
return realHeats;}
async tick(){if(this._styleSelectOpen)return;if(!this.upcomingHeats[this.currentHeatIndex]){await this.fetchAndDisplayHeats();return;}
const currentLocalHeat=this.upcomingHeats[this.currentHeatIndex];try{const freshHeatData=await this.getHeatDetails(currentLocalHeat.id);if(freshHeatData){const virtualSerie=new Serie(freshHeatData.name,freshHeatData.roundKey);virtualSerie.zonesJugees=freshHeatData.zonesJugees;freshHeatData.slots.forEach((slot,idx)=>{if(slot.participant&&slot.participant.id){const p=new Participant(freshHeatData.categoryKey,999,slot.participant.bib,slot.participant.name);p.id=slot.participant.id;virtualSerie.slots[idx].participant=p;virtualSerie.slots[idx].prioDepart=slot.prioDepart;virtualSerie.slots[idx].heatResult={order:slot.participant.ordre_arrivee,penalty:slot.participant.penalite,specialStatus:slot.participant.specialStatus};}});virtualSerie.calculateAndApplyRanking();freshHeatData.slots.forEach((slot,idx)=>{slot.participant.finalRank=virtualSerie.slots[idx].heatResult.finalRank;});this.upcomingHeats[this.currentHeatIndex]=freshHeatData;this.renderCurrentHeat();if(this.activeOverlayMode!=='HIDDEN')this.pushToOBS(this.activeOverlayMode,false);}}catch(e){console.error("[OverlayControlUI] Erreur tick:",e);}}
async getHeatDetails(heatId){const url=`${this.peripheriquesPersistenceManager._apiGetHeatDetailsEndpoint}?competition=${this.competitionCode}&heat_id=${heatId}`;try{const response=await fetch(url);const result=await response.json();if(!response.ok||!result.success){throw new Error(result.message||"Erreur récupération détails série.");}
return result.heat;}catch(error){console.error("[Overlay] Échec getHeatDetails:",error);throw error;}}
_getStatusLed(heat){const statusMap={1:'led-attente',2:'led-programme',3:'led-en-cours',4:'led-termine',5:'led-officiel',6:'led-officiel'};return`<div class="heat-status-led-speaker ${statusMap[heat.etat] || 'led-attente'}"></div>`;}
_renderHeader(heat){const t=window.APP_TEXTS.video;const statusLabels=t.statusLabels;const statusColorMap={1:'#888',2:'#007bff',3:'#28a745',4:'#6c757d',5:'#fd7e14',6:'#fd7e14'};const statusLabel=statusLabels[heat.etat]||'–';const statusColor=statusColorMap[heat.etat]||'#888';const canGoPrev=this.currentHeatIndex>0;const canGoNext=this.currentHeatIndex<this.upcomingHeats.length-1;const title=this.formatFullTitle(heat);const athleteCount=heat.slots?heat.slots.filter(s=>s.participant&&s.participant.id).length:0;const athleteLabel=t.athleteCount.replace('{n}',athleteCount);return`
        <div class="vc-topbar">
            <button class="vc-nav-btn" data-action="previous-heat" ${canGoPrev ? '' : 'disabled'} title="${escapeHtml(t.btnPrevHeatTitle)}">&#8249;</button>
            <div class="vc-topbar-center">
                <span class="vc-heat-title">${escapeHtml(title)}</span>
                <span class="vc-heat-meta">${athleteLabel}</span>
            </div>
            <span class="vc-status-badge" style="background:${statusColor}20; color:${statusColor}; border:1px solid ${statusColor}40;">${statusLabel}</span>
            <button class="vc-nav-btn" data-action="next-heat" ${canGoNext ? '' : 'disabled'} title="${escapeHtml(t.btnNextHeatTitle)}">&#8250;</button>
        </div>`;}
_renderActionButtons(heat){return'';}
_renderTable(heat){const t=window.APP_TEXTS.video;const activeSlots=heat.slots.filter(s=>s.participant&&s.participant.id&&s.participant.specialStatus!=='DNS');const prioLetters=window.APP_TEXTS.prioLetters;const prioClasses=['prio-red','prio-green','prio-blue','prio-yellow'];const isNewHeat=this._lastLiveHeatId!==heat.id;const wasEmptyButNowPopulated=this.liveOrder.length===0&&activeSlots.length>0;if(isNewHeat||wasEmptyButNowPopulated){this.rampSelection={1:null,2:null,3:null,4:null};this.liveOrder=activeSlots.map(s=>s.prioDepart);this._lastLiveHeatId=heat.id;this.showNextHeat=false;this.showQualifiers=false;}else{this.liveOrder=this.liveOrder.filter(prio=>activeSlots.some(s=>s.prioDepart===prio));for(let pos in this.rampSelection){if(this.rampSelection[pos]&&!activeSlots.some(s=>s.prioDepart===this.rampSelection[pos])){this.rampSelection[pos]=null;}}}
let html=``;const isRampActive=(this.activeOverlayMode==='START_RAMP');const rampBtnLabel=isRampActive?t.btnHide:t.btnShow;const rampBtnBg=isRampActive?'#dc3545':'#28a745';html+=`<div class="vc-main">`;html+=`<div class="vc-panel" style="margin-bottom:0;">
            <div class="vc-panel-header" style="justify-content:flex-end; gap:8px;">
                <span class="vc-panel-title" style="flex:none;">Style incrustation</span>
                <select id="style-selector" style="font-size:12px; padding:4px 8px; border-radius:6px; border:1px solid #ccc; cursor:pointer;">
                    ${this.availableStyles.map(s => `<option value="${s.file}"${this.selectedStyle===s.file?'selected':''}>${s.label}</option>`).join('')}
                </select>
            </div>
        </div>`;html+=`<div class="vc-panel ${isRampActive ? 'vc-active-ramp' : ''}">
            <div class="vc-panel-header">
                <span class="vc-panel-title">${escapeHtml(t.panelRampTitle)}</span>
                <button class="vc-obs-btn" style="background:${rampBtnBg}" data-action="${isRampActive ? 'obs-hide' : 'obs-show-ramp'}">${escapeHtml(rampBtnLabel)}</button>
            </div>
            <div class="vc-ramp-grid">`;for(let pos=1;pos<=4;pos++){const selPrio=this.rampSelection[pos];const selSlot=activeSlots.find(s=>s.prioDepart===selPrio);html+=`<div class="vc-ramp-col">
                <div class="vc-ramp-num">${pos}</div>
                <div class="vc-color-btns">`;activeSlots.forEach(s=>{const isSel=this.rampSelection[pos]===s.prioDepart;const isDim=this.rampSelection[pos]!==null&&!isSel;const cls=prioClasses[(s.prioDepart-1)%4];html+=`<button class="vc-cbtn ${cls} ${isSel ? 'selected' : ''} ${isDim ? 'dimmed' : ''}" data-action="select-ramp-color" data-pos="${pos}" data-prio="${s.prioDepart}">${prioLetters[(s.prioDepart - 1) % 4]}</button>`;});html+=`</div><div class="vc-ramp-name">${selSlot ? escapeHtml(selSlot.participant.name) : '–'}</div></div>`;}
html+=`</div></div>`;html+=`<div class="vc-row">`;const isLiveActive=(this.activeOverlayMode==='LIVE_RUN');const liveBtnLabel=isLiveActive?t.btnHide:t.btnLiveShow;const liveBtnBg=isLiveActive?'#dc3545':'#007bff';html+=`<div class="vc-panel ${isLiveActive ? 'vc-active-live' : ''}">
            <div class="vc-panel-header">
                <span class="vc-panel-title">${escapeHtml(t.panelLiveTitle)} <small style="text-transform:none; font-weight:400; opacity:0.7;">${escapeHtml(t.panelLiveHint)}</small></span>
                <button class="vc-obs-btn" style="background:${liveBtnBg}" data-action="${isLiveActive ? 'obs-hide' : 'obs-show-live'}">${escapeHtml(liveBtnLabel)}</button>
            </div>
            <div class="vc-live-list">`;this.liveOrder.forEach((prio,idx)=>{const s=activeSlots.find(sl=>sl.prioDepart===prio);if(!s)return;const p=s.participant;const penHtml=p.specialStatus?`<div class="penalty-tag ral">${p.specialStatus}</div>`:createPenaltySummaryHTML(p.penalite,{heatResult:{order:null},gateCount:this.gateCount,rollZoneAfterGate:this.rollZone},'');html+=`<div class="vc-live-row" draggable="true" data-idx="${idx}">
                <div class="vc-rank">${idx + 1}</div>
                <div class="vc-prio ${prioClasses[(prio - 1) % 4]}">${prioLetters[(prio - 1) % 4]}</div>
                <div class="vc-name">${escapeHtml(p.name)}</div>
                ${penHtml}
                <span class="vc-drag">&#8942;</span>
            </div>`;});html+=`</div>
            <div class="vc-pen-footer">
                <label class="vc-pen-label">
                    <input type="checkbox" id="toggle-penalties" ${this.showLivePenalties ? 'checked' : ''}>
                    ${escapeHtml(t.showPenalties)}
                </label>
                <!-- TODO Traduction -->
                <label class="vc-pen-label">
                    <input type="checkbox" id="toggle-next-heat" ${this.showNextHeat ? 'checked' : ''}>
                    ${escapeHtml(t.showNextHeat || "Mention Prochaine Série")}
                </label>
            </div>
        </div>`;const isResultsActive=(this.activeOverlayMode==='RESULTS');const resBtnLabel=isResultsActive?t.btnHide:t.btnResultsShow;const resBtnBg=isResultsActive?'#dc3545':'#fd7e14';const sortedResults=[...activeSlots].sort((a,b)=>(parseInt(a.participant.finalRank)||999)-(parseInt(b.participant.finalRank)||999));html+=`<div class="vc-panel ${isResultsActive ? 'vc-active-results' : ''}">
            <div class="vc-panel-header">
                <span class="vc-panel-title">${escapeHtml(t.panelResultsTitle)}</span>
                <button class="vc-obs-btn" style="background:${resBtnBg}" data-action="${isResultsActive ? 'obs-hide' : 'obs-show-results'}">${escapeHtml(resBtnLabel)}</button>
            </div>
            <div class="vc-live-list">`;sortedResults.forEach(s=>{const p=s.participant;const penHtml=p.specialStatus?`<div class="penalty-tag ral">${p.specialStatus}</div>`:createPenaltySummaryHTML(p.penalite,{heatResult:{order:null},gateCount:this.gateCount,rollZoneAfterGate:this.rollZone},'');html+=`<div class="vc-live-row" style="cursor:default;">
                <div class="vc-rank">${p.finalRank || '–'}</div>
                <div class="vc-prio ${prioClasses[(s.prioDepart - 1) % 4]}">${prioLetters[(s.prioDepart - 1) % 4]}</div>
                <div class="vc-name">${escapeHtml(p.name)}</div>
                ${penHtml}
            </div>`;});html+=`</div>
                <div class="vc-pen-footer">
                <!-- Aligne à droite la 2° case à cocher.
                <div class="vc-pen-footer" style="justify-content: space-between;"> -->
                    <label class="vc-pen-label">
                        <input type="checkbox" id="toggle-result-penalties" ${this.showResultPenalties ? 'checked' : ''}>
                        ${escapeHtml(t.showPenalties)}
                    </label>
                    <!-- TODO Traduction -->
                    <label class="vc-pen-label">
                        <input type="checkbox" id="toggle-qualifiers" ${this.showQualifiers ? 'checked' : ''}>
                        ${escapeHtml(t.showQualifiers || "Afficher les qualifiés")}
                    </label>                    
                </div>
            </div>`;html+=`</div></div>`;html+=`</div>`;html+=`<div id="vc-monitor-container" class="vc-panel"></div>`;html+=`</div>`;return html;}
_getMainActionButtons(heat){return'';}
attachDragEvents(){const rows=this.container.querySelectorAll('.vc-live-row[draggable="true"]');rows.forEach(row=>{row.addEventListener('dragstart',(e)=>{this.draggedIndex=parseInt(row.dataset.idx);row.classList.add('dragging');e.dataTransfer.effectAllowed='move';});row.addEventListener('dragover',(e)=>{e.preventDefault();const overIndex=parseInt(row.dataset.idx);if(overIndex!==this.draggedIndex){this.handleLiveSwap(this.draggedIndex,overIndex);this.draggedIndex=overIndex;}});row.addEventListener('dragend',()=>{row.classList.remove('dragging');if(this.activeOverlayMode==='LIVE_RUN')this.pushToOBS('LIVE_RUN',false);});});}
handleLiveSwap(from,to){const item=this.liveOrder.splice(from,1)[0];this.liveOrder.splice(to,0,item);this.renderCurrentHeat();if(this.activeOverlayMode==='LIVE_RUN')this.pushToOBS('LIVE_RUN',false);}
renderCurrentHeat(){super.renderCurrentHeat();this.attachDragEvents();const monitorContainer=document.getElementById('vc-monitor-container');const heat=this.upcomingHeats[this.currentHeatIndex];if(monitorContainer&&heat){if(heat.etat>=HeatState.OFFICIEL){monitorContainer.style.display='none';return;}else{monitorContainer.style.display='block';}
this.raceMonitor=new RaceMonitorWidget(monitorContainer,'top',{showHeader:false,showGlobalNumber:false,showStatusBadge:false,penaltyZonesOnly:false});const config={gateCount:this.gateCount,rollZoneAfterGate:this.rollZone,detailPortes:heat.detailPortes||null};this.raceMonitor.update(heat,config);}}
async handleColorSelection(btn){const pos=parseInt(btn.dataset.pos),prio=parseInt(btn.dataset.prio);if(this.rampSelection[pos]===prio)this.rampSelection[pos]=null;else{for(let i=1;i<=4;i++)if(this.rampSelection[i]===prio)this.rampSelection[i]=null;this.rampSelection[pos]=prio;}
this.renderCurrentHeat();if(this.activeOverlayMode==='START_RAMP')this.pushToOBS('START_RAMP',false);}
async pushToOBS(mode,shouldRender=true){this.activeOverlayMode=mode;const heat=this.upcomingHeats[this.currentHeatIndex];if(!heat)return;let payload={mode,title:this.formatFullTitle(heat,false),slots:[],showPenalties:this.showLivePenalties,showResultPenalties:this.showResultPenalties,showQualifiers:this.showQualifiers,showNextHeat:this.showNextHeat,resultsLabel:window.APP_TEXTS.video.resultsLabel,nextHeatLabel:window.APP_TEXTS.video.nextHeatLabel,styleSheet:this.selectedStyle,};const prioClasses=['prio-red','prio-green','prio-blue','prio-yellow'];if(mode==='START_RAMP'){for(let i=1;i<=4;i++){const p=this.rampSelection[i],s=heat.slots.find(sl=>sl.prioDepart===p);payload.slots.push(s?{name:s.participant.name,club:s.participant.club||null,numPos:(p-1)%4,colorLetter:prioClasses[(p-1)%4]}:{name:"",numPos:"",colorLetter:""});}}else if(mode==='LIVE_RUN'||mode==='RESULTS'){const list=(mode==='RESULTS')?[...heat.slots].sort((a,b)=>(parseInt(a.participant.finalRank)||999)-(parseInt(b.participant.finalRank)||999)):this.liveOrder.map(prio=>heat.slots.find(s=>s.prioDepart===prio));list.forEach((s)=>{if(!s||!s.participant||s.participant.specialStatus==='DNS')return;const p=s.participant;const penHtml=p.specialStatus?`<div class="penalty-summary-box"><div class="penalty-tag ral" >${p.specialStatus}</div></div>`:createPenaltySummaryHTML(p.penalite,{heatResult:{order:null},gateCount:this.gateCount,rollZoneAfterGate:this.rollZone},'');payload.slots.push({name:p.name,club:p.club||null,numPos:(s.prioDepart-1)%4,colorLetter:prioClasses[(s.prioDepart-1)%4],rank:p.finalRank,penaltyHtml:penHtml});});}
fetch(`../api/api_overlay_state.php?competition=${this.competitionCode}`,{method:'POST',body:JSON.stringify(payload)});if(shouldRender)this.renderCurrentHeat();}
async loadAvailableStyles(){try{const res=await fetch(`../api/api_get_styles.php`);const data=await res.json();if(Array.isArray(data)&&data.length>0){this.availableStyles=data;}}catch(e){console.warn('[Overlay] Impossible de charger la liste des styles:',e);}}}
document.addEventListener('DOMContentLoaded',async()=>{changerOrientation('auto');await loadLanguage(['common','peripheriques','roundnames','video']);const languageSelector=new LanguageSelector('language-selector-container');languageSelector.init();const app=new OverlayControlUI();window.addEventListener('keydown',async(event)=>{if(event.key==='ArrowRight'){app.handleNextHeat();await app.tick();}
else if(event.key==='ArrowLeft'){app.handlePreviousHeat();await app.tick();}});document.body.addEventListener('click',async(e)=>{const btn=e.target.closest('button');if(!btn)return;const act=btn.dataset.action;if(act==='select-ramp-color')app.handleColorSelection(btn);else if(act==='obs-show-ramp'){app.pushToOBS('START_RAMP');app.tick();}
else if(act==='obs-show-live'){app.pushToOBS('LIVE_RUN');app.tick();}
else if(act==='obs-show-results'){app.pushToOBS('RESULTS');app.tick();}
else if(act==='obs-hide')app.pushToOBS('HIDDEN');else if(act==='next-heat'){app.handleNextHeat();await app.tick();}
else if(act==='previous-heat'){app.handlePreviousHeat();await app.tick();}});document.body.addEventListener('change',(e)=>{if(e.target.id==='toggle-penalties'){app.showLivePenalties=e.target.checked;if(app.activeOverlayMode==='LIVE_RUN')app.pushToOBS('LIVE_RUN',false);}
else if(e.target.id==='toggle-result-penalties'){app.showResultPenalties=e.target.checked;if(app.activeOverlayMode==='RESULTS')app.pushToOBS('RESULTS',false);}
else if(e.target.id==='toggle-next-heat'){app.showNextHeat=e.target.checked;if(app.activeOverlayMode==='LIVE_RUN')app.pushToOBS('LIVE_RUN',false);}
else if(e.target.id==='toggle-qualifiers'){app.showQualifiers=e.target.checked;if(app.activeOverlayMode==='RESULTS')app.pushToOBS('RESULTS',false);}
else if(e.target.id==='style-selector'){app._styleSelectOpen=false;app.selectedStyle=e.target.value;if(app.activeOverlayMode!=='HIDDEN'){app.pushToOBS(app.activeOverlayMode,false);}else{app.pushToOBS('HIDDEN',false);}}});document.body.addEventListener('mousedown',(e)=>{if(e.target.id==='style-selector'){app._styleSelectOpen=true;}else{if(app._styleSelectOpen)app._styleSelectOpen=false;}});const urlParams=new URLSearchParams(window.location.search);const compCode=urlParams.get('competition');if(compCode){const resetPayload=JSON.stringify({action:'DELETE'});const apiUrl=`../api/api_overlay_state.php?competition=${compCode}`;fetch(apiUrl,{method:'POST',body:resetPayload});window.addEventListener('beforeunload',()=>{fetch(apiUrl,{method:'POST',body:resetPayload,keepalive:true});});}
await app.loadAvailableStyles();app.initialize();});