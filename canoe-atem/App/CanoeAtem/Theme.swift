import SwiftUI

/// Palette sombre à fort contraste : l'app s'utilise dehors, au bord de l'eau,
/// souvent en plein soleil et parfois sous la pluie. Un fond clair y est
/// illisible et éclaire le visage en régie de nuit.
enum Theme {
    static let background = Color(red: 0.05, green: 0.06, blue: 0.09)
    static let surface = Color(red: 0.10, green: 0.12, blue: 0.16)
    static let surfaceRaised = Color(red: 0.15, green: 0.17, blue: 0.23)
    static let separator = Color.white.opacity(0.08)

    static let text = Color.white
    static let textMuted = Color.white.opacity(0.55)

    /// Le bleu des habillages TV de canoe-wslive, pour que l'app et l'antenne
    /// se lisent comme un même ensemble.
    static let accent = Color(red: 0.145, green: 0.431, blue: 0.710)
    static let running = Color(red: 0.99, green: 0.74, blue: 0.16)
    static let live = Color(red: 0.92, green: 0.26, blue: 0.26)
    static let ok = Color(red: 0.24, green: 0.76, blue: 0.47)
    static let penalty = Color(red: 0.85, green: 0.22, blue: 0.22)

    static let corner: CGFloat = 14
}

extension View {
    func cardBackground(_ color: Color = Theme.surface) -> some View {
        background(color, in: RoundedRectangle(cornerRadius: Theme.corner, style: .continuous))
    }
}

/// Pastille d'état d'une liaison.
struct StatusDot: View {
    let status: LinkStatus

    private var color: Color {
        switch status {
        case .connected: Theme.ok
        case .connecting: Theme.running
        case .lost: Theme.live
        case .idle: Theme.textMuted
        }
    }

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 8, height: 8)
            .shadow(color: color.opacity(0.7), radius: 3)
    }
}
