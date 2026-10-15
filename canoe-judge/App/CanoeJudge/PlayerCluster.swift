import AVFoundation
import Observation
import JudgeKit

/// Les caméras jouées ensemble, pilotées par **l'heure de course** et non par
/// une position de fichier.
///
/// C'est le choix qui structure tout : deux ISO ne commencent jamais à la même
/// seconde — une caméra allumée en retard, une carte remplacée en cours de
/// journée. Les caler sur « 0 s de fichier » les décale d'autant à l'écran.
/// Caler chacune sur l'heure qu'il est les remet ensemble, et rend la position
/// commune directement comparable à ce que dit le chronométrage.
@MainActor
@Observable
final class PlayerCluster {
    /// Une caméra : une case de la grille et un lecteur, quel que soit le
    /// nombre de fichiers. L'ATEM en ouvre un nouveau à chaque reprise
    /// d'enregistrement ; le lecteur charge celui qui couvre l'instant demandé.
    struct Lane: Identifiable {
        let camera: String
        /// Les fichiers de la caméra, du plus ancien au plus récent.
        var segments: [VideoSource]
        let player: AVPlayer
        /// Le fichier chargé dans le lecteur.
        var loaded = 0
        var id: String { camera }
        var source: VideoSource { segments[loaded] }
    }

    private(set) var lanes: [Lane] = []
    /// Position courante, en heure de course (millisecondes depuis minuit).
    private(set) var clockMs = 0
    private(set) var rate: Float = 0
    /// Recalage commun à toutes les caméras — elles enregistrent depuis le même
    /// mélangeur, leur horloge est la même.
    var offsetMs = 0

    var isPlaying: Bool { rate != 0 }

    private var ticker: Task<Void, Never>?

    // MARK: - Ouverture

    func open(_ sources: [VideoSource]) {
        close()
        lanes = Self.group(sources).map { camera, segments in
            let player = AVPlayer(url: segments[0].url)
            player.actionAtItemEnd = .pause
            player.isMuted = true
            // Sans cela, AVPlayer retarde le démarrage pour constituer un
            // tampon : les caméras ne partent alors plus ensemble.
            player.automaticallyWaitsToMinimizeStalling = false
            return Lane(camera: camera, segments: segments, player: player)
        }
        clockMs = coverage?.lowerBound ?? 0
        seek(toClock: clockMs)
        startTicker()
    }

    func close() {
        ticker?.cancel()
        ticker = nil
        lanes.forEach { $0.player.pause() }
        lanes = []
        rate = 0
    }

    /// Les fichiers rangés par caméra, dans l'ordre où les caméras arrivent.
    private static func group(_ sources: [VideoSource]) -> [(String, [VideoSource])] {
        var order: [String] = []
        var byCamera: [String: [VideoSource]] = [:]
        for source in sources {
            if byCamera[source.camera] == nil { order.append(source.camera) }
            byCamera[source.camera, default: []].append(source)
        }
        return order.map { ($0, byCamera[$0]!.sorted { $0.startMs < $1.startMs }) }
    }

    /// L'intervalle d'heures de course couvert par au moins une caméra.
    ///
    /// En heure de **course** : le recalage s'applique. Sans lui, une fois les
    /// horloges recalées, chaque déplacement était ramené dans les heures de
    /// l'enregistreur, c'est-à-dire à côté de la descente.
    var coverage: ClosedRange<Int>? {
        let segments = lanes.flatMap(\.segments)
        guard !segments.isEmpty else { return nil }
        let starts = segments.map { $0.startMs - offsetMs }
        let ends = segments.map { $0.startMs - offsetMs + Int($0.durationSeconds * 1000) }
        guard let low = starts.min(), let high = ends.max(), low < high else { return nil }
        return low...high
    }

    func videoTime(_ source: VideoSource, atClock clockMs: Int) -> TimeInterval {
        source.alignment(offsetMs: offsetMs).videoTime(atClock: clockMs)
    }

    /// Le fichier de la caméra qui couvre cet instant.
    private func segment(of lane: Lane, clockMs: Int) -> Int? {
        lane.segments.firstIndex { source in
            let t = videoTime(source, atClock: clockMs)
            return t >= 0 && t <= source.durationSeconds
        }
    }

    /// Une caméra couvre-t-elle cet instant ? Une caméra qui ne le couvre pas
    /// affiche une ardoise plutôt qu'une image gelée d'un autre moment.
    func covers(_ lane: Lane, clockMs: Int) -> Bool {
        segment(of: lane, clockMs: clockMs) != nil
    }

    /// Charge dans le lecteur le fichier qui couvre l'instant, et dit où s'y
    /// placer. `nil` : la caméra n'enregistrait pas.
    private func prepare(_ index: Int, atClock clockMs: Int) -> TimeInterval? {
        guard let segment = segment(of: lanes[index], clockMs: clockMs) else { return nil }
        if lanes[index].loaded != segment {
            lanes[index].loaded = segment
            lanes[index].player.replaceCurrentItem(with: AVPlayerItem(url: lanes[index].source.url))
        }
        return videoTime(lanes[index].source, atClock: clockMs)
    }

    // MARK: - Déplacement

    func seek(toClock target: Int) {
        let clamped = coverage.map { min(max(target, $0.lowerBound), $0.upperBound) } ?? target
        clockMs = clamped
        for index in lanes.indices {
            guard let seconds = prepare(index, atClock: clamped) else { continue }
            let lane = lanes[index]
            // Tolérance nulle : sur un jugement, « à peu près la bonne image »
            // n'est pas une réponse. C'est plus lent, et c'est le prix.
            lane.player.seek(to: CMTime(seconds: seconds, preferredTimescale: 600),
                             toleranceBefore: .zero, toleranceAfter: .zero)
        }
    }

    func nudge(seconds: Double) {
        pause()
        seek(toClock: clockMs + Int(seconds * 1000))
    }

    /// Avance ou recule d'une image sur chaque caméra.
    ///
    /// C'est le geste du jugement : une touche se voit sur une image, pas sur
    /// une seconde. `step(byCount:)` demande l'image suivante au décodeur, ce
    /// qu'un déplacement en temps ne sait pas faire.
    func step(frames: Int) {
        pause()
        var reference: Int?
        for lane in lanes where covers(lane, clockMs: clockMs) {
            guard let item = lane.player.currentItem,
                  frames > 0 ? item.canStepForward : item.canStepBackward else { continue }
            item.step(byCount: frames)
            if reference == nil {
                reference = lane.source.alignment(offsetMs: offsetMs)
                    .clock(atVideoTime: item.currentTime().seconds)
            }
        }
        if let reference { clockMs = reference }
    }

    // MARK: - Lecture

    func play(rate newRate: Float) {
        guard !lanes.isEmpty else { return }
        // La marche arrière dépend du codec : H.264 la refuse souvent. Jouer
        // seulement les pistes qui l'acceptent désynchroniserait la grille —
        // mieux vaut ne rien faire, l'image par image reste disponible.
        if newRate < 0 {
            let supported = lanes.allSatisfy {
                guard let item = $0.player.currentItem else { return false }
                return newRate <= -1 ? item.canPlayReverse : item.canPlaySlowReverse
            }
            guard supported else { return }
        }
        // Un même instant d'horloge hôte pour toutes les pistes : elles
        // démarrent à la même image plutôt qu'à la même milliseconde de code.
        let start = CMClockGetTime(CMClockGetHostTimeClock())
            + CMTime(seconds: 0.2, preferredTimescale: 600)

        for index in lanes.indices {
            guard let seconds = prepare(index, atClock: clockMs) else {
                lanes[index].player.rate = 0
                continue
            }
            lanes[index].player.setRate(newRate,
                                time: CMTime(seconds: seconds, preferredTimescale: 600),
                                atHostTime: start)
        }
        rate = newRate
    }

    func pause() {
        lanes.forEach { $0.player.rate = 0 }
        rate = 0
    }

    func togglePlay(rate: Float = 1) {
        isPlaying ? pause() : play(rate: rate)
    }

    /// Relit la position depuis la première caméra qui couvre l'instant, dix
    /// fois par seconde. La position commune est celle de l'image affichée, pas
    /// celle qu'on a demandée.
    private func startTicker() {
        ticker?.cancel()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                guard let self, self.isPlaying else { continue }
                guard let lane = self.lanes.first(where: { self.covers($0, clockMs: self.clockMs) }) else { continue }
                let seconds = lane.player.currentTime().seconds
                guard seconds.isFinite else { continue }
                self.clockMs = lane.source.alignment(offsetMs: self.offsetMs).clock(atVideoTime: seconds)
            }
        }
    }

    // MARK: - Fichiers qui grossissent

    /// Remplace les pistes dont le fichier a grandi, en gardant la position.
    ///
    /// Pendant la course, l'ISO en cours d'écriture grossit ; AVFoundation a lu
    /// sa durée à l'ouverture et ne la reverra pas. Sans ce rechargement, la
    /// descente qui vient de se terminer reste inatteignable — c'est-à-dire
    /// justement celle sur laquelle on est appelé.
    func refresh(with updated: [VideoSource]) {
        let position = clockMs
        // Relevé avant la pause, qui remet la vitesse à zéro : sans cela on
        // repartait toujours à 1×, en plein ralenti de jugement.
        let previousRate = rate
        pause()

        let groups = Dictionary(uniqueKeysWithValues: Self.group(updated))
        for index in lanes.indices {
            // Une nouvelle prise de la caméra rejoint sa case : elle était
            // jusque-là inatteignable.
            guard let fresh = groups[lanes[index].camera], !fresh.isEmpty else { continue }
            let shown = lanes[index].source
            lanes[index].segments = fresh
            if let kept = fresh.firstIndex(where: { $0.url == shown.url }) {
                lanes[index].loaded = kept
                guard fresh[kept].durationSeconds > shown.durationSeconds + 0.5 else { continue }
            } else {
                lanes[index].loaded = 0
            }
            lanes[index].player.replaceCurrentItem(with: AVPlayerItem(url: lanes[index].source.url))
        }
        seek(toClock: position)
        if previousRate != 0 { play(rate: previousRate) }
    }
}
