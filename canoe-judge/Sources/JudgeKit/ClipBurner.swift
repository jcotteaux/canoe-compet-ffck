import Foundation
import AVFoundation
import CoreGraphics
import CoreText
import QuartzCore

public enum BurnError: Error, LocalizedError {
    case noVideoTrack(URL)
    case cannotExport
    case failed(String)

    public var errorDescription: String? {
        switch self {
        case .noVideoTrack(let url):
            "Pas de piste vidéo dans \(url.lastPathComponent)."
        case .cannotExport:
            "Impossible de préparer la gravure de l'incrustation."
        case .failed(let reason):
            "Gravure de l'incrustation : \(reason)"
        }
    }
}

/// Grave le chrono et les pénalités dans un clip.
///
/// Avec AVFoundation plutôt qu'avec ffmpeg : le filtre `drawtext` d'ffmpeg
/// demande une compilation avec freetype que les paquets Homebrew n'ont pas
/// toujours — celui de cette machine ne l'a pas — et un juge n'a pas à
/// recompiler ffmpeg la veille d'une course. AVFoundation est là de toute
/// façon, c'est lui qui joue déjà les ISO, et le texte y est rendu avec les
/// mêmes polices qu'à l'écran.
public enum ClipBurner {

    /// Le chrono n'est réécrit qu'une fois par seconde.
    ///
    /// Il faut une image de texte par valeur affichée, et les dixièmes
    /// multiplieraient par dix le nombre d'images à garder en mémoire pendant
    /// l'export — sur un plateau entier, ce sont des centaines de mégaoctets
    /// pour une précision que le clip n'a pas à porter. Le dixième se lit dans
    /// l'app, image par image, là où on juge vraiment.
    static let chronoStepSeconds = 1.0

    @MainActor
    @discardableResult
    public static func export(_ job: ClipJob, board: ScoreBoard) async throws -> URL {
        let asset = AVURLAsset(url: job.sourceURL)
        guard let sourceVideo = try await asset.loadTracks(withMediaType: .video).first else {
            throw BurnError.noVideoTrack(job.sourceURL)
        }

        // Composition ramenée à zéro : les animations des calques se comptent
        // depuis le début du clip. Sur l'asset d'origine elles partiraient du
        // début de l'ISO, soit une heure trop tôt.
        let composition = AVMutableComposition()
        let range = CMTimeRange(start: CMTime(seconds: job.startSeconds, preferredTimescale: 600),
                                duration: CMTime(seconds: job.durationSeconds, preferredTimescale: 600))

        guard let videoTrack = composition.addMutableTrack(withMediaType: .video,
                                                           preferredTrackID: kCMPersistentTrackID_Invalid)
        else { throw BurnError.cannotExport }
        try videoTrack.insertTimeRange(range, of: sourceVideo, at: .zero)
        videoTrack.preferredTransform = try await sourceVideo.load(.preferredTransform)

        if let sourceAudio = try await asset.loadTracks(withMediaType: .audio).first,
           let audioTrack = composition.addMutableTrack(withMediaType: .audio,
                                                        preferredTrackID: kCMPersistentTrackID_Invalid) {
            // L'ambiance vaut parfois le geste : on l'emporte si elle existe,
            // mais son absence n'empêche pas le clip.
            try? audioTrack.insertTimeRange(range, of: sourceAudio, at: .zero)
        }

        // La composition vidéo est montée à la main plutôt que déduite de la
        // composition : `videoComposition(withPropertiesOf:)` ferait traverser
        // un `AVMutableComposition` non-Sendable entre deux acteurs, ce que
        // Swift 6 refuse à juste titre.
        let natural = try await sourceVideo.load(.naturalSize)
        let transform = try await sourceVideo.load(.preferredTransform)
        let frameRate = try await sourceVideo.load(.nominalFrameRate)
        let turned = natural.applying(transform)
        let size = CGSize(width: abs(turned.width), height: abs(turned.height))
        guard size.width > 0, size.height > 0 else { throw BurnError.cannotExport }

        let videoComposition = AVMutableVideoComposition()
        videoComposition.renderSize = size
        videoComposition.frameDuration = CMTime(value: 1,
                                                timescale: CMTimeScale(frameRate > 0 ? frameRate.rounded() : 30))
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: range.duration)
        let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
        layerInstruction.setTransform(transform, at: .zero)
        instruction.layerInstructions = [layerInstruction]
        videoComposition.instructions = [instruction]

        let videoLayer = CALayer()
        videoLayer.frame = CGRect(origin: .zero, size: size)
        let parent = CALayer()
        parent.frame = CGRect(origin: .zero, size: size)
        parent.addSublayer(videoLayer)
        parent.addSublayer(scoreLayer(board: board,
                                      clipStartClock: job.startClockMs,
                                      duration: job.durationSeconds,
                                      size: size))
        videoComposition.animationTool =
            AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parent)

        try? FileManager.default.createDirectory(at: job.outputURL.deletingLastPathComponent(),
                                                 withIntermediateDirectories: true)
        try? FileManager.default.removeItem(at: job.outputURL)

        guard let session = AVAssetExportSession(asset: composition,
                                                 presetName: AVAssetExportPresetHighestQuality)
        else { throw BurnError.cannotExport }
        session.videoComposition = videoComposition

        if #available(macOS 15.0, *) {
            try await session.export(to: job.outputURL, as: .mp4)
        } else {
            session.outputURL = job.outputURL
            session.outputFileType = .mp4
            await session.export()
            guard session.status == .completed else {
                throw BurnError.failed(session.error?.localizedDescription ?? "export interrompu")
            }
        }
        return job.outputURL
    }

    // MARK: - Les calques

    /// L'ardoise, en bas à gauche : le bateau, son chrono, ses pénalités.
    ///
    /// En bas à gauche parce que c'est là que le regard ne cherche pas le
    /// bateau : une ardoise en haut recouvre le ciel, où passent les portes.
    @MainActor
    static func scoreLayer(board: ScoreBoard,
                           clipStartClock: Int,
                           duration: Double,
                           size: CGSize) -> CALayer {
        // Toutes les tailles suivent la hauteur de l'image : le même code doit
        // rendre lisiblement sur une vignette de 320 et sur un ISO 4K.
        let unit = max(8, size.height / 22)
        let pad = unit * 0.45
        let nameFont = CTFontCreateWithName("HelveticaNeue-Bold" as CFString, unit * 0.9, nil)
        // Chiffres à chasse fixe : sans cela le chrono tremble à chaque
        // seconde, et un chiffre qui saute attire l'œil hors de l'eau.
        let chronoFont = CTFontCreateWithName("Menlo-Bold" as CFString, unit * 1.15, nil)
        let chipFont = CTFontCreateWithName("HelveticaNeue-Bold" as CFString, unit * 0.75, nil)

        let white = CGColor(red: 1, green: 1, blue: 1, alpha: 1)
        let container = CALayer()

        // Ligne du haut : qui c'est.
        let title = [board.label, board.epreuve].filter { !$0.isEmpty }.joined(separator: "  ·  ")
        let name = textLayer(title, font: nameFont, color: white)

        // Ligne du bas : le chrono, puis les pénalités qui s'allument.
        let chrono = chronoLayer(board: board, clipStartClock: clipStartClock,
                                 duration: duration, font: chronoFont, color: white)

        var chips: [CALayer] = []
        var chipX = chrono.bounds.width + unit * 0.6
        for mark in board.marks.sorted(by: { $0.gate < $1.gate }) {
            let chip = chipLayer(mark, font: chipFont, unit: unit)
            chip.frame.origin = CGPoint(x: chipX, y: (chrono.bounds.height - chip.bounds.height) / 2)
            // Elle s'allume au moment où le bateau la franchit — avant, elle
            // n'existe pas encore, et l'afficher d'emblée raconterait la fin
            // de la descente pendant qu'on regarde le début.
            let at = Double(mark.clockMs - clipStartClock) / 1000
            if at > 0.05 {
                chip.opacity = 0
                let reveal = CABasicAnimation(keyPath: "opacity")
                reveal.fromValue = 0
                reveal.toValue = 1
                reveal.duration = 0.18
                reveal.beginTime = AVCoreAnimationBeginTimeAtZero + max(0, at)
                reveal.fillMode = .forwards
                reveal.isRemovedOnCompletion = false
                chip.add(reveal, forKey: "reveal")
            }
            chipX += chip.bounds.width + unit * 0.3
            chips.append(chip)
        }

        let bottomWidth = chipX
        let width = max(name.bounds.width, bottomWidth) + pad * 2
        let height = name.bounds.height + chrono.bounds.height + pad * 2.4

        let plate = CALayer()
        plate.frame = CGRect(x: unit * 0.8, y: unit * 0.8, width: width, height: height)
        plate.backgroundColor = CGColor(red: 0, green: 0, blue: 0, alpha: 0.55)
        plate.cornerRadius = unit * 0.3

        chrono.frame.origin = CGPoint(x: pad, y: pad)
        name.frame.origin = CGPoint(x: pad, y: pad + chrono.bounds.height + pad * 0.4)
        let bottom = CALayer()
        bottom.frame = CGRect(x: pad, y: pad, width: bottomWidth, height: chrono.bounds.height)
        chrono.frame.origin = .zero
        bottom.addSublayer(chrono)
        chips.forEach { bottom.addSublayer($0) }

        plate.addSublayer(name)
        plate.addSublayer(bottom)
        container.frame = CGRect(origin: .zero, size: size)
        container.addSublayer(plate)
        return container
    }

    /// Le chrono : une image de texte par seconde, échangées par une animation
    /// à paliers sur `contents`.
    @MainActor
    private static func chronoLayer(board: ScoreBoard,
                                    clipStartClock: Int,
                                    duration: Double,
                                    font: CTFont,
                                    color: CGColor) -> CALayer {
        let steps = max(1, Int((duration / chronoStepSeconds).rounded(.up)))
        var frames: [CGImage] = []
        var texts: [String] = []
        for step in 0...steps {
            let clockMs = clipStartClock + Int(Double(step) * chronoStepSeconds * 1000)
            texts.append(ScoreBoard.formatElapsed(board.elapsedMs(atClock: clockMs), tenths: false))
        }

        // Toutes les images à la même taille : `contents` est étiré sur les
        // limites du calque, et une largeur qui change ferait respirer le
        // chrono à chaque seconde.
        let widest = texts.max { measure($0, font: font).width < measure($1, font: font).width } ?? texts[0]
        let box = measure(widest, font: font)
        for text in texts {
            if let image = render(text, font: font, color: color, box: box) { frames.append(image) }
        }

        let layer = CALayer()
        layer.bounds = CGRect(origin: .zero, size: box)
        layer.anchorPoint = .zero
        layer.contentsGravity = .left
        layer.contents = frames.first

        guard frames.count > 1 else { return layer }
        let animation = CAKeyframeAnimation(keyPath: "contents")
        animation.values = frames
        animation.calculationMode = .discrete
        animation.duration = max(0.1, Double(frames.count - 1) * chronoStepSeconds)
        animation.beginTime = AVCoreAnimationBeginTimeAtZero
        animation.fillMode = .forwards
        animation.isRemovedOnCompletion = false
        layer.add(animation, forKey: "chrono")
        return layer
    }

    @MainActor
    private static func chipLayer(_ mark: ScoreMark, font: CTFont, unit: CGFloat) -> CALayer {
        let text = textLayer(mark.label, font: font,
                             color: CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        let chip = CALayer()
        let padding = unit * 0.3
        chip.bounds = CGRect(x: 0, y: 0,
                             width: text.bounds.width + padding * 2,
                             height: text.bounds.height + padding * 0.8)
        chip.anchorPoint = .zero
        chip.cornerRadius = chip.bounds.height / 2
        chip.backgroundColor = mark.isFifty
            ? CGColor(red: 0.85, green: 0.16, blue: 0.20, alpha: 0.95)   // 50 : ça coûte la course
            : CGColor(red: 0.95, green: 0.60, blue: 0.10, alpha: 0.95)   // 2 : ça coûte un rang
        text.frame.origin = CGPoint(x: padding, y: padding * 0.4)
        chip.addSublayer(text)
        return chip
    }

    // MARK: - Texte

    @MainActor
    private static func textLayer(_ text: String, font: CTFont, color: CGColor) -> CALayer {
        let box = measure(text, font: font)
        let layer = CALayer()
        layer.bounds = CGRect(origin: .zero, size: box)
        layer.anchorPoint = .zero
        layer.contents = render(text, font: font, color: color, box: box)
        return layer
    }

    static func measure(_ text: String, font: CTFont) -> CGSize {
        let line = CTLineCreateWithAttributedString(attributed(text, font: font, color: nil))
        var ascent: CGFloat = 0, descent: CGFloat = 0, leading: CGFloat = 0
        let width = CTLineGetTypographicBounds(line, &ascent, &descent, &leading)
        return CGSize(width: ceil(width) + 2, height: ceil(ascent + descent + leading) + 2)
    }

    private static func attributed(_ text: String, font: CTFont, color: CGColor?) -> CFAttributedString {
        var attributes: [CFString: Any] = [kCTFontAttributeName: font]
        if let color { attributes[kCTForegroundColorAttributeName] = color }
        return CFAttributedStringCreate(nil, text as CFString, attributes as CFDictionary)!
    }

    private static func render(_ text: String, font: CTFont, color: CGColor, box: CGSize) -> CGImage? {
        let width = max(1, Int(box.width)), height = max(1, Int(box.height))
        guard let context = CGContext(data: nil, width: width, height: height,
                                      bitsPerComponent: 8, bytesPerRow: 0,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }
        let line = CTLineCreateWithAttributedString(attributed(text, font: font, color: color))
        var ascent: CGFloat = 0, descent: CGFloat = 0
        _ = CTLineGetTypographicBounds(line, &ascent, &descent, nil)
        context.textPosition = CGPoint(x: 1, y: descent + 1)
        CTLineDraw(line, context)
        return context.makeImage()
    }
}
