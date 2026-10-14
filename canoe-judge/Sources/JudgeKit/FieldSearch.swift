import Foundation
import CanoeLiveKit

/// Ce qu'on garde du plateau.
public enum FieldFilter: String, CaseIterable, Sendable, Identifiable {
    case all
    /// Les bateaux dont au moins un 50 n'a pas encore été regardé.
    case toCheck
    case penalised
    case fifty

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .all: "Tous"
        case .toCheck: "À vérifier"
        case .penalised: "Pénalisés"
        case .fifty: "50 seulement"
        }
    }

    func keeps(_ entry: CanoeEntry, checked: Set<FiftyID>) -> Bool {
        switch self {
        case .all: true
        case .toCheck:
            entry.fifties.contains { !checked.contains(FiftyID(bib: entry.bib, gate: $0.gate)) }
        case .penalised: !entry.penalties.isEmpty
        case .fifty: entry.hasFifty
        }
    }
}

/// Dans quel ordre se lit le plateau.
public enum FieldOrder: String, CaseIterable, Sendable, Identifiable {
    /// Dernier parti en tête : on est appelé sur la descente qui vient
    /// d'avoir lieu, pas sur la première de la journée.
    case recent
    case bib
    case rank

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .recent: "Derniers partis"
        case .bib: "Dossard"
        case .rank: "Classement"
        }
    }
}

public enum FieldSearch {
    /// Recherche par dossard ou par nom.
    ///
    /// Un juge tape ce qu'on lui dit à la radio : « le 12 », « Martin ». Les
    /// deux doivent marcher dans le même champ, sans accent ni casse — on ne
    /// tape pas « Ríos » à la main pendant qu'un bateau attend.
    /// - Parameter checked: les 50 déjà vérifiés, dont le filtre « À vérifier »
    ///   a besoin pour savoir ce qu'il reste.
    public static func filter(_ entries: [CanoeEntry],
                              query: String = "",
                              filter: FieldFilter = .all,
                              order: FieldOrder = .recent,
                              checked: Set<FiftyID> = []) -> [CanoeEntry] {
        let needle = fold(query)
        let kept = entries.filter { entry in
            filter.keeps(entry, checked: checked) && (needle.isEmpty || matches(entry, needle: needle))
        }
        return sort(kept, by: order)
    }

    static func matches(_ entry: CanoeEntry, needle: String) -> Bool {
        // Un nombre se cherche comme un dossard : « 12 » ne doit pas ramener
        // tous les 120 et 212 du plateau avant le 12 lui-même.
        if let number = Int(needle) { return entry.bib == number }
        return fold(entry.name).contains(needle)
            || fold(entry.club).contains(needle)
            || fold(entry.epreuve).contains(needle)
            || fold(entry.nation).contains(needle)
    }

    static func sort(_ entries: [CanoeEntry], by order: FieldOrder) -> [CanoeEntry] {
        switch order {
        case .bib:
            entries.sorted { $0.bib < $1.bib }
        case .rank:
            // Les non-classés (rang 0) en queue plutôt qu'en tête.
            entries.sorted { ($0.rank == 0 ? Int.max : $0.rank, $0.bib) < ($1.rank == 0 ? Int.max : $1.rank, $1.bib) }
        case .recent:
            entries.sorted { ($0.startMs, $0.bib) > ($1.startMs, $1.bib) }
        }
    }

    /// Sans accent, sans casse, sans espaces aux bouts.
    static func fold(_ text: String) -> String {
        text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            .trimmingCharacters(in: .whitespaces)
    }
}
