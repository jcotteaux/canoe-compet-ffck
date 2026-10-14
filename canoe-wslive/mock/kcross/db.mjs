// Base MySQL et API PHP de gestion_kcross_series, en mémoire.
//
// Chaque fonction `api_*` reprend le script PHP du même nom (gestion_kcross_series/api/)
// et renvoie { status, body } : mêmes champs, mêmes types, mêmes 304. Les tables
// portent les noms de colonnes MySQL pour qu'on puisse relire le PHP en regard.
//
// Deux sources de données, comme sur le terrain :
//   - `source` : ce que competFFCK a en base (compétition, bateaux, time trial) ;
//   - les tables KCross_* : ce que l'application kayak cross écrit.

const HEAT = Object.freeze({ EN_ATTENTE: 1, PRET: 2, INCOMPLET: 3, PRET_A_VALIDER: 4, OFFICIEL: 5, EN_MODIF: 6 });
export { HEAT };

// api_competffck_resultats.php
const STATUS_CODE_MAP = { '-500': 'DNF', '-800': 'DSQ', '-600': 'DNS', '-700': 'DES' };
const TRI_NON_CLASSES = { '-500': 1, '-700': 1, '-800': 2, '-600': 3 };
const CODE_SELECT = { '-500': true, '-700': true, '-800': false, '-600': false };

// config/config.php. Le live web est coupé : le gestionnaire pousserait sinon
// la compétition simulée sur livecompet.ffck.org.
const CONFIG = {
  judging: { juge_start: true },
  live_web: { fonction_live_enabled: false, mode: 'Live', server_url: '', secret_key: '' },
};

const PRIVILEGED = new Set(['jugement', 'gestionnaire', 'admin']);

const ok = (body) => ({ status: 200, body });
const notModified = () => ({ status: 304, body: null });
const fail = (status, message, extra = {}) => ({ status, body: { success: false, message, ...extra } });

const upper = (s) => (s ? s.toLocaleUpperCase('fr-FR') : '');
const title = (s) => (s ? s.toLocaleLowerCase('fr-FR').replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('fr-FR')) : '');

export class KxDatabase {
  constructor(source) {
    this.source = source; // { competition, categories: {K1H: {Nom_categorie, Statut_epreuve}}, boats: [...] }
    this.code = String(source.competition.Code);
    this.lastStamp = 0;
    this.listeners = new Set();
    this.reset();
  }

  reset() {
    this.settings = null;
    this.schedules = null;
    this.categories = [];
    this.heats = [];
    this.slots = [];
    this.ranking = [];
    this.displayState = null;
    this.overlayState = null;
    this.nextCatId = 1;
    this.nextHeatId = 1;
  }

  /** getCurrentTimestamp() du PHP, rendu strictement croissant : deux écritures
   *  dans la même milliseconde ne doivent pas se masquer derrière un 304. */
  now() {
    this.lastStamp = Math.max(Date.now(), this.lastStamp + 1);
    return this.lastStamp;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  changed(what) {
    for (const fn of this.listeners) fn(what);
  }

  // ------------------------------------------------------------ requêtes

  heat(id) {
    return this.heats.find((h) => h.Code_Serie === Number(id)) || null;
  }

  heatSlots(id) {
    return this.slots.filter((s) => s.Code_Serie === Number(id)).sort((a, b) => a.Slot_Index - b.Slot_Index);
  }

  slot(heatId, index) {
    return this.slots.find((s) => s.Code_Serie === Number(heatId) && s.Slot_Index === Number(index)) || null;
  }

  category(id) {
    return this.categories.find((c) => c.Code_Categorie === id) || null;
  }

  boat(code) {
    return this.source.boats.find((b) => String(b.Code_bateau) === String(code)) || null;
  }

  zoneCount() {
    if (!this.settings) return 0;
    return this.settings.Nombre_portes + (this.settings.Roll_Zone !== -1 ? 2 : 1);
  }

  maxLastModified() {
    let m = 0;
    for (const h of this.heats) m = Math.max(m, h.Last_Modified || 0);
    for (const s of this.slots) m = Math.max(m, s.Last_Modified || 0);
    return m;
  }

  /** Les séries telles que les sert api_get_next_heats.php, dans son ordre. */
  orderedHeats() {
    return [...this.heats].sort(
      (a, b) =>
        (a.Num_Serie_Global ?? -1) - (b.Num_Serie_Global ?? -1) ||
        String(a.H_depart ?? '').localeCompare(String(b.H_depart ?? '')) ||
        a.Code_Serie - b.Code_Serie
    );
  }

  matches(code) {
    return String(code ?? '') === this.code;
  }

  // ------------------------------------------------------- heat -> JSON

  /** Une série au format de api_get_next_heats.php / api_get_heat_details.php. */
  heatJson(h, withClub) {
    const cat = this.category(h.Code_Categorie);
    const s = this.settings;
    const slots = this.heatSlots(h.Code_Serie);
    let lastModified = h.Last_Modified || 0;
    for (const sl of slots) lastModified = Math.max(lastModified, sl.Last_Modified || 0);
    return {
      id: h.Code_Serie,
      categoryKey: cat.Nom_Categorie,
      roundKey: h.Nom_Tour,
      name: h.Nom_Serie,
      startTime: h.H_depart,
      etat: h.Etat,
      globalHeatNumber: h.Num_Serie_Global ? h.Num_Serie_Global : null,
      formatKey: s.Format,
      nomVariante: cat.Nom_Variante,
      zonesJugees: h.Zones_Jugees,
      gateCount: s.Nombre_portes,
      rollZoneAfterGate: s.Roll_Zone,
      detailPortes: s.Detail_portes,
      lastModified,
      modifiedBy: h.Modified_By,
      slots: slots.map((sl) => {
        const b = this.boat(sl.Code_bateau);
        const name = b ? `${upper(b.Nom)} ${title(b.Prenom)}`.trim() || 'N/A' : 'N/A';
        return {
          prioDepart: sl.Slot_Index,
          lastModified: sl.Last_Modified ?? null,
          modifiedBy: sl.Modified_By,
          participant: {
            id: sl.Code_bateau,
            bib: b ? b.Dossard : null,
            name,
            club: withClub ? (b ? b.Club : null) : null,
            ordre_arrivee: sl.Ordre_arrivee,
            penalite: sl.Penalite,
            specialStatus: sl.Statut_Special,
            finalRank: sl.Clt > 0 ? sl.Clt : sl.Statut_Special || '-',
          },
        };
      }),
    };
  }

  // ------------------------------------------------------- API GET

  api_get_next_heats(q) {
    if (!q.competition) return fail(400, 'Code de compétition non fourni.');
    const dbLast = this.maxLastModified();
    const clientLast = Number(q.last_modified || 0);
    if (clientLast > 0 && dbLast <= clientLast) return notModified();
    if (!this.matches(q.competition) || !this.settings) return ok({ success: true, lastModified: dbLast, heats: [] });

    const etats = String(q.etat ?? '2').split(',').map((n) => parseInt(n, 10));
    const limit = Number(q.limit || 0);
    const withClub = q.club === 'true';
    const z = q.zoneIndex;

    const zoneFilter = (h) => {
      if (z === undefined || z === null) return true;
      const zj = h.Zones_Jugees;
      if (z === 'all') return zj !== null && !zj.includes('0');
      if (z === 'nostart') {
        if (zj === null) return false;
        return CONFIG.judging.juge_start ? !zj.includes('0') : !zj.slice(1).includes('0');
      }
      const i = parseInt(z, 10) || 0;
      return zj === null || zj[i] === '0';
    };

    const heats = [];
    for (const h of this.orderedHeats()) {
      if (!etats.includes(h.Etat)) continue;
      if (!zoneFilter(h)) continue;
      if (q.category && this.category(h.Code_Categorie).Nom_Categorie !== q.category) continue;
      if (limit > 0 && heats.length >= limit) break;
      heats.push(this.heatJson(h, withClub));
    }
    return ok({ success: true, lastModified: dbLast, heats });
  }

  api_get_heat_details(q) {
    const heatId = parseInt(q.heat_id, 10) || 0;
    if (!q.competition || heatId === 0) return fail(400, 'Paramètres manquants.');
    const h = this.matches(q.competition) ? this.heat(heatId) : null;
    if (!h) return ok({ success: false, message: 'Série introuvable' });
    return ok({ success: true, heat: this.heatJson(h, true) });
  }

  api_load_state(q, payload = {}) {
    const code = q.competition || payload.competitionCode;
    if (!code) return fail(400, 'Code de compétition manquant.');
    const action = q.action || payload.action;
    if (!action) return fail(400, 'Action manquante.');

    let dbLast = 0;
    if (action === 'load_full_competition' || action === 'load_categories_data') {
      dbLast = this.matches(code) ? this.maxLastModified() : 0;
      const clientLast = Number(q.last_modified || 0);
      if (clientLast > 0 && dbLast <= clientLast) return notModified();
    }

    let res;
    switch (action) {
      case 'load_heat_status': {
        const heatId = parseInt(q.heatId, 10) || 0;
        if (heatId === 0) return fail(500, "Erreur lors du chargement de l'état: ID de la série manquant.");
        const h = this.matches(code) ? this.heat(heatId) : null;
        if (!h) {
          res = { success: false, message: 'Série introuvable.' };
        } else {
          const lm = Math.max(h.Last_Modified || 0, ...this.heatSlots(heatId).map((s) => s.Last_Modified || 0));
          res = { success: true, etat: h.Etat, zonesJugees: h.Zones_Jugees, lastModified: lm };
        }
        break;
      }
      case 'load_full_competition':
        res = this.fullCompetitionState(code);
        break;
      case 'load_categories_data':
        res = this.matches(code) && this.categories.length
          ? { success: true, found: true, data: { categoriesData: this.categoriesData() } }
          : { success: true, found: false, message: 'Aucune catégorie trouvée pour cette compétition.' };
        break;
      default:
        return fail(500, `Erreur lors du chargement de l'état: Action de chargement non reconnue : ${action}`);
    }
    if (dbLast > 0) res.lastModified = dbLast;
    return ok(res);
  }

  fullCompetitionState(code = this.code) {
    if (!this.matches(code) || !this.settings) {
      return { success: true, found: false, message: 'Aucun état de persistance trouvé.' };
    }
    return {
      success: true,
      found: true,
      data: {
        settings: { ...this.settings },
        schedulesData: JSON.parse(JSON.stringify(this.schedules)),
        categoriesData: this.categoriesData(),
        liveWebConfig: CONFIG.live_web,
      },
    };
  }

  /** _buildCategoriesDataFromRows() de api_load_state.php. */
  categoriesData() {
    const out = {};
    const cats = this.categories
      .filter((c) => c.Nom_Categorie !== '_TEST_RESEAU_')
      .sort((a, b) => (a.Ordre ?? 999) - (b.Ordre ?? 999) || a.Code_Categorie - b.Code_Categorie);
    for (const cat of cats) {
      const entry = {
        cle: cat.Nom_Categorie,
        numCompetitorsInHeats: cat.Nb_Bateau,
        nomVariante: cat.Nom_Variante,
        ordre: cat.Ordre ?? 999,
        rounds: {},
      };
      const heats = this.heats.filter((h) => h.Code_Categorie === cat.Code_Categorie).sort((a, b) => a.Code_Serie - b.Code_Serie);
      for (const h of heats) {
        if (!entry.rounds[h.Nom_Tour]) entry.rounds[h.Nom_Tour] = { name: h.Nom_Tour, heats: [] };
        const slots = this.heatSlots(h.Code_Serie).filter((s) => s.Code_bateau);
        let lm = h.Last_Modified || 0;
        if (slots.length) lm = Math.max(lm, slots[0].Last_Modified || 0); // le PHP ne lit que la première ligne
        entry.rounds[h.Nom_Tour].heats.push({
          id: h.Code_Serie,
          name: h.Nom_Serie,
          roundKey: h.Nom_Tour,
          startTime: h.H_depart,
          etat: h.Etat,
          globalHeatNumber: h.Num_Serie_Global || null,
          lastModified: lm,
          modifiedBy: h.Modified_By ?? null,
          slots: slots.map((s) => ({
            prioDepart: s.Slot_Index,
            participantCodeBateau: s.Code_bateau,
            lastModified: s.Last_Modified ?? null,
            modifiedBy: s.Modified_By ?? null,
            heatResult: {
              order: s.Ordre_arrivee ? Number(s.Ordre_arrivee) : null,
              penalty: s.Penalite,
              specialStatus: s.Statut_Special,
              finalRank: s.Clt === null || s.Clt === undefined ? null : Number(s.Clt),
            },
          })),
        });
      }
      out[cat.Nom_Categorie] = entry;
    }
    return out;
  }

  /** api_competffck_resultats.php : le time trial vu de competFFCK. */
  api_competffck_resultats(q) {
    const code = q.competition || '';
    if (!code) return fail(400, 'Code de compétition non fourni.');
    if (parseInt(String(code).replace(/[^0-9]/g, ''), 10) !== Number(this.source.competition.Code)) {
      return ok({ success: false, message: 'Compétition non trouvée.' });
    }
    return ok({ success: true, message: 'Données de la compétition chargées avec succès.', data: this.resultatsData() });
  }

  resultatsData() {
    const { competition, categories, boats } = this.source;
    const statuts = {};
    for (const [code, c] of Object.entries(categories)) {
      statuts[code] = { Statut_epreuve: c.Statut_epreuve, Nom_categorie: c.Nom_categorie ?? null, nombre_classes: 0 };
    }
    const byCat = {};
    for (const b of boats) {
      const code = b.Code_categorie || 'SANS_CATEGORIE';
      (byCat[code] ||= []).push({
        Code_bateau: b.Code_bateau,
        Dossard: b.Dossard,
        Club: b.Club,
        Bateau: b.Bateau,
        Code_categorie: b.Code_categorie,
        Cltc: b.Cltc ?? null,
        Rang_initial: b.Rang_initial ?? null,
        Tps_chrono: b.Tps_chrono ?? null,
        Nom: upper(b.Nom),
        Prenom: title(b.Prenom),
        Sexe: b.Sexe,
        Matric: b.Matric,
        Nation: b.Code_nation ?? null,
        Source_csv: null,
        calculated_rang: null,
        selected: false,
      });
    }
    const autres = Math.max(...Object.values(TRI_NON_CLASSES)) + 1;
    const priority = (t) => (TRI_NON_CLASSES[String(t)] ?? (t !== null && t < 0 ? autres : autres + 1));
    const out = {};
    for (const [code, list] of Object.entries(byCat)) {
      list.sort((a, b) => {
        const ap = a.Tps_chrono !== null && a.Tps_chrono > 0;
        const bp = b.Tps_chrono !== null && b.Tps_chrono > 0;
        if (ap && bp) {
          const ca = a.Cltc ?? Infinity;
          const cb = b.Cltc ?? Infinity;
          if (ca !== cb) return ca - cb;
          if (a.Tps_chrono !== b.Tps_chrono) return a.Tps_chrono - b.Tps_chrono;
          return String(a.Bateau).localeCompare(String(b.Bateau));
        }
        if (ap) return -1;
        if (bp) return 1;
        return priority(a.Tps_chrono) - priority(b.Tps_chrono) || String(a.Bateau).localeCompare(String(b.Bateau));
      });
      let classes = 0;
      list.forEach((b, i) => {
        b.calculated_rang = i + 1;
        b.selected = (b.Tps_chrono !== null && b.Tps_chrono > 0) || CODE_SELECT[String(b.Tps_chrono)] === true;
        if (b.selected) classes++;
        if (b.Tps_chrono !== null && b.Tps_chrono <= 0 && STATUS_CODE_MAP[String(b.Tps_chrono)]) {
          b.Tps_chrono = STATUS_CODE_MAP[String(b.Tps_chrono)];
        }
      });
      if (statuts[code]) statuts[code].nombre_classes = classes;
      out[code] = list;
    }
    return { competition_details: { ...competition }, statuts_categories: statuts, resultats_par_categorie: out };
  }

  api_competffck_competitions() {
    const c = this.source.competition;
    const fr = (d) => (d ? d.split('-').reverse().join('/') : null);
    return ok([{ Code: c.Code, Date_debut: fr(c.Date_debut), Date_fin: fr(c.Date_fin), Nom: c.Nom, Ville: c.Ville, Etat: c.Etat, Codex: c.Codex }]);
  }

  api_get_manual_competitions() {
    return ok({ success: true, data: [] });
  }

  api_test_tables() {
    return ok({ tables_exist: true, error: null });
  }

  api_create_tables() {
    return ok({ success: true, message: 'Aucune mise à jour requise.', status: 'skipped' });
  }

  api_get_server_time() {
    const t = Date.now();
    return ok({ success: true, serverTime: t, serverTimeISO: new Date(t).toISOString() });
  }

  api_display_state(q, payload, method) {
    if (!q.competition) return ok({ success: false, message: 'Code compétition manquant' });
    if (!this.matches(q.competition) || !this.settings) {
      return fail(403, 'Accès refusé : Compétition non configurée.');
    }
    if (method === 'POST') {
      this.displayState = payload;
      return ok({ success: true });
    }
    return ok(this.displayState ?? { success: true, state: null });
  }

  api_overlay_state(q, payload, method) {
    if (!q.competition) return ok({ success: false, message: 'Code compétition manquant' });
    if (method === 'POST') {
      if (payload && payload.action === 'DELETE') this.overlayState = null;
      else this.overlayState = payload;
      this.changed('overlay');
      return ok({ success: true });
    }
    return ok(this.overlayState ?? { success: true, mode: 'HIDDEN', title: '', slots: [] });
  }

  // ------------------------------------------------------- API POST

  /** api_save_state.php : une transaction par appel, comme le PHP. */
  api_save_state(q, payload) {
    const code = q.competition || payload?.competitionCode;
    if (!code) return fail(400, 'Code de compétition manquant.');
    const action = q.action || payload?.action;
    if (!action) return fail(400, 'Action manquante.');
    if (!this.matches(code)) return fail(500, `Compétition ${code} inconnue du simulateur (attendu : ${this.code}).`);

    const p = { ...payload, modifiedBy: payload.modifiedBy ?? 'unknown' };
    const snapshot = this.snapshot();
    try {
      const handler = this.actions[action];
      if (!handler) throw new Error(`Action non reconnue : ${action}`);
      const data = handler.call(this, p);
      if (data && data.__locked) {
        this.restore(snapshot);
        const { __locked, ...lock } = data;
        return ok({ success: false, locked: true, ...lock });
      }
      this.changed(action);
      return ok({ success: true, message: `Action '${action}' effectuée avec succès.`, ...(data || {}) });
    } catch (e) {
      this.restore(snapshot);
      return fail(500, `Erreur lors de l'action '${action}': ${e.message}`);
    }
  }

  snapshot() {
    return JSON.stringify({ settings: this.settings, schedules: this.schedules, categories: this.categories, heats: this.heats, slots: this.slots, ranking: this.ranking, nextCatId: this.nextCatId, nextHeatId: this.nextHeatId });
  }

  restore(snap) {
    Object.assign(this, JSON.parse(snap));
  }

  checkHeatLocked(heatId) {
    const h = this.heat(heatId);
    if (!h) return { locked: false, state: null, message: null };
    if (h.Etat === HEAT.OFFICIEL) return { locked: true, state: h.Etat, message: 'Série validée. Modification impossible depuis ce périphérique.' };
    if (h.Etat === HEAT.EN_MODIF) return { locked: true, state: h.Etat, message: 'Série en cours de modification par le gestionnaire.' };
    return { locked: false, state: h.Etat, message: null };
  }

  locked(info) {
    return { __locked: true, state: info.state, message: info.message };
  }

  upsertSlot(heatId, index, fields, stamp, by) {
    let s = this.slot(heatId, index);
    if (!s) {
      s = { Code_competition: this.code, Code_Serie: Number(heatId), Slot_Index: Number(index), Code_bateau: null, Ordre_arrivee: null, Penalite: null, Statut_Special: null, Clt: 0 };
      this.slots.push(s);
    }
    Object.assign(s, fields, { Last_Modified: stamp, Modified_By: by });
    return s;
  }

  updateSingleHeatAndSlots(heatData, by) {
    const id = heatData.id;
    const now = this.now();
    const h = this.heat(id);
    if (h) {
      Object.assign(h, {
        H_depart: heatData.startTime || null,
        Etat: heatData.etat ?? HEAT.EN_ATTENTE,
        Num_Serie_Global: heatData.globalHeatNumber ?? null,
        Last_Modified: now,
        Modified_By: by,
      });
    }
    this.slots = this.slots.filter((s) => s.Code_Serie !== Number(id));
    for (const slot of heatData.slots) {
      if (slot.participant && slot.participant.rankTT > 0) {
        this.slots.push({
          Code_competition: this.code,
          Code_Serie: Number(id),
          Slot_Index: slot.prioDepart,
          Code_bateau: slot.participant.codeBateau ?? slot.participant.id,
          Ordre_arrivee: slot.heatResult.order === null || slot.heatResult.order === undefined ? null : Number(slot.heatResult.order),
          Penalite: slot.heatResult.penalty,
          Statut_Special: slot.heatResult.specialStatus ?? null,
          Clt: isNumeric(slot.heatResult.finalRank) ? Number(slot.heatResult.finalRank) : 0,
          Last_Modified: now,
          Modified_By: by,
        });
      }
    }
  }

  saveFinalRanking(categoryId, finalRanking) {
    if (!finalRanking || !finalRanking.length) return;
    this.ranking = this.ranking.filter((r) => r.Code_Categorie !== categoryId);
    for (const item of finalRanking) {
      if (!item.participant) continue;
      this.ranking.push({
        Code_Categorie: categoryId,
        Code_bateau: item.participant.codeBateau ?? item.participant.id,
        Cltc: item.rangFinal,
        Serie_Source: item.detailsSource,
      });
    }
  }

  catIdByName(name) {
    return this.categories.find((c) => c.Nom_Categorie === name)?.Code_Categorie ?? null;
  }
}

function isNumeric(v) {
  return v !== null && v !== '' && v !== undefined && !isNaN(Number(v));
}

const requireFields = (p, fields, action) => {
  for (const f of fields) if (p[f] === undefined) throw new Error(`Données manquantes pour '${action}'.`);
};

KxDatabase.prototype.actions = {
  save_full_config(p) {
    const nbZones = Number(p.gateCount ?? 8) + (p.rollZoneAfterGate !== undefined && Number(p.rollZoneAfterGate) !== -1 ? 2 : 1);
    const zones = '0'.repeat(nbZones);
    this.reset();
    this.settings = {
      Code_competition: this.code,
      Format: p.formatKey,
      Nombre_portes: Number(p.gateCount),
      Detail_portes: p.gateProfil,
      Roll_Zone: Number(p.rollZoneAfterGate),
      Ecart_Series_Global: Number(p.globalScheduleSettings.defaultEcartSeriesGlobal),
      Ecart_Categories_Global: Number(p.globalScheduleSettings.defaultEcartCategoriesGlobal),
    };
    this.schedules = p.schedulesData;
    const now = this.now();
    const idMapping = { heats: {} };
    for (const [catKey, category] of Object.entries(p.categoriesData)) {
      const catId = this.nextCatId++;
      this.categories.push({ Code_Categorie: catId, Nom_Categorie: catKey, Nb_Bateau: category.numCompetitorsInHeats, Nom_Variante: category.nomVariante ?? null, Ordre: category.ordre ?? 999 });
      if (category.finalRanking) this.saveFinalRanking(catId, category.finalRanking);
      for (const [roundKey, round] of Object.entries(category.rounds)) {
        for (const heat of round.heats) {
          const heatId = this.nextHeatId++;
          this.heats.push({
            Code_competition: this.code,
            Code_Serie: heatId,
            Code_Categorie: catId,
            Nom_Tour: roundKey,
            Nom_Serie: heat.name,
            H_depart: heat.startTime || null,
            Etat: heat.etat ?? HEAT.EN_ATTENTE,
            Num_Serie_Global: heat.globalHeatNumber ?? null,
            Zones_Jugees: zones,
            Last_Modified: now,
            Modified_By: p.modifiedBy,
          });
          idMapping.heats[`${catKey}_${roundKey}_${heat.name}`] = heatId;
          for (const slot of heat.slots) {
            if (slot.participant && slot.participant.rankTT > 0) {
              this.slots.push({
                Code_competition: this.code,
                Code_Serie: heatId,
                Slot_Index: slot.prioDepart,
                Code_bateau: slot.participant.codeBateau ?? slot.participant.id,
                Ordre_arrivee: slot.heatResult.order,
                Penalite: slot.heatResult.penalty,
                Statut_Special: slot.heatResult.specialStatus ?? null,
                Clt: isNumeric(slot.heatResult.finalRank) ? Number(slot.heatResult.finalRank) : 0,
                Last_Modified: now,
                Modified_By: p.modifiedBy,
              });
            }
          }
        }
      }
    }
    // Série de test réseau créée par le PHP avec chaque configuration.
    const testCat = this.nextCatId++;
    this.categories.push({ Code_Categorie: testCat, Nom_Categorie: '_TEST_RESEAU_', Nb_Bateau: 4, Nom_Variante: '0', Ordre: 9999 });
    const testHeat = this.nextHeatId++;
    this.heats.push({ Code_competition: this.code, Code_Serie: testHeat, Code_Categorie: testCat, Nom_Tour: 'TEST', Nom_Serie: '_TEST_RESEAU_', H_depart: null, Etat: HEAT.OFFICIEL, Num_Serie_Global: 0, Zones_Jugees: zones, Last_Modified: now, Modified_By: p.modifiedBy });
    for (let i = 1; i <= 4; i++) {
      this.slots.push({ Code_competition: this.code, Code_Serie: testHeat, Slot_Index: i, Code_bateau: `TEST_BATEAU_${i}`, Ordre_arrivee: null, Penalite: null, Statut_Special: null, Clt: 0, Last_Modified: now, Modified_By: p.modifiedBy });
    }
    return { idMapping };
  },

  update_global_settings_schedule(p) {
    if (this.settings) {
      this.settings.Ecart_Series_Global = Number(p.globalScheduleSettings.defaultEcartSeriesGlobal);
      this.settings.Ecart_Categories_Global = Number(p.globalScheduleSettings.defaultEcartCategoriesGlobal);
    }
  },

  save_schedules(p) {
    this.schedules = p.schedulesData ?? this.schedules;
    const now = this.now();
    for (const heat of p.heats || []) {
      const h = this.heat(heat.id);
      if (h) Object.assign(h, { H_depart: heat.startTime || null, Num_Serie_Global: heat.globalHeatNumber ?? null, Last_Modified: now });
    }
  },

  save_heat_results(p) {
    this.updateSingleHeatAndSlots(p.heatData, p.modifiedBy);
    const catId = this.catIdByName(p.heatData.categoryKey);
    if (catId && p.finalRanking) this.saveFinalRanking(catId, p.finalRanking);
  },

  save_progression(p) {
    const now = this.now();
    this.updateSingleHeatAndSlots(p.sourceHeat, p.modifiedBy);
    for (const target of p.targetHeats) {
      const h = this.heat(target.id);
      if (h) Object.assign(h, { Etat: target.etat, Last_Modified: now, Modified_By: p.modifiedBy });
      for (const slot of target.slots) {
        if (slot.participant && slot.participant.rankTT > 0) {
          this.upsertSlot(target.id, slot.prioDepart, {
            Code_bateau: slot.participant.codeBateau ?? slot.participant.id,
            Ordre_arrivee: null,
            Penalite: null,
            Statut_Special: null,
            Clt: 0,
          }, now, p.modifiedBy);
        }
      }
    }
    const catId = this.catIdByName(p.sourceHeat.categoryKey);
    if (catId && p.finalRanking) this.saveFinalRanking(catId, p.finalRanking);
  },

  validate_heat_results(p) {
    requireFields(p, ['heatId', 'slots'], 'validate_heat_results');
    const now = this.now();
    const h = this.heat(p.heatId);
    if (h) Object.assign(h, { Etat: HEAT.OFFICIEL, Last_Modified: now, Modified_By: p.modifiedBy });
    for (const sd of p.slots) {
      const r = sd.heatResult;
      const s = this.slot(p.heatId, sd.prioDepart);
      if (s) {
        Object.assign(s, {
          Ordre_arrivee: r.order ?? null,
          Penalite: r.penalty,
          Statut_Special: r.specialStatus ?? null,
          Clt: isNumeric(r.finalRank) ? Number(r.finalRank) : 0,
          Last_Modified: now,
          Modified_By: p.modifiedBy,
        });
      }
    }
  },

  update_heat_state(p) {
    requireFields(p, ['heatInfo', 'newState'], 'update_heat_state');
    const lock = this.checkHeatLocked(p.heatInfo);
    if (lock.locked) return this.locked(lock);
    const now = this.now();
    const h = this.heat(p.heatInfo);
    if (h) Object.assign(h, { Etat: Number(p.newState), Last_Modified: now, Modified_By: p.modifiedBy });
    return { newLastModified: now };
  },

  launch_heat(p) {
    requireFields(p, ['heatId', 'newState'], 'launch_heat');
    const lock = this.checkHeatLocked(p.heatId);
    if (lock.locked) return this.locked(lock);
    const now = this.now();
    const h = this.heat(p.heatId);
    if (h) Object.assign(h, { Etat: Number(p.newState), Last_Modified: now, Modified_By: p.modifiedBy });
    for (const dns of p.dnsSlots || []) {
      const s = this.slot(p.heatId, dns.slotIndex);
      if (s) Object.assign(s, { Statut_Special: dns.newStatus, Last_Modified: now, Modified_By: p.modifiedBy });
    }
    for (const pen of p.penaltyInit || []) {
      const s = this.slot(p.heatId, pen.slotIndex);
      if (s) Object.assign(s, { Penalite: pen.value, Last_Modified: now, Modified_By: p.modifiedBy });
    }
    return { newLastModified: now };
  },

  record_arrivals(p) {
    requireFields(p, ['heatId', 'newState', 'arrivals'], 'record_arrivals');
    const lock = this.checkHeatLocked(p.heatId);
    if (lock.locked) return this.locked(lock);
    const now = this.now();
    for (const a of p.arrivals) {
      const s = this.slot(p.heatId, a.slotIndex);
      if (s) Object.assign(s, { Ordre_arrivee: a.newRank, Statut_Special: a.newStatus, Last_Modified: now, Modified_By: p.modifiedBy });
    }
    const h = this.heat(p.heatId);
    if (h) Object.assign(h, { Etat: Number(p.newState), Last_Modified: now, Modified_By: p.modifiedBy });
    return { newLastModified: now };
  },

  update_status(p) {
    requireFields(p, ['code_Serie', 'slot_Index', 'newStatus'], 'update_status');
    const lock = this.checkHeatLocked(p.code_Serie);
    if (lock.locked) return this.locked(lock);
    if (lock.state >= HEAT.PRET_A_VALIDER) {
      return this.locked({ state: lock.state, message: 'Arrivée validée. Modification du statut impossible.' });
    }
    const now = this.now();
    const s = this.slot(p.code_Serie, p.slot_Index);
    if (s) {
      if (['DNS', 'DNF', 'DQB', 'DSQ'].includes(p.newStatus)) Object.assign(s, { Statut_Special: p.newStatus, Ordre_arrivee: null });
      else s.Statut_Special = null;
      Object.assign(s, { Last_Modified: now, Modified_By: p.modifiedBy });
    }
    return { newLastModified: now };
  },

  update_penalite(p) {
    requireFields(p, ['code_Serie', 'slot_Index', 'newValue'], 'update_penalite');
    const lock = this.checkHeatLocked(p.code_Serie);
    if (lock.locked) return this.locked(lock);
    const h = this.heat(p.code_Serie);
    const zj = h?.Zones_Jugees ?? null;
    const toCheck = !CONFIG.judging.juge_start && zj ? zj.slice(1) : zj;
    if (toCheck && !toCheck.includes('0')) {
      return this.locked({ state: lock.state, message: 'Toutes les zones requises ont été jugées. Modification impossible.' });
    }
    const s = this.slot(p.code_Serie, p.slot_Index);
    if (!PRIVILEGED.has(p.modifiedBy) && zj) {
      const current = s?.Penalite || '';
      const max = Math.max(current.length, String(p.newValue).length, zj.length);
      for (let i = 0; i < max; i++) {
        if ((zj[i] ?? '0') !== '0' && (current[i] ?? '0') !== (String(p.newValue)[i] ?? '0')) {
          return this.locked({ state: lock.state, message: `Zone ${i + 1} déjà validée. Seul le jugement peut la modifier.` });
        }
      }
    }
    const now = this.now();
    if (s) Object.assign(s, { Penalite: p.newValue, Last_Modified: now, Modified_By: p.modifiedBy });
    return { newLastModified: now };
  },

  validate_zone_penalties(p) {
    if (p.heatId === undefined || p.zoneIndex === undefined || !Array.isArray(p.penalties)) {
      throw new Error("Données manquantes pour 'validate_zone_penalties'.");
    }
    const lock = this.checkHeatLocked(p.heatId);
    if (lock.locked) return this.locked(lock);
    const h = this.heat(p.heatId);
    const zoneIndex = Number(p.zoneIndex);
    const zj = (h?.Zones_Jugees || '').split('');
    if (zj[zoneIndex] !== undefined && zj[zoneIndex] !== '0' && !PRIVILEGED.has(p.modifiedBy)) {
      return this.locked({ state: lock.state, message: `La zone ${zoneIndex} est déjà validée. Seul le poste de jugement peut la modifier.` });
    }
    const now = this.now();
    for (const pen of p.penalties) {
      const v = String(pen.newValue);
      if (!['0', '2', '5'].includes(v)) throw new Error('La nouvelle valeur de pénalité est invalide.');
      const s = this.slot(p.heatId, pen.slotIndex);
      if (!s) throw new Error("Le slot demandé n'existe pas. Vérifiez les identifiants.");
      const cur = (s.Penalite || '').padEnd(zoneIndex + 1, '0').split('');
      cur[zoneIndex] = v;
      Object.assign(s, { Penalite: cur.join(''), Last_Modified: now, Modified_By: p.modifiedBy });
    }
    while (zj.length <= zoneIndex) zj.push('0');
    zj[zoneIndex] = '1';
    if (h) Object.assign(h, { Zones_Jugees: zj.join(''), Last_Modified: now, Modified_By: p.modifiedBy });
    return { newLastModified: now };
  },

  update_place(p) {
    requireFields(p, ['code_Serie', 'slot_Index', 'newValue'], 'update_place');
    const lock = this.checkHeatLocked(p.code_Serie);
    if (lock.locked) return this.locked(lock);
    if (lock.state >= HEAT.PRET_A_VALIDER) {
      return this.locked({ state: lock.state, message: "Arrivée validée. Modification de l'ordre impossible." });
    }
    const now = this.now();
    const s = this.slot(p.code_Serie, p.slot_Index);
    if (s) Object.assign(s, { Ordre_arrivee: p.newValue === null ? null : parseInt(p.newValue, 10), Last_Modified: now, Modified_By: p.modifiedBy });
    return { newLastModified: now };
  },

  // Le PHP ne touche pas Last_Modified ici : les pages ne voient le changement
  // qu'à la prochaine écriture. Reproduit tel quel.
  update_slot_penalties(p) {
    requireFields(p, ['heatId', 'slotPrio', 'heatResult'], 'update_slot_penalties');
    const s = this.slot(p.heatId, p.slotPrio);
    if (s) s.Penalite = p.heatResult.penalty;
  },

  save_updated_heats(p) {
    for (const heat of p.heats || []) {
      const h = this.heat(heat.id);
      if (h) h.Etat = heat.etat;
      for (const slot of heat.slots) {
        const code = slot.participant && slot.participant.rankTT > 0 ? slot.participant.codeBateau ?? slot.participant.id : null;
        const s = this.slot(heat.id, slot.prioDepart);
        if (!s) {
          this.upsertSlot(heat.id, slot.prioDepart, { Code_bateau: code }, this.now(), 'engine_progression');
        } else if (s.Code_bateau !== code) {
          Object.assign(s, { Code_bateau: code, Ordre_arrivee: null, Penalite: null, Statut_Special: null, Clt: 0, Last_Modified: this.now(), Modified_By: 'engine_progression' });
        }
      }
    }
  },

  force_validate_heat(p) {
    requireFields(p, ['heatId'], 'force_validate_heat');
    const h = this.heat(p.heatId);
    const now = this.now();
    const current = h?.Zones_Jugees ?? '0'.repeat(this.zoneCount());
    const final = current.replace(/0/g, '2');
    if (h) Object.assign(h, { Etat: HEAT.PRET_A_VALIDER, Zones_Jugees: final, Last_Modified: now, Modified_By: p.modifiedBy });
    return { success: true, newLastModified: now, zonesJugees: final };
  },

  reset_competition() {
    this.reset();
  },
};
