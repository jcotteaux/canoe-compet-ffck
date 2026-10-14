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
    struct Lane: Identifiable {
        var source: VideoSource
        let player: AVPlayer
        var id: URL { source.url }
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
        lanes = sources.map { source in
            let player = AVPlayer(url: source.url)
            player.actionAtItemEnd = .pause
            player.isMuted = true
            // Sans cela, AVPlayer retarde le démarrage pour constituer un
            // tampon : les caméras ne partent alors plus ensemble.
            player.automaticallyWaitsToMinimizeStalling = false
            return Lane(source: source, player: player)
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

    /// L'intervalle d'heures couvert par au moins une caméra.
    var coverage: ClosedRange<Int>? {
        guard !lanes.isEmpty else { return nil }
        let starts = lanes.map(\.source.startMs)
        let ends = lanes.map { $0.source.startMs + Int($0.source.durationSeconds * 1000) }
        guard let low = starts.min(), let high = ends.max(), low < high else { return nil }
        return low...high
    }

    func videoTime(_ lane: Lane, atClock clockMs: Int) -> TimeInterval {
        lane.source.alignment(offsetMs: offsetMs).videoTime(atClock: clockMs)
    }

    /// Une caméra couvre-t-elle cet instant ? Une caméra qui ne le couvre pas
    /// affiche une ardoise plutôt qu'une image gelée d'un autre moment.
    func covers(_ lane: Lane, clockMs: Int) -> Bool {
        let t = videoTime(lane, atClock: clockMs)
        return t >= 0 && t <= lane.source.durationSeconds
    }

    // MARK: - Déplacement

    func seek(toClock target: Int) {
        let clamped = coverage.map { min(max(target, $0.lowerBound), $0.upperBound) } ?? target
        clockMs = clamped
        for lane in lanes {
            let seconds = videoTime(lane, atClock: clamped)
            guard seconds >= 0, seconds <= lane.source.durationSeconds else { continue }
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

        for lane in lanes {
            let seconds = videoTime(lane, atClock: clockMs)
            guard seconds >= 0, seconds <= lane.source.durationSeconds else {
                lane.player.rate = 0
                continue
            }
            lane.player.setRate(newRate,
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

        for (index, lane) in lanes.enumerated() {
            guard let fresh = updated.first(where: { $0.url == lane.source.url }) else { continue }
            guard fresh.durationSeconds > lane.source.durationSeconds + 0.5 else {
                lanes[index].source = fresh
                continue
            }
            lanes[index].source = fresh
            lane.player.replaceCurrentItem(with: AVPlayerItem(url: fresh.url))
        }
        seek(toClock: position)
        if previousRate != 0 { play(rate: previousRate) }
    }
}
