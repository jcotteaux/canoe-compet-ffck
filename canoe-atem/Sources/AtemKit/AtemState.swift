import Foundation

public struct AtemMacro: Identifiable, Sendable, Equatable {
    public let index: UInt16
    public var name: String
    public var description: String
    public var isUsed: Bool
    public var hasUnsupportedOps: Bool

    public var id: UInt16 { index }
    /// Une macro sans nom reste déclenchable : on l'annonce par son rang.
    public var displayName: String { name.isEmpty ? "Macro \(index + 1)" : name }
}

public struct AtemInput: Identifiable, Sendable, Equatable {
    public let id: UInt16
    public var longName: String
    public var shortName: String
    public var isExternal: Bool
}

public enum AtemStreamingStatus: UInt16, Sendable {
    case idle = 1, connecting = 2, streaming = 4, stopping = 32

    public var label: String {
        switch self {
        case .idle: "à l'arrêt"
        case .connecting: "connexion…"
        case .streaming: "en direct"
        case .stopping: "arrêt…"
        }
    }
}

/// Ce que le mélangeur dit de ses propres capacités (`_top`). On n'en retient
/// que ce qui conditionne le jeu de macros : sans SuperSource, pas de duo.
public struct AtemCapabilities: Sendable, Equatable {
    public var mixEffects: UInt8 = 0
    public var downstreamKeyers: UInt8 = 0
    public var dves: UInt8 = 0
    public var superSources: UInt8 = 0
    /// Les mélangeurs récents remplacent le keyer chroma par teinte par un
    /// keyer qui échantillonne l'image. Les deux ne se règlent pas du tout de
    /// la même façon, d'où l'importance de savoir lequel on a en face.
    public var advancedChromaKeyers = false
}

/// Un keyer amont, tel que le mélangeur le rapporte.
public struct AtemKeyer: Identifiable, Sendable, Equatable {
    public let id: UInt8
    public var type: AtemKeyType = .luma
    public var fillSource: UInt16 = 0
    public var onAir = false
    /// La couleur retenue par le keyer chroma avancé. Lue plutôt que devinée :
    /// c'est elle qui dit dans quelle échelle le mélangeur range un
    /// échantillon.
    public var sampledY: UInt16 = 0
    public var sampledCb: Int16 = 0
    public var sampledCr: Int16 = 0
}

/// Une fenêtre du SuperSource, telle que le mélangeur la rapporte (`SSBP`).
public struct AtemSuperSourceBox: Sendable, Equatable {
    public var enabled = false
    public var source: UInt16 = 0
    public var x: Int16 = 0
    public var y: Int16 = 0
    public var size: UInt16 = 0
}

/// L'enregistreur de macros (`MRcS`) : gravé ou non, et dans quel emplacement.
public struct AtemMacroRecorder: Sendable, Equatable {
    public var isRecording = false
    public var index: UInt16 = 0
}

public struct AtemMacroRun: Sendable, Equatable {
    public var isRunning = false
    public var isWaiting = false
    public var isLooping = false
    public var index: UInt16 = 0
}

/// L'état du mélangeur tel que le client l'a reconstitué. Volontairement
/// partiel : seules les informations qu'une régie de course regarde.
public struct AtemState: Sendable, Equatable {
    public var productName = ""
    public var version = ""
    public var macros: [AtemMacro] = []
    public var inputs: [AtemInput] = []
    public var program: UInt16 = 0
    public var preview: UInt16 = 0
    public var streaming: AtemStreamingStatus = .idle
    public var isRecording = false
    public var macroRun = AtemMacroRun()
    public var macroRecorder = AtemMacroRecorder()
    public var capabilities = AtemCapabilities()
    /// Les fenêtres du SuperSource, indexées par leur rang.
    public var superSourceBoxes: [AtemSuperSourceBox] = []
    /// Les keyers amont du premier M/E.
    public var keyers: [AtemKeyer] = []
    /// La source sous laquelle le SuperSource se présente au programme, telle
    /// que `InPr` l'annonce. Absente si le mélangeur n'en a pas.
    public var superSourceInput: UInt16?
    /// La version du protocole en un seul entier comparable, majeure en poids
    /// fort : plusieurs commandes ont changé de disposition en 8.0.
    public var protocolVersion: UInt32 = 0
    /// Le mélangeur a fini de vider son état (`InCm`).
    public var isInitialised = false

    public init() {}

    public var usedMacros: [AtemMacro] { macros.filter(\.isUsed) }

    public func keyer(_ id: UInt8) -> AtemKeyer? { keyers.first { $0.id == id } }

    public func inputName(_ id: UInt16) -> String {
        inputs.first { $0.id == id }?.longName ?? "Source \(id)"
    }

    /// Applique une commande reçue. Rend `true` si l'état a changé.
    @discardableResult
    mutating func apply(_ command: AtemRawCommand) -> Bool {
        let d = command.data
        switch command.name {
        case "_ver":
            version = "\(d.readUInt16BE(at: 0)).\(d.readUInt16BE(at: 2))"
            protocolVersion = UInt32(d.readUInt16BE(at: 0)) << 16 | UInt32(d.readUInt16BE(at: 2))
        case "_top":
            // Un champ s'est inséré en 2.30 (le nombre de multivues) et décale
            // tout ce qui suit. `_ver` arrive avant `_top` dans le vidage
            // d'état : la version est donc déjà connue ici.
            let shift = protocolVersion > 0x0002_001D ? 1 : 0
            capabilities = AtemCapabilities(
                mixEffects: d.readUInt8(at: 0),
                downstreamKeyers: d.readUInt8(at: 2),
                dves: d.readUInt8(at: 8 + shift),
                superSources: d.readUInt8(at: 10 + shift),
                advancedChromaKeyers: d.count > 20 && d.readUInt8(at: 21 + shift) == 1
            )
        case "_pin":
            productName = d.readString(at: 0, length: min(44, d.count))
        case "InPr":
            let input = AtemInput(
                id: d.readUInt16BE(at: 0),
                longName: d.readString(at: 2, length: 20),
                shortName: d.readString(at: 22, length: 4),
                // ExternalPortType.Internal == 256 : tout le reste est une
                // vraie prise sur la face arrière.
                isExternal: d.readUInt16BE(at: 30) != 256 && d.readUInt16BE(at: 30) != 0
            )
            if let i = inputs.firstIndex(where: { $0.id == input.id }) { inputs[i] = input } else { inputs.append(input) }
            // InternalPortType.SuperSource == 6 : c'est ainsi qu'on apprend
            // sous quelle source le compositeur se présente, plutôt que de
            // figer la valeur 6000 vue sur les mélangeurs connus.
            if d.readUInt8(at: 32) == 6 { superSourceInput = input.id }
        case "PrgI":
            program = d.readUInt16BE(at: 2)
        case "PrvI":
            preview = d.readUInt16BE(at: 2)
        case "MPrp":
            let index = d.readUInt16BE(at: 0)
            let nameLength = Int(d.readUInt16BE(at: 4))
            let descriptionLength = Int(d.readUInt16BE(at: 6))
            let macro = AtemMacro(
                index: index,
                name: d.readString(at: 8, length: nameLength),
                description: d.readString(at: 8 + nameLength, length: descriptionLength),
                isUsed: d.readUInt8(at: 2) != 0,
                hasUnsupportedOps: d.readUInt8(at: 3) != 0
            )
            if let i = macros.firstIndex(where: { $0.index == index }) { macros[i] = macro } else { macros.append(macro) }
            macros.sort { $0.index < $1.index }
        case "MRPr":
            let flags = d.readUInt8(at: 0)
            macroRun = AtemMacroRun(
                isRunning: flags & 0x01 != 0,
                isWaiting: flags & 0x02 != 0,
                isLooping: d.readUInt8(at: 1) != 0,
                index: d.readUInt16BE(at: 2)
            )
        // Les keyers ne sont suivis que sur le premier M/E : c'est le seul
        // qu'un mélangeur de la famille Mini possède, et le seul que l'app
        // utilise.
        case "KeBP" where d.readUInt8(at: 0) == 0:
            let id = d.readUInt8(at: 1)
            var keyer = keyer(id) ?? AtemKeyer(id: id)
            keyer.type = AtemKeyType(rawValue: d.readUInt8(at: 2)) ?? .luma
            keyer.fillSource = d.readUInt16BE(at: 6)
            upsert(keyer)
        case "KeOn" where d.readUInt8(at: 0) == 0:
            let id = d.readUInt8(at: 1)
            var keyer = keyer(id) ?? AtemKeyer(id: id)
            keyer.onAir = d.readUInt8(at: 2) != 0
            upsert(keyer)
        case "KACC" where d.readUInt8(at: 0) == 0:
            let id = d.readUInt8(at: 1)
            var keyer = keyer(id) ?? AtemKeyer(id: id)
            keyer.sampledY = d.readUInt16BE(at: 10)
            keyer.sampledCb = d.readInt16BE(at: 12)
            keyer.sampledCr = d.readInt16BE(at: 14)
            upsert(keyer)
        case "MRcS":
            macroRecorder = AtemMacroRecorder(isRecording: d.readUInt8(at: 0) != 0, index: d.readUInt16BE(at: 2))
        case "SSBP":
            // Disposition 8.0 : l'identifiant du SuperSource ouvre le message.
            let box = Int(d.readUInt8(at: 1))
            while superSourceBoxes.count <= box { superSourceBoxes.append(AtemSuperSourceBox()) }
            superSourceBoxes[box] = AtemSuperSourceBox(
                enabled: d.readUInt8(at: 2) != 0,
                source: d.readUInt16BE(at: 4),
                x: d.readInt16BE(at: 6),
                y: d.readInt16BE(at: 8),
                size: d.readUInt16BE(at: 10)
            )
        case "StRS":
            streaming = AtemStreamingStatus(rawValue: d.readUInt16BE(at: 0)) ?? .idle
        case "RTMS":
            isRecording = d.readUInt16BE(at: 0) & 0x01 != 0
        case "InCm":
            isInitialised = true
        default:
            return false // commande connue du mélangeur mais inutile ici
        }
        return true
    }

    private mutating func upsert(_ keyer: AtemKeyer) {
        if let i = keyers.firstIndex(where: { $0.id == keyer.id }) { keyers[i] = keyer } else { keyers.append(keyer) }
        keyers.sort { $0.id < $1.id }
    }
}
