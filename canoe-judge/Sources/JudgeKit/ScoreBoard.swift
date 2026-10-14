import Foundation
import CanoeLiveKit

/// Une pénalité telle que l'incrustation la montre.
public struct ScoreMark: Identifiable, Sendable, Equatable {
    public let gate: Int
    public let seconds: Int
    /// Heure de course à laquelle elle s'allume.
    public let clockMs: Int
    /// L'heure est déduite du numéro de porte, pas entendue. L'incrustation
    /// doit le dire : sur un clip qui sort du dossier, plus rien ne rappelle
    /// que cette seconde-là est une estimation.
    public let isEstimated: Bool

    public var id: Int { gate }
    public var isFifty: Bool { seconds == 50 }

    /// `p7 · 50`, avec le point d'interrogation quand l'heure est déduite.
    public var label: String {
        "p\(gate) · \(seconds)" + (isEstimated ? " ?" : "")
    }
}

/// Ce que porte l'incrustation, indépendamment de la façon de la dessiner.
///
/// Le même objet sert à l'écran, en SwiftUI, et au clip gravé, en calques
/// CoreAnimation. Deux calculs séparés finiraient par ne plus dire la même
/// chose, et c'est précisément le clip qui part au jury qui aurait tort.
public struct ScoreBoard: Sendable, Equatable {
    public let bib: Int
    /// `3 VASSEUR Quentin`.
    public let label: String
    public let epreuve: String
    /// Heure de course du départ.
    public let startMs: Int
    /// Heure de course de l'arrivée, `nil` tant que le bateau n'est pas arrivé.
    public let finishMs: Int?
    public let marks: [ScoreMark]

    /// Le temps de descente à cet instant.
    ///
    /// Négatif avant le départ — on se pose toujours quelques secondes avant,
    /// et un chrono qui resterait à zéro laisserait croire que la descente a
    /// commencé. Figé à l'arrivée : après la ligne, le chrono ne court plus.
    public func elapsedMs(atClock clockMs: Int) -> Int {
        (finishMs.map { min(clockMs, $0) } ?? clockMs) - startMs
    }

    /// Les pénalités déjà franchies à cet instant, dans l'ordre du parcours.
    public func passed(atClock clockMs: Int) -> [ScoreMark] {
        marks.filter { $0.clockMs <= clockMs }.sorted { $0.gate < $1.gate }
    }

    public func penaltySeconds(atClock clockMs: Int) -> Int {
        passed(atClock: clockMs).reduce(0) { $0 + $1.seconds }
    }

    /// `nil` sans heure de départ : sans borne basse il n'y a pas de chrono, et
    /// en afficher un faux sur une image de jugement est pire que rien.
    public static func make(entry: CanoeEntry, sequence: JudgeSequence) -> ScoreBoard? {
        guard let start = sequence.start else { return nil }
        let marks: [ScoreMark] = sequence.marks.compactMap { mark in
            guard case .gate(let gate, let seconds) = mark.kind else { return nil }
            return ScoreMark(gate: gate, seconds: seconds,
                             clockMs: mark.clockMs, isEstimated: mark.isEstimated)
        }
        return ScoreBoard(bib: entry.bib,
                          label: entry.label,
                          epreuve: entry.epreuve,
                          startMs: start.clockMs,
                          finishMs: sequence.finish?.clockMs,
                          marks: marks)
    }

    /// `1:23.4` — un temps de descente, pas une heure du jour.
    ///
    /// Sans dixièmes pour le clip gravé, où le chrono n'est réécrit qu'une
    /// fois par seconde : afficher un dixième qui ne bouge pas pendant dix
    /// images serait pire que de ne pas l'afficher.
    public static func formatElapsed(_ ms: Int, tenths: Bool = true) -> String {
        let sign = ms < 0 ? "−" : ""
        let total = abs(ms)
        let minutes = total / 60_000, seconds = (total % 60_000) / 1000
        guard tenths else { return String(format: "%@%d:%02d", sign, minutes, seconds) }
        return String(format: "%@%d:%02d.%d", sign, minutes, seconds, (total % 1000) / 100)
    }
}
