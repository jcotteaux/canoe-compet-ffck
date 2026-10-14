import Testing
import Foundation
import CanoeLiveKit
@testable import JudgeKit

// MARK: - Calage des horloges

@Test("Une heure de course se convertit en position dans la vidéo, et retour")
func clockMapsToVideoTime() {
    // L'enregistrement a commencé à 13:47:31, le bateau part à 14:00:00.
    let alignment = ClockAlignment(recordingStartMs: 49_651_000)
    #expect(alignment.videoTime(atClock: 50_400_000) == 749)
    #expect(alignment.clock(atVideoTime: 749) == 50_400_000)
    // Avant le début de l'enregistrement : négatif, pas zéro. Rogner ici
    // masquerait une caméra allumée trop tard.
    #expect(alignment.videoTime(atClock: 49_000_000) < 0)
}

@Test("Le décalage se règle en désignant une image plutôt qu'en calculant")
func alignmentFromAKnownFrame() {
    var alignment = ClockAlignment(recordingStartMs: 49_651_000)
    // Le juge voit le départ du bateau à 752 s de vidéo, alors que le
    // chronométrage l'annonce à 14:00:00 : l'enregistreur avance de 3 s.
    alignment.align(videoTime: 752, toClock: 50_400_000)
    #expect(alignment.offsetMs == 3000)
    #expect(alignment.videoTime(atClock: 50_400_000) == 752)
    #expect(alignment.offsetLabel == "+3,00 s" || alignment.offsetLabel == "+3.00 s")
}

@Test("L'heure du jour se compte en millisecondes depuis minuit")
func timeOfDayCounting() {
    var components = DateComponents()
    components.year = 2026; components.month = 9; components.day = 20
    components.hour = 14; components.minute = 0; components.second = 0
    let date = Calendar.current.date(from: components)!
    #expect(timeOfDayMs(date) == 50_400_000)
}

// MARK: - Repères

private func entry(bib: Int, start: Int, chrono: Int, penalties: [(Int, Int)]) -> CanoeEntry {
    var entry = CanoeEntry(bib: bib)
    entry.name = "MARTIN Léa"
    entry.epreuve = "K1D"
    entry.startMs = start
    entry.chronoMs = chrono
    entry.totalMs = chrono + penalties.reduce(0) { $0 + $1.1 } * 1000
    entry.penalties = penalties.map { CanoeGatePenalty(gate: $0.0, seconds: $0.1) }
    return entry
}

@Test("Une pénalité entendue porte son heure ; les autres sont placées, et le disent")
func heardPenaltiesBeatEstimatedOnes() {
    let boat = entry(bib: 12, start: 50_400_000, chrono: 90_000, penalties: [(3, 50), (14, 2)])
    let heard = [CanoePenaltyEvent(bib: 12, gate: 3, seconds: 50,
                                   clockMs: 50_418_400, receivedAt: .now)]
    let sequence = JudgeMarks.sequence(for: boat, events: heard, gateCount: 18)

    let gate3 = try! #require(sequence.marks.first { $0.gate == 3 })
    #expect(gate3.clockMs == 50_418_400)
    #expect(gate3.isEstimated == false)
    #expect(gate3.isFifty)

    // Porte 14 sur 18 : placée aux 14/19 de la descente, et signalée comme
    // telle. 50_400_000 + 90_000 × 14/19 = 50_466_315.
    let gate14 = try! #require(sequence.marks.first { $0.gate == 14 })
    #expect(gate14.clockMs == 50_466_315)
    #expect(gate14.isEstimated)
    #expect(gate14.uncertaintyMs == 15_000)
}

@Test("Les repères sortent dans l'ordre de la descente")
func marksAreChronological() {
    let boat = entry(bib: 12, start: 50_400_000, chrono: 90_000, penalties: [(14, 2), (3, 50)])
    let sequence = JudgeMarks.sequence(for: boat, events: [], gateCount: 18)

    #expect(sequence.marks.map(\.id) == ["start", "gate-3", "gate-14", "finish"])
    #expect(sequence.marks.map(\.clockMs).sorted() == sequence.marks.map(\.clockMs))
    #expect(sequence.finish?.clockMs == 50_490_000)
    #expect(sequence.fifties.map(\.gate) == [3])
}

@Test("La fenêtre déborde de part et d'autre de la descente")
func windowPadsBothEnds() {
    let boat = entry(bib: 12, start: 50_400_000, chrono: 90_000, penalties: [])
    let sequence = JudgeMarks.sequence(for: boat, events: [], gateCount: 18)
    let window = try! #require(sequence.window(padSeconds: 5))
    #expect(window == 50_395_000...50_495_000)
}

@Test("Sans heure de départ il n'y a pas de repère, plutôt qu'un repère faux")
func noStartMeansNoMarks() {
    let boat = entry(bib: 12, start: 0, chrono: 90_000, penalties: [(3, 50)])
    let sequence = JudgeMarks.sequence(for: boat, events: [], gateCount: 18)
    #expect(sequence.marks.isEmpty)
    #expect(sequence.window() == nil)
}

@Test("Un bateau encore sur l'eau garde une fenêtre ouverte sur une durée plausible")
func boatStillOnTheWaterKeepsAWindow() {
    let boat = entry(bib: 9, start: 50_400_000, chrono: 0, penalties: [])
    let sequence = JudgeMarks.sequence(for: boat, events: [], gateCount: 18)
    #expect(sequence.finish == nil)
    #expect(try! #require(sequence.window(padSeconds: 0)) == 50_400_000...50_580_000)
}

// MARK: - Recherche

private func field() -> [CanoeEntry] {
    var lea = CanoeEntry(bib: 12)
    lea.name = "MARTIN Léa"; lea.club = "CK Pau"; lea.epreuve = "K1D"
    lea.startMs = 50_400_000; lea.chronoMs = 93_461; lea.rank = 2
    lea.penalties = [CanoeGatePenalty(gate: 3, seconds: 50)]

    var paul = CanoeEntry(bib: 7)
    paul.name = "DUPONT Paul"; paul.club = "ACC Toulouse"; paul.epreuve = "K1H"
    paul.startMs = 50_460_000; paul.chronoMs = 91_200; paul.rank = 1

    var theo = CanoeEntry(bib: 120)
    theo.name = "BERNARD Théo"; theo.club = "CK Pau"; theo.epreuve = "K1H"
    theo.startMs = 50_520_000; theo.chronoMs = 95_000; theo.rank = 3
    theo.penalties = [CanoeGatePenalty(gate: 5, seconds: 2)]

    return [lea, paul, theo]
}

@Test("Un dossard se cherche exactement, pas par préfixe")
func bibSearchIsExact() {
    // « 12 » ne doit pas ramener le 120 : à la radio on annonce un dossard,
    // pas un début de dossard.
    #expect(FieldSearch.filter(field(), query: "12").map(\.bib) == [12])
    #expect(FieldSearch.filter(field(), query: "120").map(\.bib) == [120])
}

@Test("Un nom se cherche sans accent ni casse")
func nameSearchIgnoresAccents() {
    #expect(FieldSearch.filter(field(), query: "lea").map(\.bib) == [12])
    #expect(FieldSearch.filter(field(), query: "THÉO").map(\.bib) == [120])
    // Le club compte aussi : « pau » ramène les deux du CK Pau — et Paul,
    // dont le nom contient les mêmes lettres. Chercher large vaut mieux que
    // rater le bateau qu'on cherche.
    #expect(FieldSearch.filter(field(), query: "pau").map(\.bib) == [120, 7, 12])
}

@Test("Le filtre 50 ne garde que ce qui se conteste")
func fiftyFilter() {
    #expect(FieldSearch.filter(field(), filter: .fifty).map(\.bib) == [12])
    #expect(FieldSearch.filter(field(), filter: .penalised).map(\.bib) == [120, 12])
    #expect(FieldSearch.filter(field(), filter: .all).count == 3)
}

@Test("Par défaut le dernier parti est en tête")
func defaultOrderIsMostRecentStart() {
    #expect(FieldSearch.filter(field()).map(\.bib) == [120, 7, 12])
    #expect(FieldSearch.filter(field(), order: .bib).map(\.bib) == [7, 12, 120])
    #expect(FieldSearch.filter(field(), order: .rank).map(\.bib) == [7, 12, 120])
}

@Test("Un non-classé passe derrière les classés, pas devant")
func unrankedSortsLast() {
    var running = CanoeEntry(bib: 99)
    running.name = "SUR L'EAU"; running.startMs = 50_600_000
    #expect(FieldSearch.sort(field() + [running], by: .rank).map(\.bib) == [7, 12, 120, 99])
}

// MARK: - Découpage

@Test("Le nom de fichier se trie tout seul par dossard")
func clipFilenameSortsByBib() {
    let name = ClipExporter.filename(bib: 12, name: "MARTIN Léa", epreuve: "K1D",
                                     camera: "ISO 1", extension: "mp4")
    #expect(name == "012_MARTIN-Lea_K1D_ISO-1.mp4")
    #expect(ClipExporter.slug("O'BRIEN – Ana  Ríos") == "O-BRIEN-Ana-Rios")
}

@Test("ffmpeg saute dans le fichier au lieu de le décoder depuis le début")
func ffmpegSeeksBeforeInput() {
    let job = ClipJob(sourceURL: URL(fileURLWithPath: "/tmp/iso1.mp4"), camera: "ISO 1", bib: 12,
                      startSeconds: 744, durationSeconds: 100,
                      outputURL: URL(fileURLWithPath: "/tmp/out.mp4"))
    let arguments = ClipExporter.arguments(for: job, quality: .copy)
    let seek = try! #require(arguments.firstIndex(of: "-ss"))
    let input = try! #require(arguments.firstIndex(of: "-i"))
    #expect(seek < input, "-ss après -i décoderait tout le fichier")
    #expect(arguments.contains("copy"))
    #expect(ClipExporter.arguments(for: job, quality: .precise).contains("libx264"))
}

@Test("Le découpage est rogné sur ce que le fichier contient vraiment")
func clipIsClampedToTheRecording() {
    let boat = entry(bib: 12, start: 50_400_000, chrono: 90_000, penalties: [])
    let sequence = JudgeMarks.sequence(for: boat, events: [], gateCount: 18)
    let directory = URL(fileURLWithPath: "/tmp/clips")

    // Caméra allumée à 13:59:00, arrêtée au bout de 80 s : la descente déborde
    // des deux côtés.
    let short = VideoSource(url: URL(fileURLWithPath: "/tmp/iso1.mp4"), camera: "ISO 1",
                            startMs: 50_340_000, durationSeconds: 80, startSource: .metadata)
    let job = try! #require(ClipExporter.job(for: boat, sequence: sequence, source: short,
                                             into: directory))
    #expect(job.startSeconds == 55)          // 50_395_000 − 50_340_000
    #expect(job.durationSeconds == 25)       // rogné à la fin du fichier

    // Caméra d'une autre épreuve : pas de clip vide.
    let elsewhere = VideoSource(url: URL(fileURLWithPath: "/tmp/iso2.mp4"), camera: "ISO 2",
                                startMs: 61_200_000, durationSeconds: 600, startSource: .metadata)
    #expect(ClipExporter.job(for: boat, sequence: sequence, source: elsewhere, into: directory) == nil)
}
