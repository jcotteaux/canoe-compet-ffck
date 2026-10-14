import Foundation
import AVFoundation

/// Un fichier d'enregistrement, et l'heure qu'il était quand il a commencé.
public struct VideoSource: Identifiable, Sendable, Equatable {
    public let url: URL
    /// Nom affiché de la caméra, dérivé du nom de fichier.
    public var camera: String
    /// Heure du jour du premier échantillon, en millisecondes depuis minuit.
    public let startMs: Int
    /// La même chose en date complète, quand on la connaît. Elle sert à
    /// réécrire une heure d'enregistrement sur un clip extrait.
    public let startDate: Date?
    public let durationSeconds: Double
    /// Comment `startMs` a été obtenue — une date de fichier n'a pas la même
    /// valeur qu'une métadonnée d'enregistrement, et le juge doit pouvoir s'en
    /// méfier si le calage tombe à côté.
    public let startSource: StartSource

    public enum StartSource: String, Sendable {
        /// `creation_time` écrit par l'enregistreur : la bonne source.
        case metadata
        /// Date de création du fichier : approximative, et fausse après une
        /// copie qui ne préserve pas les dates.
        case fileSystem

        public var label: String {
            switch self {
            case .metadata: "métadonnée d'enregistrement"
            case .fileSystem: "date du fichier"
            }
        }
    }

    public init(url: URL, camera: String, startMs: Int, startDate: Date? = nil,
                durationSeconds: Double, startSource: StartSource) {
        self.url = url
        self.camera = camera
        self.startMs = startMs
        self.startDate = startDate
        self.durationSeconds = durationSeconds
        self.startSource = startSource
    }

    public var id: URL { url }

    public func alignment(offsetMs: Int = 0) -> ClockAlignment {
        ClockAlignment(recordingStartMs: startMs, offsetMs: offsetMs)
    }
}

public enum VideoLibrary {
    public static let extensions: Set<String> = ["mp4", "mov", "mkv", "avi", "m4v", "webm", "mxf"]

    /// Les vidéos d'un dossier, triées par nom, avec leur heure de début.
    public static func scan(directory: URL) async -> [VideoSource] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        let candidates = names
            .filter { !$0.hasPrefix(".") && extensions.contains(($0 as NSString).pathExtension.lowercased()) }
            .sorted { $0.localizedStandardCompare($1) == .orderedAscending }
            .map { directory.appendingPathComponent($0) }

        var sources: [VideoSource] = []
        for url in candidates {
            if let source = await load(url: url) { sources.append(source) }
        }
        return shortenNames(sources)
    }

    /// Relit un fichier : durée et heure de début.
    ///
    /// À rappeler pendant la course — l'ISO en cours d'écriture grossit, et sa
    /// durée d'il y a deux minutes ne permet pas d'atteindre la descente qui
    /// vient de se terminer.
    public static func load(url: URL) async -> VideoSource? {
        let asset = AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: false])
        guard let duration = try? await asset.load(.duration), duration.isNumeric else { return nil }

        let (date, origin) = await startOfRecording(asset: asset, url: url, duration: duration.seconds)
        return VideoSource(url: url,
                           camera: url.deletingPathExtension().lastPathComponent,
                           startMs: date.map { timeOfDayMs($0) } ?? 0,
                           startDate: date,
                           durationSeconds: duration.seconds,
                           startSource: origin)
    }

    private static func startOfRecording(asset: AVURLAsset,
                                         url: URL,
                                         duration: Double) async -> (Date?, VideoSource.StartSource) {
        if let item = try? await asset.load(.creationDate) {
            if let date = try? await item.load(.dateValue) {
                return (date, .metadata)
            }
            // Certains encodeurs écrivent la date en chaîne sans type date.
            if let text = try? await item.load(.stringValue),
               let date = ISO8601DateFormatter().date(from: text) {
                return (date, .metadata)
            }
        }
        let values = try? url.resourceValues(forKeys: [.creationDateKey, .contentModificationDateKey])
        if let date = values?.creationDate {
            return (date, .fileSystem)
        }
        if let modified = values?.contentModificationDate {
            // Dernier recours : la fin du fichier moins sa durée.
            return (modified.addingTimeInterval(-duration), .fileSystem)
        }
        return (nil, .fileSystem)
    }

    /// Raccourcit les noms de caméra en retirant ce qu'ils ont tous en commun.
    ///
    /// L'ATEM nomme ses ISO d'après l'enregistrement :
    /// `Coupe de France 2026 - ISO 1`, `… - ISO 2`. Répéter le titre sur
    /// chaque ligne d'une colonne étroite ne distingue rien.
    ///
    /// Mais tout retirer ne laisserait que `1`, `2`, `3` : le mot qui porte le
    /// sens est gardé dès que le reste n'est qu'un numéro.
    static func shortenNames(_ sources: [VideoSource]) -> [VideoSource] {
        let names = sources.map(\.camera)
        guard names.count > 1 else { return sources }

        let separators = CharacterSet(charactersIn: " -_·—–")
        var prefix = names.dropFirst().reduce(names[0]) { $0.commonPrefix(with: $1) }

        let remainders = { (cut: String) in
            names.map { $0.dropFirst(cut.count).trimmingCharacters(in: separators) }
        }
        let isOnlyNumbers = remainders(prefix).allSatisfy { !$0.isEmpty && $0.allSatisfy(\.isNumber) }
        if isOnlyNumbers {
            // Reculer d'un mot : `… - ISO ` devient `… - `, et la caméra
            // s'appelle de nouveau `ISO 1`.
            let trimmed = prefix.trimmingCharacters(in: separators)
            if let lastSeparator = trimmed.rangeOfCharacter(from: separators, options: .backwards) {
                prefix = String(trimmed[trimmed.startIndex..<lastSeparator.upperBound])
            } else {
                prefix = ""
            }
        }

        return sources.map { source in
            var short = String(source.camera.dropFirst(prefix.count))
                .trimmingCharacters(in: separators)
            if short.isEmpty { short = source.camera }
            var copy = source
            copy.camera = short
            return copy
        }
    }
}
