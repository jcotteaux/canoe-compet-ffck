import Foundation

/// Une couleur de découpe, telle qu'on l'écrit dans un réglage : `#CC00CC`.
///
/// Le mélangeur, lui, ne raisonne pas en rouge-vert-bleu mais en luminance et
/// différences de couleur — c'est ce qu'il échantillonne dans l'image. La
/// conversion suit le BT.709, la colorimétrie de la haute définition, celle
/// dans laquelle travaille un ATEM HD.
public struct ChromaColor: Sendable, Equatable {
    /// Composantes de 0 à 1.
    public let red: Double
    public let green: Double
    public let blue: Double

    public init(red: Double, green: Double, blue: Double) {
        self.red = red
        self.green = green
        self.blue = blue
    }

    /// Accepte `CC00CC`, `#CC00CC` et `0xCC00CC`.
    public init?(hex: String) {
        var text = hex.trimmingCharacters(in: .whitespaces).uppercased()
        if text.hasPrefix("#") { text.removeFirst() }
        if text.hasPrefix("0X") { text.removeFirst(2) }
        guard text.count == 6, let value = UInt32(text, radix: 16) else { return nil }
        red = Double((value >> 16) & 0xff) / 255
        green = Double((value >> 8) & 0xff) / 255
        blue = Double(value & 0xff) / 255
    }

    public var hex: String {
        String(format: "#%02X%02X%02X",
               Int((red * 255).rounded()), Int((green * 255).rounded()), Int((blue * 255).rounded()))
    }

    // MARK: - BT.709

    /// Luminance, de 0 à 1.
    public var luma: Double { 0.2126 * red + 0.7152 * green + 0.0722 * blue }
    /// Différence de bleu, de -0,5 à 0,5.
    public var blueDifference: Double { (blue - luma) / 1.8556 }
    /// Différence de rouge, de -0,5 à 0,5.
    public var redDifference: Double { (red - luma) / 1.5748 }

    /// La teinte en degrés, pour le keyer chroma d'avant le keyer avancé.
    public var hueDegrees: Double {
        let high = max(red, green, blue)
        let low = min(red, green, blue)
        let span = high - low
        guard span > 0 else { return 0 }
        let hue: Double
        switch high {
        case red: hue = (green - blue) / span
        case green: hue = 2 + (blue - red) / span
        default: hue = 4 + (red - green) / span
        }
        return (hue * 60).truncatingRemainder(dividingBy: 360) + (hue < 0 ? 360 : 0)
    }

    /// La teinte telle que l'attend `CKCk`, en dixièmes de degré.
    public var hueTenths: UInt16 { UInt16((hueDegrees * 10).rounded()) }

    // MARK: - Échantillon

    /// L'échelle des composantes échantillonnées est le seul nombre de tout ce
    /// fichier qui ne soit **pas** vérifiable : ni Blackmagic ni
    /// l'implémentation de référence ne disent si le mélangeur attend des
    /// millièmes ou des dix-millièmes. Le millième est la convention de presque
    /// toutes les autres grandeurs du protocole (taille, niveau, position),
    /// d'où ce choix par défaut — et d'où la sonde, qui lit ce que le
    /// mélangeur a réellement retenu plutôt que de continuer à supposer.
    public static let defaultSampleScale: Double = 1000

    public func sampled(scale: Double = defaultSampleScale) -> (y: UInt16, cb: Int16, cr: Int16) {
        (
            y: UInt16(max(0, min(Double(UInt16.max), (luma * scale).rounded()))),
            cb: Int16(max(Double(Int16.min), min(Double(Int16.max), (blueDifference * scale).rounded()))),
            cr: Int16(max(Double(Int16.min), min(Double(Int16.max), (redDifference * scale).rounded())))
        )
    }
}
