import SwiftUI
import JudgeKit

/// L'ardoise posée sur l'image : qui descend, depuis combien de temps, et ce
/// qu'il a pris.
///
/// C'est volontairement le même contenu que le clip gravé, au même endroit.
/// Le juge voit à l'écran ce que le jury recevra dans le fichier, et n'a pas à
/// se demander ce qui sera visible une fois le clip parti.
struct ScoreOverlayView: View {
    let board: ScoreBoard
    let clockMs: Int

    private var passed: [ScoreMark] { board.passed(atClock: clockMs) }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Text(board.label)
                    .font(.system(size: 11, weight: .bold))
                    .lineLimit(1)
                if !board.epreuve.isEmpty {
                    Text(board.epreuve)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Theme.textMuted)
                }
            }

            HStack(spacing: 5) {
                // Le chrono à chasse fixe : sinon les chiffres dansent dix
                // fois par seconde, et l'œil quitte l'eau pour les suivre.
                Text(ScoreBoard.formatElapsed(board.elapsedMs(atClock: clockMs)))
                    .font(.system(size: 15, weight: .semibold, design: .monospaced))
                    .foregroundStyle(elapsedColor)

                ForEach(passed) { mark in
                    Text(mark.label)
                        .font(.system(size: 10, weight: .bold))
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .background(mark.isFifty ? Theme.fifty : Theme.touch, in: Capsule())
                        .foregroundStyle(.white)
                        // Une pénalité déduite du numéro de porte n'est pas une
                        // pénalité entendue : la pastille le dit, sur l'image
                        // comme dans la bande des repères.
                        .opacity(mark.isEstimated ? 0.65 : 1)
                }

                if !passed.isEmpty {
                    Text("+\(board.penaltySeconds(atClock: clockMs))")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundStyle(Theme.fifty)
                }
            }
        }
        .foregroundStyle(Theme.text)
        .padding(.horizontal, 8).padding(.vertical, 5)
        .background(.black.opacity(0.58), in: RoundedRectangle(cornerRadius: 6))
        .padding(6)
        // Elle se regarde, elle ne se clique pas : sans cela elle mangerait le
        // double-clic d'agrandissement de la vignette qu'elle recouvre.
        .allowsHitTesting(false)
    }

    /// Avant le départ, le chrono compte à rebours et se met en retrait : il
    /// ne faut pas qu'on lise « la descente a commencé » sur une image où le
    /// bateau est encore sur la ligne.
    private var elapsedColor: Color {
        board.elapsedMs(atClock: clockMs) < 0 ? Theme.textMuted : Theme.text
    }
}
