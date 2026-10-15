import SwiftUI
import AtemKit

/// Le pilotage par secteurs : la bande des secteurs et le bouton qui avance.
///
/// C'est le geste principal pendant une descente. Le bouton est volontairement
/// plus grand que tout le reste : on le presse en regardant la rivière, pas
/// l'écran.
struct SectorControl: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 10) {
            SectorBar()
            NextSectorButton()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

struct SectorBar: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        HStack(spacing: 6) {
            ForEach(model.sectors.activeSectors, id: \.self) { sector in
                SectorPill(
                    number: sector + 1,
                    macro: model.macro(for: sector),
                    isCurrent: model.sectors.current == sector
                ) {
                    model.selectSector(sector)
                }
            }
        }
    }
}

private struct SectorPill: View {
    let number: Int
    let macro: AtemMacro?
    let isCurrent: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text("\(number)")
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(isCurrent ? Theme.text : Theme.textMuted)
                Text(macro?.displayName ?? "—")
                    .font(.caption2)
                    .foregroundStyle(isCurrent ? Theme.text.opacity(0.85) : Theme.textMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .padding(.horizontal, 4)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(isCurrent ? Theme.accent : Theme.surfaceRaised)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(isCurrent ? Theme.text.opacity(0.35) : Theme.separator, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .animation(.easeOut(duration: 0.18), value: isCurrent)
    }
}

struct NextSectorButton: View {
    @Environment(AppModel.self) private var model

    private var nextMacro: AtemMacro? { model.macro(for: model.sectors.nextSector) }
    /// Sans plusieurs secteurs il n'y a pas de « suivant » : le bouton rejoue
    /// alors la même macro, ce qui reste utile pour relancer un cadrage.
    private var isCycle: Bool { model.sectors.count > 1 }

    var body: some View {
        Button {
            model.advanceSector()
        } label: {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(isCycle ? "SECTEUR SUIVANT" : "REJOUER LE SECTEUR")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Theme.text.opacity(0.7))
                    // On annonce ce qu'on s'apprête à envoyer : le bouton est
                    // pressé sans regarder, mais il se vérifie d'un coup d'œil.
                    Text(nextMacro?.displayName ?? "Aucune macro affectée")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(nextMacro == nil ? Theme.text.opacity(0.5) : Theme.text)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }

                Spacer(minLength: 8)

                if isCycle {
                    Text("\(model.sectors.current + 1) → \(model.sectors.nextSector + 1)")
                        .font(.headline.monospacedDigit())
                        .foregroundStyle(Theme.text.opacity(0.8))
                }
                Image(systemName: "chevron.right.circle.fill")
                    .font(.system(size: 30))
                    .foregroundStyle(Theme.text.opacity(0.9))
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, minHeight: 78)
            .background(Theme.accent, in: RoundedRectangle(cornerRadius: Theme.corner, style: .continuous))
        }
        .buttonStyle(PressableButtonStyle())
        // La barre d'espace d'un clavier, ou d'une télécommande Bluetooth qui
        // en envoie une : on change de caméra sans quitter l'image des yeux.
        .keyboardShortcut(.space, modifiers: [])
    }
}

/// Un simple retour d'appui. `.buttonStyle(.plain)` n'en donne aucun, et sans
/// lui on ne sait pas si l'appui a porté.
struct PressableButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}
