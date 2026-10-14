'use strict';

/**
 * Encodage des trames competFFCK, retro-ingenieré depuis ws_live/adv/adv.js.
 *
 * Une "sqlTable" serialisée est un objet { name, columns, rows } où chaque
 * colonne est un tuple positionnel lu par adv.table :
 *   [0] nom        (adv.table.prototype.GetColumnName)
 *   [1] libellé    (GetColumnLabel)
 *   [2] format     (GetColumnFormat)
 *   [5] type SQL   (GetColumnType -> parseInt(columns[c][5]))
 *   [9] alignement (GetColumnAlignment -> parseInt(columns[c][9]))
 * Les autres indices ne sont jamais lus par le client : on les remplit de 0.
 */

// adv.index_type (adv/adv.js:7)
const TYPE = {
  NULL: 0, CHAR: 1, VARCHAR: 2, TEXT: 3, SHORT: 4, LONG: 5, DOUBLE: 6,
  CHRONO: 7, CHRONO_INV: 8, RANKING: 9, DATE: 10, SMALLDATETIME: 11, DATETIME: 12,
};

// adv.chrono (adv/adv.js:3) — les chronos sont en millisecondes,
// toute valeur < OK est un statut et non une durée.
const CHRONO = { OK: 1, KO: -1, DNF: -500, DNS: -600, DES: -700, DSQ: -800, AUTO: -99 };

// adv.passage (adv/adv.js:4)
const PASSAGE = { START: 0, FINISH: -1, INTER1: 1, INTER2: 2 };

// adv.align_horz / align_vert (adv/adv.js:5-6)
const ALIGN = { LEFT: 0, CENTER: 0x0100, RIGHT: 0x0200 };

/**
 * Même forme que adv.table.prototype.AddColumn (adv/adv.js:526) :
 * [name, label, format, style, typeName, sqlType, storageSize, widthDefault, widthActive, alignment]
 */
function col(name, type = TYPE.TEXT, { label = name, format = '', align = ALIGN.LEFT } = {}) {
  return [name, label, format, -1, '', type, -1, -1, -1, align];
}

function table(name, columns, rows = []) {
  return { name, columns, rows };
}

/** Construit une ligne dans l'ordre des colonnes à partir d'un objet {colonne: valeur}. */
function row(columns, values) {
  return columns.map((c) => (values[c[0]] === undefined ? '' : values[c[0]]));
}

/** Clé de sérialisation attendue par adv.GetTable / adv.GetTableUnique. */
function tableKey(name) {
  return `${name}<sqlTable>`;
}

/** Table au premier niveau de la trame (adv.GetTableUnique). */
function withTable(frame, name, t) {
  return { ...frame, [tableKey(name)]: t };
}

/** Tables imbriquées sous `tables` (adv.GetTable). */
function withTables(frame, tables) {
  const bag = {};
  for (const [name, t] of Object.entries(tables)) bag[tableKey(name)] = t;
  return { ...frame, tables: bag };
}

/** ms depuis minuit -> chrono client. */
function msOfDay(date = new Date()) {
  return (
    date.getHours() * 3600000 +
    date.getMinutes() * 60000 +
    date.getSeconds() * 1000 +
    date.getMilliseconds()
  );
}

/** "10:00:00" -> ms depuis minuit */
function parseClock(hhmmss) {
  const [h = 0, m = 0, s = 0] = String(hhmmss).split(':').map(Number);
  return h * 3600000 + m * 60000 + s * 1000;
}

function formatClock(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}

module.exports = {
  TYPE, CHRONO, PASSAGE, ALIGN,
  col, table, row, tableKey, withTable, withTables,
  msOfDay, parseClock, formatClock,
};
