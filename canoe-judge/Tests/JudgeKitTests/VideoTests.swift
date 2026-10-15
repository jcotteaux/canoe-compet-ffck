import Testing
import Foundation
import CanoeLiveKit
@testable import JudgeKit

/// Ces cas-là se confrontent à de vrais fichiers plutôt qu'à des structures
/// fabriquées : lire une `creation_time` et découper un segment sont deux
/// choses qu'on ne peut pas prouver contre soi-même. Sans ffmpeg pour les
/// produire, ils sont sautés plutôt que faussement verts.
private let hasFFmpeg = ClipExporter.locateFFmpeg() != nil

/// Fabrique une vidéo de test portant une heure d'enregistrement.
@discardableResult
private func makeVideo(_ url: URL, seconds: Int, creation: String) throws -> URL {
    let process = Process()
    process.executableURL = try #require(ClipExporter.locateFFmpeg())
    process.arguments = [
        "-hide_banner", "-nostdin", "-y",
        "-f", "lavfi", "-i", "testsrc=duration=\(seconds):size=320x240:rate=10",
        // Une image-clé par seconde : sans cela la copie sans réencodage
        // remonterait au début du fichier et le cas ne prouverait rien.
        "-c:v", "libx264", "-preset", "ultrafast", "-g", "10",
        "-metadata", "creation_time=\(creation)",
        url.path,
    ]
    process.standardError = FileHandle.nullDevice
    process.standardOutput = FileHandle.nullDevice
    try process.run()
    process.waitUntilExit()
    #expect(process.terminationStatus == 0)
    return url
}

private func scratch() throws -> URL {
    let directory = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent("judgekit-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
}

@Test("L'heure de début se lit dans la métadonnée d'enregistrement", .enabled(if: hasFFmpeg))
func startTimeComesFromRecordingMetadata() async throws {
    let directory = try scratch()
    defer { try? FileManager.default.removeItem(at: directory) }
    let stamp = "2026-09-20T13:47:31Z"
    try makeVideo(directory.appendingPathComponent("ISO 1.mp4"), seconds: 6, creation: stamp)

    let source = try #require(await VideoLibrary.load(url: directory.appendingPathComponent("ISO 1.mp4")))
    let expected = timeOfDayMs(try #require(ISO8601DateFormatter().date(from: stamp)))

    #expect(source.startSource == .metadata, "la date du fichier ne vaut pas la métadonnée")
    // La métadonnée mp4 est à la seconde près.
    #expect(abs(source.startMs - expected) < 1000)
    #expect(abs(source.durationSeconds - 6) < 0.5)
}

@Test("Un dossier se lit en une passe, noms de caméra raccourcis", .enabled(if: hasFFmpeg))
func scanReadsAWholeFolder() async throws {
    let directory = try scratch()
    defer { try? FileManager.default.removeItem(at: directory) }
    for iso in 1...3 {
        try makeVideo(directory.appendingPathComponent("Coupe de France 2026 - ISO \(iso).mp4"),
                      seconds: 2, creation: "2026-09-20T13:47:31Z")
    }
    // Un fichier qui n'est pas une vidéo, et un fichier caché.
    try "".write(to: directory.appendingPathComponent("notes.txt"), atomically: true, encoding: .utf8)
    try "".write(to: directory.appendingPathComponent(".DS_Store"), atomically: true, encoding: .utf8)

    let sources = await VideoLibrary.scan(directory: directory)
    #expect(sources.map(\.camera) == ["ISO 1", "ISO 2", "ISO 3"])
}

@Test("Un nom de caméra unique reste entier") 
func singleCameraKeepsItsName() {
    let lone = VideoSource(url: URL(fileURLWithPath: "/tmp/Coupe 2026 - ISO 1.mp4"),
                           camera: "Coupe 2026 - ISO 1", startMs: 0, durationSeconds: 1,
                           startSource: .metadata)
    #expect(VideoLibrary.shortenNames([lone]).map(\.camera) == ["Coupe 2026 - ISO 1"])
}

@Test("Le clip extrait tombe bien sur la descente demandée", .enabled(if: hasFFmpeg))
func exportedClipCoversTheRun() async throws {
    let directory = try scratch()
    defer { try? FileManager.default.removeItem(at: directory) }
    let input = directory.appendingPathComponent("ISO 1.mp4")
    try makeVideo(input, seconds: 30, creation: "2026-09-20T13:47:31Z")
    let source = try #require(await VideoLibrary.load(url: input))

    // Un bateau parti 8 s après le début de l'enregistrement, arrivé 9 s plus
    // tard. Les bornes se déduisent de la vidéo elle-même : le cas ne dépend
    // donc pas du fuseau de la machine qui l'exécute.
    var boat = CanoeEntry(bib: 12)
    boat.name = "MARTIN Léa"
    boat.epreuve = "K1D"
    boat.startMs = source.startMs + 8000
    boat.chronoMs = 9000
    let sequence = JudgeMarks.sequence(for: boat, events: [], gateCount: 18)

    let job = try #require(ClipExporter.job(for: boat, sequence: sequence, source: source,
                                            padSeconds: 3, into: directory.appendingPathComponent("clips")))
    #expect(job.startSeconds == 5)                  // 8 − 3 de marge
    #expect(job.durationSeconds == 15)              // 9 de descente + 2 × 3

    let output = try await ClipExporter.export(job, quality: .precise)
    #expect(output.lastPathComponent == "012_MARTIN-Lea_K1D_ISO-1.mp4")
    let clip = try #require(await VideoLibrary.load(url: output))
    #expect(abs(clip.durationSeconds - 15) < 1)
    // Le clip porte sa propre heure d'enregistrement : rouvert seul, hors du
    // dossier, il se recale encore sur le chronométrage.
    #expect(clip.startSource == .metadata)
    #expect(abs(clip.startMs - (source.startMs + 5000)) < 1000)
}

@Test("Le raccourci garde le mot qui distingue, pas seulement le numéro")
func shortNamesKeepTheMeaningfulWord() {
    func sources(_ names: [String]) -> [VideoSource] {
        names.map { VideoSource(url: URL(fileURLWithPath: "/tmp/\($0).mp4"), camera: $0,
                                startMs: 0, durationSeconds: 1, startSource: .metadata) }
    }
    #expect(VideoLibrary.shortenNames(sources(["Coupe de France 2026 - ISO 1",
                                               "Coupe de France 2026 - ISO 2"])).map(\.camera)
            == ["ISO 1", "ISO 2"])
    // Rien de commun à retirer : les noms passent tels quels.
    #expect(VideoLibrary.shortenNames(sources(["Depart", "Arrivee"])).map(\.camera)
            == ["Depart", "Arrivee"])
    // Déjà court : on ne rabote pas jusqu'au chiffre nu.
    #expect(VideoLibrary.shortenNames(sources(["ISO_1", "ISO_2"])).map(\.camera)
            == ["ISO_1", "ISO_2"])
    // Un mot distinctif suffit à garder le reste entier.
    #expect(VideoLibrary.shortenNames(sources(["Slalom - Porte 5", "Slalom - Arrivee"])).map(\.camera)
            == ["Porte 5", "Arrivee"])
}

@Test("Les prises successives d'une caméra ATEM gardent le nom de la caméra")
func atemTakesShareTheCameraName() {
    #expect(VideoLibrary.cameraName(fileName: "wr-finala CAM 1 01") == "wr-finala CAM 1")
    #expect(VideoLibrary.cameraName(fileName: "wr-finala CAM 1 02") == "wr-finala CAM 1")
    // Un seul nombre : c'est celui de la caméra, on n'y touche pas.
    #expect(VideoLibrary.cameraName(fileName: "Coupe de France 2026 - ISO 1") == "Coupe de France 2026 - ISO 1")
    #expect(VideoLibrary.cameraName(fileName: "ISO_2") == "ISO_2")
    #expect(VideoLibrary.cameraName(fileName: "Depart") == "Depart")

    // Deux prises de huit caméras : huit noms, raccourcis comme d'habitude.
    let files = (1...8).flatMap { cam in ["01", "02"].map { "wr-finala CAM \(cam) \($0)" } }
    let sources = files.map {
        VideoSource(url: URL(fileURLWithPath: "/tmp/\($0).mp4"),
                    camera: VideoLibrary.cameraName(fileName: $0),
                    startMs: 0, durationSeconds: 1, startSource: .metadata)
    }
    let names = VideoLibrary.shortenNames(sources).map(\.camera)
    #expect(Array(names.prefix(4)) == ["CAM 1", "CAM 1", "CAM 2", "CAM 2"])
    #expect(Set(names).count == 8)
}
