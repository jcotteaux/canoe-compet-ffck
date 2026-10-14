import Testing
import Foundation
@testable import CanoeLiveKit

/// Rejoue une séquence de trames dans le client, sans WebSocket.
private func replay(_ frames: [[String: Any]]) async throws -> CanoeState {
    let client = CompetFFCKClient(host: "127.0.0.1")
    for payload in frames {
        let data = try JSONSerialization.data(withJSONObject: payload)
        await client.apply(try #require(AdvFrame(data: data)))
    }
    return await client.currentState
}

/// Un classement slalom à 4 portes, orthographe competFFCK brute (`@…`).
private func slalomRanking() -> [String: Any] {
    [
        "name": "ranking",
        "columns": [["Dossard"], ["Bateau"], ["Club"], ["Code_categorie"],
                    ["@START_TIME_1_1_1"], ["@CHRONO_1_1_1"], ["@TIME_1_1_1"], ["@RK_1_1_1"],
                    ["@PENA_1_1"], ["@PENA_2_1"], ["@PENA_3_1"], ["@PENA_4_1"]],
        "rows": [
            // 12 : un 50 à la porte 3 et une touche à la porte 1.
            [12, "MARTIN Léa", "CK Pau", "K1D", 50_400_000, 93_461, 145_461, 2, "2", "0", "50", ""],
            // 7 : descente propre.
            [7, "DUPONT Paul", "ACC Toulouse", "K1H", 50_460_000, 91_200, 91_200, 1, "0", "", "", ""],
            // 9 : parti, pas encore arrivé — colonnes de résultat vides.
            [9, "BERNARD Théo", "CK Pau", "K1H", 50_520_000, 0, 0, 0, "", "", "", ""],
        ],
    ]
}

private func raceLoad() -> [String: Any] {
    [
    "key": "<race_load>", "Code_course": 1, "Code_phase": 1, "clock": 50_500_000,
    "tables": ["Competition<sqlTable>": ["name": "Competition",
                                         "columns": [["Nom"], ["Code_activite"]],
                                         "rows": [["Coupe de France", "SLA"]]]],
    ]
}

@Test("Le plateau porte tout le monde, arrivés comme partants")
func fieldCoversEveryone() async throws {
    let state = try await replay([
        raceLoad(),
        ["key": "<epreuve_load>", "Nb_porte": 4, "ranking<sqlTable>": slalomRanking()],
    ])

    #expect(state.field.count == 3)
    let lea = try #require(state.entry(bib: 12))
    #expect(lea.name == "MARTIN Léa")
    #expect(lea.epreuve == "K1D")
    #expect(lea.rank == 2)
    #expect(lea.hasRun)
    // `<on_course>` n'a jamais été reçu : le plateau ne dépend pas de lui.
    #expect(state.onCourse.isEmpty)
}

@Test("Seules les portes pénalisées sont retenues, et le 50 se distingue")
func onlyPenalisedGatesAreKept() async throws {
    let state = try await replay([
        raceLoad(),
        ["key": "<epreuve_load>", "Nb_porte": 4, "ranking<sqlTable>": slalomRanking()],
    ])

    let lea = try #require(state.entry(bib: 12))
    #expect(lea.penalties.map(\.gate) == [1, 3])
    #expect(lea.penaltySeconds == 52)
    #expect(lea.fifties.map(\.gate) == [3])
    #expect(lea.hasFifty)

    let paul = try #require(state.entry(bib: 7))
    #expect(paul.penalties.isEmpty)
    #expect(paul.hasFifty == false)
}

@Test("L'heure d'arrivée se déduit du départ et du chrono brut")
func finishTimeComesFromStartPlusChrono() async throws {
    let state = try await replay([
        raceLoad(),
        ["key": "<epreuve_load>", "Nb_porte": 4, "ranking<sqlTable>": slalomRanking()],
    ])

    let lea = try #require(state.entry(bib: 12))
    // 14:00:00 + 1:33.461. Le chrono *brut* : les 52 s de pénalité n'ont pas
    // été passées sur l'eau, les ajouter décalerait la vidéo d'autant.
    #expect(lea.finishMs == 50_493_461)
    #expect(Chrono.formatClock(lea.startMs) == "14:00:00")

    // Parti sans chrono : pas de borne haute plutôt qu'une borne fausse.
    #expect(try #require(state.entry(bib: 9)).finishMs == nil)
}

@Test("Une pénalité entendue en direct est horodatée et rejoint le plateau")
func livePenaltyIsJournalledAndMerged() async throws {
    let state = try await replay([
        raceLoad(),
        ["key": "<epreuve_load>", "Nb_porte": 4, "ranking<sqlTable>": slalomRanking()],
        ["key": "<on_course>", "clock": 50_530_000,
         "table<sqlTable>": ["name": "t", "columns": [["bib"], ["time"]], "rows": [[9, 10_000]]]],
        ["key": "<penalty_add>", "bib": 9, "gate": 2, "penalty": "50"],
    ])

    let event = try #require(state.penaltyEvents(bib: 9).first)
    #expect(event.gate == 2)
    #expect(event.isFifty)
    // L'horloge de course au moment de la trame : c'est elle qui donnera
    // l'image. Le classement, lui, ne dira jamais quand.
    #expect(event.clockMs == 50_530_000)

    let theo = try #require(state.entry(bib: 9))
    #expect(theo.penalties.map(\.gate) == [2])
    #expect(theo.penalties[0].isLive, "la porte n'est pas encore dans le classement")
}

@Test("Le classement rechargé fait foi sur ce qu'il connaît")
func reloadedRankingWins() async throws {
    var ranking = slalomRanking()
    // Le classement finit par porter la porte 2 du dossard 9.
    ranking["rows"] = [[9, "BERNARD Théo", "CK Pau", "K1H", 50_520_000, 88_000, 138_000, 3,
                        "", "50", "", ""]]
    let state = try await replay([
        raceLoad(),
        ["key": "<epreuve_load>", "Nb_porte": 4, "ranking<sqlTable>": slalomRanking()],
        ["key": "<penalty_add>", "bib": 9, "gate": 2, "penalty": "50"],
        ["key": "<epreuve_load>", "Nb_porte": 4, "ranking<sqlTable>": ranking],
    ])

    let theo = try #require(state.entry(bib: 9))
    #expect(theo.penalties.map(\.gate) == [2])
    #expect(theo.penalties[0].isLive == false)
    // Le journal, lui, garde l'heure : c'est tout son intérêt.
    #expect(state.penaltyEvents(bib: 9).count == 1)
}

@Test("Une manche effacée emporte son journal")
func runEraseClearsTheJournal() async throws {
    let state = try await replay([
        raceLoad(),
        ["key": "<epreuve_load>", "Nb_porte": 4, "ranking<sqlTable>": slalomRanking()],
        ["key": "<penalty_add>", "bib": 12, "gate": 3, "penalty": "50"],
        ["key": "<run_erase>", "Code_competition": 1, "Code_course": 1, "Code_phase": 1],
    ])

    #expect(state.penaltyLog.isEmpty)
}
