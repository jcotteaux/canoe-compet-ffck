import Foundation
import CanoeLiveKit

/// Un clip, désigné par ce qu'il montre plutôt que par son chemin : le nom de
/// fichier change avec le nom du bateau, qui arrive parfois après son chrono.
public struct ClipKey: Hashable, Sendable {
    public let bib: Int
    public let camera: String

    public init(bib: Int, camera: String) {
        self.bib = bib
        self.camera = camera
    }
}

/// Dans quelles conditions un clip a été découpé.
///
/// C'est l'identité d'une coupe : deux coupes de même empreinte donnent le
/// même fichier, et il n'y a rien à refaire. Toute différence — l'arrivée
/// corrigée par le jury, les horloges recalées, une fin manquante désormais
/// enregistrée — vaut découpage.
public struct ClipStamp: Hashable, Sendable {
    /// La fenêtre demandée, en heure de course.
    public let windowStartMs: Int
    public let windowEndMs: Int
    /// Le décalage des horloges appliqué : il déplace la coupe dans le fichier.
    public let offsetMs: Int
    /// La coupe s'arrête avant la fin de la fenêtre.
    public let isShortAtEnd: Bool
    /// Le chrono et les pénalités sont gravés dans l'image. Changer d'avis
    /// change le fichier : l'empreinte le porte, et tout se refait.
    public let isBurned: Bool

    public init(windowStartMs: Int, windowEndMs: Int, offsetMs: Int,
                isShortAtEnd: Bool, isBurned: Bool = false) {
        self.windowStartMs = windowStartMs
        self.windowEndMs = windowEndMs
        self.offsetMs = offsetMs
        self.isShortAtEnd = isShortAtEnd
        self.isBurned = isBurned
    }
}

/// Ce qu'il reste à découper, à un instant donné.
///
/// Le plan est recalculé de zéro à chaque passage plutôt que tenu à jour au fil
/// de l'eau : le plateau bouge — un chrono corrigé, une pénalité ajoutée, une
/// caméra branchée en retard — et une file constituée une fois pour toutes
/// vieillirait sans qu'on le voie.
public enum ClipPlan {

    public struct Item: Sendable, Identifiable {
        public let key: ClipKey
        public let job: ClipJob
        public let stamp: ClipStamp
        /// De quoi graver l'incrustation, quand elle est demandée.
        public let board: ScoreBoard?
        /// Heure d'arrivée du bateau : sert à traiter les dernières descentes
        /// d'abord.
        public let finishMs: Int

        public var id: URL { job.outputURL }
    }

    /// Les découpages manquants, les descentes les plus récentes d'abord.
    ///
    /// Trois raisons de ne rien avoir : le bateau vient d'arriver, la coupe
    /// précédente a été rognée sur un ISO qui s'écrivait encore, ou une
    /// correction du jury a déplacé la fenêtre. Le plan ne les distingue pas —
    /// il regarde ce qui devrait exister et ce qui existe.
    ///
    /// - Parameter growing: les enregistrements dont la durée a augmenté depuis
    ///   le passage précédent. Une coupe écourtée sur l'un d'eux est **remise à
    ///   plus tard** : elle sera entière au prochain passage, et un clip qui
    ///   s'arrête avant l'arrivée est pire que pas de clip — le juge y verrait
    ///   une descente finie. Sur un enregistrement qui ne grandit plus, il n'y
    ///   a en revanche plus rien à attendre, et on découpe ce qu'on a.
    /// - Parameter done: les empreintes déjà découpées, par clip.
    public static func pending(race: CanoeState,
                               sources: [VideoSource],
                               growing: Set<URL>,
                               done: [ClipKey: ClipStamp],
                               offsetMs: Int,
                               padSeconds: Double = 5,
                               burnIn: Bool = false,
                               into directory: URL) -> [Item] {
        var items: [Item] = []

        for entry in race.field {
            // Les arrivés seulement. Un bateau sur l'eau n'a pas de borne
            // haute : `JudgeSequence` lui en invente une de trois minutes pour
            // que le juge puisse quand même regarder, mais découper là-dessus
            // produirait un clip faux qu'il faudrait refaire à l'arrivée.
            guard let finishMs = entry.finishMs else { continue }

            let sequence = JudgeMarks.sequence(for: entry,
                                               events: race.penaltyEvents(bib: entry.bib),
                                               gateCount: race.gateCount)
            guard let window = sequence.window(padSeconds: padSeconds) else { continue }
            let board = burnIn ? ScoreBoard.make(entry: entry, sequence: sequence) : nil

            for source in sources {
                // `nil` : la descente ne tombe pas dans cet enregistrement.
                // Rien à faire maintenant, et rien à mémoriser — si la caméra
                // rattrape son retard, le passage suivant le verra.
                guard let job = ClipExporter.job(for: entry, sequence: sequence, source: source,
                                                 offsetMs: offsetMs, padSeconds: padSeconds,
                                                 into: directory) else { continue }

                let key = ClipKey(bib: entry.bib, camera: source.camera)
                let stamp = ClipStamp(windowStartMs: window.lowerBound,
                                      windowEndMs: window.upperBound,
                                      offsetMs: offsetMs,
                                      isShortAtEnd: job.isShortAtEnd,
                                      isBurned: burnIn)

                if done[key] == stamp { continue }
                if job.isShortAtEnd, growing.contains(source.url) { continue }

                items.append(Item(key: key, job: job, stamp: stamp, board: board, finishMs: finishMs))
            }
        }

        // Les dernières descentes d'abord : sur un retard de plusieurs
        // bateaux, celle qu'on va nous réclamer est celle qui vient de passer,
        // pas celle d'il y a une heure.
        return items.sorted { $0.finishMs > $1.finishMs }
    }
}
