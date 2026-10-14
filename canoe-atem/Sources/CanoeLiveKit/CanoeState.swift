import Foundation

/// Les chronos competFFCK sont en millisecondes ; toute valeur inférieure à 1
/// est un statut, pas une durée (`adv.chrono`).
public enum Chrono: Sendable {
    public static let ko = -1, auto = -99, dnf = -500, dns = -600, des = -700, dsq = -800

    public static func isTime(_ ms: Int) -> Bool { ms >= 1 }

    public static func status(_ ms: Int) -> String? {
        switch ms {
        case dsq: "DSQ"
        case dnf: "DNF"
        case dns: "DNS"
        case des: "DES"
        case auto: "AUTO"
        case ko: "KO"
        case ..<1: "—"
        default: nil
        }
    }

    /// `1:23.45`, ou `23.45` sous la minute — la convention des affichages de
    /// course, au centième.
    public static func format(_ ms: Int) -> String {
        if let status = status(ms) { return status }
        let minutes = ms / 60_000
        let seconds = (ms % 60_000) / 1000
        let hundredths = (ms % 1000) / 10
        return minutes > 0
            ? String(format: "%d:%02d.%02d", minutes, seconds, hundredths)
            : String(format: "%d.%02d", seconds, hundredths)
    }

    /// Heure du jour, à partir de millisecondes depuis minuit.
    public static func formatClock(_ ms: Int) -> String {
        let total = max(0, ms) / 1000
        return String(format: "%02d:%02d:%02d", total / 3600, (total / 60) % 60, total % 60)
    }

    /// Temps restant avant un départ. Un départ déjà passé sans que le bateau
    /// soit parti est préfixé `+` : c'est une anomalie que la régie doit voir,
    /// pas un compte à rebours ordinaire.
    public static func formatCountdown(_ ms: Int) -> String {
        let total = abs(ms) / 1000
        return String(format: "%@%d:%02d", ms < 0 ? "+" : "", total / 60, total % 60)
    }
}

public struct CanoeBoat: Identifiable, Sendable, Equatable {
    public let bib: Int
    public var name: String
    public var club: String
    public var epreuve: String
    /// Chrono tournant, brut (les pénalités ne sont pas comprises).
    public var elapsedMs: Int
    /// Cumul de pénalités en secondes ; 0 hors slalom.
    public var penaltySeconds: Int

    public var id: Int { bib }
}

public struct CanoeStarter: Identifiable, Sendable, Equatable {
    public let bib: Int
    public var name: String
    public var club: String
    public var epreuve: String
    /// Heure de départ, en millisecondes depuis minuit.
    public var startMs: Int

    public var id: Int { bib }

    public func remainingMs(clockMs: Int) -> Int { startMs - clockMs }
}

/// Ce que l'app retient de la compétition en cours.
public struct CanoeState: Sendable, Equatable {
    public var competition = ""
    public var place = ""
    public var raceLabel = ""
    /// `SLA` (slalom) ou `DES` (descente).
    public var activity = ""
    /// Horloge de course, en millisecondes depuis minuit.
    public var clockMs = 0
    /// Nombre de portes ; 0 hors slalom, ce qui sert aussi de test d'activité.
    public var gateCount = 0
    public var onCourse: [CanoeBoat] = []
    public var nextStarters: [CanoeStarter] = []
    /// Tout le plateau, dans l'ordre où competFFCK envoie le classement.
    /// Vide pour les pages qui n'en ont pas l'usage — le remplir ne coûte
    /// qu'une lecture de plus de la table déjà reçue.
    public var field: [CanoeEntry] = []
    /// Les pénalités entendues depuis l'ouverture de la liaison, dans l'ordre
    /// d'arrivée. Survit aux reconnexions : une coupure Wi-Fi ne doit pas
    /// effacer des repères qu'on ne peut pas reconstituer.
    public var penaltyLog: [CanoePenaltyEvent] = []

    public init() {}

    public var isSlalom: Bool { gateCount > 0 }

    public func entry(bib: Int) -> CanoeEntry? {
        field.first { $0.bib == bib }
    }

    /// Les pénalités journalisées d'un bateau, dans l'ordre du parcours.
    public func penaltyEvents(bib: Int) -> [CanoePenaltyEvent] {
        penaltyLog.filter { $0.bib == bib }.sorted { $0.clockMs < $1.clockMs }
    }

    public var headline: String {
        [competition, raceLabel].filter { !$0.isEmpty }.joined(separator: " — ")
    }
}
