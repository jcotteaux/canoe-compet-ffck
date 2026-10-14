import Testing
import Foundation
import CanoeLiveKit
@testable import JudgeKit

/// Départ 14:00:00, arrivée 14:01:30, un 50 entendu à 14:00:18 et une touche
/// déduite à la porte 14.
private func descent() -> (CanoeEntry, JudgeSequence) {
    var entry = CanoeEntry(bib: 12)
    entry.name = "MARTIN Léa"
    entry.epreuve = "K1D"
    entry.startMs = 50_400_000
    entry.chronoMs = 90_000
    entry.penalties = [CanoeGatePenalty(gate: 3, seconds: 50),
                       CanoeGatePenalty(gate: 14, seconds: 2)]
    let heard = [CanoePenaltyEvent(bib: 12, gate: 3, seconds: 50,
                                   clockMs: 50_418_000, receivedAt: .now)]
    return (entry, JudgeMarks.sequence(for: entry, events: heard, gateCount: 18))
}

@Test("Le chrono part du départ, pas du début du clip")
func chronoCountsFromTheStart() {
    let (entry, sequence) = descent()
    let board = try! #require(ScoreBoard.make(entry: entry, sequence: sequence))
    #expect(board.elapsedMs(atClock: 50_400_000) == 0)
    #expect(board.elapsedMs(atClock: 50_418_400) == 18_400)
}

@Test("Avant le départ le chrono est négatif, pas à zéro")
func chronoIsNegativeBeforeTheStart() {
    // La fenêtre s'ouvre cinq secondes avant : un chrono figé à 0:00 ferait
    // lire « la descente a commencé » sur une image où le bateau attend.
    let (entry, sequence) = descent()
    let board = try! #require(ScoreBoard.make(entry: entry, sequence: sequence))
    #expect(board.elapsedMs(atClock: 50_395_000) == -5_000)
    #expect(ScoreBoard.formatElapsed(-5_000) == "−0:05.0")
}

@Test("Après la ligne le chrono se fige")
func chronoFreezesAtTheFinish() {
    // Le clip déborde de cinq secondes sur l'arrivée : le chrono ne doit pas
    // continuer à courir, ce serait un temps faux sur un clip de litige.
    let (entry, sequence) = descent()
    let board = try! #require(ScoreBoard.make(entry: entry, sequence: sequence))
    #expect(board.elapsedMs(atClock: 50_490_000) == 90_000)
    #expect(board.elapsedMs(atClock: 50_495_000) == 90_000)
}

@Test("Les pénalités s'allument au passage, pas avant")
func penaltiesAppearWhenPassed() {
    let (entry, sequence) = descent()
    let board = try! #require(ScoreBoard.make(entry: entry, sequence: sequence))

    // Au départ : rien. Raconter la fin de la descente pendant qu'on regarde
    // le début enlèverait tout intérêt au visionnage.
    #expect(board.passed(atClock: 50_400_000).isEmpty)
    #expect(board.penaltySeconds(atClock: 50_400_000) == 0)

    // Après le 50 entendu : lui seul.
    #expect(board.passed(atClock: 50_420_000).map(\.gate) == [3])
    #expect(board.penaltySeconds(atClock: 50_420_000) == 50)

    // À l'arrivée : les deux, dans l'ordre du parcours.
    let all = board.passed(atClock: 50_490_000)
    #expect(all.map(\.gate) == [3, 14])
    #expect(board.penaltySeconds(atClock: 50_490_000) == 52)
}

@Test("Une pénalité déduite le dit sur sa pastille")
func estimatedPenaltiesSaySo() {
    let (entry, sequence) = descent()
    let board = try! #require(ScoreBoard.make(entry: entry, sequence: sequence))
    let heard = try! #require(board.marks.first { $0.gate == 3 })
    let guessed = try! #require(board.marks.first { $0.gate == 14 })
    #expect(heard.isEstimated == false)
    #expect(heard.label == "p3 · 50")
    #expect(guessed.isEstimated)
    #expect(guessed.label == "p14 · 2 ?")
}

@Test("Sans heure de départ il n'y a pas d'ardoise")
func noStartMeansNoBoard() {
    var entry = CanoeEntry(bib: 9)
    entry.startMs = 0
    let sequence = JudgeMarks.sequence(for: entry, events: [], gateCount: 18)
    #expect(ScoreBoard.make(entry: entry, sequence: sequence) == nil)
}

@Test("Le chrono gravé se lit sans dixièmes")
func burnedChronoHasNoTenths() {
    // Il n'est réécrit qu'une fois par seconde : un dixième immobile pendant
    // dix images serait un mensonge de précision.
    #expect(ScoreBoard.formatElapsed(83_400, tenths: false) == "1:23")
    #expect(ScoreBoard.formatElapsed(83_400) == "1:23.4")
    #expect(ScoreBoard.formatElapsed(-4_200, tenths: false) == "−0:04")
}
