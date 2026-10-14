import Foundation

/// Un bloc de commande : 8 octets d'en-tête (longueur, nom sur 4 caractères)
/// puis les données. La longueur inclut l'en-tête et fait avancer le parseur.
public struct AtemRawCommand: Sendable {
    public let name: String
    public let data: Data

    /// Découpe la charge utile d'un paquet. S'arrête à la première longueur
    /// incohérente : mieux vaut perdre la fin d'un paquet que se désynchroniser
    /// et interpréter des données comme un nom de commande.
    public static func parse(_ payload: Data) -> [AtemRawCommand] {
        var out: [AtemRawCommand] = []
        var offset = 0
        while payload.count - offset >= 8 {
            let slice = payload.subdata(in: (payload.startIndex + offset)..<payload.endIndex)
            let length = Int(slice.readUInt16BE(at: 0))
            guard length >= 8, length <= slice.count else { break }
            let name = slice.readString(at: 4, length: 4)
            out.append(AtemRawCommand(name: name, data: slice.subdata(in: (slice.startIndex + 8)..<(slice.startIndex + length))))
            offset += length
        }
        return out
    }

    /// Sérialise une commande à destination du mélangeur. Les données sont
    /// complétées à un multiple de 4 octets avant l'écriture de la longueur.
    public static func encode(_ name: String, _ data: Data) -> Data {
        var padded = data
        if padded.count % 4 != 0 { padded.append(Data(count: 4 - padded.count % 4)) }
        var out = Data(count: 8)
        out.writeUInt16BE(UInt16(8 + padded.count), at: 0)
        let ascii = Array(name.utf8.prefix(4))
        for (i, byte) in ascii.enumerated() { out.writeUInt8(byte, at: 4 + i) }
        out.append(padded)
        return out
    }
}

// MARK: - Commandes émises vers le mélangeur

public enum MacroAction: UInt8, Sendable {
    case run = 0, stop = 1, stopRecord = 2, insertUserWait = 3, `continue` = 4, delete = 5
}

public enum AtemOutgoing {
    /// `MAct` : index sur 16 bits, action sur 8. Les actions qui ne visent pas
    /// une macro précise portent l'index 0xffff.
    public static func macroAction(_ action: MacroAction, index: UInt16) -> Data {
        var data = Data(count: 4)
        let needsIndex = action == .run || action == .delete
        data.writeUInt16BE(needsIndex ? index : 0xffff, at: 0)
        data.writeUInt8(action.rawValue, at: 2)
        return AtemRawCommand.encode("MAct", data)
    }

    /// `CPgI` / `CPvI` : bus M/E sur 8 bits, source sur 16.
    public static func setProgram(source: UInt16, mixEffect: UInt8 = 0) -> Data {
        var data = Data(count: 4)
        data.writeUInt8(mixEffect, at: 0)
        data.writeUInt16BE(source, at: 2)
        return AtemRawCommand.encode("CPgI", data)
    }

    public static func setPreview(source: UInt16, mixEffect: UInt8 = 0) -> Data {
        var data = Data(count: 4)
        data.writeUInt8(mixEffect, at: 0)
        data.writeUInt16BE(source, at: 2)
        return AtemRawCommand.encode("CPvI", data)
    }
}

// MARK: - SuperSource et enregistrement de macros

/// Le masque d'une commande partielle : le mélangeur n'applique que les champs
/// dont le bit est levé, les autres gardent leur valeur. C'est ce qui permet de
/// changer la source d'une fenêtre sans toucher à sa géométrie.
public struct SuperSourceBoxMask: OptionSet, Sendable {
    public let rawValue: UInt16
    public init(rawValue: UInt16) { self.rawValue = rawValue }

    // src/commands/SuperSource/SuperSourceBoxParametersCommand.ts
    public static let enabled = SuperSourceBoxMask(rawValue: 1 << 0)
    public static let source  = SuperSourceBoxMask(rawValue: 1 << 1)
    public static let x       = SuperSourceBoxMask(rawValue: 1 << 2)
    public static let y       = SuperSourceBoxMask(rawValue: 1 << 3)
    public static let size    = SuperSourceBoxMask(rawValue: 1 << 4)
    public static let cropped = SuperSourceBoxMask(rawValue: 1 << 5)

    public static let geometry: SuperSourceBoxMask = [.x, .y, .size]
}

extension AtemOutgoing {
    /// `MSRc` : ouvre l'enregistrement d'une macro. Tout ce que le mélangeur
    /// reçoit ensuite — de n'importe quel client — est gravé dans la macro,
    /// jusqu'à `MAct` avec l'action `stopRecord`. C'est exactement ainsi que
    /// procède ATEM Software Control : il n'existe pas de commande qui
    /// téléverserait une macro toute faite.
    public static func macroRecord(index: UInt16, name: String, description: String) -> Data {
        let nameBytes = Array(name.utf8)
        let descriptionBytes = Array(description.utf8)
        var data = Data(count: 8 + nameBytes.count + descriptionBytes.count)
        data.writeUInt16BE(index, at: 0)
        data.writeUInt16BE(UInt16(nameBytes.count), at: 2)
        data.writeUInt16BE(UInt16(descriptionBytes.count), at: 4)
        data.writeBytes(nameBytes, at: 6)
        data.writeBytes(descriptionBytes, at: 6 + nameBytes.count)
        return AtemRawCommand.encode("MSRc", data)
    }

    /// `CMPr` : renomme une macro déjà gravée, sans la rejouer ni la réécrire.
    public static func macroRename(index: UInt16, name: String, description: String) -> Data {
        let nameBytes = Array(name.utf8)
        let descriptionBytes = Array(description.utf8)
        var data = Data(count: 8 + nameBytes.count + descriptionBytes.count)
        data.writeUInt8(0x03, at: 0) // masque : nom + description
        data.writeUInt16BE(index, at: 2)
        data.writeUInt16BE(UInt16(nameBytes.count), at: 4)
        data.writeUInt16BE(UInt16(descriptionBytes.count), at: 6)
        data.writeBytes(nameBytes, at: 8)
        data.writeBytes(descriptionBytes, at: 8 + nameBytes.count)
        return AtemRawCommand.encode("CMPr", data)
    }

    /// `CSBP` : les paramètres d'une fenêtre du SuperSource.
    ///
    /// La disposition dépend de la version du protocole : depuis la 8.0, le mot
    /// de masque est suivi de l'identifiant du SuperSource, ce qui décale tout
    /// le reste d'un octet puis d'un second pour réaligner sur 16 bits. On
    /// n'encode que cette forme : les mélangeurs qui ont un SuperSource et que
    /// cette app vise sont tous au-delà.
    public static func superSourceBox(
        _ box: UInt8,
        mask: SuperSourceBoxMask,
        enabled: Bool = false,
        source: UInt16 = 0,
        x: Int16 = 0,
        y: Int16 = 0,
        size: UInt16 = 0,
        superSource: UInt8 = 0
    ) -> Data {
        var data = Data(count: 24)
        data.writeUInt16BE(mask.rawValue, at: 0)
        data.writeUInt8(superSource, at: 2)
        data.writeUInt8(box, at: 3)
        data.writeUInt8(enabled ? 1 : 0, at: 4)
        data.writeUInt16BE(source, at: 6)
        data.writeInt16BE(x, at: 8)
        data.writeInt16BE(y, at: 10)
        data.writeUInt16BE(size, at: 12)
        return AtemRawCommand.encode("CSBP", data)
    }

    /// `CSSc` : le fond du SuperSource, c'est-à-dire ce qu'on voit dans les
    /// quadrants que les fenêtres ne couvrent pas. Forme 8.0 du message.
    public static func superSourceArt(fill: UInt16, superSource: UInt8 = 0) -> Data {
        var data = Data(count: 16)
        data.writeUInt8(0x05, at: 0)  // masque : source de remplissage + mode
        data.writeUInt8(superSource, at: 1)
        data.writeUInt16BE(fill, at: 2)
        data.writeUInt8(0, at: 6)     // SuperSourceArtOption.background
        return AtemRawCommand.encode("CSSc", data)
    }
}

// MARK: - Incrustation

/// src/enums/index.ts — MixEffectKeyType
public enum AtemKeyType: UInt8, Sendable {
    case luma = 0, chroma = 1, pattern = 2, dve = 3

    public var label: String {
        switch self {
        case .luma: "luma"
        case .chroma: "chroma"
        case .pattern: "motif"
        case .dve: "DVE"
        }
    }
}

extension AtemOutgoing {
    /// `CKTp` : le type d'incrustation d'un keyer. Seul le type est masqué :
    /// le vol (`flyEnabled`) reste tel qu'il est.
    public static func keyType(_ type: AtemKeyType, keyer: UInt8, mixEffect: UInt8 = 0) -> Data {
        var data = Data(count: 8)
        data.writeUInt8(0x01, at: 0)
        data.writeUInt8(mixEffect, at: 1)
        data.writeUInt8(keyer, at: 2)
        data.writeUInt8(type.rawValue, at: 3)
        return AtemRawCommand.encode("CKTp", data)
    }

    /// `CKeF` : la source de remplissage d'un keyer. En chroma, c'est elle qui
    /// fournit aussi la découpe : pas de source de cut à régler.
    public static func keyFillSource(_ source: UInt16, keyer: UInt8, mixEffect: UInt8 = 0) -> Data {
        var data = Data(count: 4)
        data.writeUInt8(mixEffect, at: 0)
        data.writeUInt8(keyer, at: 1)
        data.writeUInt16BE(source, at: 2)
        return AtemRawCommand.encode("CKeF", data)
    }

    /// `CKOn` : met le keyer à l'antenne, ou l'en retire.
    public static func keyOnAir(_ onAir: Bool, keyer: UInt8, mixEffect: UInt8 = 0) -> Data {
        var data = Data(count: 4)
        data.writeUInt8(mixEffect, at: 0)
        data.writeUInt8(keyer, at: 1)
        data.writeUInt8(onAir ? 1 : 0, at: 2)
        return AtemRawCommand.encode("CKOn", data)
    }

    /// `CACC` : la couleur retenue par le keyer chroma avancé.
    ///
    /// Ce keyer se règle normalement en **échantillonnant l'image** : on pose un
    /// curseur sur la zone à rendre transparente et le mélangeur en tire la
    /// couleur. Les trois composantes échantillonnées sont cependant
    /// inscriptibles directement, ce qui permet d'imposer une couleur connue
    /// sans rien viser — le seul moyen de graver une couleur dans une macro.
    ///
    /// Le masque ne lève que ces trois champs : le curseur et l'aperçu gardent
    /// leur état, et rien de ce qu'on ne maîtrise pas n'est écrit.
    public static func chromaSample(y: UInt16, cb: Int16, cr: Int16, keyer: UInt8, mixEffect: UInt8 = 0) -> Data {
        var data = Data(count: 20)
        data.writeUInt8(0xe0, at: 0)  // masque : sampledY + sampledCb + sampledCr
        data.writeUInt8(mixEffect, at: 1)
        data.writeUInt8(keyer, at: 2)
        data.writeUInt16BE(y, at: 12)
        data.writeInt16BE(cb, at: 14)
        data.writeInt16BE(cr, at: 16)
        return AtemRawCommand.encode("CACC", data)
    }

    /// `CKCk` : le keyer chroma d'avant le keyer avancé, réglé par teinte. Sert
    /// de repli sur les mélangeurs qui n'annoncent pas de chroma avancé ; la
    /// teinte y est en dixièmes de degré, le reste garde ses valeurs.
    public static func chromaHue(_ hue: UInt16, keyer: UInt8, mixEffect: UInt8 = 0) -> Data {
        var data = Data(count: 16)
        data.writeUInt8(0x01, at: 0)  // masque : teinte seule
        data.writeUInt8(mixEffect, at: 1)
        data.writeUInt8(keyer, at: 2)
        data.writeUInt16BE(hue, at: 4)
        return AtemRawCommand.encode("CKCk", data)
    }
}
