// Cache de la catégorie affichée, séparé par serveur, compétition et manche.
const resultsCacheLiveContexts = new Set();
function ResultsCategoryLiveEvent()
{
    resultsCacheLiveContexts.add(ResultsCacheKey());
}
function ResultsCacheKey()
{
    return 'CRBCK:tv_results:category:v1:' + wsParams.url + ':' + wsParams.port + ':' +
        canoe.GetCodeCompetition() + ':' + canoe.GetCodeCoursePhase();
}
function SaveResultsCategory()
{
    if (wsMain.epreuveForcee || !wsMain.epreuve) return;
    try { localStorage.setItem(ResultsCacheKey(), wsMain.epreuve); }
    catch (e) { /* L'affichage reste utilisable si le stockage est indisponible. */ }
}
function RestoreResultsCategory()
{
    if (wsMain.epreuveForcee || wsMain.preferTerminee || resultsCacheLiveContexts.has(ResultsCacheKey())) return '';
    try {
        const category = localStorage.getItem(ResultsCacheKey());
        const info = ReleverCategories().get(category);
        if (!info) return '';
        document.body.classList.toggle('provisoire', info.traites < info.total);
        return category;
    } catch (e) { return ''; }
}
function ClearResultsCategory()
{
    try { localStorage.removeItem(ResultsCacheKey()); } catch (e) {}
}
