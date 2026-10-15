import Foundation

/// La géométrie d'une fenêtre du SuperSource.
///
/// Les coordonnées sont celles d'ATEM Software Control, multipliées par cent :
/// l'image va de -1600 à +1600 en abscisse et de -900 à +900 en ordonnée (soit
/// ±16,00 et ±9,00 dans l'interface), la taille de 0 à 1000 pour 0,00 à 1,00.
/// Une fenêtre de taille 0,5 centrée sur un quadrant tombe donc à la moitié de
/// chaque demi-axe.
public struct WindowGeometry: Sendable, Equatable {
    public var x: Int16
    public var y: Int16
    public var size: UInt16

    public init(x: Int16, y: Int16, size: UInt16) {
        self.x = x
        self.y = y
        self.size = size
    }

    public static let fullScreen  = WindowGeometry(x: 0, y: 0, size: 1000)
    public static let topLeft     = WindowGeometry(x: -800, y: 450, size: 500)
    public static let bottomRight = WindowGeometry(x: 800, y: -450, size: 500)
}

/// Une opération élémentaire d'une macro. C'est une commande à envoyer, mais
/// nommée : pendant l'enregistrement on veut pouvoir annoncer ce qu'on grave,
/// et à l'essai on veut jouer la même séquence sans rien graver.
public enum MacroStep: Sendable, Equatable {
    /// Change la source d'une fenêtre sans toucher à son cadrage.
    case windowSource(window: UInt8, source: UInt16)
    /// Pose une fenêtre : présence et cadrage, sans toucher à sa source. Le
    /// recadrage est retiré au passage : une fenêtre rognée ne tomberait plus
    /// dans le trou que tv_duo lui a percé.
    case windowLayout(window: UInt8, enabled: Bool, geometry: WindowGeometry)
    /// Éteint une fenêtre sans toucher au reste.
    case windowOff(window: UInt8)
    /// Le fond, visible dans les quadrants qu'aucune fenêtre ne couvre.
    case background(source: UInt16)
    /// Envoie une source au programme.
    case program(source: UInt16)
    /// La source de remplissage d'un keyer.
    case keyFill(keyer: UInt8, source: UInt16)
    /// Le type d'incrustation d'un keyer.
    case keyType(keyer: UInt8, type: AtemKeyType)
    /// La couleur que le keyer chroma avancé doit rendre transparente.
    case chromaSample(keyer: UInt8, y: UInt16, cb: Int16, cr: Int16)
    /// La teinte du keyer chroma classique, en dixièmes de degré.
    case chromaHue(keyer: UInt8, hue: UInt16)
    /// Met le keyer à l'antenne, ou l'en retire.
    case keyOnAir(keyer: UInt8, onAir: Bool)

    public func encoded() -> Data {
        switch self {
        case .windowSource(let window, let source):
            AtemOutgoing.superSourceBox(window, mask: .source, source: source)
        case .windowLayout(let window, let enabled, let geometry):
            AtemOutgoing.superSourceBox(
                window,
                mask: [.enabled, .geometry, .cropped],
                enabled: enabled,
                x: geometry.x, y: geometry.y, size: geometry.size
            )
        case .windowOff(let window):
            AtemOutgoing.superSourceBox(window, mask: .enabled, enabled: false)
        case .background(let source):
            AtemOutgoing.superSourceArt(fill: source)
        case .program(let source):
            AtemOutgoing.setProgram(source: source)
        case .keyFill(let keyer, let source):
            AtemOutgoing.keyFillSource(source, keyer: keyer)
        case .keyType(let keyer, let type):
            AtemOutgoing.keyType(type, keyer: keyer)
        case .chromaSample(let keyer, let y, let cb, let cr):
            AtemOutgoing.chromaSample(y: y, cb: cb, cr: cr, keyer: keyer)
        case .chromaHue(let keyer, let hue):
            AtemOutgoing.chromaHue(hue, keyer: keyer)
        case .keyOnAir(let keyer, let onAir):
            AtemOutgoing.keyOnAir(onAir, keyer: keyer)
        }
    }

    public func label(in state: AtemState) -> String {
        switch self {
        case .windowSource(let window, let source):
            "fenetre \(window + 1) ← \(state.inputName(source))"
        case .windowLayout(let window, let enabled, let geometry):
            enabled
                ? "fenetre \(window + 1) : x \(geometry.x) y \(geometry.y) taille \(geometry.size)"
                : "fenetre \(window + 1) : éteinte"
        case .windowOff(let window):
            "fenetre \(window + 1) : éteinte"
        case .background(let source):
            "fond ← \(state.inputName(source))"
        case .program(let source):
            "programme ← \(state.inputName(source))"
        case .keyFill(let keyer, let source):
            "incrust \(keyer + 1) ← \(state.inputName(source))"
        case .keyType(let keyer, let type):
            "incrust \(keyer + 1) : type \(type.label)"
        case .chromaSample(let keyer, let y, let cb, let cr):
            "incrust \(keyer + 1) : couleur Y \(y) Cb \(cb) Cr \(cr)"
        case .chromaHue(let keyer, let hue):
            "incrust \(keyer + 1) : teinte \(Double(hue) / 10)°"
        case .keyOnAir(let keyer, let onAir):
            "incrust \(keyer + 1) \(onAir ? "à l'antenne" : "hors antenne")"
        }
    }
}

/// Une macro à graver : ce qu'elle s'appellera et ce qu'elle contiendra.
public struct MacroRecipe: Sendable, Equatable, Identifiable {
    public let index: UInt16
    public let name: String
    public let details: String
    public let steps: [MacroStep]

    public var id: UInt16 { index }
}

/// Le jeu de macros d'une régie à deux fenêtres.
///
/// Deux kayakistes à l'écran, c'est le SuperSource : un compositeur qui tient
/// plusieurs fenêtres et qui s'envoie au programme comme une source ordinaire.
/// Le programme reste donc **toujours** sur le SuperSource, et les macros ne
/// déplacent que ce qu'il y a dedans. C'est ce qui rend « plein écran » et
/// « duo » indépendantes des caméras choisies : sans cela, chaque bascule de
/// cadrage devrait connaître la caméra en cours, et il faudrait une macro par
/// combinaison.
///
/// - la fenêtre 1 est celle qu'on voit seule en plein écran, et en haut à
///   gauche en duo ;
/// - la fenêtre 2 n'apparaît qu'en duo, en bas à droite ;
/// - les fenêtres 3 et 4, que le mélangeur allume par défaut en mosaïque, sont
///   éteintes par les deux cadrages : elles déborderaient sous l'habillage.
public enum RegiePlan {
    /// Le SuperSource vu comme source : les mélangeurs le présentent sous cet
    /// identifiant. Il est confirmé à la connexion par `InPr`, qui donne le
    /// type de port interne de chaque source.
    public static let superSourceId: UInt16 = 6000

    public static func recipes(
        cameras: [UInt16],
        superSource: UInt16 = superSourceId,
        background: UInt16 = 0,
        firstIndex: UInt16 = 0
    ) -> [MacroRecipe] {
        var recipes: [MacroRecipe] = [
            MacroRecipe(
                index: firstIndex,
                name: "Duo",
                details: "Deux fenetres : 1 en haut a gauche, 2 en bas a droite",
                steps: [
                    .background(source: background),
                    .windowLayout(window: 0, enabled: true, geometry: .topLeft),
                    .windowLayout(window: 1, enabled: true, geometry: .bottomRight),
                    .windowOff(window: 2),
                    .windowOff(window: 3),
                    .program(source: superSource),
                ]
            ),
            MacroRecipe(
                index: firstIndex + 1,
                name: "Plein ecran",
                details: "Fenetre 1 seule, plein cadre",
                steps: [
                    .windowLayout(window: 0, enabled: true, geometry: .fullScreen),
                    .windowLayout(window: 1, enabled: false, geometry: .bottomRight),
                    .windowOff(window: 2),
                    .windowOff(window: 3),
                    .program(source: superSource),
                ]
            ),
        ]

        // Les deux séries de caméras se suivent : d'abord toute la fenêtre 1,
        // puis toute la fenêtre 2, dans l'ordre des caméras. C'est l'ordre des
        // macros dans le mélangeur, donc celui des boutons dans l'app.
        for window in UInt8(0)...UInt8(1) {
            for (rank, camera) in cameras.enumerated() {
                let offset = UInt16(2 + Int(window) * cameras.count + rank)
                recipes.append(MacroRecipe(
                    index: firstIndex + offset,
                    name: "F\(window + 1)-Cam\(rank + 1)",
                    details: window == 0
                        ? "Fenetre 1 (plein ecran et haut gauche) : camera \(rank + 1)"
                        : "Fenetre 2 (bas droite) : camera \(rank + 1)",
                    steps: [.windowSource(window: window, source: camera)]
                ))
            }
        }
        return recipes
    }

    /// Comment la couleur à découper est décidée.
    ///
    /// Trois chemins parce qu'il y a trois situations : la couleur est connue
    /// et le mélangeur a le keyer avancé ; on a relevé sur le mélangeur ce
    /// qu'il a lui-même retenu, et on le regrave tel quel ; le mélangeur n'a
    /// que l'ancien keyer, qui se règle par teinte.
    public enum ChromaSetting: Sendable, Equatable {
        case color(ChromaColor, scale: Double = ChromaColor.defaultSampleScale)
        case sampled(y: UInt16, cb: Int16, cr: Int16)
        case hue(UInt16)

        public var step: (UInt8) -> MacroStep {
            switch self {
            case .color(let color, let scale):
                let sample = color.sampled(scale: scale)
                return { .chromaSample(keyer: $0, y: sample.y, cb: sample.cb, cr: sample.cr) }
            case .sampled(let y, let cb, let cr):
                return { .chromaSample(keyer: $0, y: y, cb: cb, cr: cr) }
            case .hue(let hue):
                return { .chromaHue(keyer: $0, hue: hue) }
            }
        }

        /// Sans accent : c'est une description de macro, elle s'affiche dans
        /// ATEM Software Control comme sur le mélangeur.
        public var label: String {
            switch self {
            case .color(let color, _): "sur \(color.hex)"
            case .sampled(let y, let cb, let cr): "sur la couleur relevee (Y \(y) Cb \(cb) Cr \(cr))"
            case .hue(let hue): "sur la teinte \(Double(hue) / 10) deg"
            }
        }
    }

    /// L'incrustation d'une source sur une couleur donnée, et son retrait.
    ///
    /// Le keyer se pose **au-dessus** du programme, donc au-dessus du
    /// SuperSource : l'incrustation reste en place quel que soit le cadrage, et
    /// les macros de cadrage n'ont pas à la connaître.
    ///
    /// L'ordre des opérations n'est pas indifférent : la source et le type
    /// avant la couleur, la mise à l'antenne en dernier. Passer à l'antenne
    /// d'abord afficherait l'incrustation mal réglée le temps que le reste
    /// arrive — sur une macro, ce temps se voit.
    public static func chromaKey(
        fill: UInt16,
        setting: ChromaSetting,
        keyer: UInt8 = 0,
        index: UInt16,
        withRemoval: Bool = true
    ) -> [MacroRecipe] {
        var recipes = [MacroRecipe(
            index: index,
            name: "Incrust \(fill)",
            details: "Source \(fill) en chroma \(setting.label)",
            steps: [
                .keyFill(keyer: keyer, source: fill),
                .keyType(keyer: keyer, type: .chroma),
                setting.step(keyer),
                .keyOnAir(keyer: keyer, onAir: true),
            ]
        )]
        // Un keyer qu'on ne sait pas retirer reste à l'antenne : en régie, la
        // macro de retrait n'est pas un supplément, c'est l'autre moitié.
        if withRemoval {
            recipes.append(MacroRecipe(
                index: index + 1,
                name: "Incrust off",
                details: "Retire l incrustation \(keyer + 1)",
                steps: [.keyOnAir(keyer: keyer, onAir: false)]
            ))
        }
        return recipes
    }
}
