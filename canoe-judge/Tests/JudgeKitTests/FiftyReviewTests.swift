import Testing
import Foundation
import CanoeLiveKit
@testable import JudgeKit

private func boat(bib: Int, name: String, start: Int, fifties: [Int] = [], touches: [Int] = []) -> CanoeEntry {
    var entry = CanoeEntry(bib: bib)
    entry.name = name
    entry.epreuve = "K1H"
    entry.startMs = start
    entry.chronoMs = 95_000
    entry.penalties = (fifties.map { CanoeGatePenalty(gate: $0, seconds: 50) }
                       + touches.map { CanoeGatePenalty(gate: $0, seconds: 2) })
        .sorted { $0.gate < $1.gate }
    return entry
}

/// Trois bateaux, quatre 50, un seul entendu en direct.
private func slalom(log: [CanoePenaltyEvent] = []) -> CanoeState {
    var state = CanoeState()
    state.gateCount = 18
    state.field = [boat(bib: 1, name: "CHEVALIER Arthur", start: 50_400_000, fifties: [7]),
                   boat(bib: 2, name: "RIVIERE Hugo", start: 50_490_000, touches: [4]),
                   boat(bib: 3, name: "VASSEUR Quentin", start: 50_580_000, fifties: [2, 15])]
    state.penaltyLog = log
    return state
}

private func heard(bib: Int, gate: Int, at clockMs: Int) -> CanoePenaltyEvent {
    CanoePenaltyEvent(bib: bib, gate: gate, seconds: 50, clockMs: clockMs, receivedAt: .now)
}

// MARK: - Ce qu'il y a à vérifier

@Test("Tous les 50 du classement sont à vérifier, entendus ou non")
func everyFiftyInTheRankingIsListed() {
    // Le journal est vide : l'app a été ouverte après le départ. Ces 50 se
    // contestent quand même, et une liste qui ne montrerait que ce qu'on a
    // entendu laisserait passer les plus anciens.
    let items = FiftyReview.toCheck(race: slalom(), checked: [])
    #expect(items.map(\.id) == [FiftyID(bib: 3, gate: 2), FiftyID(bib: 3, gate: 15),
                                FiftyID(bib: 1, gate: 7)])
    #expect(items.allSatisfy { !$0.isHeard })
    #expect(items.allSatisfy { $0.clockMs == nil })
}

@Test("Une touche à 2 n'est pas à vérifier")
func touchesAreNotListed() {
    let items = FiftyReview.toCheck(race: slalom(), checked: [])
    #expect(items.allSatisfy { $0.bib != 2 })
}

@Test("Un 50 entendu porte son heure, et passe devant")
func heardFiftyCarriesItsClock() {
    // Le 50 du bateau 1 est entendu à 14:00:30 — après le départ du 3, donc
    // il remonte en tête d'une liste triée par heure.
    let state = slalom(log: [heard(bib: 1, gate: 7, at: 50_610_000)])
    let items = FiftyReview.toCheck(race: state, checked: [])
    #expect(items.first?.id == FiftyID(bib: 1, gate: 7))
    #expect(items.first?.clockMs == 50_610_000)
    #expect(items.first?.isHeard == true)
    #expect(items.first?.label == "1 CHEVALIER Arthur")
}

@Test("Le même 50 entendu deux fois ne fait qu'une ligne")
func aFiftyHeardTwiceIsListedOnce() {
    // Entendu en direct, puis rechargé avec le classement : redemander au
    // juge ce qu'il vient de faire serait le meilleur moyen qu'il arrête de
    // cocher.
    let state = slalom(log: [heard(bib: 1, gate: 7, at: 50_610_000),
                             heard(bib: 1, gate: 7, at: 50_611_000)])
    let items = FiftyReview.toCheck(race: state, checked: [])
    #expect(items.filter { $0.id == FiftyID(bib: 1, gate: 7) }.count == 1)
    // La première trame fait foi : une retransmission ne déplace pas le geste.
    #expect(items.first?.clockMs == 50_610_000)
}

// MARK: - Valider

@Test("Valider un 50 le retire de la liste")
func validatingRemovesItFromTheList() {
    let checked: Set<FiftyID> = [FiftyID(bib: 3, gate: 2)]
    let items = FiftyReview.toCheck(race: slalom(), checked: checked)
    #expect(items.map(\.id) == [FiftyID(bib: 3, gate: 15), FiftyID(bib: 1, gate: 7)])
}

@Test("Valider une porte ne valide pas l'autre porte du même bateau")
func validatingOneGateLeavesTheOther() {
    // Le 3 a deux 50 : en avoir vu un ne dit rien de l'autre.
    let items = FiftyReview.toCheck(race: slalom(), checked: [FiftyID(bib: 3, gate: 2)])
    #expect(items.contains { $0.id == FiftyID(bib: 3, gate: 15) })
}

@Test("Tout valider vide la liste")
func validatingEverythingEmptiesTheList() {
    let all: Set<FiftyID> = [FiftyID(bib: 1, gate: 7),
                             FiftyID(bib: 3, gate: 2), FiftyID(bib: 3, gate: 15)]
    #expect(FiftyReview.toCheck(race: slalom(), checked: all).isEmpty)
}

// MARK: - Le filtre

@Test("« À vérifier » ne garde que les bateaux qui ont encore un 50 à voir")
func toCheckFilterKeepsWhatIsLeft() {
    let field = slalom().field
    #expect(FieldSearch.filter(field, filter: .toCheck).map(\.bib) == [3, 1])

    // Le 7 du bateau 1 est vu : il sort du filtre. Le 3 garde sa porte 15.
    let checked: Set<FiftyID> = [FiftyID(bib: 1, gate: 7), FiftyID(bib: 3, gate: 2)]
    #expect(FieldSearch.filter(field, filter: .toCheck, checked: checked).map(\.bib) == [3])

    let everything: Set<FiftyID> = checked.union([FiftyID(bib: 3, gate: 15)])
    #expect(FieldSearch.filter(field, filter: .toCheck, checked: everything).isEmpty)
}

@Test("Les autres filtres ignorent les coches")
func otherFiltersAreUnaffectedByChecking() {
    // « 50 seulement » reste la liste de tous les 50, vus ou non : c'est la
    // liste du classement, pas celle du travail qui reste.
    let field = slalom().field
    let everything: Set<FiftyID> = [FiftyID(bib: 1, gate: 7),
                                    FiftyID(bib: 3, gate: 2), FiftyID(bib: 3, gate: 15)]
    #expect(FieldSearch.filter(field, filter: .fifty, checked: everything).map(\.bib) == [3, 1])
    #expect(FieldSearch.filter(field, filter: .all, checked: everything).count == 3)
}
