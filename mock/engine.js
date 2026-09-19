'use strict';

const { EventEmitter } = require('events');
const P = require('./protocol');

const { TYPE, CHRONO, ALIGN, col, table, row } = P;

const TICK_MS = 100;          // pas de simulation
const ON_COURSE_EVERY = 1;    // <on_course> à chaque tick (10 Hz, comme competFFCK)

/**
 * Moteur de compétition simulé.
 *
 * Il tient l'état complet d'une course (horloge, bateaux, temps, pénalités) et
 * produit les trames que competFFCK enverrait. Il n'y a ni MySQL ni .exe :
 * toute la donnée vient d'une fixture JSON.
 */
class Engine extends EventEmitter {
  constructor(fixture) {
    super();
    this.load(fixture);
  }

  load(fixture) {
    this.fixture = fixture;
    this.speed = fixture.speed || 1;
    this.running = false;
    this.tickCount = 0;
    this.reset();
  }

  reset() {
    const f = this.fixture;
    const firstStart = P.parseClock(f.first_start || '10:00:00');
    const interval = (f.start_interval_s || 60) * 1000;

    this.clock = firstStart - 30000; // on démarre 30 s avant le premier départ
    this.currentEpreuve = f.epreuves[0].code;

    // ordre de départ : par épreuve puis par dossard, comme une vraie liste de départ
    const ordered = [...f.boats].sort(
      (a, b) =>
        f.epreuves.findIndex((e) => e.code === a.epreuve) -
          f.epreuves.findIndex((e) => e.code === b.epreuve) || a.bib - b.bib
    );

    this.boats = ordered.map((b, i) => ({
      ...b,
      hour_start: b.hour_start !== undefined ? P.parseClock(b.hour_start) : firstStart + i * interval,
      state: 'waiting',              // waiting | running | finished
      status: null,                  // null | 'DNF' | 'DNS' | 'DSQ' | 'DES'
      chrono: null,                  // temps d'arrivée en ms
      inters: {},                    // { 1: ms, 2: ms }
      pena: {},                      // { numéro de porte: 2 | 50 }
    }));

    this.emitFrame(this.onCourseFrame());
  }

  // ---------------------------------------------------------------- horloge

  get codeCoursePhase() {
    return `${this.fixture.course.Code_course}_${this.fixture.phase.Code_phase}`;
  }

  get isSlalom() {
    return this.fixture.competition.Code_activite === 'SLA';
  }

  get nbInter() {
    return this.fixture.nb_inter || 0;
  }

  get nbPorte() {
    return this.fixture.nb_porte || 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  pause() {
    this.running = false;
    clearInterval(this.timer);
    this.timer = null;
  }

  setSpeed(speed) {
    this.speed = Math.max(0.1, Math.min(60, Number(speed) || 1));
  }

  /** Avance l'horloge et déclenche départs, inters et arrivées. */
  tick() {
    this.clock += TICK_MS * this.speed;
    this.tickCount++;

    for (const b of this.boats) {
      if (b.status === 'DNS') continue;

      if (b.state === 'waiting' && this.clock >= b.hour_start) {
        b.state = 'running';
        this.currentEpreuve = b.epreuve;
      }

      if (b.state !== 'running') continue;

      const elapsed = this.clock - b.hour_start;

      for (let n = 1; n <= this.nbInter; n++) {
        if (b.inters[n] === undefined && elapsed >= this.interTarget(b, n)) {
          b.inters[n] = Math.round(this.interTarget(b, n));
          this.emitFrame({
            key: '<bib_time>',
            bib: b.bib,
            passage: n,
            time_chrono: b.inters[n],
            device: 'mock',
          });
        }
      }

      if (elapsed >= b.ref_time_ms) {
        this.finish(b, Math.round(b.ref_time_ms));
      }
    }

    if (this.tickCount % ON_COURSE_EVERY === 0) this.emitFrame(this.onCourseFrame());
  }

  interTarget(b, n) {
    // inters répartis régulièrement sur le parcours, avec la même dérive que le temps final
    return (b.ref_time_ms * n) / (this.nbInter + 1);
  }

  // ---------------------------------------------------------------- actions

  boat(bib) {
    return this.boats.find((b) => b.bib === Number(bib));
  }

  finish(b, chronoMs) {
    b.state = 'finished';
    b.chrono = chronoMs;

    const frame = {
      key: '<bib_time>',
      bib: b.bib,
      passage: 0,
      time_chrono: chronoMs,
      device: 'mock',
    };

    // écart avec le meilleur temps de la catégorie, affiché en vert/rouge par live.js
    const best = this.boats
      .filter((o) => o !== b && o.epreuve === b.epreuve && o.state === 'finished' && o.chrono > 0)
      .reduce((min, o) => Math.min(min, this.totalTime(o)), Infinity);
    if (best !== Infinity) frame.diff_categ = this.totalTime(b) - best;

    this.emitFrame(frame);
  }

  /** Temps classant : chrono + pénalités (slalom) ou chrono seul (descente). */
  totalTime(b) {
    if (b.status) return CHRONO[b.status];
    if (b.chrono === null) return CHRONO.KO;
    return this.isSlalom ? b.chrono + this.sumPena(b) * 1000 : b.chrono;
  }

  sumPena(b) {
    return Object.values(b.pena).reduce((s, v) => s + Number(v), 0);
  }

  forceStart(bib) {
    const b = this.boat(bib);
    if (!b) return;
    b.hour_start = this.clock;
    b.state = 'running';
    b.status = null;
    b.chrono = null;
    b.inters = {};
    this.currentEpreuve = b.epreuve;
  }

  forceFinish(bib) {
    const b = this.boat(bib);
    if (!b || b.state !== 'running') return;
    this.finish(b, Math.round(this.clock - b.hour_start));
  }

  /**
   * L'opérateur supprime un départ erroné : le bateau quitte le flux
   * `<on_course>` sans `<bib_time>` ni `<run_erase>`. C'est le seul chemin qui
   * fait passer live.js par sa branche « remise en état des anciens on_course ».
   */
  removeFromCourse(bib) {
    const b = this.boat(bib);
    if (!b) return;
    b.state = 'waiting';
    b.chrono = null;
    b.inters = {};
  }

  setStatus(bib, status) {
    const b = this.boat(bib);
    if (!b) return;
    b.status = status;
    b.state = 'finished';
    b.chrono = CHRONO[status] !== undefined ? CHRONO[status] : CHRONO.KO;
    this.emitFrame({ key: '<bib_time>', bib: b.bib, passage: 0, time_chrono: b.chrono, device: 'mock' });
  }

  addPenalty(bib, porte, value) {
    const b = this.boat(bib);
    if (!b) return;
    const p = Number(porte);
    const v = Number(value);
    if (v === 0) delete b.pena[p];
    else b.pena[p] = v;

    // Noms de champs imposes par le client : live.js:307-309 lit bib / gate /
    // penalty. `penalty` est une chaine ('0', '2' ou '50'), comparee telle
    // quelle par SetOnCoursePenalty.
    this.emitFrame({
      key: '<penalty_add>',
      bib: b.bib,
      gate: p,
      penalty: String(v),
      Total_pena: this.sumPena(b),
      Code_competition: this.fixture.competition.Code_competition,
      Code_course: this.fixture.course.Code_course,
      Code_phase: this.fixture.phase.Code_phase,
    });
  }

  /** Efface la manche en cours — le cas qui casse le plus souvent les affichages. */
  eraseRun() {
    for (const b of this.boats) {
      b.state = 'waiting';
      b.status = null;
      b.chrono = null;
      b.inters = {};
      b.pena = {};
    }
    this.emitFrame({
      key: '<run_erase>',
      Code_competition: this.fixture.competition.Code_competition,
      Code_course: this.fixture.course.Code_course,
      Code_phase: this.fixture.phase.Code_phase,
    });
  }

  setModeChrono(mode) {
    this.emitFrame({ key: '<mode_chrono>', mode });
  }

  emitFrame(frame) {
    this.emit('frame', frame);
  }

  // ----------------------------------------------------------------- trames

  /** Réponse à `<competition_load>` : la liste des compétitions disponibles. */
  competitionLoadFrame() {
    const f = this.fixture;
    const columns = [
      col('key', TYPE.VARCHAR, { label: 'Codex' }),
      col('Code_activite', TYPE.CHAR),
      col('Nom', TYPE.TEXT),
      col('Date_debut', TYPE.DATE),
      col('Libelle_course', TYPE.TEXT),
      col('Libelle_phase', TYPE.TEXT),
      col('active', TYPE.SHORT),
    ];
    const rows = [
      row(columns, {
        key: this.keyRace(),
        Code_activite: f.competition.Code_activite,
        Nom: f.competition.Nom,
        Date_debut: f.competition.Date_debut,
        Libelle_course: f.course.Libelle,
        Libelle_phase: f.phase.Libelle,
        active: 1,
      }),
    ];
    return P.withTable({ key: '<competition_load>' }, 'competitions', table('competitions', columns, rows));
  }

  keyRace() {
    const f = this.fixture;
    return `${f.competition.Code_competition}_${f.course.Code_course}_${f.phase.Code_phase}`;
  }

  /** Réponse à `<race_load>` : compétition, course, phase et liste des épreuves. */
  raceLoadFrame() {
    const f = this.fixture;

    const cCompetition = [
      col('Code_competition', TYPE.LONG),
      col('Nom', TYPE.TEXT),
      col('Code_activite', TYPE.CHAR),
      col('Code_niveau', TYPE.CHAR),
      col('Date_debut', TYPE.DATE),
      col('Lieu', TYPE.TEXT),
    ];
    const cCourse = [col('Code_course', TYPE.SHORT), col('Libelle', TYPE.TEXT)];
    const cPhase = [col('Code_phase', TYPE.SHORT), col('Libelle', TYPE.TEXT)];
    const cEpreuve = [
      col('Libelle_court', TYPE.VARCHAR),
      col('Libelle', TYPE.TEXT),
      col('Nombre', TYPE.SHORT),
      col('Etat_programme_epreuve', TYPE.CHAR),
    ];

    const epreuveRows = f.epreuves.map((e) =>
      row(cEpreuve, {
        Libelle_court: e.code,
        Libelle: e.libelle,
        Nombre: this.boats.filter((b) => b.epreuve === e.code).length,
        Etat_programme_epreuve: e.etat || '1',
      })
    );

    return P.withTables(
      {
        key: '<race_load>',
        Code_competition: f.competition.Code_competition,
        Code_course: f.course.Code_course,
        Code_phase: f.phase.Code_phase,
        Nb_inter: this.nbInter,
        clock: Math.round(this.clock),
      },
      {
        Competition: table('Competition', cCompetition, [row(cCompetition, f.competition)]),
        Competition_Course: table('Competition_Course', cCourse, [row(cCourse, f.course)]),
        Competition_Course_Phase: table('Competition_Course_Phase', cPhase, [row(cPhase, f.phase)]),
        Competition_Course_Phase_Manche_Epreuve: table(
          'Competition_Course_Phase_Manche_Epreuve',
          cEpreuve,
          epreuveRows
        ),
      }
    );
  }

  /**
   * Réponse à `<epreuve_load>` : le classement.
   *
   * En slalom competFFCK envoie des colonnes génériques `@...` que
   * canoe.SetColumnNameRanking renomme côté client ; en descente les noms
   * finaux sont envoyés directement (canoe.js:225-270, pas de branche else).
   */
  epreuveLoadFrame(epreuve) {
    const cp = this.codeCoursePhase;
    const sla = this.isSlalom;
    const name = (generic, final) => (sla ? generic : final);

    const columns = [
      col('Dossard', TYPE.SHORT, { label: 'Dos.', align: ALIGN.RIGHT }),
      col('Bateau', TYPE.TEXT, { label: 'Identité' }),
      col('Club', TYPE.TEXT),
      col('Code_nation', TYPE.CHAR),
      col('Code_categorie', TYPE.VARCHAR),
      col(name(`@START_RK_${cp}_1`, `Rang${cp}`), TYPE.SHORT),
      col(name(`@START_TIME_${cp}_1`, `Heure_depart${cp}`), TYPE.CHRONO, { format: 'HHMMSS' }),
      col(name(`@CHRONO_${cp}_1`, `Tps_chrono${cp}`), TYPE.CHRONO),
      col(name(`@TIME_${cp}_1`, `Tps${cp}`), TYPE.CHRONO),
      col(name(`@RK_${cp}_1`, `Cltc${cp}`), TYPE.RANKING),
      col(`Clt${cp}`, TYPE.RANKING),
    ];

    if (sla) {
      for (let p = 1; p <= this.nbPorte; p++) columns.push(col(`@PENA_${p}_1`, TYPE.SHORT));
      columns.push(col(`@SUMPENA_${cp}_1`, TYPE.SHORT));
    }

    // Colonnes d'inters. Le client y écrit via SetCell/SetRanking, qui sont des
    // no-op si la colonne n'existe pas : il faut donc toutes les déclarer.
    for (let n = 1; n <= this.nbInter; n++) {
      columns.push(col(name(`@INTER${n}_${cp}_1`, `Tps${cp}_inter${n}`), TYPE.CHRONO));
      columns.push(col(name(`@CHRONO_INTER${n}_${cp}_1`, `Tps_chrono${cp}_inter${n}`), TYPE.CHRONO));
      columns.push(col(name(`@RK_INTER${n}_${cp}_1`, `Cltc${cp}_inter${n}`), TYPE.RANKING));
      columns.push(col(name(`@RK_CHRONO_INTER${n}_${cp}_1`, `Cltc_chrono${cp}_inter${n}`), TYPE.RANKING));
      columns.push(col(name(`@DIFF_INTER${n}_${cp}_1`, `Diffc${cp}_inter${n}`), TYPE.CHRONO));
      columns.push(col(name(`@DIFF_CHRONO_INTER${n}_${cp}_1`, `Diffc_chrono${cp}_inter${n}`), TYPE.CHRONO));
      columns.push(col(`Clt${cp}_inter${n}`, TYPE.RANKING));
      columns.push(col(`Clt_chrono${cp}_inter${n}`, TYPE.RANKING));
    }

    const selected = epreuve
      ? this.boats.filter((b) => b.epreuve === epreuve)
      : this.boats;

    const rows = selected.map((b) => {
      const values = {
        Dossard: b.bib,
        Bateau: b.nom,
        Club: b.club || '',
        Code_nation: b.nation || 'FRA',
        Code_categorie: b.epreuve,
        [name(`@START_TIME_${cp}_1`, `Heure_depart${cp}`)]: Math.round(b.hour_start),
        [name(`@CHRONO_${cp}_1`, `Tps_chrono${cp}`)]: b.chrono === null ? '' : b.chrono,
        [name(`@TIME_${cp}_1`, `Tps${cp}`)]: b.chrono === null ? '' : this.totalTime(b),
      };

      if (sla) {
        for (let p = 1; p <= this.nbPorte; p++) {
          values[`@PENA_${p}_1`] = b.pena[p] !== undefined ? String(b.pena[p]) : '';
        }
        values[`@SUMPENA_${cp}_1`] = this.sumPena(b);
      }

      for (let n = 1; n <= this.nbInter; n++) {
        const t = b.inters[n];
        values[name(`@INTER${n}_${cp}_1`, `Tps${cp}_inter${n}`)] = t === undefined ? '' : t;
        values[name(`@CHRONO_INTER${n}_${cp}_1`, `Tps_chrono${cp}_inter${n}`)] = t === undefined ? '' : t;
      }

      return row(columns, values);
    });

    // classements (Cltc = par catégorie) — competFFCK les envoie déjà calculés
    this.applyRanking(columns, rows, name(`@TIME_${cp}_1`, `Tps${cp}`), name(`@RK_${cp}_1`, `Cltc${cp}`), true);
    this.applyRanking(columns, rows, name(`@TIME_${cp}_1`, `Tps${cp}`), `Clt${cp}`, false);

    return P.withTable(
      {
        key: '<epreuve_load>',
        epreuve: epreuve || this.currentEpreuve,
        clock: Math.round(this.clock),
        Nb_porte: this.nbPorte,
        Nb_inter: this.nbInter,
      },
      'ranking',
      table('ranking', columns, rows)
    );
  }

  applyRanking(columns, rows, timeColName, rankColName, byCategory) {
    const idx = (n) => columns.findIndex((c) => c[0] === n);
    const cTime = idx(timeColName);
    const cRank = idx(rankColName);
    const cCateg = idx('Code_categorie');
    if (cTime < 0 || cRank < 0) return;

    const groups = new Map();
    rows.forEach((r) => {
      const k = byCategory ? r[cCateg] : '*';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    });

    for (const group of groups.values()) {
      group
        .filter((r) => Number(r[cTime]) >= CHRONO.OK)
        .sort((a, b) => Number(a[cTime]) - Number(b[cTime]))
        .forEach((r, i) => {
          r[cRank] = i + 1;
        });
    }
  }

  /** Flux temps réel : horloge serveur + bateaux en course avec temps tournant. */
  onCourseFrame() {
    const columns = [col('bib', TYPE.SHORT), col('time', TYPE.CHRONO)];
    const rows = this.boats
      .filter((b) => b.state === 'running')
      .map((b) => row(columns, { bib: b.bib, time: Math.round(this.clock - b.hour_start) }));

    return P.withTable(
      {
        key: '<on_course>',
        clock: Math.round(this.clock),
        epreuve: this.currentEpreuve,
      },
      'table',
      table('table', columns, rows)
    );
  }

  /** Vue lisible pour le panneau de contrôle. */
  snapshot() {
    return {
      clock: P.formatClock(this.clock),
      clockMs: Math.round(this.clock),
      running: this.running,
      speed: this.speed,
      epreuve: this.currentEpreuve,
      fixture: this.fixture.id,
      activite: this.fixture.competition.Code_activite,
      nbPorte: this.nbPorte,
      nbInter: this.nbInter,
      boats: this.boats.map((b) => ({
        bib: b.bib,
        nom: b.nom,
        epreuve: b.epreuve,
        state: b.state,
        status: b.status,
        hour_start: P.formatClock(b.hour_start),
        elapsed: b.state === 'running' ? Math.round(this.clock - b.hour_start) : null,
        chrono: b.chrono,
        total: b.state === 'finished' ? this.totalTime(b) : null,
        pena: this.sumPena(b),
        inters: b.inters,
      })),
    };
  }
}

module.exports = { Engine, TICK_MS };
