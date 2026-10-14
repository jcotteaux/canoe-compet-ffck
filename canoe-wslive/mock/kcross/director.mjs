// Directeur de course : il tient les postes d'une vraie compétition de kayak
// cross et les fait agir sur la base, par les mêmes actions api_save_state que
// les tablettes :
//
//   départ       launch_heat              (série -> EN COURS, pénalités à zéro, DNS)
//   juges        validate_zone_penalties  (une zone après l'autre, au passage des bateaux)
//   arrivée      update_place puis record_arrivals (série -> À VALIDER)
//   gestionnaire validation par le moteur réel (série -> OFFICIELLE, qualifiés placés)
//
// Le temps est simulé : `speed` accélère tout, de l'appel en pré-départ à
// l'écart entre deux séries. Mis en pause, il laisse la main aux vraies pages
// (depart.html, arrivee.html, penalite.html, admin.html) sur la même base.

import { EventEmitter } from 'node:events';
import { HEAT } from './db.mjs';
import { rng } from './fixtures.mjs';
import * as kx from './kx-engine.mjs';
import { Regie } from './regie.mjs';

const TICK_MS = 100;

const DEFAULT_SIM = {
  call_s: 25,         // série affichée « prête » avant le départ
  bracket_s: 12,      // dont tableau des phases finales à l'antenne, avant la rampe
  race_s: 52,         // durée de course du meilleur bateau
  race_spread_s: 6,   // écart maximal entre premier et dernier
  validate_s: 12,     // délai avant validation par le gestionnaire
  gap_s: 20,          // pause entre la validation et l'appel suivant
  p_dns: 0.02,
  p_dnf: 0.03,
  p_dsq: 0.01,
  p_start: 0.02,      // faute au départ (rampe)
  p_gate: 0.04,       // faute par porte
  p_roll: 0.08,       // esquimautage manqué
  p_ral: 0.015,       // RAL, plus lourd qu'une FLT au classement
};

export const PHASES = Object.freeze({
  IDLE: 'idle',             // rien à courir pour l'instant
  WAITING: 'waiting',       // série suivante encore incomplète (séries sources non validées)
  CALL: 'call',             // appel : série prête, bateaux en pré-départ
  RACE: 'race',             // en course
  VALIDATION: 'validation', // arrivée saisie, attente du gestionnaire
  GAP: 'gap',               // série officielle, pause avant la suivante
  DONE: 'done',             // compétition terminée
});

export class Director extends EventEmitter {
  constructor(db, fixture, { speed, autoValidate = true, running = true } = {}) {
    super();
    this.db = db;
    this.fixture = fixture;
    this.sim = { ...DEFAULT_SIM, ...(fixture.sim || {}) };
    this.speed = speed ?? fixture.speed ?? 4;
    this.autoValidate = autoValidate;
    this.running = running;
    this.log = [];
    this.regie = new Regie(db);
    this.reset();
    this.timer = setInterval(() => this.tick(TICK_MS), TICK_MS);
  }

  close() {
    clearInterval(this.timer);
  }

  reset() {
    this.phase = PHASES.IDLE;
    this.heatId = null;
    this.t = 0;          // temps simulé écoulé dans la série, en ms
    this.events = [];    // [{ at, label, run }]
    this.boats = new Map();
    this.busy = false;
  }

  // ------------------------------------------------------------ journal

  note(msg) {
    const entry = { at: Date.now(), msg };
    this.log.unshift(entry);
    this.log.length = Math.min(this.log.length, 80);
    console.log(`[kx] ${msg}`);
    this.emit('log', entry);
  }

  // ------------------------------------------------------------ outils

  post(action, payload, modifiedBy) {
    const r = this.db.api_save_state({}, { action, competitionCode: this.db.code, modifiedBy, ...payload });
    if (!r.body.success) this.note(`⚠ ${action} refusé : ${r.body.message}`);
    return r.body;
  }

  label(heat) {
    const cat = this.db.category(heat.Code_Categorie);
    return `#${heat.Num_Serie_Global} ${cat.Nom_Categorie} ${heat.Nom_Tour} ${heat.Nom_Serie}`;
  }

  zones() {
    const s = this.db.settings;
    return kx.penaltyZones(s.Nombre_portes, s.Roll_Zone, s.Detail_portes);
  }

  penaltyLength() {
    return this.db.zoneCount();
  }

  realHeats() {
    return this.db.orderedHeats().filter((h) => this.db.category(h.Code_Categorie)?.Nom_Categorie !== '_TEST_RESEAU_');
  }

  /** Prochaine série au programme : la première qui n'a pas encore couru. */
  nextHeat() {
    return this.realHeats().find((h) => h.Etat === HEAT.EN_ATTENTE || h.Etat === HEAT.PRET) || null;
  }

  // ------------------------------------------------------------ horloge

  tick(realMs) {
    if (!this.running || this.busy || !this.db.settings) return;
    this.t += realMs * this.speed;
    this.advance().catch((e) => this.note(`⚠ ${e.stack || e.message}`));
  }

  /** Fait avancer d'un pas : exécute les événements échus, change de phase. */
  async advance() {
    this.busy = true;
    try {
      while (this.events.length && this.events[0].at <= this.t) {
        const ev = this.events.shift();
        await ev.run();
      }
      await this.transition();
    } finally {
      this.busy = false;
    }
  }

  schedule(at, label, run) {
    this.events.push({ at, label, run });
    this.events.sort((a, b) => a.at - b.at);
  }

  /** Passe immédiatement au prochain événement (bouton « Étape suivante »). */
  async step() {
    if (this.busy) return;
    if (this.events.length) this.t = Math.max(this.t, this.events[0].at);
    else this.t = Number.MAX_SAFE_INTEGER / 2;
    await this.advance();
    if (!this.events.length && this.phase !== PHASES.DONE) this.t = 0;
  }

  /** Pousse l'incrustation OBS pour une série, si la régie automatique est active. */
  overlay(mode, heatId = this.heatId) {
    const h = heatId ? this.db.heat(heatId) : null;
    if (!h) return;
    if (mode === 'BRACKET') this.regie.bracket(this.db.heatJson(h, true));
    else this.regie.push(mode, this.db.heatJson(h, true));
  }

  /** La catégorie de cette série se joue-t-elle en tableau (élimination directe) ? */
  inBracket(heatId) {
    const h = this.db.heat(heatId);
    const cat = h && this.db.category(h.Code_Categorie);
    return !!cat && kx.hasBracket(this.db.settings.Format, cat.Nom_Variante);
  }

  get current() {
    return this.heatId ? this.db.heat(this.heatId) : null;
  }

  async transition() {
    const heat = this.current;

    switch (this.phase) {
      case PHASES.IDLE:
      case PHASES.WAITING: {
        // Séries laissées en chemin par les pages réelles pendant une pause :
        // on les reprend là où elles en sont plutôt que de les abandonner.
        const onWater = this.realHeats().find((h) => h.Etat === HEAT.INCOMPLET);
        if (onWater) {
          this.reset();
          this.heatId = onWater.Code_Serie;
          this.note(`Reprise de ${this.label(onWater)}, déjà en course.`);
          return this.launch();
        }
        const toValidate = this.autoValidate && this.realHeats().find((h) => h.Etat === HEAT.PRET_A_VALIDER);
        if (toValidate) {
          this.reset();
          this.heatId = toValidate.Code_Serie;
          return this.toValidation();
        }
        const next = this.nextHeat();
        if (!next) {
          const pending = this.realHeats().some((h) => h.Etat !== HEAT.OFFICIEL);
          if (!pending) {
            if (this.phase !== PHASES.DONE) this.note('Compétition terminée : toutes les séries sont officielles.');
            this.phase = PHASES.DONE;
          }
          return;
        }
        if (next.Etat !== HEAT.PRET) {
          if (this.phase !== PHASES.WAITING || this.heatId !== next.Code_Serie) {
            this.note(`${this.label(next)} attend la validation de ses séries sources.`);
          }
          this.phase = PHASES.WAITING;
          this.heatId = next.Code_Serie;
          return;
        }
        this.startCall(next);
        return;
      }

      case PHASES.CALL:
      case PHASES.RACE:
        // Une page réelle a pu prendre la main sur la série (arrivée, gestionnaire).
        if (!heat) return this.toIdle();
        if (heat.Etat >= HEAT.OFFICIEL) return this.toGap();
        if (this.phase === PHASES.RACE && heat.Etat === HEAT.PRET_A_VALIDER) return this.toValidation();
        return;

      case PHASES.VALIDATION:
        if (!heat) return this.toIdle();
        if (heat.Etat === HEAT.OFFICIEL) {
          // Validée depuis admin.html : les résultats passent quand même à l'antenne.
          this.overlay('RESULTS');
          return this.toGap();
        }
        if (this.autoValidate && this.t >= this.validateAt) {
          const res = await this.validate(heat.Code_Serie);
          if (!res.success) this.validateAt = this.t + 10000; // nouvel essai plus tard, sans inonder le journal
        }
        return;

      case PHASES.GAP:
        if (!this.events.length) this.toIdle();
        return;

      default:
        return;
    }
  }

  toIdle() {
    this.reset();
  }

  toGap() {
    const heat = this.current;
    this.phase = PHASES.GAP;
    this.events = [];
    this.t = 0;
    // Finale jouée : après ses résultats, le tableau complet et son vainqueur.
    if (heat && this.inBracket(heat.Code_Serie)) {
      const cat = this.db.category(heat.Code_Categorie);
      if (kx.isLastPhase(this.db.settings.Format, cat.Nom_Variante, heat.Nom_Tour)) {
        const id = heat.Code_Serie;
        this.schedule(this.sim.gap_s * 500, 'tableau final à l\'antenne', () => {
          const h = this.db.heat(id);
          if (h) this.regie.bracket(this.db.heatJson(h, true), false);
        });
      }
    }
    this.schedule(this.sim.gap_s * 1000, 'appel de la série suivante', () => {});
  }

  // ------------------------------------------------------------ une série

  startCall(heat) {
    this.reset();
    this.phase = PHASES.CALL;
    this.heatId = heat.Code_Serie;
    this.note(`Appel ${this.label(heat)} (${heat.H_depart?.slice(0, 5) ?? '--:--'})`);
    // Avant la rampe, le tableau : le public voit où se situe la course qui vient.
    // Jusqu'à ×10, chaque écran reste assez longtemps pour être lu (8 s de
    // tableau, 5 s de rampe en temps réel) ; au-delà on teste, tout accélère.
    const readable = (realS) => (this.speed <= 10 ? realS * 1000 * this.speed : 0);
    let launchAt = this.sim.call_s * 1000;
    // Le tableau montre la branche de la série qui part : il passe avant chaque départ.
    if (this.regie.auto && this.sim.bracket_s > 0 && this.inBracket(heat.Code_Serie)) {
      const bracketMs = Math.max(this.sim.bracket_s * 1000, readable(8));
      this.overlay('BRACKET');
      this.schedule(bracketMs, 'rampe de départ à l\'antenne', () => this.overlay('START_RAMP'));
      launchAt = Math.max(launchAt, bracketMs + readable(5));
    } else {
      this.overlay('START_RAMP');
    }
    this.schedule(launchAt, 'départ', () => this.launch());
  }

  plan(heat) {
    const rand = rng(heat.Code_Serie * 7919 + (this.fixture.seed ?? 1));
    const sim = this.sim;
    const raceStart = this.t;
    const slots = this.db.heatSlots(heat.Code_Serie).filter((s) => s.Code_bateau);
    const boats = new Map();
    for (const s of slots) {
      // Plus le bateau était rapide au time trial, plus il a de chances d'arriver devant.
      const b = this.db.boat(s.Code_bateau);
      const tt = typeof b?.Tps_chrono === 'number' && b.Tps_chrono > 0 ? b.Tps_chrono : 90000;
      const time = sim.race_s * 1000 * (tt / 60000) * 0.85 + rand() * sim.race_spread_s * 1000;
      // Une série reprise en cours garde ce que les postes ont déjà saisi.
      const out = s.Statut_Special || (heat.Etat === HEAT.PRET && rand() < sim.p_dns ? 'DNS' : null);
      const place = s.Ordre_arrivee ? Number(s.Ordre_arrivee) : null;
      boats.set(s.Slot_Index, {
        slot: s.Slot_Index,
        bib: b?.Dossard ?? '?',
        finishAt: raceStart + time,
        status: out,
        dnfAt: !out && !place && rand() < sim.p_dnf ? raceStart + time * (0.3 + rand() * 0.5) : null,
        dsq: !out && rand() < sim.p_dsq,
        place,
        pena: {},
      });
    }

    // Pénalités tirées d'avance, zone par zone ; la valeur est posée quand la
    // zone est jugée. Un bateau sorti avant une zone n'y est pas pénalisé.
    const zones = this.zones();
    zones.forEach((z, i) => {
      for (const boat of boats.values()) {
        if (boat.status === 'DNS') continue;
        const p = z.type === 'START' ? sim.p_start : z.type === 'ROLL' ? sim.p_roll : sim.p_gate;
        if (z.type === 'ROLL' && rand() < sim.p_ral) boat.pena[i] = '5';
        else if (rand() < p) boat.pena[i] = '2';
      }
    });
    return boats;
  }

  launch() {
    const heat = this.current;
    if (!heat) return;
    // Déjà partie : le poste départ réel a donné le départ pendant une pause.
    const adopted = heat.Etat === HEAT.INCOMPLET;
    if (!adopted && heat.Etat !== HEAT.PRET) {
      this.note(`${this.label(heat)} n'est plus prête (état ${heat.Etat}) : départ annulé.`);
      return this.toIdle();
    }
    this.t = 0;
    this.events = [];
    this.boats = this.plan(heat);
    if (!adopted) {
      const zero = '0'.repeat(this.penaltyLength());
      const dns = [...this.boats.values()].filter((b) => b.status === 'DNS');
      this.post('launch_heat', {
        heatId: heat.Code_Serie,
        newState: HEAT.INCOMPLET,
        dnsSlots: dns.map((b) => ({ slotIndex: b.slot, newStatus: 'DNS' })),
        penaltyInit: [...this.boats.keys()].map((slotIndex) => ({ slotIndex, value: zero })),
      }, 'depart');
      this.note(`Départ ${this.label(heat)}${dns.length ? ` — DNS : ${dns.map((b) => b.bib).join(', ')}` : ''}`);
    }
    this.phase = PHASES.RACE;
    this.overlay('LIVE_RUN');

    const boats = [...this.boats.values()];
    const racing = boats.filter((b) => !b.status && !b.place);
    const lastFinish = Math.max(0, ...racing.map((b) => b.finishAt));
    const firstFinish = Math.min(lastFinish, ...racing.map((b) => b.finishAt));

    for (const b of racing) {
      if (b.dnfAt !== null) this.schedule(b.dnfAt, `DNF ${b.bib}`, () => this.dnf(b.slot));
      else this.schedule(b.finishAt, `arrivée ${b.bib}`, () => this.arrive(b.slot));
    }

    // Chaque juge valide sa zone quand le dernier bateau l'a passée : la zone i
    // est atteinte vers i/n de la course.
    const zones = this.zones();
    zones.forEach((z, i) => {
      const at = Math.min(lastFinish, (firstFinish * (i + 1)) / zones.length) + 1500 + (i % 3) * 400;
      this.schedule(at, `juge ${z.nomAffichage}`, () => this.judge(i));
    });

    this.schedule(lastFinish + 2500, 'saisie de l\'arrivée', () => this.recordArrivals());
  }

  boatsBySlot() {
    return [...this.boats.values()];
  }

  dnf(slot) {
    const b = this.boats.get(slot);
    if (!b || b.status || b.place) return;
    b.status = 'DNF';
    this.post('update_status', { code_Serie: this.heatId, slot_Index: slot, newStatus: 'DNF' }, 'arrivee');
    this.note(`DNF dossard ${b.bib}`);
    this.overlay('LIVE_RUN');
  }

  arrive(slot) {
    const b = this.boats.get(slot);
    if (!b || b.status || b.place) return;
    b.place = 1 + this.boatsBySlot().filter((x) => x.place).length;
    this.post('update_place', { code_Serie: this.heatId, slot_Index: slot, newValue: b.place }, 'arrivee');
    this.overlay('LIVE_RUN');
  }

  judge(zoneIndex) {
    const heat = this.current;
    if (!heat || heat.Zones_Jugees?.[zoneIndex] !== '0') return;
    const penalties = this.boatsBySlot().map((b) => ({
      slotIndex: b.slot,
      newValue: b.status === 'DNS' ? '0' : b.pena[zoneIndex] || '0',
    }));
    this.post('validate_zone_penalties', { heatId: heat.Code_Serie, zoneIndex, penalties }, `penalite_zone${zoneIndex}`);
    const faults = penalties.filter((p) => p.newValue !== '0');
    if (faults.length) {
      const zone = this.zones()[zoneIndex];
      const txt = faults.map((f) => `${this.boats.get(f.slotIndex).bib} ${f.newValue === '5' ? 'RAL' : 'FLT'}`).join(', ');
      this.note(`Juge ${zone.nomAffichage} : ${txt}`);
      if (this.phase === PHASES.RACE) this.overlay('LIVE_RUN');
    }
  }

  recordArrivals() {
    const heat = this.current;
    if (!heat || heat.Etat !== HEAT.INCOMPLET) return; // transition() prend le relais
    // Zones restées sans juge (bateaux tous sortis avant) : validées vides.
    [...(heat.Zones_Jugees || '')].forEach((z, i) => z === '0' && this.judge(i));

    // DSQ prononcé par le juge à l'arrivée, avant la saisie définitive.
    for (const b of this.boatsBySlot()) {
      if (b.dsq && !b.status) {
        b.status = 'DSQ';
        this.post('update_status', { code_Serie: heat.Code_Serie, slot_Index: b.slot, newStatus: 'DSQ' }, 'arrivee');
        this.note(`DSQ dossard ${b.bib}`);
      }
    }
    const arrivals = this.boatsBySlot().map((b) => ({
      slotIndex: b.slot,
      newRank: b.status ? null : b.place,
      newStatus: b.status,
    }));
    this.post('record_arrivals', { heatId: heat.Code_Serie, newState: HEAT.PRET_A_VALIDER, arrivals }, 'arrivee');
    const order = this.boatsBySlot()
      .filter((b) => b.place && !b.status)
      .sort((a, b) => a.place - b.place)
      .map((b) => b.bib);
    this.note(`Arrivée ${this.label(heat)} : ${order.join(' › ') || '—'}`);
    this.toValidation();
  }

  toValidation() {
    this.phase = PHASES.VALIDATION;
    this.events = [];
    this.t = 0;
    this.validateAt = this.sim.validate_s * 1000;
    if (this.autoValidate) this.schedule(this.validateAt, 'validation', () => {});
  }

  /** Validation par le gestionnaire. Accepte n'importe quelle série « à valider ». */
  async validate(heatId) {
    const heat = this.db.heat(heatId);
    if (!heat) return { success: false, errorCode: 'HEAT_NOT_FOUND' };
    const res = await kx.validateHeat(this.db.fullCompetitionState(), this.db.resultatsData(), heat.Code_Serie, async (payload) => {
      const body = this.post('save_progression', payload, 'gestionnaire');
      if (!body.success) throw new Error(body.message);
      return body;
    });
    if (res.success) {
      const ranks = this.db
        .heatSlots(heatId)
        .filter((s) => s.Code_bateau)
        .sort((a, b) => (a.Clt || 99) - (b.Clt || 99))
        .map((s) => `${s.Clt || s.Statut_Special || '-'}. ${this.db.boat(s.Code_bateau)?.Dossard}`);
      this.note(`Officielle ${this.label(heat)} : ${ranks.join('  ')}`);
      this.overlay('RESULTS', heatId);
    } else {
      this.note(`⚠ validation ${this.label(heat)} refusée : ${res.errorCode}`);
    }
    return res;
  }

  // ------------------------------------------------------------ incidents

  /** Incident déclenché depuis le panneau sur un bateau de la série en course. */
  incident(slot, kind) {
    const b = this.boats.get(Number(slot));
    if (this.phase !== PHASES.RACE || !b) return { ok: false, message: 'aucun bateau en course sur ce couloir' };
    if (kind === 'DNF') {
      this.dnf(b.slot);
      this.events = this.events.filter((e) => e.label !== `arrivée ${b.bib}`);
    } else if (kind === 'DSQ') {
      b.dsq = true;
    } else if (kind === 'FLT' || kind === 'RAL') {
      // Faute sur la prochaine zone pas encore jugée.
      const zj = this.current?.Zones_Jugees || '';
      const next = [...zj].findIndex((z) => z === '0');
      if (next === -1) return { ok: false, message: 'toutes les zones sont déjà jugées' };
      b.pena[next] = kind === 'RAL' ? '5' : '2';
      this.note(`${kind} demandée pour ${b.bib} en zone ${this.zones()[next].nomAffichage}`);
    }
    return { ok: true };
  }

  state() {
    const heat = this.current;
    return {
      running: this.running,
      regie: { auto: this.regie.auto, style: this.regie.style },
      speed: this.speed,
      autoValidate: this.autoValidate,
      phase: this.phase,
      heatId: this.heatId,
      heatLabel: heat ? this.label(heat) : null,
      elapsed: Math.round(this.t),
      next: this.events[0] ? { label: this.events[0].label, in: Math.max(0, Math.round((this.events[0].at - this.t) / this.speed)) } : null,
      boats: this.boatsBySlot().map((b) => ({ slot: b.slot, bib: b.bib, status: b.status, place: b.place, dsq: b.dsq })),
      log: this.log.slice(0, 40),
    };
  }
}
