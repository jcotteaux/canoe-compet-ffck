import SwiftUI
import CanoeLiveKit
import JudgeKit

struct ContentView: View {
    @Bindable var model: JudgeModel
    @State private var zoomed: String?
    @State private var showSettings = false
    @FocusState private var searchFocused: Bool
    /// Le focus des touches du jugement. Rien ne le donnait au lancement :
    /// flèches et espace restaient sans effet tant qu'on n'avait pas cliqué
    /// dans la liste.
    @FocusState private var keysFocused: Bool

    var body: some View {
        HSplitView {
            FieldPanel(model: model, searchFocused: $searchFocused)
                .frame(minWidth: 230, idealWidth: 290, maxWidth: 420)

            VStack(spacing: 0) {
                MulticamGrid(model: model, zoomed: $zoomed)
                    // Un clic sur l'image rend les touches au transport, même
                    // après être passé par la recherche ou un réglage.
                    .simultaneousGesture(TapGesture().onEnded { reclaimKeys() })
                MarksStrip(model: model)
                TransportBar(model: model)
                    .simultaneousGesture(TapGesture().onEnded { reclaimKeys() })
            }
            .frame(minWidth: 520)
        }
        .background(Theme.background)
        .preferredColorScheme(.dark)
        .focusable()
        .focused($keysFocused)
        .focusEffectDisabled()
        .onKeyPress(phases: .down) { press in handle(press) }
        .onAppear { keysFocused = true }
        .onChange(of: showSettings) { _, shown in if !shown { keysFocused = true } }
        .toolbar { toolbar }
        .sheet(isPresented: $showSettings) {
            SettingsView(model: model, isPresented: $showSettings)
        }
        .task {
            model.connect()
            await model.loadVideos()
        }
        .task {
            // L'ISO en cours d'écriture grandit. On relit sa durée en arrière-
            // plan, mais jamais pendant une lecture : remplacer l'élément d'un
            // AVPlayer coupe l'image, et le faire au milieu d'un ralenti de
            // jugement serait pire que d'attendre.
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(20))
                guard !model.cluster.isPlaying else { continue }
                await model.refreshVideos()
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .navigation) {
            VStack(alignment: .leading, spacing: 0) {
                Text(model.race.headline.isEmpty ? "Jugement vidéo" : model.race.headline)
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(1)
                HStack(spacing: 5) {
                    StatusDot(status: model.status)
                    Text(subtitle)
                        .font(.system(size: 10))
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                }
            }
        }

        ToolbarItemGroup {
            if model.scanning { ProgressView().controlSize(.small) }

            // Le découpage tourne en fond et personne ne le regarde. Mais
            // quand le jury réclame une descente, savoir qu'il reste douze
            // clips à sortir change ce qu'on répond.
            if model.catchUpRemaining > 0 {
                HStack(spacing: 4) {
                    ProgressView().controlSize(.small)
                    Text("\(model.catchUpRemaining)")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(Theme.textMuted)
                }
                .help("\(model.catchUpRemaining) clip(s) restant(s) à découper")
            }

            Button { pickFolder(model) } label: {
                Label(model.videoFolder?.lastPathComponent ?? "Dossier…", systemImage: "folder")
            }
            .help(model.videoFolder?.path ?? "Choisir le dossier des enregistrements")

            // Le mélangeur écrit ses huit ISO quoi qu'il arrive. Celles qui
            // ne filment pas les bateaux n'ont à être ni décodées ni
            // découpées — et le compteur dit d'un coup d'œil combien sont
            // retenues, sans ouvrir le menu.
            if !model.sources.isEmpty {
                Menu {
                    ForEach(model.cameras, id: \.self) { camera in
                        Toggle(camera, isOn: Binding(
                            get: { model.isCameraUsed(camera) },
                            set: { model.setCamera(camera, used: $0) }
                        ))
                    }
                    if !model.disabledCameras.isEmpty {
                        Divider()
                        Button("Tout utiliser") { model.useAllCameras() }
                    }
                } label: {
                    // Un `Label` se réduit à son icône dans une barre d'outils
                    // serrée, et le compte disparaîtrait justement quand il y a
                    // beaucoup de caméras — c'est-à-dire quand il sert.
                    HStack(spacing: 3) {
                        Image(systemName: "rectangle.3.group")
                        Text("\(model.activeCameraCount)/\(model.cameras.count)")
                            .font(.system(size: 11, design: .monospaced))
                    }
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
                .help("Choisir les caméras affichées et découpées")
            }

            Button { Task { await model.refreshVideos() } } label: {
                Image(systemName: "arrow.clockwise")
            }
            .help("Relire les fichiers — à faire quand l'enregistrement en cours a grandi")
            .disabled(model.sources.isEmpty)

            Button { showSettings = true } label: { Image(systemName: "gearshape") }
                .help("Réglages")
        }
    }

    private var subtitle: String {
        if let message = model.lastMessage { return message }
        if model.race.field.isEmpty { return model.status.label }
        let journal = model.isJournalling ? "journal en cours" : "journal interrompu"
        return "\(model.race.field.count) bateaux · \(model.race.gateCount) portes · \(journal)"
    }

    private func reclaimKeys() {
        searchFocused = false
        keysFocused = true
    }

    /// Les touches du jugement. Elles n'ont pas d'équivalent menu : on les
    /// enchaîne à une main, l'autre sur la molette, en regardant l'image.
    private func handle(_ press: KeyPress) -> KeyPress.Result {
        guard !searchFocused else { return .ignored }
        let shift = press.modifiers.contains(.shift)

        switch press.key.character {
        case " ":
            model.cluster.togglePlay()
        case KeyEquivalent.leftArrow.character:
            shift ? model.cluster.nudge(seconds: -1) : model.cluster.step(frames: -1)
        case KeyEquivalent.rightArrow.character:
            shift ? model.cluster.nudge(seconds: 1) : model.cluster.step(frames: 1)
        case KeyEquivalent.escape.character:
            if zoomed != nil { zoomed = nil } else { return .ignored }
        case "f":
            searchFocused = true
        default:
            return .ignored
        }
        return .handled
    }
}
