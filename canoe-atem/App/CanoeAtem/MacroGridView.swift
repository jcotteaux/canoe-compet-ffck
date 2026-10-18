import SwiftUI
import AtemKit
import CanoeLiveKit

/// La grille de macros : la raison d'être de l'app. Un appui = une macro.
struct MacroGridView: View {
    @Environment(AppModel.self) private var model
    /// Largeur minimale d'une tuile : elle doit rester frappable d'un pouce,
    /// sans viser, ce qui fixe le nombre de colonnes plutôt que l'inverse.
    /// Compacte depuis qu'il y a dix-huit macros : on veut les voir toutes
    /// sans faire défiler.
    private let columns = [GridItem(.adaptive(minimum: 110), spacing: 8)]

    var body: some View {
        Group {
            if model.atem.usedMacros.isEmpty {
                emptyState
            } else {
                ScrollView {
                    VStack(spacing: 8) {
                        // La macro mise en avant ouvre la grille sur toute sa
                        // largeur, et n'est pas répétée parmi les autres.
                        if let featured {
                            MacroButton(macro: featured, isRunning: model.isRunning(featured), isFeatured: true) {
                                model.run(macro: featured)
                            }
                        }
                        LazyVGrid(columns: columns, spacing: 8) {
                            ForEach(model.atem.usedMacros.filter { $0.index != featured?.index }) { macro in
                                MacroButton(macro: macro, isRunning: model.isRunning(macro)) {
                                    model.run(macro: macro)
                                }
                            }
                        }
                    }
                    .padding(12)
                }
            }
        }
    }

    /// Introuvable sur le mélangeur, elle est ignorée : le réglage reste, et
    /// elle reviendra dès que la macro existera de nouveau.
    private var featured: AtemMacro? {
        guard let index = model.featuredMacro else { return nil }
        return model.atem.usedMacros.first { $0.index == index }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "square.grid.2x2")
                .font(.system(size: 38))
                .foregroundStyle(Theme.textMuted)
            Text(model.atemStatus.isConnected ? "Aucune macro enregistrée" : "Mélangeur non connecté")
                .font(.headline)
                .foregroundStyle(Theme.text)
            Text(model.atemStatus.isConnected
                 ? "Les macros s'enregistrent depuis ATEM Software Control ; elles apparaissent ici aussitôt."
                 : model.atemStatus.label)
                .font(.subheadline)
                .foregroundStyle(Theme.textMuted)
                .multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct MacroButton: View {
    let macro: AtemMacro
    let isRunning: Bool
    var isFeatured = false
    let action: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text("\(macro.index + 1)")
                        .font(.caption2.monospacedDigit().weight(.bold))
                        .foregroundStyle(Theme.textMuted)
                    if isFeatured {
                        Image(systemName: "star.fill")
                            .font(.caption2)
                            .foregroundStyle(Theme.running)
                    }
                    Spacer()
                    if isRunning {
                        Image(systemName: "play.fill")
                            .font(.caption2)
                            .foregroundStyle(Theme.running)
                    }
                }

                Text(macro.displayName)
                    .font(isFeatured ? .title3.weight(.bold) : .subheadline.weight(.semibold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)

                if !macro.description.isEmpty {
                    Text(macro.description)
                        .font(.caption2)
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                        .multilineTextAlignment(.leading)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .topLeading)
            .padding(10)
            .cardBackground(background)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.corner, style: .continuous)
                    .stroke(border, lineWidth: isRunning || isFeatured ? 2 : 1)
            )
            .scaleEffect(isPressed ? 0.97 : 1)
        }
        .buttonStyle(.plain)
        .animation(.easeOut(duration: 0.12), value: isPressed)
        .animation(.easeOut(duration: 0.2), value: isRunning)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in isPressed = true }
                .onEnded { _ in isPressed = false }
        )
    }

    private var background: Color {
        if isRunning { return Theme.accent.opacity(0.35) }
        return isFeatured ? Theme.accent.opacity(0.18) : Theme.surface
    }

    private var border: Color {
        if isRunning { return Theme.running }
        return isFeatured ? Theme.accent : Theme.separator
    }
}
