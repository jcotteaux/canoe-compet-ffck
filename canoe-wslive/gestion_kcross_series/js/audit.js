import{saveBlobWithTauri}from'./tauri-helpers.js?v=2.2.0';import{log}from'./utils.js?v=2.2.0';let autoRefreshInterval=null;let currentLimit=20;let currentLogs=[];let currentLogIndex=-1;let currentPage=1;let totalLogs=0;let competitionFilter=null;let limitSelect,autoRefreshToggle,refreshIntervalSelect,refreshBtn,lastUpdateSpan;let logsTbody,noLogsPanel,errorPanel,errorMessage,loadingIndicator,detailsModal;let modalContent,closeModalBtn,clearLogsBtn,prevLogBtn,nextLogBtn,logPositionSpan;let auditActiveToggle,refreshControls,backupBtn;let paginationBar,paginationSummary,pageNumbers,pageFirstBtn,pagePrevBtn,pageNextBtn,pageLastBtn;let competitionFilterInfo,backupBtnText,clearBtnText;function initDOMElements(){limitSelect=document.getElementById('limit-select');autoRefreshToggle=document.getElementById('auto-refresh-toggle');refreshIntervalSelect=document.getElementById('refresh-interval');refreshBtn=document.getElementById('refresh-btn');lastUpdateSpan=document.getElementById('last-update');logsTbody=document.getElementById('logs-tbody');noLogsPanel=document.getElementById('no-logs');errorPanel=document.getElementById('error-panel');errorMessage=document.getElementById('error-message');loadingIndicator=document.getElementById('loading');detailsModal=document.getElementById('details-modal');modalContent=document.getElementById('modal-content');closeModalBtn=document.getElementById('close-modal');clearLogsBtn=document.getElementById('clear-logs-btn');prevLogBtn=document.getElementById('prev-log-btn');nextLogBtn=document.getElementById('next-log-btn');logPositionSpan=document.getElementById('log-position');auditActiveToggle=document.getElementById('audit-active-toggle');refreshControls=document.getElementById('refresh-controls');backupBtn=document.getElementById('backup-db-btn');paginationBar=document.getElementById('pagination-bar');paginationSummary=document.getElementById('pagination-summary');pageNumbers=document.getElementById('page-numbers');pageFirstBtn=document.getElementById('page-first');pagePrevBtn=document.getElementById('page-prev');pageNextBtn=document.getElementById('page-next');pageLastBtn=document.getElementById('page-last');competitionFilterInfo=document.getElementById('competition-filter-info');backupBtnText=document.getElementById('backup-btn-text');clearBtnText=document.getElementById('clear-btn-text');if(pageFirstBtn)pageFirstBtn.addEventListener('click',()=>goToPage(1));if(pagePrevBtn)pagePrevBtn.addEventListener('click',()=>goToPage(currentPage-1));if(pageNextBtn)pageNextBtn.addEventListener('click',()=>goToPage(currentPage+1));if(pageLastBtn)pageLastBtn.addEventListener('click',()=>goToPage(getTotalPages()));}
function getCompetitionFromURL(){const urlParams=new URLSearchParams(window.location.search);return urlParams.get('competition')||null;}
function initCompetitionFilter(){competitionFilter=getCompetitionFromURL();if(competitionFilter&&competitionFilterInfo){competitionFilterInfo.innerHTML=`Filtré sur la compétition : <span class="code">${competitionFilter}</span>`;competitionFilterInfo.style.display='inline-block';if(backupBtnText){backupBtnText.textContent=`Backup #${competitionFilter}`;}
if(clearBtnText){clearBtnText.textContent=`Effacer logs #${competitionFilter}`;}
document.title=`Audit - Compétition ${competitionFilter}`;}}
function showCustomConfirm(title,message,buttons){return new Promise((resolve)=>{const overlay=document.getElementById('custom-dialog-overlay');if(!overlay){if(buttons.length===1){alert(message);resolve(buttons[0].value);}else{resolve(confirm(message)?'confirm':'cancel');}
return;}
const titleEl=overlay.querySelector('#dialog-title');const messageEl=overlay.querySelector('#dialog-message');const actionsEl=overlay.querySelector('#dialog-actions');titleEl.textContent=title;messageEl.innerHTML=message;actionsEl.innerHTML='';buttons.forEach(btnInfo=>{const button=document.createElement('button');button.textContent=btnInfo.text;button.dataset.value=btnInfo.value;if(btnInfo.class)button.classList.add(btnInfo.class);actionsEl.appendChild(button);});const clickHandler=(event)=>{const clickedButton=event.target.closest('button');if(clickedButton){overlay.style.display='none';actionsEl.removeEventListener('click',clickHandler);resolve(clickedButton.dataset.value);}};actionsEl.addEventListener('click',clickHandler);overlay.style.display='flex';});}
function formatTimestamp(timestamp){const date=new Date(timestamp);return date.toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function formatCurrentTime(){return new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
async function loadLogs(){loadingIndicator.style.display='flex';errorPanel.style.display='none';const offset=(currentPage-1)*currentLimit;let apiUrl=`./api/api_get_audit_log.php?limit=${currentLimit}&offset=${offset}`;if(competitionFilter){apiUrl+=`&competition=${encodeURIComponent(competitionFilter)}`;}
try{const response=await fetch(apiUrl);const data=await response.json();if(!data.success){throw new Error(data.message||'Erreur inconnue');}
totalLogs=data.total||0;renderLogs(data.logs);renderPagination();lastUpdateSpan.textContent=`Mis à jour : ${formatCurrentTime()}`;updateUIVisibility(data.auditEnabled);}catch(error){log.error('Erreur lors du chargement des logs:',error);errorMessage.textContent=error.message;errorPanel.style.display='flex';logsTbody.innerHTML='';if(paginationBar)paginationBar.style.display='none';}finally{loadingIndicator.style.display='none';}}
function updateUIVisibility(isEnabled){auditActiveToggle.checked=isEnabled;refreshControls.style.visibility=isEnabled?'visible':'hidden';}
function renderLogs(logs){currentLogs=logs||[];currentLogIndex=-1;if(!logs||logs.length===0){logsTbody.innerHTML='';noLogsPanel.style.display='flex';document.querySelector('.logs-table-container').style.display='none';return;}
noLogsPanel.style.display='none';document.querySelector('.logs-table-container').style.display='block';logsTbody.innerHTML=logs.map((clog,index)=>{const statusClass=clog.success?'status-success':'status-error';const statusText=clog.success?'OK':'Erreur';const statusIcon=clog.success?'check_circle':'error';return`
             <tr data-log-id="${clog.id}">
                 <td class="col-time">${formatTimestamp(clog.timestamp)}</td>
                 <td class="col-action"><span class="action-badge">${escapeHtml(clog.action || '-')}</span></td>
                 <td class="col-competition">${escapeHtml(clog.Code_competition || '-')}</td>
                 <td class="col-tables">${formatTables(clog.tables_affected)}</td>
                 <td class="col-records">${clog.records_affected ?? '-'}</td>
                 <td class="col-user" title="${escapeHtml(clog.user_agent || '')}">${escapeHtml(truncate(clog.modified_by || '-', 20))}</td>
                 <td class="col-status">
                     <span class="status-badge ${statusClass}">
                         <span class="material-icons">${statusIcon}</span>
                         ${statusText}
                     </span>
                 </td>
                 <td class="col-details">
                     <button class="btn-details" data-log-index="${index}" title="Voir les détails">
                         <span class="material-icons">visibility</span>
                     </button>
                 </td>
             </tr>
         `;}).join('');document.querySelectorAll('.btn-details').forEach(btn=>{btn.addEventListener('click',()=>{const index=parseInt(btn.dataset.logIndex,10);showDetailsAtIndex(index);});});}
function showDetailsAtIndex(index){if(index<0||index>=currentLogs.length)return;currentLogIndex=index;const clog=currentLogs[index];logPositionSpan.textContent=`(${index + 1}/${currentLogs.length})`;prevLogBtn.disabled=index===0;nextLogBtn.disabled=index===currentLogs.length-1;let contextHtml='';if(clog.human_context){const ctx=clog.human_context;let slotBadge='';if(ctx.slot){slotBadge=`
                 <tr>
                     <th>Slot / Priorité</th>
                     <td>
                         <span style="
                             display: inline-block;
                             padding: 4px 12px;
                             background-color: ${ctx.slot.hex};
                             color: ${ctx.slot.text};
                             border-radius: 4px;
                             font-weight: bold;
                             border: 1px solid rgba(0,0,0,0.1);
                         ">
                             ${ctx.slot.label}
                         </span>
                     </td>
                 </tr>
             `;}
let changeRow='';if(ctx.change){let valueContent='';if(ctx.change.table_data&&Array.isArray(ctx.change.table_data)){let rows=ctx.change.table_data.map(item=>`
                     <tr>
                         <td style="padding: 4px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                             <span style="
                                 display: inline-block;
                                 padding: 2px 8px;
                                 background-color: ${item.slot_hex};
                                 color: ${item.slot_text};
                                 border-radius: 4px;
                                 font-size: 0.9em;
                                 font-weight: bold;
                             ">${escapeHtml(item.slot_label)}</span>
                         </td>
                         <td style="padding: 4px; border-bottom: 1px solid rgba(0,0,0,0.05); text-align: right; font-weight: bold; color: #333;">
                             ${escapeHtml(item.penalty)}
                         </td>
                     </tr>
                 `).join('');valueContent=`
                     <table style="width: 100%; border-collapse: collapse; background-color: rgba(255,255,255,0.5); border-radius: 4px;">
                         ${rows}
                     </table>
                 `;}else if(ctx.change.value){valueContent=escapeHtml(ctx.change.value);}
changeRow=`
                 <tr style="background-color: #fff3cd;">
                     <th style="color: #856404; font-weight:bold; vertical-align: top; padding-top: 12px;">${ctx.change.label}</th>
                     <td style="font-size: 1.1em; font-weight: bold; color: #856404;">
                         ${valueContent}
                     </td>
                 </tr>
             `;}
contextHtml=`
             <div class="detail-section" style="background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 10px;">
                 <h3 style="color: #495057; border-bottom-color: #dee2e6;">Contexte Métier</h3>
                 <table class="detail-table">
                     <tr>
                         <th style="background-color: transparent;">Série concernée</th>
                         <td style="font-size: 1.1em; font-weight: bold;">${escapeHtml(ctx.serie)}</td>
                     </tr>
                     ${slotBadge}
                     ${changeRow}
                 </table>
             </div>
         `;}
const html=`
         <div class="detail-section">
             <h3>Informations générales</h3>
             <table class="detail-table">
                 <tr><th>ID</th><td>${clog.id}</td></tr>
                 <tr><th>Date/Heure</th><td>${formatTimestamp(clog.timestamp)}</td></tr>
                 <tr><th>Action</th><td>${escapeHtml(clog.action || '-')}</td></tr>
                 <tr><th>Compétition</th><td>${escapeHtml(clog.Code_competition || '-')}</td></tr>
                 <tr><th>Tables affectées</th><td>${escapeHtml(clog.tables_affected || '-')}</td></tr>
                 <tr><th>Enregistrements</th><td>${clog.records_affected ?? '-'}</td></tr>
                 <tr><th>Durée</th><td>${clog.duration_ms ? clog.duration_ms + ' ms' : '-'}</td></tr>
                 <tr><th>Statut</th><td>${clog.success ? '<span class="text-success">Succès</span>' : '<span class="text-error">Erreur</span>'}</td></tr>
             </table>
         </div>

         ${contextHtml}

         <div class="detail-section">
             <h3>Utilisateur / Source</h3>
             <table class="detail-table">
                 <tr><th>Identifiant</th><td>${escapeHtml(clog.modified_by || '-')}</td></tr>
                 <tr><th>Adresse IP</th><td>${escapeHtml(clog.ip_address || '-')}</td></tr>
                 <tr><th>User Agent</th><td class="user-agent">${escapeHtml(clog.user_agent || '-')}</td></tr>
             </table>
         </div>

         ${clog.error_message ? `<div class="detail-section error-section"><h3>Message d'erreur</h3><pre>${escapeHtml(clog.error_message)}</pre></div>` : ''}
${clog.payload_summary?`<div class="detail-section"><h3>Résumé du payload</h3><pre>${formatJson(clog.payload_summary)}</pre></div>`:''}
${clog.old_values?`<div class="detail-section"><h3>Anciennes valeurs</h3><pre>${formatJson(clog.old_values)}</pre></div>`:''}
${clog.new_values?`<div class="detail-section"><h3>Nouvelles valeurs</h3><pre>${formatJson(clog.new_values)}</pre></div>`:''}`;
 
     modalContent.innerHTML = html;
     detailsModal.style.display = 'flex';
 }
 
 /**
  * Ferme le modal de détails
  */
 function closeModal() {
     detailsModal.style.display = 'none';
     currentLogIndex = -1;
 }
 
 /**
  * Affiche le log précédent
  */
 function showPrevLog() {
     if (currentLogIndex > 0) {
         showDetailsAtIndex(currentLogIndex - 1);
     }
 }
 
 /**
  * Affiche le log suivant
  */
 function showNextLog() {
     if (currentLogIndex < currentLogs.length - 1) {
         showDetailsAtIndex(currentLogIndex + 1);
     }
 }
 
 /**
  * Démarre le rafraîchissement automatique
  */
 function startAutoRefresh() {
     stopAutoRefresh();
     const interval = parseInt(refreshIntervalSelect.value, 10);
     refreshIntervalSelect.disabled = false;
     autoRefreshInterval = setInterval(loadLogs, interval);
 }
 
 /**
  * Arrête le rafraîchissement automatique
  */
 function stopAutoRefresh() {
     if (autoRefreshInterval) {
         clearInterval(autoRefreshInterval);
         autoRefreshInterval = null;
     }
     refreshIntervalSelect.disabled = true;
 }
 
 /**
  * Échappe les caractères HTML
  */
 function escapeHtml(text) {
     if (text === null || text === undefined) return '';
     const div = document.createElement('div');
     div.textContent = String(text);
     return div.innerHTML;
 }
 
 /**
  * Tronque une chaîne
  */
 function truncate(str, maxLength) {
     if (!str) return '';
     if (str.length <= maxLength) return str;
     return str.substring(0, maxLength - 3) + '...';
 }
 
 /**
  * Formate un objet JSON pour l'affichage
  */
 function formatJson(obj) {
     if (typeof obj === 'string') {
         try {
             obj = JSON.parse(obj);
         } catch (e) {
             return escapeHtml(obj);
         }
     }
     return escapeHtml(JSON.stringify(obj, null, 2));
 }
 
 /**
  * Formate les noms de tables en badges pour un meilleur affichage
  */
 function formatTables(tablesString) {
     if (!tablesString || tablesString === '-') return '-';
 
     // Séparer par virgule ou point-virgule
     const tables = tablesString.split(/[,;]\s*/);
 
     return tables
         .filter(t => t.trim())
         .map(t => `<span class="table-name">${escapeHtml(t.trim())}</span>`)
         .join('');
 }
 
 /**
  * Supprime les logs d'audit (filtrés par compétition si applicable)
  */
 async function clearAllLogs() {
     const filterInfo = competitionFilter 
         ? `pour la compétition<strong>${competitionFilter}</strong>`
         : '';
     
     const choice = await showCustomConfirm(
         'Confirmation de suppression',
         `Êtes-vous sûr de vouloir supprimer ${competitionFilter?'les':'<strong>TOUS</strong> les'}logs d'audit${filterInfo}?<br><br>Cette action est irréversible.`,
         [
             { text: 'Annuler', value: 'cancel', class: 'secondary' },
             { text: 'Supprimer', value: 'confirm', class: 'danger' }
         ]
     );
 
     if (choice !== 'confirm') return;
 
     clearLogsBtn.disabled = true;
     clearLogsBtn.innerHTML = '<span class="material-icons spinning">sync</span> Suppression...';
 
     try {
         // Construire l'URL avec le filtre compétition si présent
         let apiUrl = './api/api_get_audit_log.php';
         if (competitionFilter) {
             apiUrl += `?competition=${encodeURIComponent(competitionFilter)}`;
         }
         
         const response = await fetch(apiUrl, {
             method: 'DELETE'
         });
         const data = await response.json();
 
         if (!data.success) {
             throw new Error(data.message || 'Erreur inconnue');
         }
 
         await showCustomConfirm(
             'Suppression effectuée',
             `${data.deletedCount}log(s)supprimé(s)${filterInfo}.`,
             [{ text: 'OK', value: 'ok', class: 'primary' }]
         );
         loadLogs();
 
     } catch (error) {
         log.error('Erreur lors de la suppression des logs:', error);
         await showCustomConfirm(
             'Erreur',
             'Erreur lors de la suppression : ' + error.message,
             [{ text: 'OK', value: 'ok', class: 'primary' }]
         );
     } finally {
         clearLogsBtn.disabled = false;
         const btnText = competitionFilter ? `Effacer logs#${competitionFilter}` : 'Effacer les logs';
         clearLogsBtn.innerHTML = `<span class="material-icons">delete_forever</span>${btnText}`;
     }
 }
 
 
 // --- Pagination ---
 
 function getTotalPages() {
     return Math.max(1, Math.ceil(totalLogs / currentLimit));
 }
 
 function renderPagination() {
     if (!paginationBar) return;
 
     const totalPages = getTotalPages();
 
     // Afficher la barre de pagination seulement si plus d'une page
     if (totalPages <= 1) {
         paginationBar.style.display = 'none';
         return;
     }
     paginationBar.style.display = 'flex';
 
     // Mise à jour du résumé
     const start = (currentPage - 1) * currentLimit + 1;
     const end = Math.min(currentPage * currentLimit, totalLogs);
     paginationSummary.textContent = `${start}–${end}sur ${totalLogs}`;
 
     // Mise à jour des boutons first/prev/next/last
     pageFirstBtn.disabled = currentPage === 1;
     pagePrevBtn.disabled = currentPage === 1;
     pageNextBtn.disabled = currentPage === totalPages;
     pageLastBtn.disabled = currentPage === totalPages;
 
     // Générer les numéros de page
     pageNumbers.innerHTML = '';
 
     // Calculer la plage de pages à afficher
     const maxVisible = 5;
     let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
     let endPage = Math.min(totalPages, startPage + maxVisible - 1);
 
     if (endPage - startPage + 1 < maxVisible) {
         startPage = Math.max(1, endPage - maxVisible + 1);
     }
 
     if (startPage > 1) {
         pageNumbers.appendChild(createPageBtn(1));
         if (startPage > 2) {
             const dots = document.createElement('span');
             dots.className = 'page-dots';
             dots.textContent = '…';
             pageNumbers.appendChild(dots);
         }
     }
 
     for (let i = startPage; i <= endPage; i++) {
         pageNumbers.appendChild(createPageBtn(i));
     }
 
     if (endPage < totalPages) {
         if (endPage < totalPages - 1) {
             const dots = document.createElement('span');
             dots.className = 'page-dots';
             dots.textContent = '…';
             pageNumbers.appendChild(dots);
         }
         pageNumbers.appendChild(createPageBtn(totalPages));
     }
 }
 
 function createPageBtn(pageNum) {
     const btn = document.createElement('button');
     btn.className = 'btn-page-num' + (pageNum === currentPage ? ' active' : '');
     btn.textContent = pageNum;
     btn.addEventListener('click', () => goToPage(pageNum));
     return btn;
 }
 
 function goToPage(page) {
     const totalPages = getTotalPages();
     page = Math.max(1, Math.min(page, totalPages));
     if (page === currentPage) return;
     currentPage = page;
     loadLogs();
 }
 
 
 // --- Initialisation ---
 document.addEventListener('DOMContentLoaded', () => {
     initDOMElements();
     initCompetitionFilter();
     // Attachement dynamique des événements pour éviter les erreurs sur variables null
     limitSelect.addEventListener('change', () => {
         currentLimit = parseInt(limitSelect.value,10);
         currentPage = 1;
         loadLogs();
     });
     
     autoRefreshToggle.addEventListener('change', () => {
         if (autoRefreshToggle.checked) {
             startAutoRefresh();
         } else {
             stopAutoRefresh();
         }
     });
     
     refreshIntervalSelect.addEventListener('change', () => {
         if (autoRefreshToggle.checked) {
             startAutoRefresh();
         }
     });
     
     refreshBtn.addEventListener('click', loadLogs);
     clearLogsBtn.addEventListener('click', clearAllLogs);
     closeModalBtn.addEventListener('click', closeModal);
     prevLogBtn.addEventListener('click', showPrevLog);
     nextLogBtn.addEventListener('click', showNextLog);
     
     detailsModal.addEventListener('click', (e) => {
         if (e.target === detailsModal) {
             closeModal();
         }
     });

    document.addEventListener('keydown', (e) => {
        if (detailsModal.style.display === 'flex') {
            switch (e.key) {
                case 'Escape':
                    closeModal();
                    break;
                case 'ArrowLeft':
                    showPrevLog();
                    e.preventDefault();
                    break;
                case 'ArrowRight':
                    showNextLog();
                    e.preventDefault();
                    break;
            }
        }
    });

     auditActiveToggle.addEventListener('change', async () => {
         const isEnabled = auditActiveToggle.checked;
         try {
             const response = await fetch('./api/api_set_audit_config.php', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ enabled: isEnabled })
             });
             const result = await response.json();
             if (result.success) {
                 updateUIVisibility(isEnabled);
                 if (isEnabled) loadLogs();
             } else {
                 throw new Error(result.message);
             }
         } catch (error) {
             await showCustomConfirm(
                 'Erreur',
                 'Erreur lors du changement de config: ' + error.message,
                 [{ text: 'OK', value: 'ok', class: 'primary' }]
             );
             auditActiveToggle.checked = !isEnabled;
         }
     });

     backupBtn.addEventListener('click', async () => {
         backupBtn.disabled = true;
         const originalContent = backupBtn.innerHTML;
         backupBtn.innerHTML = '<span class="material-icons spinning">sync</span> Backup...';
         try {
             let apiUrl = './api/sos.php';
             if (competitionFilter) {
                 apiUrl += `?competition=${encodeURIComponent(competitionFilter)}`;
             }
             const response = await fetch(apiUrl);
             if (!response.ok) throw new Error('Erreur serveur: ' + response.status);
             const sqlText = await response.text();
             const blob = new Blob(['\uFEFF' + sqlText], { type: 'text/plain;charset=utf-8' });
             let filename = 'database_backup_';
             if (competitionFilter) filename += `comp${competitionFilter}_`;filename+=new Date().toISOString().slice(0,19).replace(/[T:]/g,'-')+'.sql';await saveBlobWithTauri(blob,filename);}catch(error){await showCustomConfirm('Erreur','Erreur lors de la sauvegarde : '+(error.message||error),[{text:'OK',value:'ok',class:'primary'}]);}finally{backupBtn.disabled=false;backupBtn.innerHTML=originalContent;}});loadLogs();});