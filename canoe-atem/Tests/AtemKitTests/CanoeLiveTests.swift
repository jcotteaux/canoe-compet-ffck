import Testing
import Foundation
@testable import CanoeLiveKit

@Test("Une table competFFCK se lit par nom de colonne")
func tableReadsByColumnName() throws {
    let json: [String: Any] = [
        "name": "ranking",
        "columns": [["Dossard"], ["Bateau"], ["Tps1_1"]],
        "rows": [[4, "MARTIN Léa", 93_461], [7, "DUPONT Paul", -500]],
    ]
    let table = try #require(AdvTable(json: json))

    #expect(table.rowCount == 2)
    #expect(table.string("Bateau", row: 0) == "MARTIN Léa")
    #expect(table.int("Tps1_1", row: 0) == 93_461)
    #expect(table.rowIndex(where: "Dossard", equals: 7) == 1)
}

@Test("Les noms de colonne slalom et descente sont acceptés indifféremment")
func columnLookupAcceptsBothSpellings() throws {
    // En slalom competFFCK envoie `@TIME_1_1_1`, en descente `Tps1_1`.
    let json: [String: Any] = [
        "name": "ranking",
        "columns": [["Dossard"], ["@TIME_1_1_1"]],
        "rows": [[4, 93_461]],
    ]
    let table = try #require(AdvTable(json: json))

    #expect(table.index(ofAny: ["Tps1_1", "@TIME_1_1_1"]) == 1)
    #expect(table.value(anyOf: ["Tps1_1", "@TIME_1_1_1"], row: 0).intValue == 93_461)
    #expect(table.index(ofAny: ["Tps1_1"]) == nil)
}

@Test("Une colonne absente ne fait pas tomber la lecture")
func missingColumnIsHarmless() throws {
    let table = try #require(AdvTable(json: ["name": "t", "columns": [["Dossard"]], "rows": [[4]]]))
    #expect(table.string("Bateau", row: 0) == "")
    #expect(table.int("Tps1_1", row: 99) == nil)
}

@Test("Une trame range ses tables au premier niveau ou sous `tables`")
func frameFindsTablesAtBothLevels() throws {
    let payload: [String: Any] = [
        "key": "<race_load>",
        "clock": 50_400_000,
        "ranking<sqlTable>": ["name": "ranking", "columns": [["Dossard"]], "rows": [[1]]],
        "tables": ["Competition<sqlTable>": ["name": "Competition", "columns": [["Nom"]], "rows": [["Coupe de France"]]]],
    ]
    let data = try JSONSerialization.data(withJSONObject: payload)
    let frame = try #require(AdvFrame(data: data))

    #expect(frame.key == "<race_load>")
    #expect(frame.int("clock") == 50_400_000)
    #expect(frame.table("ranking")?.rowCount == 1)
    #expect(frame.nestedTable("Competition")?.string("Nom", row: 0) == "Coupe de France")
}

@Test("Les chronos se lisent au centième, les statuts par leur nom")
func chronoFormatting() {
    #expect(Chrono.format(93_461) == "1:33.46")
    #expect(Chrono.format(23_450) == "23.45")
    #expect(Chrono.format(Chrono.dnf) == "DNF")
    #expect(Chrono.format(Chrono.dsq) == "DSQ")
    #expect(Chrono.isTime(Chrono.dnf) == false)
}

@Test("Le compte à rebours distingue un départ à venir d'un départ manqué")
func countdownFormatting() {
    #expect(Chrono.formatCountdown(47_000) == "0:47")
    #expect(Chrono.formatCountdown(-12_000) == "+0:12")
    #expect(Chrono.formatClock(50_400_000) == "14:00:00")
}
