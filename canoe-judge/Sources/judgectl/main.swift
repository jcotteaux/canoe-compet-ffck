import Foundation
import CanoeLiveKit
import JudgeKit

/// Banc d'essai en ligne de commande.
///
/// Il existe pour la même raison que `atemctl` : vérifier la chaîne complète
/// — competFFCK, le calage des horloges, le découpage — sans passer par
/// l'interface, et contre le bouchon canoe-wslive plutôt que contre une
/// compétition qu'on ne peut pas rejouer.
///
///   swift run judgectl scan "/Volumes/ArchiDrive/2026/Video ISO Files"
///   swift run judgectl field --host 127.0.0.1 --filter fifty
///   swift run judgectl marks 12 --host 127.0.0.1 --dir ./videos
///   swift run judgectl watch --host 127.0.0.1
///   swift run judgectl export 12 --dir ./videos --out ./clips --quality precise

// Sortie ligne par ligne : `judgectl watch` tourne pendant des heures et on
// le redirige volontiers vers un fichier. Sans cela stdout est mis en tampon
// dès qu'il n'est plus un terminal, et le journal n'apparaît qu'à la fin —
// c'est-à-dire jamais, puisqu'on l'arrête au Ctrl-C.
setvbuf(stdout, nil, _IOLBF, 0)

func option(_ name: String, default value: String) -> String {
    let args = CommandLine.arguments
    guard let i = args.firstIndex(of: "--\(name)"), i + 1 < args.count else { return value }
    return args[i + 1]
}

let positional: [String] = {
    var out: [String] = []
    var skip = false
    for argument in CommandLine.arguments.dropFirst() {
        if skip { skip = false; continue }
        if argument.hasPrefix("--") { skip = true; continue }
        out.append(argument)
    }
    return out
}()

let command = positional.first ?? "help"
let host = option("host", default: "127.0.0.1")
let port = UInt16(option("port", default: "20000")) ?? 20000
let offsetMs = Int((Double(option("offset", default: "0")) ?? 0) * 1000)
let padSeconds = Double(option("pad", default: "5")) ?? 5

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("✗ \(message)\n".utf8))
    exit(1)
}

/// Ouvre la liaison et rend la main dès que le plateau est là.
func loadRace(timeout: Double = 15) async -> CanoeState {
    let client = CompetFFCKClient(host: host, port: port)
    await client.start()
    let deadline = Date().addingTimeInterval(timeout)

    for await event in await client.events {
        switch event {
        case .connected(let state), .changed(let state):
            if !state.field.isEmpty {
                await client.stop()
                return state
            }
        case .disconnected(let reason):
            if Date() > deadline { fail("competFFCK : \(reason ?? "pas de réponse")") }
        case .connecting:
            break
        }
        if Date() > deadline { break }
    }
    await client.stop()
    fail("pas de classement reçu de \(host):\(port) en \(Int(timeout)) s")
}

/// `String(format:)` n'honore pas la largeur sur `%@` : les colonnes seraient
/// décalées dès qu'un nom est plus court que le gabarit.
func pad(_ text: String, _ width: Int) -> String {
    text.count >= width ? text : text + String(repeating: " ", count: width - text.count)
}

func penaltyBadges(_ entry: CanoeEntry) -> String {
    guard !entry.penalties.isEmpty else { return "" }
    return entry.penalties
        .map { "p\($0.gate):\($0.seconds)\($0.isLive ? "*" : "")" }
        .joined(separator: " ")
}

func describe(_ entry: CanoeEntry) -> String {
    let time = entry.hasRun ? Chrono.format(entry.totalMs) : (entry.statusLabel ?? "—")
    let rank = entry.rank > 0 ? String(format: "%3d.", entry.rank) : "   ·"
    let start = entry.startMs > 0 ? Chrono.formatClock(entry.startMs) : "--:--:--"
    return "\(rank) \(pad(String(entry.bib), 4)) \(pad(entry.name, 22)) \(pad(entry.epreuve, 5)) "
        + "\(start)  \(pad(time, 9))  \(penaltyBadges(entry))"
}

func sources(required: Bool = true) async -> [VideoSource] {
    let path = option("dir", default: "")
    guard !path.isEmpty else {
        if required { fail("préciser le dossier des vidéos avec --dir") }
        return []
    }
    let found = await VideoLibrary.scan(directory: URL(fileURLWithPath: path))
    if found.isEmpty, required { fail("aucune vidéo dans \(path)") }
    return found
}

switch command {

case "scan":
    let path = positional.dropFirst().first ?? option("dir", default: "")
    guard !path.isEmpty else { fail("usage : judgectl scan <dossier>") }
    let found = await VideoLibrary.scan(directory: URL(fileURLWithPath: path))
    guard !found.isEmpty else { fail("aucune vidéo dans \(path)") }
    print("\(found.count) vidéo(s) dans \(path)")
    for source in found {
        let end = source.startMs + Int(source.durationSeconds * 1000)
        print("  \(pad(source.camera, 20)) \(Chrono.formatClock(source.startMs)) → \(Chrono.formatClock(end))"
            + String(format: "  (%.0f s, ", source.durationSeconds) + source.startSource.label + ")")
    }

case "field":
    let state = await loadRace()
    let filter = FieldFilter(rawValue: option("filter", default: "all")) ?? .all
    let entries = FieldSearch.filter(state.field,
                                     query: option("search", default: ""),
                                     filter: filter,
                                     order: FieldOrder(rawValue: option("order", default: "recent")) ?? .recent)
    print("\(state.headline)  [\(state.activity)]  \(state.gateCount) portes  —  \(entries.count)/\(state.field.count) bateaux")
    for entry in entries { print(describe(entry)) }
    if state.penaltyLog.isEmpty, state.isSlalom {
        print("\n(journal vide : les heures de pénalité ne sont connues que si l'app écoutait pendant la course)")
    }

case "marks":
    guard let bib = Int(positional.dropFirst().first ?? "") else { fail("usage : judgectl marks <dossard>") }
    let state = await loadRace()
    guard let entry = state.entry(bib: bib) else { fail("dossard \(bib) absent du plateau") }
    let sequence = JudgeMarks.sequence(for: entry,
                                       events: state.penaltyEvents(bib: bib),
                                       gateCount: state.gateCount)
    guard !sequence.marks.isEmpty else { fail("dossard \(bib) : pas d'heure de départ, rien à baliser") }

    print("\(entry.label) [\(entry.epreuve)] \(entry.club)")
    let videos = await sources(required: false)
    for mark in sequence.marks {
        var line = "  \(pad(mark.label, 16)) \(Chrono.formatClock(mark.clockMs))"
            + (mark.isEstimated ? " ~ estimé ±\(mark.uncertaintyMs / 1000) s" : "")
        for source in videos {
            let t = source.alignment(offsetMs: offsetMs).videoTime(atClock: mark.clockMs)
            guard t >= 0, t <= source.durationSeconds else { continue }
            line += "   \(source.camera) \(hms(t))"
        }
        print(line)
    }
    if let window = sequence.window(padSeconds: padSeconds) {
        print("  fenêtre : \(Chrono.formatClock(window.lowerBound)) → \(Chrono.formatClock(window.upperBound))")
    }

case "watch":
    // Le mode qu'on laisse tourner pendant la course : c'est lui qui constitue
    // le journal des heures de pénalité.
    let client = CompetFFCKClient(host: host, port: port)
    await client.start()
    var seen = Set<String>()
    print("… écoute de \(host):\(port) — Ctrl-C pour arrêter")
    for await event in await client.events {
        guard case .changed(let state) = event else {
            if case .connected(let state) = event { print("✓ \(state.headline)") }
            continue
        }
        for penalty in state.penaltyLog where !seen.contains(penalty.id) {
            seen.insert(penalty.id)
            let who = state.entry(bib: penalty.bib)?.label ?? "Dossard \(penalty.bib)"
            print("\(Chrono.formatClock(penalty.clockMs))  \(penalty.seconds == 50 ? "⛔ 50" : "⚠  2")  porte \(penalty.gate)  \(who)")
        }
    }

case "export":
    guard let bib = Int(positional.dropFirst().first ?? "") else { fail("usage : judgectl export <dossard> --dir <vidéos> --out <dossier>") }
    let state = await loadRace()
    guard let entry = state.entry(bib: bib) else { fail("dossard \(bib) absent du plateau") }
    let sequence = JudgeMarks.sequence(for: entry,
                                       events: state.penaltyEvents(bib: bib),
                                       gateCount: state.gateCount)
    let videos = await sources()
    let quality = ClipQuality(rawValue: option("quality", default: "copy")) ?? .copy
    let outputDirectory = URL(fileURLWithPath: option("out", default: "./clips"))
    let wanted = option("cam", default: "")
    // `--burn` grave le chrono et les pénalités dans l'image, par AVFoundation.
    // C'est le seul moyen de vérifier l'incrustation sans ouvrir l'app — et
    // elle se vérifie en regardant une image, pas en lisant du code.
    let burn = CommandLine.arguments.contains("--burn")
    let board = burn ? ScoreBoard.make(entry: entry, sequence: sequence) : nil
    if burn, board == nil { fail("dossard \(bib) : pas d'heure de départ, rien à graver") }

    var exported = 0
    for source in videos where wanted.isEmpty || source.camera.localizedCaseInsensitiveContains(wanted) {
        guard let job = ClipExporter.job(for: entry, sequence: sequence, source: source,
                                         offsetMs: offsetMs, padSeconds: padSeconds,
                                         into: outputDirectory) else {
            print("  – \(source.camera) : hors enregistrement")
            continue
        }
        do {
            let url: URL
            if let board {
                url = try await ClipBurner.export(job, board: board)
            } else {
                url = try await ClipExporter.export(job, quality: quality)
            }
            exported += 1
            print("  ✓ \(url.lastPathComponent)" + String(format: "  (%.1f s)", job.durationSeconds)
                  + (burn ? "  incrusté" : ""))
        } catch {
            print("  ✗ \(source.camera) : \(error.localizedDescription)")
        }
    }
    if exported == 0 { fail("aucun clip produit") }

default:
    print("""
    judgectl — banc d'essai du jugement vidéo

      scan <dossier>                  les vidéos et leur heure de début
      field                           le plateau, avec les pénalités
      marks <dossard>                 les repères d'une descente
      watch                           journalise les pénalités en direct
      export <dossard>                découpe les clips du bateau
                                      --burn grave le chrono et les pénalités

    options : --host --port --dir --out --search --filter (all|penalised|fifty)
              --order (recent|bib|rank) --quality (copy|precise) --offset <s> --pad <s> --cam
    """)
}

/// `1:23:45.6` — la position dans un fichier, pas une heure du jour.
func hms(_ seconds: Double) -> String {
    let total = Int(seconds)
    return String(format: "%d:%02d:%02d.%d", total / 3600, (total / 60) % 60, total % 60,
                  Int((seconds - Double(total)) * 10))
}
