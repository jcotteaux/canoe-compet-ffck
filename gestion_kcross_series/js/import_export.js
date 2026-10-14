import{saveBlobWithTauri}from'./tauri-helpers.js?v=2.2.0';import{notifyError}from'./utils.js?v=2.2.0';export class ImportExportManager{constructor(competitionCode){this.competitionCode=competitionCode;}
async fetchExportData(){const url=`./api/api_export_course.php?competition=${encodeURIComponent(this.competitionCode)}`;const response=await fetch(url);const result=await response.json();if(!result.success){throw new Error(result.error||"Erreur lors de l'export.");}
return result.export;}
getStatsHtml(data){const stats=data.stats||{};const t=window.APP_TEXTS.import_export.stats;return`
            <div class="export-summary">
                <ul>
                    <li>${t.categories} : <strong>${stats.categories}</strong></li>
                    <li>${t.heats} : <strong>${stats.series}</strong></li>
                    <li>${t.slots} : <strong>${stats.slots}</strong></li>
                    <li>${t.rankings} : <strong>${stats.classement}</strong></li>
                </ul>
            </div>
        `;}
async saveExportFile(exportData){const jsonStr=JSON.stringify(exportData,null,2);const blob=new Blob([jsonStr],{type:'application/json'});const filename=`course_${this.competitionCode}_${new Date().toISOString().slice(0, 10)}.mdv`;await saveBlobWithTauri(blob,filename);}
async parseImportFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=(e)=>{try{const data=JSON.parse(e.target.result);if(!data.kcross_export||data.kcross_export.format!=='kcross_course'){reject(new Error("Ce fichier n'est pas un export valide (format incorrect)."));return;}
resolve({data,fileInfo:file});}catch(err){reject(new Error("Fichier JSON invalide ou corrompu."));}};reader.onerror=()=>reject(new Error("Erreur de lecture du fichier."));reader.readAsText(file);});}
async executeImport(importData){const response=await fetch('./api/api_import_course.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target_code:this.competitionCode,export_data:importData})});const result=await response.json();if(!result.success){throw new Error(result.error||"Erreur lors de l'import serveur.");}
return result;}}