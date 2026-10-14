import Foundation
import CanoeLiveKit

/// Un 50, désigné par le bateau et la porte.
///
/// Pas par l'événement du journal : le même 50 arrive souvent deux fois —
/// entendu en direct, puis rechargé avec le classement — et une liste de
/// vérification qui les compterait séparément redemanderait au juge ce qu'il
/// vient de faire.
public struct FiftyID: Hashable, Sendable {
    public let bib: Int
    public let gate: Int

    public init(bib: Int, gate: Int) {
        self.bib = bib
        self.gate = gate
    }

    /// Forme courte pour ranger la marque de vérification sur le disque.
    public var token: String { "\(bib)-\(gate)" }

    public init?(token: String) {
        let parts = token.split(separator: "-")
        guard parts.count == 2, let bib = Int(parts[0]), let gate = Int(parts[1]) else { return nil }
        self.init(bib: bib, gate: gate)
    }
}

/// Un 50 qui attend d'être regardé.
public struct FiftyToCheck: Identifiable, Sendable, Equatable {
    public let id: FiftyID
    /// `12 MARTIN Léa`.
    public let label: String
    public let epreuve: String
    /// Heure entendue, quand le journal la porte. `nil` veut dire que l'app
    /// n'écoutait pas à ce moment-là : il faudra chercher à partir du départ,
    /// et la liste doit le dire plutôt que d'afficher une heure inventée.
    public let clockMs: Int?
    /// Ce sur quoi la liste se trie : l'heure entendue, sinon le départ.
    let sortMs: Int

    public var bib: Int { id.bib }
    public var gate: Int { id.gate }
    public var isHeard: Bool { clockMs != nil }
}

public enum FiftyReview {

    /// Les 50 qui restent à vérifier, le plus récent d'abord.
    ///
    /// La source est le **classement**, pas le journal. Un 50 tombé avant
    /// l'ouverture de l'app n'a pas d'heure, mais il se conteste comme les
    /// autres : une liste qui ne montrerait que ce qu'on a entendu laisserait
    /// passer précisément ceux qu'on n'a pas vus.
    public static func toCheck(race: CanoeState, checked: Set<FiftyID>) -> [FiftyToCheck] {
        var heard: [FiftyID: Int] = [:]
        for event in race.penaltyLog where event.isFifty && event.clockMs > 0 {
            let id = FiftyID(bib: event.bib, gate: event.gate)
            // La première trame fait foi, comme pour les repères : une
            // retransmission tardive ne déplace pas le geste.
            if heard[id] == nil { heard[id] = event.clockMs }
        }

        var items: [FiftyToCheck] = []
        for entry in race.field {
            for penalty in entry.fifties {
                let id = FiftyID(bib: entry.bib, gate: penalty.gate)
                guard !checked.contains(id) else { continue }
                let clockMs = heard[id]
                items.append(FiftyToCheck(id: id,
                                          label: entry.label,
                                          epreuve: entry.epreuve,
                                          clockMs: clockMs,
                                          sortMs: clockMs ?? entry.startMs))
            }
        }

        // Le plus récent d'abord : c'est celui qu'on va nous réclamer. À heure
        // égale — deux 50 du même bateau sans heure entendue — l'ordre du
        // parcours, parce qu'on les regarde dans cet ordre-là.
        return items.sorted {
            if $0.sortMs != $1.sortMs { return $0.sortMs > $1.sortMs }
            if $0.bib != $1.bib { return $0.bib < $1.bib }
            return $0.gate < $1.gate
        }
    }
}
