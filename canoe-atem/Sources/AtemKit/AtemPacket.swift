import Foundation

/// Drapeaux de l'en-tête ATEM. Ils occupent les 5 bits hauts du premier mot,
/// les 11 bits restants portant la longueur totale du paquet.
public struct AtemPacketFlags: OptionSet, Sendable {
    public let rawValue: UInt16
    public init(rawValue: UInt16) { self.rawValue = rawValue }

    public static let ackRequest        = AtemPacketFlags(rawValue: 0x01)
    public static let hello             = AtemPacketFlags(rawValue: 0x02)
    public static let retransmit        = AtemPacketFlags(rawValue: 0x04)
    public static let retransmitRequest = AtemPacketFlags(rawValue: 0x08)
    public static let ack               = AtemPacketFlags(rawValue: 0x10)
}

/// Un datagramme du protocole ATEM : 12 octets d'en-tête, puis des commandes.
public struct AtemPacket: Sendable {
    public var flags: AtemPacketFlags
    public var sessionId: UInt16
    public var ackId: UInt16
    public var retransmitId: UInt16
    public var packetId: UInt16
    public var payload: Data

    /// La longueur ne dispose que de 11 bits.
    public static let maxSize = 0x07ff
    /// Les numéros de paquet bouclent sur 15 bits.
    public static let packetIdModulo: UInt16 = 1 << 15

    public init(flags: AtemPacketFlags, sessionId: UInt16, ackId: UInt16 = 0,
                retransmitId: UInt16 = 0, packetId: UInt16 = 0, payload: Data = Data()) {
        self.flags = flags
        self.sessionId = sessionId
        self.ackId = ackId
        self.retransmitId = retransmitId
        self.packetId = packetId
        self.payload = payload
    }

    public func encoded() -> Data {
        var out = Data(count: 12)
        let length = UInt16(12 + payload.count)
        out.writeUInt16BE(flags.rawValue << 11 | length, at: 0)
        out.writeUInt16BE(sessionId, at: 2)
        out.writeUInt16BE(ackId, at: 4)
        out.writeUInt16BE(retransmitId, at: 6)
        out.writeUInt16BE(0, at: 8)
        out.writeUInt16BE(packetId, at: 10)
        out.append(payload)
        return out
    }

    public init?(decoding data: Data) {
        guard data.count >= 12 else { return nil }
        let word = data.readUInt16BE(at: 0)
        flags = AtemPacketFlags(rawValue: word >> 11)
        sessionId = data.readUInt16BE(at: 2)
        ackId = data.readUInt16BE(at: 4)
        retransmitId = data.readUInt16BE(at: 6)
        packetId = data.readUInt16BE(at: 10)

        // La longueur annoncée peut être inférieure au datagramme reçu ; on la
        // respecte plutôt que de lire la fin du tampon comme des commandes.
        let declared = Int(word & UInt16(AtemPacket.maxSize))
        let end = declared >= 12 && declared <= data.count ? declared : data.count
        payload = data.subdata(in: (data.startIndex + 12)..<(data.startIndex + end))
    }

    /// La trame d'ouverture, reprise octet pour octet de l'implémentation de
    /// référence. L'octet 8-9 (`0x003a`) n'a pas de sens connu : on le
    /// reproduit tel quel plutôt que d'envoyer un zéro qu'aucun mélangeur réel
    /// n'a jamais reçu.
    public static func hello() -> Data {
        Data([0x10, 0x14, 0x53, 0xab, 0x00, 0x00, 0x00, 0x00,
              0x00, 0x3a, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
              0x00, 0x00, 0x00, 0x00])
    }
}

// MARK: - Lecture et écriture gros-boutiste

extension Data {
    func readUInt16BE(at offset: Int) -> UInt16 {
        let i = startIndex + offset
        guard i + 1 < endIndex else { return 0 }
        return UInt16(self[i]) << 8 | UInt16(self[i + 1])
    }

    func readUInt32BE(at offset: Int) -> UInt32 {
        let i = startIndex + offset
        guard i + 3 < endIndex else { return 0 }
        return UInt32(self[i]) << 24 | UInt32(self[i + 1]) << 16 | UInt32(self[i + 2]) << 8 | UInt32(self[i + 3])
    }

    func readUInt8(at offset: Int) -> UInt8 {
        let i = startIndex + offset
        guard i < endIndex else { return 0 }
        return self[i]
    }

    /// Chaîne de taille fixe terminée par un zéro, comme les noms d'entrée.
    func readString(at offset: Int, length: Int) -> String {
        let start = startIndex + offset
        guard start < endIndex else { return "" }
        let end = Swift.min(start + length, endIndex)
        var bytes = Array(self[start..<end])
        if let zero = bytes.firstIndex(of: 0) { bytes = Array(bytes[..<zero]) }
        return String(decoding: bytes, as: UTF8.self)
    }

    mutating func writeUInt16BE(_ value: UInt16, at offset: Int) {
        let i = startIndex + offset
        guard i + 1 < endIndex else { return }
        self[i] = UInt8(truncatingIfNeeded: value >> 8)
        self[i + 1] = UInt8(truncatingIfNeeded: value)
    }

    mutating func writeUInt8(_ value: UInt8, at offset: Int) {
        let i = startIndex + offset
        guard i < endIndex else { return }
        self[i] = value
    }
}

extension Data {
    /// Les positions du SuperSource sont signées : une fenêtre à gauche du
    /// centre porte une abscisse négative.
    func readInt16BE(at offset: Int) -> Int16 {
        Int16(bitPattern: readUInt16BE(at: offset))
    }

    mutating func writeInt16BE(_ value: Int16, at offset: Int) {
        writeUInt16BE(UInt16(bitPattern: value), at: offset)
    }

    mutating func writeBytes(_ bytes: [UInt8], at offset: Int) {
        for (i, byte) in bytes.enumerated() { writeUInt8(byte, at: offset + i) }
    }
}
