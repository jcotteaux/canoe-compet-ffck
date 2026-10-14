import SwiftUI
import AVFoundation
import JudgeKit

/// Une vue dont le calque **est** le calque vidéo : pas de sous-calque à
/// redimensionner à la main, donc rien qui traîne d'une image sur l'autre
/// pendant qu'on étire la fenêtre.
final class PlayerBackedView: NSView {
    let playerLayer = AVPlayerLayer()

    override func makeBackingLayer() -> CALayer { playerLayer }

    init(player: AVPlayer) {
        super.init(frame: .zero)
        wantsLayer = true
        playerLayer.player = player
        playerLayer.videoGravity = .resizeAspect
        playerLayer.backgroundColor = NSColor.black.cgColor
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }
}

struct PlayerView: NSViewRepresentable {
    let player: AVPlayer

    func makeNSView(context: Context) -> PlayerBackedView { PlayerBackedView(player: player) }

    func updateNSView(_ view: PlayerBackedView, context: Context) {
        if view.playerLayer.player !== player { view.playerLayer.player = player }
    }
}

struct MulticamGrid: View {
    let model: JudgeModel
    @Binding var zoomed: URL?

    private var visible: [PlayerCluster.Lane] {
        guard let zoomed else { return model.cluster.lanes }
        return model.cluster.lanes.filter { $0.id == zoomed }
    }

    var body: some View {
        GeometryReader { geometry in
            if model.cluster.lanes.isEmpty {
                EmptyStage(model: model)
            } else {
                let grid = layout(for: visible.count, in: geometry.size)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2),
                                         count: grid.columns),
                          spacing: 2) {
                    ForEach(visible) { lane in
                        CameraCell(model: model, lane: lane, zoomed: $zoomed)
                            .aspectRatio(16 / 9, contentMode: .fit)
                    }
                }
                .frame(width: grid.width)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
            }
        }
        .background(.black)
    }

    /// Le découpage de la grille : le nombre de colonnes qui donne la plus
    /// grande vignette **sans qu'aucune ne sorte de l'écran**.
    ///
    /// Le mélangeur enregistre huit ISO. Ne raisonner que sur la largeur, comme
    /// avant, donnait deux colonnes de quatre rangées : les deux dernières
    /// caméras tombaient sous le bord de la fenêtre, sans barre de défilement
    /// pour aller les chercher. Une caméra qu'on ne voit pas est une caméra
    /// qu'on oublie de regarder.
    private func layout(for count: Int, in size: CGSize) -> (columns: Int, width: CGFloat) {
        let spacing: CGFloat = 2
        guard count > 1, size.width > 0, size.height > 0 else {
            return (1, min(size.width, size.height * 16 / 9))
        }
        var best = (columns: 1, side: CGFloat.zero)
        for columns in 1...count {
            let rows = Int((Double(count) / Double(columns)).rounded(.up))
            let byWidth = (size.width - spacing * CGFloat(columns - 1)) / CGFloat(columns)
            let byHeight = (size.height - spacing * CGFloat(rows - 1)) / CGFloat(rows) * 16 / 9
            // La contrainte la plus dure fixe la vignette : elle est en 16/9,
            // et c'est tantôt la largeur, tantôt la hauteur qui la borne.
            let side = min(byWidth, byHeight)
            if side > best.side { best = (columns, side) }
        }
        return (best.columns, best.side * CGFloat(best.columns) + spacing * CGFloat(best.columns - 1))
    }
}

private struct CameraCell: View {
    let model: JudgeModel
    let lane: PlayerCluster.Lane
    @Binding var zoomed: URL?

    private var covered: Bool { model.cluster.covers(lane, clockMs: model.cluster.clockMs) }

    var body: some View {
        ZStack(alignment: .topLeading) {
            PlayerView(player: lane.player)

            if !covered {
                // Une caméra qui ne couvre pas l'instant affiche une ardoise :
                // une image gelée d'un autre moment se juge comme si elle était
                // celle-là, et c'est le plus sûr moyen de se tromper.
                Rectangle().fill(.black.opacity(0.88))
                Text("hors enregistrement")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.textMuted)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            Text(lane.source.camera)
                .font(.system(size: 11, weight: .semibold))
                .padding(.horizontal, 6).padding(.vertical, 3)
                .background(.black.opacity(0.55), in: Capsule())
                .foregroundStyle(covered ? Theme.text : Theme.textMuted)
                .padding(6)

            // L'ardoise seulement là où il y a une image à annoter : sur une
            // caméra hors enregistrement, un chrono qui court par-dessus une
            // ardoise noire ne dit rien de ce qu'on regarde.
            if model.showOverlay, covered, let board = model.scoreBoard {
                VStack {
                    Spacer(minLength: 0)
                    HStack {
                        ScoreOverlayView(board: board, clockMs: model.cluster.clockMs)
                        Spacer(minLength: 0)
                    }
                }
            }
        }
        .contentShape(Rectangle())
        .onTapGesture(count: 2) { zoomed = (zoomed == lane.id) ? nil : lane.id }
        .contextMenu {
            // Écarter une caméra là où on s'aperçoit qu'elle ne sert à rien :
            // devant son image, pas dans un menu à l'autre bout de la fenêtre.
            Button("Ne pas utiliser \(lane.source.camera)") {
                if zoomed == lane.id { zoomed = nil }
                model.setCamera(lane.source.camera, used: false)
            }
        }
        .help("Double-cliquer pour agrandir \(lane.source.camera)")
    }
}

private struct EmptyStage: View {
    let model: JudgeModel

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "film.stack")
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(Theme.textMuted)
            Text(model.lastMessage ?? "Aucune vidéo chargée")
                .foregroundStyle(Theme.textMuted)
            Button("Choisir le dossier des enregistrements…") { pickFolder(model) }
                .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Le sélecteur de dossier, partagé par la barre d'outils et l'écran vide.
@MainActor
func pickFolder(_ model: JudgeModel) {
    let panel = NSOpenPanel()
    panel.canChooseDirectories = true
    panel.canChooseFiles = false
    panel.allowsMultipleSelection = false
    panel.prompt = "Ouvrir"
    panel.message = "Le dossier des ISO du mélangeur"
    panel.directoryURL = model.videoFolder ?? URL(fileURLWithPath: "/Volumes")
    if panel.runModal() == .OK, let url = panel.url { model.open(folder: url) }
}
