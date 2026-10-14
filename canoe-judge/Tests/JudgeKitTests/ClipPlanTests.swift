import Testing
import Foundation
import CanoeLiveKit
@testable import JudgeKit

// MARK: - Le plateau et les caméras du scénario

/// 14:00:00 → 14:01:30. La fenêtre à 5 s de marge : 13:59:55 → 14:01:35.
private func finished(bib: Int, start: Int = 50_400_000, chrono: Int = 90_000) -> CanoeEntry {
    var entry = CanoeEntry(bib: bib)
    entry.name = "MARTIN Léa"
    entry.epreuve = "K1D"
    entry.startMs = start
    entry.chronoMs = chrono
    entry.totalMs = chrono
    return entry
}

private func race(_ entries: [CanoeEntry]) -> CanoeState {
    var state = CanoeState()
    state.gateCount = 18
    state.field = entries
    return state
}

/// Caméra allumée à 13:59:00. La fenêtre du bateau 12 y tombe entre 55 s et
/// 155 s : un fichier de 200 s la contient, un fichier de 100 s s'arrête au
/// milieu de la descente.
private func iso(_ name: String, seconds: Double) -> VideoSource {
    VideoSource(url: URL(fileURLWithPath: "/tmp/\(name).mp4"), camera: name,
                startMs: 50_340_000, durationSeconds: seconds, startSource: .metadata)
}

private let clips = URL(fileURLWithPath: "/tmp/clips")

private func pending(_ state: CanoeState,
                     sources: [VideoSource],
                     growing: Set<URL> = [],
                     done: [ClipKey: ClipStamp] = [:],
                     offsetMs: Int = 0) -> [ClipPlan.Item] {
    ClipPlan.pending(race: state, sources: sources, growing: growing, done: done,
                     offsetMs: offsetMs, into: clips)
}

// MARK: - Qui est découpé

@Test("Un bateau encore sur l'eau n'est pas découpé")
func boatsStillRunningAreNotCut() {
    // Sans arrivée, la fenêtre s'arrête sur une durée plausible inventée : un
    // clip là-dessus serait à refaire de toute façon.
    let running = finished(bib: 9, start: 50_520_000, chrono: 0)
    let items = pending(race([running, finished(bib: 12)]), sources: [iso("ISO 1", seconds: 200)])
    #expect(items.map(\.key.bib) == [12])
}

@Test("Un bateau hors de l'enregistrement n'encombre pas le plan")
func boatsOutsideTheRecordingAreSkipped() {
    // ISO 2 tourne sur une autre épreuve : rien à découper, et rien à
    // mémoriser — si la caméra rattrape, le passage suivant le verra.
    let elsewhere = VideoSource(url: URL(fileURLWithPath: "/tmp/iso2.mp4"), camera: "ISO 2",
                                startMs: 61_200_000, durationSeconds: 600, startSource: .metadata)
    let items = pending(race([finished(bib: 12)]),
                        sources: [iso("ISO 1", seconds: 200), elsewhere])
    #expect(items.map(\.key.camera) == ["ISO 1"])
}

@Test("Chaque caméra donne son clip")
func everyCameraGetsItsClip() {
    let items = pending(race([finished(bib: 12)]),
                        sources: [iso("ISO 1", seconds: 200), iso("ISO 2", seconds: 200)])
    #expect(items.count == 2)
    #expect(items.allSatisfy { $0.job.isShortAtEnd == false })
    #expect(items.allSatisfy { $0.job.durationSeconds == 100 })
}

@Test("Les dernières descentes passent devant")
func latestDescentsComeFirst() {
    // Sur un retard de plusieurs bateaux, celui qu'on va nous réclamer est
    // celui qui vient d'arriver.
    let state = race([finished(bib: 7, start: 50_400_000),
                      finished(bib: 120, start: 50_520_000),
                      finished(bib: 12, start: 50_460_000)])
    let items = pending(state, sources: [iso("ISO 1", seconds: 400)])
    #expect(items.map(\.key.bib) == [120, 12, 7])
}

// MARK: - Le rattrapage

@Test("Une coupe écourtée attend que l'enregistrement ait grandi")
func shortCutWaitsWhileTheRecordingGrows() {
    // Le fichier s'arrête à 100 s, la descente va jusqu'à 155 s : le bateau
    // vient d'arriver et l'ISO s'écrit derrière lui. Un clip qui s'arrête
    // avant l'arrivée est pire que pas de clip — le juge y lirait une
    // descente finie.
    let growing = iso("ISO 1", seconds: 100)
    #expect(pending(race([finished(bib: 12)]), sources: [growing],
                    growing: [growing.url]).isEmpty)
}

@Test("Sur un enregistrement qui ne grandit plus, on découpe ce qu'on a")
func stalledRecordingIsCutAnyway() {
    // Caméra coupée avant l'arrivée : il n'y a plus rien à attendre, et un
    // clip écourté vaut mieux que rien.
    let stopped = iso("ISO 1", seconds: 100)
    let items = pending(race([finished(bib: 12)]), sources: [stopped], growing: [])
    #expect(items.count == 1)
    #expect(items[0].job.isShortAtEnd)
    #expect(items[0].stamp.isShortAtEnd)
    #expect(items[0].job.durationSeconds == 45)
}

@Test("Ce qui est déjà découpé à l'identique n'est pas refait")
func identicalCutsAreNotRepeated() {
    let source = iso("ISO 1", seconds: 200)
    let first = pending(race([finished(bib: 12)]), sources: [source])
    let done = Dictionary(uniqueKeysWithValues: first.map { ($0.key, $0.stamp) })
    #expect(pending(race([finished(bib: 12)]), sources: [source], done: done).isEmpty)
}

@Test("Une coupe écourtée est refaite dès que le fichier contient la fin")
func shortCutIsRedoneOnceTheRecordingCatchesUp() {
    // Premier passage : enregistrement arrêté à 100 s, on découpe écourté.
    let stopped = iso("ISO 1", seconds: 100)
    let first = pending(race([finished(bib: 12)]), sources: [stopped])
    let done = Dictionary(uniqueKeysWithValues: first.map { ($0.key, $0.stamp) })

    // L'enregistrement reprend et dépasse l'arrivée : l'empreinte change, la
    // coupe est refaite entière.
    let complete = pending(race([finished(bib: 12)]), sources: [iso("ISO 1", seconds: 200)],
                           done: done)
    #expect(complete.count == 1)
    #expect(complete[0].job.isShortAtEnd == false)
    #expect(complete[0].job.durationSeconds == 100)
}

@Test("Une arrivée corrigée par le jury redécoupe le bateau")
func correctedFinishTimeRedoesTheCut() {
    let source = iso("ISO 1", seconds: 400)
    let first = pending(race([finished(bib: 12, chrono: 90_000)]), sources: [source])
    let done = Dictionary(uniqueKeysWithValues: first.map { ($0.key, $0.stamp) })

    let corrected = pending(race([finished(bib: 12, chrono: 93_400)]), sources: [source],
                            done: done)
    #expect(corrected.count == 1)
    #expect(corrected[0].stamp.windowEndMs == 50_498_400)
}

@Test("Recaler les horloges remet tout à découper")
func realigningTheClocksRedoesEverything() {
    // Les clips déjà sortis ne montrent plus la bonne seconde : les garder
    // serait pire que de les refaire.
    let source = iso("ISO 1", seconds: 400)
    let first = pending(race([finished(bib: 12)]), sources: [source])
    let done = Dictionary(uniqueKeysWithValues: first.map { ($0.key, $0.stamp) })

    let realigned = pending(race([finished(bib: 12)]), sources: [source], done: done,
                            offsetMs: 3000)
    #expect(realigned.count == 1)
    #expect(realigned[0].stamp.offsetMs == 3000)
    #expect(realigned[0].job.startSeconds == 58)   // 55 s + 3 s de décalage
}
