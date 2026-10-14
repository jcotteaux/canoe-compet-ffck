import SwiftUI
import CanoeLiveKit
import JudgeKit

/// La bande des repères de la descente sélectionnée.
struct MarksStrip: View {
    let model: JudgeModel

    var body: some View {
        HStack(spacing: 8) {
            if let entry = model.selected, let sequence = model.sequence, !sequence.marks.isEmpty {
                Text(entry.label)
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(1)
                Text(entry.epreuve)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.textMuted)

                Divider().frame(height: 16).overlay(Theme.separator)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(sequence.marks) { mark in
                            MarkChip(mark: mark) { model.go(to: mark) }
                                .contextMenu {
                                    Button("Recaler les horloges sur l'image affichée") {
                                        model.alignCurrentFrame(to: mark)
                                    }
                                }
                        }
                    }
                }

                Spacer(minLength: 0)
                exportButton
            } else {
                Text(model.selected == nil
                     ? "Choisir un bateau dans la liste"
                     : "Pas d'heure de départ pour ce bateau : rien à baliser")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.textMuted)
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 10)
        .frame(height: 34)
        .background(Theme.surfaceRaised)
    }

    private var exportButton: some View {
        Button {
            model.exportSelected()
        } label: {
            HStack(spacing: 4) {
                if model.exporting {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "square.and.arrow.down")
                }
                Text("Extraire")
            }
            .font(.system(size: 11))
        }
        .disabled(model.exporting || model.activeSources.isEmpty)
        .help("Découper la descente de ce bateau sur chaque caméra")
    }
}

private struct MarkChip: View {
    let mark: JudgeMark
    let action: () -> Void

    private var tint: Color {
        switch mark.kind {
        case .start: Theme.ok
        case .finish: Theme.accent
        case .gate(_, let seconds): seconds == 50 ? Theme.fifty : Theme.touch
        }
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(mark.label)
                    .font(.system(size: 11, weight: .semibold))
                if mark.isEstimated {
                    // L'heure est déduite, pas entendue : le dire sur la
                    // pastille elle-même, pas dans un réglage qu'on n'ouvre
                    // jamais.
                    Image(systemName: "questionmark.circle")
                        .font(.system(size: 9))
                }
            }
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(tint.opacity(mark.isEstimated ? 0.35 : 1),
                        in: Capsule())
            .overlay(Capsule().strokeBorder(tint.opacity(0.9), style:
                        StrokeStyle(lineWidth: 1, dash: mark.isEstimated ? [3, 2] : [])))
            .foregroundStyle(.white)
        }
        .buttonStyle(.plain)
        .help(mark.isEstimated
              ? "\(mark.label) — heure estimée à ±\(mark.uncertaintyMs / 1000) s : l'app n'écoutait pas quand la pénalité est tombée"
              : "\(mark.label) — \(formatClockPrecise(mark.clockMs))")
    }
}

/// Le transport : la barre qu'on utilise sans la regarder.
struct TransportBar: View {
    let model: JudgeModel

    private var window: ClosedRange<Int>? {
        // Sur une descente sélectionnée, la réglette couvre la descente et rien
        // d'autre. Étalée sur deux heures d'ISO, un pixel vaudrait cinq
        // secondes : inutilisable pour le geste qu'on vient y chercher.
        model.sequence?.window(padSeconds: 8) ?? model.cluster.coverage
    }

    var body: some View {
        VStack(spacing: 0) {
            Scrubber(window: window,
                     marks: model.sequence?.marks ?? [],
                     clockMs: model.cluster.clockMs,
                     onScrub: { model.cluster.seek(toClock: $0) },
                     onSelect: { model.go(to: $0) })
                .frame(height: 26)

            HStack(spacing: 6) {
                control("gobackward.minus", "Reculer d'1 s (⇧←)") { model.cluster.nudge(seconds: -1) }
                control("backward.frame", "Image précédente (←)") { model.cluster.step(frames: -1) }

                Button {
                    model.cluster.togglePlay()
                } label: {
                    Image(systemName: model.cluster.isPlaying ? "pause.fill" : "play.fill")
                        .frame(width: 34, height: 22)
                }
                .help("Lire / Pause (espace)")

                control("forward.frame", "Image suivante (→)") { model.cluster.step(frames: 1) }
                control("goforward.plus", "Avancer d'1 s (⇧→)") { model.cluster.nudge(seconds: 1) }

                Divider().frame(height: 18).overlay(Theme.separator)

                ForEach([-1.0, -0.25, 0.25, 0.5, 1.0, 2.0], id: \.self) { speed in
                    Button {
                        model.cluster.play(rate: Float(speed))
                    } label: {
                        Text(speed < 0 ? "◀\(abs(speed) == 1 ? "" : String(abs(speed)))" : "\(speed, specifier: "%g")×")
                            .font(.system(size: 10, weight: .medium))
                            .frame(minWidth: 26)
                    }
                    .help(speed < 0 ? "Marche arrière \(abs(speed))×" : "Lecture \(speed)×")
                }

                Spacer(minLength: 8)

                Text(formatClockPrecise(model.cluster.clockMs))
                    .font(.system(size: 14, weight: .medium, design: .monospaced))
                    .foregroundStyle(Theme.text)
                    .help("Heure de course de l'image affichée")

                if model.offsetMs != 0 {
                    Text(ClockAlignment(recordingStartMs: 0, offsetMs: model.offsetMs).offsetLabel)
                        .font(.system(size: 10, design: .monospaced))
                        .padding(.horizontal, 5).padding(.vertical, 2)
                        .background(Theme.running.opacity(0.25), in: Capsule())
                        .help("Décalage appliqué entre l'enregistreur et le chronométrage")
                        .onTapGesture { model.resetAlignment() }
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
        }
        .background(Theme.surface)
    }

    private func control(_ symbol: String, _ help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: symbol) }.help(help)
    }
}

/// Réglette d'un intervalle d'heures, avec les repères de la descente dessus.
private struct Scrubber: View {
    let window: ClosedRange<Int>?
    let marks: [JudgeMark]
    let clockMs: Int
    let onScrub: (Int) -> Void
    /// Un clic tombé sur une pénalité : on s'y pose au lieu de s'arrêter au
    /// pixel visé.
    let onSelect: (JudgeMark) -> Void

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            if let window, window.upperBound > window.lowerBound {
                let span = Double(window.upperBound - window.lowerBound)
                let position = { (ms: Int) in
                    Double(ms - window.lowerBound) / span * width
                }

                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.surfaceRaised).frame(height: 4)

                    ForEach(marks) { mark in
                        // Les repères estimés sont une zone, pas un trait :
                        // dessiner un trait fin serait affirmer une précision
                        // qu'on n'a pas.
                        if mark.isEstimated {
                            let half = Double(mark.uncertaintyMs) / span * width
                            Rectangle()
                                .fill(color(mark).opacity(0.28))
                                .frame(width: max(2, half * 2), height: 16)
                                .offset(x: position(mark.clockMs) - half)
                        }
                        // Les pénalités dépassent le départ et l'arrivée :
                        // ce sont elles qu'on cherche sur la réglette, et un
                        // 2 doit se voir autant qu'un 50 se repère.
                        Rectangle()
                            .fill(color(mark))
                            .frame(width: mark.gate == nil ? 2 : 3,
                                   height: mark.isFifty ? 20 : (mark.gate == nil ? 10 : 14))
                            .offset(x: position(mark.clockMs) - 1)
                    }

                    Circle()
                        .fill(Theme.text)
                        .frame(width: 11, height: 11)
                        .offset(x: min(max(position(clockMs), 0), width) - 5.5)
                        .shadow(radius: 2)
                }
                .frame(maxHeight: .infinity)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            let ratio = min(max(value.location.x / width, 0), 1)
                            onScrub(window.lowerBound + Int(ratio * span))
                        }
                        .onEnded { value in
                            // Un clic sur une pénalité s'y pose exactement,
                            // avec l'avance qui la précède — comme la pastille
                            // au-dessus. Un glissement reste un glissement :
                            // on ne lui vole pas sa position d'arrivée.
                            guard abs(value.translation.width) < 3,
                                  let mark = nearest(toX: value.location.x,
                                                     width: width, window: window)
                            else { return }
                            onSelect(mark)
                        }
                )
            } else {
                Capsule().fill(Theme.surfaceRaised).frame(height: 4)
                    .frame(maxHeight: .infinity)
            }
        }
        .padding(.horizontal, 10)
    }

    /// La pénalité sous le doigt, s'il y en a une à portée.
    ///
    /// Les pénalités seulement : le départ et l'arrivée bornent la réglette,
    /// et les rendre attrapants empêcherait de se poser juste avant un départ,
    /// ce qu'on fait tout le temps.
    private func nearest(toX x: CGFloat, width: CGFloat, window: ClosedRange<Int>) -> JudgeMark? {
        let span = Double(window.upperBound - window.lowerBound)
        guard span > 0 else { return nil }
        return marks
            .filter { $0.gate != nil }
            .map { (mark: $0, dx: abs(Double($0.clockMs - window.lowerBound) / span * width - x)) }
            .filter { $0.dx <= 10 }
            .min { $0.dx < $1.dx }?
            .mark
    }

    private func color(_ mark: JudgeMark) -> Color {
        switch mark.kind {
        case .start: Theme.ok
        case .finish: Theme.accent
        case .gate(_, let seconds): seconds == 50 ? Theme.fifty : Theme.touch
        }
    }
}
