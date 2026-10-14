import Foundation

/// Une porte pénalisée.
///
/// competFFCK ne connaît que deux valeurs : **2** pour une touche, **50** pour
/// une porte manquée ou franchie à l'envers. C'est la seconde qui se conteste,
/// parce qu'elle ne coûte pas un rang mais la course.
public struct CanoeGatePenalty: Sendable, Equatable, Identifiable {
    public let gate: Int
    public let seconds: Int
    /// Vraie si la pénalité vient d'être entendue en direct et n'est pas
    /// encore dans le classement rechargé.
    public var isLive: Bool

    public init(gate: Int, seconds: Int, isLive: Bool = false) {
        self.gate = gate
        self.seconds = seconds
        self.isLive = isLive
    }

    public var id: Int { gate }
    public var isFifty: Bool { seconds == 50 }
}

/// Une ligne du plateau : tout ce que le classement dit d'un bateau.
///
/// `CanoeBoat` ne décrit qu'un bateau **sur l'eau** et ne vit que le temps de
/// sa descente. Pour juger, il faut au contraire pouvoir revenir sur n'importe
/// qui, longtemps après son arrivée.
public struct CanoeEntry: Identifiable, Sendable, Equatable {
    public let bib: Int
    public var name = ""
    public var club = ""
    public var nation = ""
    public var epreuve = ""
    /// Heure de départ, en millisecondes depuis minuit ; 0 si le classement ne
    /// la porte pas encore.
    public var startMs = 0
    /// Chrono brut, pénalités non comprises. Une valeur `< 1` est un statut.
    public var chronoMs = 0
    /// Temps classant, pénalités comprises.
    public var totalMs = 0
    /// Classement competFFCK ; 0 tant que le bateau n'est pas classé.
    public var rank = 0
    /// Les portes pénalisées **seulement**, dans l'ordre du parcours. Une porte
    /// jugée à 0 n'y figure pas : on veut la liste de ce qui s'est passé, pas
    /// celle des portes.
    public var penalties: [CanoeGatePenalty] = []

    public init(bib: Int) { self.bib = bib }

    public var id: Int { bib }

    public var penaltySeconds: Int { penalties.reduce(0) { $0 + $1.seconds } }
    public var fifties: [CanoeGatePenalty] { penalties.filter(\.isFifty) }
    public var hasFifty: Bool { penalties.contains(where: \.isFifty) }

    /// Le bateau a un chrono exploitable — donc quelque chose à revoir.
    public var hasRun: Bool { Chrono.isTime(chronoMs) }

    /// `DNF`, `DSQ`… ; `nil` tant que le bateau n'a pas couru, où competFFCK
    /// laisse la colonne vide plutôt que d'y mettre un statut.
    public var statusLabel: String? {
        chronoMs == 0 ? nil : Chrono.status(chronoMs)
    }

    /// Heure d'arrivée, en millisecondes depuis minuit.
    ///
    /// `nil` sans chrono valide ou sans heure de départ : c'est la borne haute
    /// de la fenêtre vidéo, et une borne fausse enverrait le juge à côté.
    public var finishMs: Int? {
        guard startMs > 0, Chrono.isTime(chronoMs) else { return nil }
        return startMs + chronoMs
    }

    /// Libellé d'affichage : `12 MARTIN Léa`.
    public var label: String {
        name.isEmpty ? "Dossard \(bib)" : "\(bib) \(name)"
    }
}

/// Une pénalité telle qu'elle est tombée, avec l'heure qu'il était.
///
/// Le classement dit **quelle** porte est pénalisée, jamais **quand**. Or c'est
/// l'heure qui permet d'aller droit sur l'image du geste contesté. Elle ne
/// s'obtient qu'en écoutant la course en direct, et se perd définitivement si
/// personne n'écoute : d'où ce journal, tenu dès l'ouverture de la liaison.
public struct CanoePenaltyEvent: Sendable, Equatable, Identifiable {
    public let bib: Int
    public let gate: Int
    public let seconds: Int
    /// Horloge de course au moment de la trame, en millisecondes depuis minuit.
    public let clockMs: Int
    /// Heure locale de réception, pour recaler le journal si l'horloge de
    /// course est absente ou fausse.
    public let receivedAt: Date

    public init(bib: Int, gate: Int, seconds: Int, clockMs: Int, receivedAt: Date) {
        self.bib = bib
        self.gate = gate
        self.seconds = seconds
        self.clockMs = clockMs
        self.receivedAt = receivedAt
    }

    public var id: String { "\(bib)-\(gate)-\(clockMs)" }
    public var isFifty: Bool { seconds == 50 }
}
