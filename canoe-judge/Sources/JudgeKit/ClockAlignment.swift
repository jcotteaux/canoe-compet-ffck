import Foundation

/// Millisecondes écoulées depuis minuit, dans le fuseau local.
///
/// C'est l'unité de competFFCK pour les heures de départ et l'horloge de
/// course, et c'est donc l'unité de tout ce qui doit se recouper avec elle.
public func timeOfDayMs(_ date: Date, calendar: Calendar = .current) -> Int {
    let parts = calendar.dateComponents([.hour, .minute, .second, .nanosecond], from: date)
    return (parts.hour ?? 0) * 3_600_000
        + (parts.minute ?? 0) * 60_000
        + (parts.second ?? 0) * 1000
        + (parts.nanosecond ?? 0) / 1_000_000
}

/// La correspondance entre l'horloge de la course et la position dans une vidéo.
///
/// Tout le jugement repose là-dessus : competFFCK dit « le dossard 12 est parti
/// à 14:00:00 », l'enregistrement dit « j'ai commencé à 13:47:31 », donc le
/// départ est à 12 min 29 s de vidéo. Sans cette conversion, il ne reste qu'à
/// chercher à la main dans deux heures d'images.
///
/// Les deux horloges ne sont pas la même : celle de l'enregistreur et celle du
/// chronométrage dérivent, et personne ne les synchronise sur un site de
/// course. D'où `offsetMs`, réglable en direct — c'est le seul réglage que le
/// juge aura à faire, et il se vérifie d'un coup d'œil sur un départ.
public struct ClockAlignment: Sendable, Equatable {
    /// Heure du jour du premier échantillon de l'enregistrement.
    public var recordingStartMs: Int
    /// Correction appliquée à l'horloge de course avant conversion. Positif =
    /// la vidéo est en avance sur le chronométrage.
    public var offsetMs: Int

    public init(recordingStartMs: Int, offsetMs: Int = 0) {
        self.recordingStartMs = recordingStartMs
        self.offsetMs = offsetMs
    }

    /// Position dans la vidéo, en secondes, d'une heure de course donnée.
    /// Peut être négative : l'instant demandé précède l'enregistrement.
    public func videoTime(atClock clockMs: Int) -> TimeInterval {
        Double(clockMs + offsetMs - recordingStartMs) / 1000
    }

    /// L'heure qu'il est à un instant de la vidéo.
    public func clock(atVideoTime seconds: TimeInterval) -> Int {
        recordingStartMs - offsetMs + Int((seconds * 1000).rounded())
    }

    /// Recale sur un repère vu à l'écran : « cette image-là, c'est ce
    /// départ-là ». Plus sûr que de saisir un décalage en secondes, qu'il
    /// faudrait d'abord calculer de tête et dont on se trompe de signe.
    public mutating func align(videoTime seconds: TimeInterval, toClock clockMs: Int) {
        offsetMs = recordingStartMs + Int((seconds * 1000).rounded()) - clockMs
    }

    /// `+1,25 s` / `−0,40 s`, tel qu'on l'affiche à côté du réglage.
    public var offsetLabel: String {
        String(format: "%@%.2f s", offsetMs < 0 ? "−" : "+", abs(Double(offsetMs)) / 1000)
    }
}
