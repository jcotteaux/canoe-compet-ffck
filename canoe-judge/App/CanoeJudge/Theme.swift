import SwiftUI
import CanoeLiveKit

/// Palette sombre, reprise de l'app de régie pour que les deux se lisent comme
/// un même ensemble. Ici la raison est autre : on regarde des images de
/// rivière pendant des heures, et une interface claire autour du cadre fausse
/// l'appréciation de ce qu'on y voit.
enum Theme {
    static let background = Color(red: 0.05, green: 0.06, blue: 0.09)
    static let surface = Color(red: 0.10, green: 0.12, blue: 0.16)
    static let surfaceRaised = Color(red: 0.15, green: 0.17, blue: 0.23)
    static let separator = Color.white.opacity(0.08)

    static let text = Color.white
    static let textMuted = Color.white.opacity(0.55)

    static let accent = Color(red: 0.145, green: 0.431, blue: 0.710)
    static let running = Color(red: 0.99, green: 0.74, blue: 0.16)
    static let ok = Color(red: 0.24, green: 0.76, blue: 0.47)
    /// Le 50 : la seule pénalité qui décide d'une course, donc la seule qui a
    /// droit au rouge plein.
    static let fifty = Color(red: 0.85, green: 0.18, blue: 0.20)
    static let touch = Color(red: 0.85, green: 0.55, blue: 0.10)

    static let corner: CGFloat = 10
}

/// La pastille d'une porte pénalisée.
struct PenaltyBadge: View {
    let penalty: CanoeGatePenalty
    var compact = false

    var body: some View {
        HStack(spacing: 3) {
            Text("p\(penalty.gate)")
                .foregroundStyle(.white.opacity(0.75))
            Text("\(penalty.seconds)")
                .fontWeight(.bold)
            if penalty.isLive { Text("•").foregroundStyle(.white.opacity(0.9)) }
        }
        .font(.system(size: compact ? 10 : 11, weight: .semibold, design: .rounded))
        .monospacedDigit()
        .padding(.horizontal, 5)
        .padding(.vertical, 2)
        .background(penalty.isFifty ? Theme.fifty : Theme.touch,
                    in: RoundedRectangle(cornerRadius: 4, style: .continuous))
        .foregroundStyle(.white)
        .help(penalty.isLive
              ? "Porte \(penalty.gate) : \(penalty.seconds) — entendue en direct, pas encore au classement"
              : "Porte \(penalty.gate) : \(penalty.seconds)")
    }
}

struct StatusDot: View {
    let status: LinkStatus

    private var color: Color {
        switch status {
        case .connected: Theme.ok
        case .connecting: Theme.running
        case .lost: Theme.fifty
        case .idle: Theme.textMuted
        }
    }

    var body: some View {
        Circle().fill(color).frame(width: 8, height: 8)
            .shadow(color: color.opacity(0.7), radius: 3)
    }
}

extension View {
    func panelBackground() -> some View {
        background(Theme.surface)
    }
}

/// `14:03:31.24` — l'heure de course au centième, la seule unité commune au
/// chronométrage et à la vidéo.
func formatClockPrecise(_ ms: Int) -> String {
    let total = max(0, ms)
    return String(format: "%02d:%02d:%02d.%02d",
                  total / 3_600_000, (total / 60_000) % 60, (total / 1000) % 60,
                  (total % 1000) / 10)
}
