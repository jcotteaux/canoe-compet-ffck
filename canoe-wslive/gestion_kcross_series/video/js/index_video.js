import{loadLanguage,getLanguage}from'../../js/languageManager.js?v=2.2.0';import{applyStaticTexts}from'../../js/utils.js?v=2.2.0';import{HeatState}from'../../js/constants.js?v=2.2.0';import{LanguageSelector}from'../../js/languageSelector.js?v=2.2.0';function parseFrenchDate(dateStr){if(!dateStr)return new Date(0);const[day,month,year]=dateStr.split('/');return new Date(year,month-1,day);}
function sortCompetitions(competitions,field,order){return[...competitions].sort((a,b)=>{let valA,valB;if(field==='date'){valA=parseFrenchDate(a.Date_debut);valB=parseFrenchDate(b.Date_debut);if(valA.getTime()===valB.getTime()){let codeA=parseInt(String(a.Code).replace(/[^0-9]/g,''),10)||0;let codeB=parseInt(String(b.Code).replace(/[^0-9]/g,''),10)||0;return order==='asc'?codeA-codeB:codeB-codeA;}}else if(field==='code'){valA=parseInt(String(a.Code).replace(/[^0-9]/g,''),10)||0;valB=parseInt(String(b.Code).replace(/[^0-9]/g,''),10)||0;}
const comparison=valA-valB;return order==='asc'?comparison:-comparison;});}
document.addEventListener('DOMContentLoaded',async()=>{await loadLanguage(['common','video']);applyStaticTexts(window.APP_TEXTS,document.body);const languageSelector=new LanguageSelector('language-selector-container');languageSelector.init();const lang=getLanguage();const t=window.APP_TEXTS.video;const container=document.getElementById('competitions-container');const noCompPanel=document.getElementById('no-competitions');try{const[resFFCK,resManual]=await Promise.all([fetch('../api/api_competffck_competitions.php').then(r=>r.json()),fetch('../api/api_get_manual_competitions.php').then(r=>r.json())]);let allComps=[...resFFCK,...(resManual.success?resManual.data:[])];if(allComps.length===0){noCompPanel.style.display='block';return;}
allComps=sortCompetitions(allComps,'date','asc');container.innerHTML='';allComps.forEach(comp=>{const li=document.createElement('li');li.className='competition-list-item';const controlUrl=`video_control.html?competition=${comp.Code}&lang=${lang}`;const overlayUrl=`video_incrustation.html?competition=${comp.Code}`;li.innerHTML=`
                <span class="item-code">${comp.Code}</span>
                <span class="item-title">${comp.Nom}</span>
                <span class="item-ville">${comp.Ville}</span>
                <span class="item-date">${comp.Date_debut}</span>
                <div class="regie-actions">
                    <a href="${controlUrl}" class="btn-regie btn-control" title="${t.btnControlTitle}">
                        <span class="material-icons">videogame_asset</span>
                    </a>
                    <a href="${overlayUrl}" class="btn-regie btn-overlay" title="${t.btnOverlayTitle}">
                        <span class="material-icons">cast</span>
                    </a>
                </div>
            `;container.appendChild(li);});}catch(error){console.error("Erreur chargement index vidéo:",error);container.innerHTML=`<p class="error">${t.errorServer}</p>`;}});