import Foundation
import CanoeLiveKit

/// Comment le clip est découpé.
public enum ClipQuality: String, Sendable, CaseIterable, Identifiable {
    /// Flux recopié tel quel : quasi instantané, mais la coupe tombe sur
    /// l'image-clé qui précède — jusqu'à quelques secondes d'avance au début.
    case copy
    /// Réencodé : la coupe tombe à l'image demandée. Compter le temps réel du
    /// clip, voire plus.
    case precise

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .copy: "Rapide (sans réencodage)"
        case .precise: "Précis (réencodé)"
        }
    }
}

/// Une extraction à faire : un bateau, une caméra, un segment.
public struct ClipJob: Sendable, Identifiable, Equatable {
    public let sourceURL: URL
    public let camera: String
    public let bib: Int
    public let startSeconds: Double
    public let durationSeconds: Double
    public let outputURL: URL
    /// Heure d'enregistrement du premier échantillon du clip, réécrite dans le
    /// fichier produit. Sans elle, un clip sorti du dossier ne dit plus quand
    /// il a été tourné — et un clip de litige ne vaut que par son heure.
    public let startDate: Date?
    /// Ce que le clip montre, écrit dans le fichier : dossard, nom, pénalités.
    public let title: String
    /// Heure de course de la **première image du clip**.
    ///
    /// Ce n'est pas le début de la fenêtre demandée : quand la caméra a été
    /// allumée après le départ, la coupe commence plus tard que prévu. Faire
    /// porter le chrono gravé par la fenêtre plutôt que par l'image décalerait
    /// l'incrustation de tout le retard de la caméra.
    public let startClockMs: Int
    /// La fenêtre demandée dépasse la fin du fichier : la coupe s'arrête avant
    /// l'arrivée. Ce n'est pas une erreur — c'est l'ISO qui s'écrit encore
    /// derrière le bateau — mais un clip à refaire quand le fichier aura
    /// grandi.
    public let isShortAtEnd: Bool

    public init(sourceURL: URL, camera: String, bib: Int,
                startSeconds: Double, durationSeconds: Double, outputURL: URL,
                startDate: Date? = nil, title: String = "",
                startClockMs: Int = 0, isShortAtEnd: Bool = false) {
        self.sourceURL = sourceURL
        self.camera = camera
        self.bib = bib
        self.startSeconds = startSeconds
        self.durationSeconds = durationSeconds
        self.outputURL = outputURL
        self.startDate = startDate
        self.title = title
        self.startClockMs = startClockMs
        self.isShortAtEnd = isShortAtEnd
    }

    public var id: URL { outputURL }
}

public enum ClipError: Error, LocalizedError {
    case ffmpegNotFound
    case outsideRecording(bib: Int, camera: String)
    case failed(command: String, log: String)

    public var errorDescription: String? {
        switch self {
        case .ffmpegNotFound:
            "ffmpeg est introuvable. Installer avec « brew install ffmpeg »."
        case .outsideRecording(let bib, let camera):
            "Le dossard \(bib) n'est pas dans l'enregistrement de \(camera)."
        case .failed(_, let log):
            "ffmpeg a échoué : \(log.suffix(400))"
        }
    }
}

public enum ClipExporter {
    /// L'extraction d'un bateau sur une caméra, ou `nil` si sa descente ne
    /// tombe pas dans cet enregistrement — une caméra allumée en retard, un
    /// ISO d'une autre épreuve.
    public static func job(for entry: CanoeEntry,
                           sequence: JudgeSequence,
                           source: VideoSource,
                           offsetMs: Int = 0,
                           padSeconds: Double = 5,
                           into directory: URL) -> ClipJob? {
        guard let window = sequence.window(padSeconds: padSeconds) else { return nil }
        let alignment = source.alignment(offsetMs: offsetMs)
        let rawStart = alignment.videoTime(atClock: window.lowerBound)
        let rawEnd = alignment.videoTime(atClock: window.upperBound)

        // Rogné sur ce que le fichier contient réellement : demander à ffmpeg
        // une seconde qui n'existe pas donne un fichier vide, pas une erreur.
        let start = max(0, rawStart)
        let end = min(source.durationSeconds, rawEnd)
        guard end - start > 0.5 else { return nil }

        let name = filename(bib: entry.bib, name: entry.name, epreuve: entry.epreuve,
                            camera: source.camera, extension: source.url.pathExtension)
        let penalties = entry.penalties.map { "porte \($0.gate) : \($0.seconds)" }
            .joined(separator: ", ")
        return ClipJob(sourceURL: source.url,
                       camera: source.camera,
                       bib: entry.bib,
                       startSeconds: start,
                       durationSeconds: end - start,
                       outputURL: directory.appendingPathComponent(name),
                       startDate: source.startDate?.addingTimeInterval(start),
                       title: [entry.label, entry.epreuve, source.camera, penalties]
                           .filter { !$0.isEmpty }.joined(separator: " · "),
                       startClockMs: alignment.clock(atVideoTime: start),
                       // Une tolérance d'une demi-image : la durée d'un fichier
                       // lu pendant son écriture n'est jamais ronde, et un
                       // écart de quelques millisecondes ne fait pas un clip
                       // écourté.
                       isShortAtEnd: rawEnd > source.durationSeconds + 0.02)
    }

    /// `012_MARTIN-Lea_K1D_ISO-1.mp4` — le dossard d'abord et sur trois
    /// chiffres, pour que le dossier se trie tout seul dans l'ordre des
    /// dossards.
    public static func filename(bib: Int, name: String, epreuve: String,
                                camera: String, extension ext: String) -> String {
        let parts = [String(format: "%03d", bib), slug(name), slug(epreuve), slug(camera)]
            .filter { !$0.isEmpty }
        return parts.joined(separator: "_") + "." + (ext.isEmpty ? "mp4" : ext)
    }

    static func slug(_ text: String) -> String {
        let folded = text.folding(options: [.diacriticInsensitive], locale: .current)
        let cleaned = folded.map { character -> Character in
            character.isLetter || character.isNumber ? character : "-"
        }
        return String(cleaned).split(separator: "-", omittingEmptySubsequences: true)
            .joined(separator: "-")
    }

    /// La ligne de commande, telle qu'elle est lancée.
    ///
    /// `-ss` est placé **avant** `-i` : ffmpeg saute alors directement dans le
    /// fichier au lieu de le décoder depuis le début, ce qui change une minute
    /// d'attente en une seconde sur un ISO de deux heures.
    public static func arguments(for job: ClipJob, quality: ClipQuality) -> [String] {
        var arguments = ["-hide_banner", "-nostdin", "-y",
                         "-ss", format(job.startSeconds),
                         "-i", job.sourceURL.path,
                         "-t", format(job.durationSeconds)]
        switch quality {
        case .copy:
            arguments += ["-c", "copy", "-avoid_negative_ts", "make_zero"]
        case .precise:
            arguments += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-c:a", "aac"]
        }
        if let startDate = job.startDate {
            let stamp = ISO8601DateFormatter()
            stamp.timeZone = TimeZone(identifier: "UTC")
            arguments += ["-metadata", "creation_time=\(stamp.string(from: startDate))"]
        }
        if !job.title.isEmpty {
            arguments += ["-metadata", "title=\(job.title)"]
        }
        arguments.append(job.outputURL.path)
        return arguments
    }

    static func format(_ seconds: Double) -> String {
        String(format: "%.3f", max(0, seconds))
    }

    @discardableResult
    public static func export(_ job: ClipJob,
                              quality: ClipQuality = .copy,
                              ffmpeg: URL? = nil) async throws -> URL {
        guard let tool = ffmpeg ?? locateFFmpeg() else { throw ClipError.ffmpegNotFound }
        try FileManager.default.createDirectory(at: job.outputURL.deletingLastPathComponent(),
                                                withIntermediateDirectories: true)

        let process = Process()
        process.executableURL = tool
        process.arguments = arguments(for: job, quality: quality)
        let errors = Pipe()
        process.standardError = errors
        process.standardOutput = FileHandle.nullDevice

        try process.run()
        // Lu avant d'attendre : ffmpeg est bavard, et un tube plein le bloque.
        let log = String(data: errors.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        process.waitUntilExit()

        guard process.terminationStatus == 0 else {
            throw ClipError.failed(command: ([tool.path] + (process.arguments ?? [])).joined(separator: " "),
                                   log: log)
        }
        return job.outputURL
    }

    public static func locateFFmpeg() -> URL? {
        let candidates = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]
        return candidates.map(URL.init(fileURLWithPath:))
            .first { FileManager.default.isExecutableFile(atPath: $0.path) }
    }
}
