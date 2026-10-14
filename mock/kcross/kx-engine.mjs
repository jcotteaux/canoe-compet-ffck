// Pont vers le moteur réel de gestion_kcross_series (js/engine.js).
//
// Le simulateur ne réécrit ni les tableaux de progression ni les règles de
// classement : il charge le moteur de l'application, sans navigateur, et lui
// fait faire exactement ce que fait le poste gestionnaire :
//   - générer les séries et les horaires à partir des résultats du time trial ;
//   - valider une série, ce qui calcule son classement et place les qualifiés
//     dans les séries suivantes.
// Une évolution des formats ou du moteur est donc reprise sans rien toucher ici.

import { register } from 'node:module';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const KX_ROOT = path.join(HERE, '..', '..', 'gestion_kcross_series');

register('./hooks.mjs', import.meta.url);

// Le moteur touche à peine au navigateur : notifyError (alert) et
// window.location dans des chemins que le simulateur n'emprunte pas.
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { getElementById: () => null, querySelector: () => null, addEventListener() {} };
}
if (typeof globalThis.alert === 'undefined') {
  globalThis.alert = (msg) => console.warn(`[kx-engine] ${msg}`);
}
if (!globalThis.location) globalThis.location = { search: '', reload() {} };

// Même suffixe de version que les imports internes : une seule instance de
// chaque module, comme dans le navigateur.
const V = '?v=2.2.0';
const engineUrl = pathToFileURL(path.join(KX_ROOT, 'js', 'engine.js')).href + V;
const formatsUrl = pathToFileURL(path.join(KX_ROOT, 'js', 'format_competition.js')).href + V;
const constantsUrl = pathToFileURL(path.join(KX_ROOT, 'js', 'constants.js')).href + V;
const utilsUrl = pathToFileURL(path.join(KX_ROOT, 'js', 'utils.js')).href + V;

const { ApplicationCourse, ConfigurationPenalites } = await import(engineUrl);
const { FORMATS_COMPETITION } = await import(formatsUrl);
export const { HeatState, SpecialStatus } = await import(constantsUrl);
export { FORMATS_COMPETITION };
// Pavés de pénalités de l'incrustation, générés comme le fait la régie vidéo.
export const { createPenaltySummaryHTML } = await import(utilsUrl);
// Le tableau des phases finales n'est dessiné que si le format est un arbre :
// même règle que la page video/video_tableau.html.
const tableauUrl = pathToFileURL(path.join(KX_ROOT, 'video', 'js', 'tableau_model.js')).href + V;
const tableau = await import(tableauUrl);
export function hasBracket(formatKey, nomVariante) {
  const v = tableau.variantOf(FORMATS_COMPETITION, formatKey, nomVariante);
  return !!v && tableau.isBracket(v.variante, v.formatDef);
}
export function isLastPhase(formatKey, nomVariante, roundKey) {
  const v = tableau.variantOf(FORMATS_COMPETITION, formatKey, nomVariante);
  const phases = v?.variante.phases || [];
  return phases.length > 0 && phases[phases.length - 1].cle === roundKey;
}

/** Sérialise comme fetch(JSON.stringify(...)) : le PHP reçoit des objets plats. */
const wire = (o) => JSON.parse(JSON.stringify(o));

/** Variante du format adaptée au nombre de bateaux (borne_affectation "9-12"). */
export function pickVariante(formatKey, nb) {
  const format = FORMATS_COMPETITION[formatKey];
  if (!format) throw new Error(`format inconnu : ${formatKey}`);
  const variantes = format.variantesParNbParticipants;
  if (variantes[String(nb)]) return String(nb);
  for (const [key, v] of Object.entries(variantes)) {
    if (key.startsWith('INV')) continue;
    const [lo, hi] = String(v.borne_affectation || '').split('-').map(Number);
    if (nb >= lo && nb <= hi) return key;
  }
  throw new Error(`aucune variante de ${formatKey} pour ${nb} bateaux (disponibles : ${Object.keys(variantes).join(', ')})`);
}

/** Zones jugées dans l'ordre de la chaîne de pénalités : START, portes, ROLL. */
export function penaltyZones(gateCount, rollZoneAfterGate, detailPortes = null) {
  return ConfigurationPenalites.genererSequenceZones(gateCount, rollZoneAfterGate, detailPortes);
}

const toSeconds = (t) => {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
};
const toClock = (sec) =>
  [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60].map((n) => String(n).padStart(2, '0')).join(':');

/**
 * Configure la compétition comme le gestionnaire le fait à l'écran
 * « Configuration » puis « Horaires », et renvoie la charge utile de
 * `save_full_config` telle que le navigateur l'enverrait.
 */
export async function buildConfiguration(cfg, resultatsData) {
  const app = new ApplicationCourse();
  app.param.apiResultsData = resultatsData;
  app.param.globalScheduleSettings = {
    defaultEcartSeriesGlobal: cfg.ecartSeries,
    defaultEcartCategoriesGlobal: cfg.ecartCategories,
  };
  app.selectionnerFormatDeRegles(cfg.formatKey, FORMATS_COMPETITION);

  await app.validerConfigurationCategoriesEtDemarrerApp({
    formatKey: cfg.formatKey,
    gateCount: cfg.gateCount,
    gateProfil: cfg.gateProfil,
    rollZoneAfterGate: cfg.rollZoneAfterGate,
    categorySelections: cfg.categories.map((c, i) => ({ catKey: c.code, nomVariante: c.variante, ordre: i + 1 })),
  });
  if (!app.param.isConfigurationValidated) throw new Error('configuration refusée par le moteur');

  // Horaires : l'opérateur fixe l'heure de la première catégorie de chaque
  // tour, le moteur enchaîne les autres. Les tours se suivent avec ecartPhases.
  let next = toSeconds(cfg.firstStart);
  for (const phaseKey of Object.keys(app.param.schedulesData)) {
    const phase = app.param.schedulesData[phaseKey];
    const first = phase.categoriesOrder[0];
    if (!first) continue;
    Object.assign(phase.categoriesDetails[first], { startTime: toClock(next), isStartTimeUserFixed: true });
    app.recalculateSchedulesForPhase(phaseKey);
    const last = Math.max(
      ...Object.values(phase.categoriesDetails)
        .map((d) => d.lastHeatStartTime)
        .filter(Boolean)
        .map(toSeconds)
    );
    next = last + cfg.ecartPhases;
  }
  app._calculateGlobalHeatNumbers();

  return wire({
    formatKey: cfg.formatKey,
    gateCount: app.param.gateCount,
    gateProfil: app.param.gateProfil,
    rollZoneAfterGate: app.param.rollZoneAfterGate,
    globalScheduleSettings: app.param.globalScheduleSettings,
    categoriesData: app.param.categoriesData,
    schedulesData: app.param.schedulesData,
  });
}

/**
 * Valide une série comme le bouton « Valider » du gestionnaire : le moteur est
 * réhydraté depuis la base (load_full_competition), calcule le classement de
 * la série et la progression, puis appelle saveProgression.
 */
export async function validateHeat(fullState, resultatsData, heatId, saveProgression) {
  const app = new ApplicationCourse();
  app.param.apiResultsData = resultatsData;
  // Réponse complète de load_full_competition ou seulement son champ data.
  await app._rehydrateState(wire(fullState.data ?? fullState));

  for (const [category, cat] of Object.entries(app.param.categoriesData)) {
    for (const [round, r] of Object.entries(cat.rounds)) {
      const heatindex = r.heats.findIndex((h) => h.id === heatId);
      if (heatindex === -1) continue;
      app.adminPersistenceManager = {
        saveProgression: async (sourceHeat, targetHeats, finalRanking) =>
          saveProgression(wire({ sourceHeat, targetHeats, finalRanking })),
      };
      return app.gererValidationClassement({ target: { dataset: { category, round, heatindex: String(heatindex) } } });
    }
  }
  return { success: false, errorCode: 'HEAT_NOT_FOUND' };
}
