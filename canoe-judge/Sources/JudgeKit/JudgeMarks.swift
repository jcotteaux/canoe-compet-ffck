import Foundation
import CanoeLiveKit

public enum JudgeMarkKind: Sendable, Equatable {
    case start
    case gate(Int, seconds: Int)
    case finish
}

/// Un repère sur la descente d'un bateau, exprimé en heure de course.
public struct JudgeMark: Identifiable, Sendable, Equatable {
    public let kind: JudgeMarkKind
    /// Heure du jour du repère, en millisecondes depuis minuit.
    public let clockMs: Int
    /// Largeur de l'incertitude, en millisecondes. **0 signifie entendu en
    /// direct** ; toute autre valeur est une déduction, et le juge doit le
    /// savoir avant de conclure sur ce qu'il voit.
    public let uncertaintyMs: Int

    public init(kind: JudgeMarkKind, clockMs: Int, uncertaintyMs: Int = 0) {
        self.kind = kind
        self.clockMs = clockMs
        self.uncertaintyMs = uncertaintyMs
    }

    public var isEstimated: Bool { uncertaintyMs > 0 }

    public var gate: Int? {
        if case .gate(let number, _) = kind { return number }
        return nil
    }

    public var isFifty: Bool {
        if case .gate(_, let seconds) = kind { return seconds == 50 }
        return false
    }

    public var id: String {
        switch kind {
        case .start: "start"
        case .finish: "finish"
        case .gate(let number, _): "gate-\(number)"
        }
    }

    public var label: String {
        switch kind {
        case .start: "Départ"
        case .finish: "Arrivée"
        case .gate(let number, let seconds): "Porte \(number) · \(seconds)"
        }
    }
}

/// La descente d'un bateau réduite à ce qu'il faut pour la revoir.
public struct JudgeSequence: Sendable, Equatable {
    public let bib: Int
    public let marks: [JudgeMark]

    public var start: JudgeMark? { marks.first { $0.kind == .start } }
    public var finish: JudgeMark? { marks.first { $0.kind == .finish } }
    public var fifties: [JudgeMark] { marks.filter(\.isFifty) }

    /// La fenêtre à extraire ou à baliser, en heure de course.
    ///
    /// `nil` quand le départ n'est pas connu : sans borne basse il n'y a pas de
    /// fenêtre, et en inventer une enverrait le juge n'importe où.
    public func window(padSeconds: TimeInterval = 5) -> ClosedRange<Int>? {
        guard let start else { return nil }
        let pad = Int(padSeconds * 1000)
        // Pas d'arrivée (bateau encore sur l'eau, DNF) : on ouvre une fenêtre
        // d'une durée plausible de descente plutôt que rien.
        let end = finish?.clockMs ?? (start.clockMs + 180_000)
        return (start.clockMs - pad)...(end + pad)
    }
}

public enum JudgeMarks {
    /// De combien on remonte avant une pénalité entendue, en secondes.
    ///
    /// La trame `<penalty_add>` part quand le juge de porte appuie, pas quand
    /// le bateau passe : il y a le temps de voir, de décider et d'appuyer. On
    /// se pose donc **avant** le repère, et on laisse le geste venir à l'image.
    public static let defaultPrerollSeconds: TimeInterval = 6

    /// Les repères d'une descente, dans l'ordre chronologique.
    ///
    /// Les pénalités entendues en direct portent leur heure. Les autres — une
    /// course déjà courue, l'app ouverte trop tard — sont **placées** sur le
    /// parcours au prorata du numéro de porte, faute de mieux : c'est un point
    /// de départ pour scruter, pas une preuve.
    public static func sequence(for entry: CanoeEntry,
                                events: [CanoePenaltyEvent],
                                gateCount: Int) -> JudgeSequence {
        var marks: [JudgeMark] = []
        guard entry.startMs > 0 else { return JudgeSequence(bib: entry.bib, marks: []) }
        marks.append(JudgeMark(kind: .start, clockMs: entry.startMs))

        let heard = Dictionary(events.filter { $0.gate > 0 && $0.clockMs > 0 }
                                     .map { ($0.gate, $0.clockMs) },
                               uniquingKeysWith: { first, _ in first })

        // Durée à répartir : le chrono brut, sinon une descente type.
        let runMs = entry.finishMs.map { $0 - entry.startMs } ?? 180_000

        for penalty in entry.penalties {
            if let clockMs = heard[penalty.gate] {
                marks.append(JudgeMark(kind: .gate(penalty.gate, seconds: penalty.seconds),
                                       clockMs: clockMs))
            } else if gateCount > 0 {
                // Portes supposées régulièrement réparties, avec une marge de
                // part et d'autre : la porte 1 n'est pas sur la ligne de
                // départ, la dernière pas sur celle d'arrivée.
                let position = Double(penalty.gate) / Double(gateCount + 1)
                let clockMs = entry.startMs + Int(Double(runMs) * position)
                marks.append(JudgeMark(kind: .gate(penalty.gate, seconds: penalty.seconds),
                                       clockMs: clockMs,
                                       // Un sixième de la descente de part et
                                       // d'autre : large, parce qu'un parcours
                                       // n'a rien de régulier.
                                       uncertaintyMs: max(4000, runMs / 6)))
            }
        }

        if let finishMs = entry.finishMs {
            marks.append(JudgeMark(kind: .finish, clockMs: finishMs))
        }
        return JudgeSequence(bib: entry.bib, marks: marks.sorted { $0.clockMs < $1.clockMs })
    }
}
