import SwiftUI
import AtemKit
import CanoeLiveKit

/// La grille de macros : la raison d'être de l'app. Un appui = une macro.
struct MacroGridView: View {
    @Environment(AppModel.self) private var model
    /// Largeur minimale d'une tuile : elle doit rester frappable d'un pouce,
    /// sans viser, ce qui fixe le nombre de colonnes plutôt que l'inverse.
    private let columns = [GridItem(.adaptive(minimum: 160), spacing: 12)]

    var body: some View {
        Group {
            if model.atem.usedMacros.isEmpty {
                emptyState
            } else {
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(model.atem.usedMacros) { macro in
                            MacroButton(macro: macro, isRunning: model.isRunning(macro)) {
                                model.run(macro: macro)
                            }
                        }
                    }
                    .padding(16)
                }
            }
        }
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
    let action: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("\(macro.index + 1)")
                        .font(.caption.monospacedDigit().weight(.bold))
                        .foregroundStyle(Theme.textMuted)
                    Spacer()
                    if isRunning {
                        Image(systemName: "play.fill")
                            .font(.caption)
                            .foregroundStyle(Theme.running)
                    }
                }

                Text(macro.displayName)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)

                if !macro.description.isEmpty {
                    Text(macro.description)
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
            .padding(14)
            .cardBackground(isRunning ? Theme.accent.opacity(0.35) : Theme.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.corner, style: .continuous)
                    .stroke(isRunning ? Theme.running : Theme.separator, lineWidth: isRunning ? 2 : 1)
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
}
