import SwiftUI
import AtemKit
import CanoeLiveKit

/// Les bateaux en course et les prochains départs.
///
/// L'information sert à décider quoi envoyer à l'antenne : qui est sur l'eau
/// et depuis combien de temps, qui part dans un instant. Rien d'autre.
struct LivePanel: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                onCourseSection
                startersSection
            }
            .padding(16)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(model.canoe.headline.isEmpty ? "Aucune course chargée" : model.canoe.headline)
                .font(.headline)
                .foregroundStyle(Theme.text)
            HStack(spacing: 8) {
                if !model.canoe.place.isEmpty {
                    Text(model.canoe.place).foregroundStyle(Theme.textMuted)
                }
                Text(Chrono.formatClock(model.canoe.clockMs))
                    .monospacedDigit()
                    .foregroundStyle(Theme.textMuted)
            }
            .font(.subheadline)
        }
    }

    private var onCourseSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionTitle("En course", count: model.canoe.onCourse.count)
            if model.canoe.onCourse.isEmpty {
                EmptyLine(model.canoeStatus.isConnected ? "Personne sur l'eau" : model.canoeStatus.label)
            } else {
                ForEach(model.canoe.onCourse) { boat in
                    OnCourseRow(boat: boat)
                }
            }
        }
    }

    private var startersSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionTitle("Prochains départs", count: model.canoe.nextStarters.count)
            if model.canoe.nextStarters.isEmpty {
                EmptyLine("Aucun départ programmé")
            } else {
                ForEach(model.canoe.nextStarters) { starter in
                    StarterRow(starter: starter, clockMs: model.canoe.clockMs)
                }
            }
        }
    }
}

private struct SectionTitle: View {
    let title: String
    let count: Int

    init(_ title: String, count: Int) {
        self.title = title
        self.count = count
    }

    var body: some View {
        HStack(spacing: 6) {
            Text(title.uppercased())
                .font(.caption.weight(.bold))
                .foregroundStyle(Theme.textMuted)
            if count > 0 {
                Text("\(count)")
                    .font(.caption2.weight(.bold).monospacedDigit())
                    .foregroundStyle(Theme.textMuted)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1)
                    .background(Theme.surfaceRaised, in: Capsule())
            }
        }
    }
}

private struct EmptyLine: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(Theme.textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .cardBackground()
    }
}

struct BibBadge: View {
    let bib: Int

    var body: some View {
        Text("\(bib)")
            .font(.subheadline.weight(.bold).monospacedDigit())
            .foregroundStyle(Theme.text)
            .frame(minWidth: 34)
            .padding(.vertical, 5)
            .background(Theme.accent, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
    }
}

struct OnCourseRow: View {
    let boat: CanoeBoat

    var body: some View {
        HStack(spacing: 10) {
            BibBadge(bib: boat.bib)

            VStack(alignment: .leading, spacing: 2) {
                Text(boat.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                if !boat.epreuve.isEmpty {
                    Text(boat.epreuve)
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                }
            }

            Spacer(minLength: 6)

            // Le cumul de pénalités explique un temps qui a « sauté » : il est
            // déjà compris dans le temps classant, pas dans le chrono tournant.
            if boat.penaltySeconds > 0 {
                Text("+\(boat.penaltySeconds)")
                    .font(.caption.weight(.bold).monospacedDigit())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(Theme.penalty, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            }

            Text(Chrono.format(boat.elapsedMs))
                .font(.title3.weight(.semibold).monospacedDigit())
                .foregroundStyle(Theme.text)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .cardBackground()
    }
}

struct StarterRow: View {
    let starter: CanoeStarter
    let clockMs: Int

    private var remaining: Int { starter.remainingMs(clockMs: clockMs) }
    /// Sous trente secondes, le départ est imminent : c'est le moment où la
    /// régie doit déjà être sur la bonne caméra.
    private var isImminent: Bool { remaining >= 0 && remaining < 30_000 }

    var body: some View {
        HStack(spacing: 10) {
            BibBadge(bib: starter.bib)

            VStack(alignment: .leading, spacing: 2) {
                Text(starter.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                Text([starter.epreuve, Chrono.formatClock(starter.startMs)].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(Theme.textMuted)
            }

            Spacer(minLength: 6)

            Text(Chrono.formatCountdown(remaining))
                .font(.title3.weight(.semibold).monospacedDigit())
                .foregroundStyle(isImminent ? Theme.running : Theme.text)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .cardBackground(isImminent ? Theme.surfaceRaised : Theme.surface)
    }
}

/// Version compacte pour l'iPhone : le bateau en course le plus avancé et le
/// prochain départ. Au-delà, la grille de macros serait repoussée hors écran.
struct LiveStrip: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 8) {
            if let boat = model.canoe.onCourse.first {
                OnCourseRow(boat: boat)
            }
            if let starter = model.canoe.nextStarters.first {
                StarterRow(starter: starter, clockMs: model.canoe.clockMs)
            }
        }
    }
}
