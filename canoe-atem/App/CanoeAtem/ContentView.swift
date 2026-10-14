import SwiftUI
import AtemKit
import CanoeLiveKit

struct ContentView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var showingSettings = false

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()

            VStack(spacing: 0) {
                StatusBar(showingSettings: $showingSettings)
                Divider().overlay(Theme.separator)

                Group {
                    if sizeClass == .regular {
                        // iPad : les macros occupent la place, les infos de
                        // course restent visibles en permanence sur le côté.
                        // La largeur du panneau est fixée et la grille prend le
                        // reste : sans `maxWidth`, la grille se laisse
                        // comprimer par le contenu du panneau et retombe à une
                        // seule colonne.
                        HStack(spacing: 0) {
                            MacroGridView()
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                            Divider().overlay(Theme.separator)
                            LivePanel()
                                .frame(width: 340)
                        }
                    } else {
                        // iPhone : l'essentiel de la course en tête, les macros
                        // dessous.
                        ScrollView {
                            VStack(spacing: 12) {
                                LiveStrip()
                                    .padding(.horizontal, 16)
                                    .padding(.top, 12)
                                MacroGridView()
                                    .frame(minHeight: 220)
                            }
                        }
                    }
                }
                .frame(maxHeight: .infinity)

                // La commande de secteur est ancrée en bas et ne défile pas :
                // c'est le geste répété d'une descente, il doit tomber au même
                // endroit à chaque fois, et sous le pouce sur un téléphone.
                Divider().overlay(Theme.separator)
                SectorControl()
                    .background(Theme.surface)
            }
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $showingSettings) {
            SettingsView()
        }
        .onAppear {
            if model.isConfigured {
                model.connect()
            } else {
                showingSettings = true
            }
        }
    }
}

struct StatusBar: View {
    @Environment(AppModel.self) private var model
    @Binding var showingSettings: Bool

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    StatusDot(status: model.atemStatus)
                    Text(model.atem.productName.isEmpty ? "ATEM" : model.atem.productName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.text)
                        .lineLimit(1)
                }
                if model.atemStatus.isConnected {
                    Text("PGM \(model.atem.inputName(model.atem.program))")
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                } else {
                    Text(model.atemStatus.label)
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            if model.atem.streaming == .streaming {
                Pill(text: "DIRECT", color: Theme.live)
            }
            if model.atem.isRecording {
                Pill(text: "REC", color: Theme.live)
            }
            if model.atem.macroRun.isRunning {
                Button { model.stopMacro() } label: {
                    Pill(text: "MACRO ■", color: Theme.running)
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 6) {
                StatusDot(status: model.canoeStatus)
                Text("Live")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.textMuted)
            }

            Button { showingSettings = true } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.textMuted)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Theme.surface)
    }
}

struct Pill: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption2.weight(.bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(color, in: Capsule())
    }
}
