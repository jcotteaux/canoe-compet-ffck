'use strict';

/**
 * Encodage du protocole UDP des mélangeurs ATEM.
 *
 * Blackmagic ne le documente pas. Ce qui suit est repris de l'implémentation
 * de référence `atem-connection` (nrkno/sofie-atem-connection), seule source
 * stable : les offsets et les valeurs d'énumération viennent de son source,
 * pas d'une capture. Chaque constante porte le fichier dont elle est tirée.
 *
 * Un paquet = 12 octets d'en-tête + une suite de commandes.
 * Une commande = 8 octets d'en-tête (longueur, nom sur 4 caractères) + données.
 */

// src/lib/atemSocketChild.ts — les drapeaux occupent les 5 bits hauts du mot 0.
const FLAG = {
  ACK_REQUEST: 0x01,
  HELLO: 0x02,
  RETRANSMIT: 0x04,
  RETRANSMIT_REQUEST: 0x08,
  ACK: 0x10,
};

// La longueur tient sur 11 bits : un paquet ne peut pas dépasser 2047 octets.
const MAX_PACKET = 0x07ff;

function buildPacket({ flags, sessionId, ackId = 0, retransmitId = 0, packetId = 0, payload = Buffer.alloc(0) }) {
  const buf = Buffer.alloc(12 + payload.length);
  if (buf.length > MAX_PACKET) throw new Error(`paquet de ${buf.length} octets, maximum ${MAX_PACKET}`);
  buf.writeUInt16BE((flags << 11) | buf.length, 0);
  buf.writeUInt16BE(sessionId, 2);
  buf.writeUInt16BE(ackId, 4);
  buf.writeUInt16BE(retransmitId, 6);
  buf.writeUInt16BE(0, 8); // inutilisé
  buf.writeUInt16BE(packetId, 10);
  payload.copy(buf, 12);
  return buf;
}

function parsePacket(buf) {
  if (buf.length < 12) return null;
  const word = buf.readUInt16BE(0);
  return {
    flags: word >> 11,
    length: word & MAX_PACKET,
    sessionId: buf.readUInt16BE(2),
    ackId: buf.readUInt16BE(4),
    retransmitId: buf.readUInt16BE(6),
    packetId: buf.readUInt16BE(10),
    payload: buf.subarray(12),
  };
}

/**
 * Une commande. La longueur déclarée inclut les 8 octets d'en-tête, et c'est
 * elle qui fait avancer le parseur : les données sont donc complétées à un
 * multiple de 4 octets *avant* que la longueur soit écrite, sans quoi le
 * récepteur se décalerait d'un cran sur la commande suivante.
 */
function cmd(name, data = Buffer.alloc(0)) {
  const padded = data.length % 4 === 0 ? data : Buffer.concat([data, Buffer.alloc(4 - (data.length % 4))]);
  const buf = Buffer.alloc(8 + padded.length);
  buf.writeUInt16BE(buf.length, 0);
  buf.write(name, 4, 4, 'ascii');
  padded.copy(buf, 8);
  return buf;
}

/** Découpe la charge utile d'un paquet en commandes. */
function parseCommands(payload) {
  const out = [];
  let buf = payload;
  while (buf.length >= 8) {
    const length = buf.readUInt16BE(0);
    if (length < 8 || length > buf.length) break;
    out.push({ name: buf.toString('ascii', 4, 8), data: buf.subarray(8, length) });
    buf = buf.subarray(length);
  }
  return out;
}

/** Chaîne de taille fixe, complétée de zéros (les noms d'entrée et de produit). */
function fixedString(text, size) {
  const buf = Buffer.alloc(size);
  buf.write(String(text).slice(0, size - 1), 0, 'utf8');
  return buf;
}

module.exports = { FLAG, MAX_PACKET, buildPacket, parsePacket, cmd, parseCommands, fixedString };
