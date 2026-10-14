import Foundation
import AtemKit
import CanoeLiveKit

/// Banc d'essai en ligne de commande.
///
/// Il existe pour vérifier les deux protocoles sans passer par l'app : un
/// simulateur de mélangeur d'un côté, le bouchon canoe-wslive de l'autre, et
/// cet exécutable qui prouve que le code Swift parle bien aux deux.
///
///   swift run atemctl atem watch --host 127.0.0.1
///   swift run atemctl atem run 4 --host 127.0.0.1
///   swift run atemctl atem sectors 0 1 2 3   (joue le plan, un secteur par seconde)
///   swift run atemctl atem cadrage duo       (pose le cadrage sans rien graver)
///   swift run atemctl atem grave --essai     (les 12 macros de regie, sans graver)
///   swift run atemctl atem incrust --sonde   (ce que le melangeur retient comme couleur)
///   swift run atemctl canoe watch --host 127.0.0.1 --port 20000

func argument(_ name: String, default value: String) -> String {
    let args = CommandLine.arguments
    guard let i = args.firstIndex(of: "--\(name)"), i + 1 < args.count else { return value }
    return args[i + 1]
}

/// Les options sans valeur : elles ne mangent pas le mot qui les suit.
let switches: Set<String> = ["--essai", "--force", "--sonde", "--sans-arret"]

func flag(_ name: String) -> Bool { CommandLine.arguments.contains("--\(name)") }

/// Les mots qui ne sont ni une option ni sa valeur. Filtrer les seuls `--xxx`
/// laisserait passer leur valeur : `--seconds 8` ajoutait un « 8 » à la liste
/// des secteurs.
let arguments: [String] = {
    var out: [String] = []
    var skipNext = false
    for argument in CommandLine.arguments.dropFirst() {
        if skipNext { skipNext = false; continue }
        if argument.hasPrefix("--") { skipNext = !switches.contains(argument); continue }
        out.append(argument)
    }
    return out
}()
let subject = arguments.first ?? "help"
let action = arguments.dropFirst().first ?? "watch"
let host = argument("host", default: "127.0.0.1")
let seconds = Double(argument("seconds", default: "10")) ?? 10

func describe(_ state: AtemState) -> String {
    var lines = ["\(state.productName) (protocole \(state.version))"]
    lines.append("  programme : \(state.inputName(state.program))   preview : \(state.inputName(state.preview))")
    lines.append("  direct : \(state.streaming.label)   enregistrement : \(state.isRecording ? "oui" : "non")")
    if state.macroRun.isRunning {
        lines.append("  macro en cours : \(state.macroRun.index)")
    }
    for keyer in state.keyers {
        let color = keyer.type == .chroma
            ? "   couleur Y \(keyer.sampledY) Cb \(keyer.sampledCb) Cr \(keyer.sampledCr)" : ""
        lines.append("  incrust \(keyer.id + 1) : \(keyer.type.label)   \(state.inputName(keyer.fillSource))   \(keyer.onAir ? "à l'antenne" : "hors antenne")\(color)")
    }
    lines.append("  macros :")
    for macro in state.usedMacros {
        lines.append("    [\(macro.index)] \(macro.displayName) — \(macro.description)")
    }
    return lines.joined(separator: "\n")
}

func describe(_ state: CanoeState) -> String {
    var lines = ["\(state.headline)  [\(state.activity)]  \(Chrono.formatClock(state.clockMs))"]
    lines.append("  en course (\(state.onCourse.count)) :")
    for boat in state.onCourse {
        let penalty = boat.penaltySeconds > 0 ? "  +\(boat.penaltySeconds)" : ""
        lines.append("    \(boat.bib) \(boat.name) [\(boat.epreuve)]  \(Chrono.format(boat.elapsedMs))\(penalty)")
    }
    lines.append("  prochains départs :")
    for starter in state.nextStarters.prefix(5) {
        let countdown = Chrono.formatCountdown(starter.remainingMs(clockMs: state.clockMs))
        lines.append("    \(starter.bib) \(starter.name) [\(starter.epreuve)]  \(Chrono.formatClock(starter.startMs))  \(countdown)")
    }
    return lines.joined(separator: "\n")
}

/// Grave une suite de macros, une à une.
///
/// Les pauses ne sont pas décoratives : elles laissent le mélangeur traiter
/// chaque opération avant la suivante, et deux commandes gravées dans le
/// désordre donneraient une macro fausse.
func grave(_ recipes: [MacroRecipe], on connection: AtemConnection) async {
    for recipe in recipes {
        await connection.startRecording(macro: recipe.index, name: recipe.name, details: recipe.details)
        try? await Task.sleep(for: .milliseconds(300))
        for step in recipe.steps {
            await connection.apply(step)
            try? await Task.sleep(for: .milliseconds(150))
        }
        try? await Task.sleep(for: .milliseconds(250))
        await connection.stopRecording()
        try? await Task.sleep(for: .milliseconds(400))
        print("  [\(recipe.index)] \(recipe.name) ✓")
    }
}

/// Les douze macros d'une régie à deux fenêtres : les poser d'abord pour les
/// voir, les graver ensuite.
///
/// Graver, c'est enregistrer : le mélangeur n'a pas de commande pour recevoir
/// une macro toute faite, il capture ce qu'il reçoit entre `MSRc` et l'action
/// `stopRecord`. Les pauses entre les commandes ne sont donc pas décoratives —
/// elles laissent le mélangeur traiter chaque opération avant la suivante, et
/// deux commandes gravées dans le désordre donneraient une macro fausse.
func regie(action: String, on connection: AtemConnection, state: AtemState) async {
    let cameras = argument("cameras", default: "1,2,3,4,5")
        .split(separator: ",").compactMap { UInt16($0.trimmingCharacters(in: .whitespaces)) }
    let superSource = state.superSourceInput ?? RegiePlan.superSourceId
    let background = UInt16(argument("fond", default: "0")) ?? 0
    let recipes = RegiePlan.recipes(
        cameras: cameras,
        superSource: superSource,
        background: background,
        firstIndex: UInt16(argument("depart", default: "0")) ?? 0
    )

    if state.capabilities.superSources == 0 {
        print("""
        ⚠︎  ce mélangeur n'annonce aucun SuperSource (_top). Le jeu de macros en
            dépend entièrement : les fenêtres n'iront nulle part.
        """)
    }
    if state.superSourceInput == nil {
        print("⚠︎  SuperSource absent des entrées : on retombe sur la source \(RegiePlan.superSourceId).")
    }

    // Poser le cadrage sans rien graver : c'est ainsi qu'on vérifie les
    // coordonnées sur l'image avant de les figer dans une macro.
    if action == "cadrage" {
        let which = arguments.dropFirst(2).first ?? "duo"
        guard let recipe = recipes.first(where: { $0.name.lowercased().hasPrefix(which.lowercased().prefix(4)) }) else {
            print("cadrage inconnu : \(which) — attendu « duo » ou « plein »")
            return
        }
        print("\ncadrage « \(recipe.name) »")
        for step in recipe.steps {
            print("  \(step.label(in: state))")
            await connection.apply(step)
            try? await Task.sleep(for: .milliseconds(120))
        }
        if let cam1 = UInt16(argument("cam1", default: "")) {
            await connection.apply(.windowSource(window: 0, source: cam1))
        }
        if let cam2 = UInt16(argument("cam2", default: "")) {
            await connection.apply(.windowSource(window: 1, source: cam2))
        }
        try? await Task.sleep(for: .milliseconds(600))
        exit(0)
    }

    print("\n\(recipes.count) macros à graver (SuperSource = \(state.inputName(superSource))) :")
    for recipe in recipes {
        print("  [\(recipe.index)] \(recipe.name) — \(recipe.details)")
        for step in recipe.steps { print("        \(step.label(in: state))") }
    }

    // Graver écrase : une macro occupée ne part qu'à la demande explicite.
    let occupied = recipes.compactMap { recipe in
        state.macros.first { $0.index == recipe.index && $0.isUsed }
    }
    if !occupied.isEmpty {
        print("\n\(occupied.count) emplacement(s) déjà occupé(s) :")
        for macro in occupied { print("  [\(macro.index)] \(macro.displayName)") }
    }

    if flag("essai") {
        print("\n--essai : rien n'a été envoyé au mélangeur.")
        exit(0)
    }
    if !occupied.isEmpty, !flag("force") {
        print("\nrien n'a été gravé. --force pour les écraser, --depart n pour graver ailleurs.")
        exit(1)
    }

    print("\ngravure…")
    await grave(recipes, on: connection)

    try? await Task.sleep(for: .milliseconds(800))
    print("\n" + describe(await connection.currentState))
    exit(0)
}

/// L'incrustation d'une source sur une couleur, gravée en macro.
///
/// La couleur se calcule depuis le hexadécimal, mais l'échelle dans laquelle le
/// mélangeur range un échantillon n'est documentée nulle part. D'où la sonde :
/// on règle la couleur une fois à la main dans ATEM Software Control, on lit ce
/// que le mélangeur en a fait, et `--couleur melangeur` le regrave tel quel.
/// C'est le seul chemin qui ne suppose rien.
func incrustation(on connection: AtemConnection, state: AtemState) async {
    let keyerNumber = max(1, Int(argument("keyer", default: "1")) ?? 1)
    let keyer = UInt8(keyerNumber - 1)
    let fill = UInt16(argument("source", default: "8")) ?? 8
    let scale = Double(argument("echelle", default: "\(Int(ChromaColor.defaultSampleScale))"))
        ?? ChromaColor.defaultSampleScale
    let colorText = argument("couleur", default: "CC00CC")
    let fromSwitcher = colorText.lowercased() == "melangeur"
    let current = state.keyer(keyer)

    guard let color = ChromaColor(hex: fromSwitcher ? "CC00CC" : colorText) else {
        print("couleur illisible : \(colorText) — attendu « CC00CC » ou « melangeur »")
        exit(1)
    }

    if flag("sonde") {
        let sample = color.sampled(scale: scale)
        print("\nsonde de l'incrustation \(keyerNumber)")
        if let current {
            print("  état actuel : \(current.type.label), \(state.inputName(current.fillSource)), \(current.onAir ? "à l'antenne" : "hors antenne")")
            print("  couleur retenue par le mélangeur : Y \(current.sampledY)  Cb \(current.sampledCb)  Cr \(current.sampledCr)")
        } else {
            print("  le mélangeur n'a rien dit de ce keyer.")
        }
        print(String(format: "  %@ vaut, normalisé : Y %.4f  Cb %+.4f  Cr %+.4f",
                     color.hex, color.luma, color.blueDifference, color.redDifference))
        for candidate in [1000.0, 10000.0] {
            let value = color.sampled(scale: candidate)
            print("     à l'échelle \(Int(candidate)) : Y \(value.y)  Cb \(value.cb)  Cr \(value.cr)")
        }
        print("  échelle retenue ici : \(Int(scale)) → Y \(sample.y)  Cb \(sample.cb)  Cr \(sample.cr)")
        // Si la couleur relevée est bien celle qu'on demande, le rapport entre
        // les deux donne l'échelle. On le lit sur la composante la plus grande,
        // celle où l'arrondi pèse le moins.
        if let current, current.sampledY != 0 || current.sampledCb != 0 || current.sampledCr != 0 {
            let pairs: [(Double, Double)] = [
                (Double(current.sampledY), color.luma),
                (Double(current.sampledCb), color.blueDifference),
                (Double(current.sampledCr), color.redDifference),
            ]
            if let best = pairs.max(by: { abs($0.1) < abs($1.1) }), abs(best.1) > 0.01 {
                print(String(format: "  → si le mélangeur a été réglé sur %@, son échelle vaut ≈ %.0f",
                             color.hex, best.0 / best.1))
            }
        }
        exit(0)
    }

    if !state.capabilities.advancedChromaKeyers {
        print("""
        ⚠︎  ce mélangeur n'annonce pas de chroma avancé : on retombe sur l'ancien
            keyer, réglé par teinte. La teinte seule ignore la luminosité et la
            saturation de la couleur demandée.
        """)
    }
    let setting: RegiePlan.ChromaSetting
    if !state.capabilities.advancedChromaKeyers {
        setting = .hue(color.hueTenths)
    } else if fromSwitcher {
        guard let current, current.sampledY != 0 || current.sampledCb != 0 || current.sampledCr != 0 else {
            print("le mélangeur n'a pas de couleur échantillonnée sur l'incrustation \(keyerNumber).")
            print("réglez-la une fois dans ATEM Software Control, puis relancez.")
            exit(1)
        }
        setting = .sampled(y: current.sampledY, cb: current.sampledCb, cr: current.sampledCr)
    } else {
        setting = .color(color, scale: scale)
    }

    // Par défaut, la première macro libre : on ne présume pas de ce que les
    // douze macros de régie occupent déjà.
    let firstFree = (0..<100).first { index in
        state.macros.first { $0.index == UInt16(index) }?.isUsed != true
    } ?? 0
    let index = UInt16(argument("emplacement", default: "\(firstFree)")) ?? UInt16(firstFree)

    let recipes = RegiePlan.chromaKey(
        fill: fill, setting: setting, keyer: keyer,
        index: index, withRemoval: !flag("sans-arret")
    )

    print("\n\(recipes.count) macro(s) à graver :")
    for recipe in recipes {
        print("  [\(recipe.index)] \(recipe.name) — \(recipe.details)")
        for step in recipe.steps { print("        \(step.label(in: state))") }
    }

    let occupied = recipes.compactMap { recipe in
        state.macros.first { $0.index == recipe.index && $0.isUsed }
    }
    if !occupied.isEmpty {
        print("\n\(occupied.count) emplacement(s) déjà occupé(s) :")
        for macro in occupied { print("  [\(macro.index)] \(macro.displayName)") }
    }

    if flag("essai") {
        print("\n--essai : rien n'a été envoyé au mélangeur.")
        exit(0)
    }
    if !occupied.isEmpty, !flag("force") {
        print("\nrien n'a été gravé. --force pour les écraser, --emplacement n pour graver ailleurs.")
        exit(1)
    }

    print("\ngravure…")
    await grave(recipes, on: connection)
    try? await Task.sleep(for: .milliseconds(800))
    print("\n" + describe(await connection.currentState))
    exit(0)
}

switch subject {
case "atem":
    let port = UInt16(argument("port", default: "9910")) ?? 9910
    let connection = AtemConnection(host: host, port: port)
    let index = UInt16(arguments.dropFirst(2).first ?? "0") ?? 0

    Task {
        for await event in await connection.events {
            switch event {
            case .connecting:
                print("… connexion à \(host):\(port)")
            case .connected(let state):
                print("connecté\n" + describe(state))
                if action == "run" {
                    print("\n→ macro \(index)")
                    await connection.run(macro: index)
                }
                if action == "sectors" {
                    // Rejoue le cycle du bouton « secteur suivant » : c'est le
                    // même SectorPlan et la même connexion que dans l'app.
                    let assigned = arguments.dropFirst(2).compactMap { UInt16($0) }
                    var plan = SectorPlan(count: max(assigned.count, 1), macros: assigned.map { $0 })
                    print("\nplan : \(plan.count) secteur(s)")
                    // Un tour complet plus un, pour voir le retour au premier.
                    for _ in 0...plan.count {
                        let from = plan.current + 1
                        guard let macro = plan.advance() else {
                            print("  secteur \(from) → \(plan.current + 1) : aucune macro")
                            continue
                        }
                        let name = state.macros.first { $0.index == macro }?.displayName ?? "?"
                        print("  secteur \(from) → \(plan.current + 1) : macro \(macro) « \(name) »")
                        await connection.run(macro: macro)
                        try? await Task.sleep(for: .milliseconds(800))
                    }
                }
                if action == "cadrage" || action == "grave" {
                    await regie(action: action, on: connection, state: state)
                }
                if action == "incrust" {
                    await incrustation(on: connection, state: state)
                }
            case .changed(let state):
                if action != "list" { print("\n— changement —\n" + describe(state)) }
            case .disconnected(let reason):
                print("déconnecté\(reason.map { " : \($0)" } ?? "")")
            }
        }
    }
    await connection.start()
    try? await Task.sleep(for: .seconds(action == "list" ? 3 : seconds))

case "canoe":
    let port = UInt16(argument("port", default: "20000")) ?? 20000
    let client = CompetFFCKClient(host: host, port: port)
    var lastPrint = Date.distantPast

    Task {
        for await event in await client.events {
            switch event {
            case .connecting:
                print("… connexion à ws://\(host):\(port)")
            case .connected(let state):
                print("connecté\n" + describe(state))
                lastPrint = Date()
            case .changed(let state):
                // Le flux arrive à 10 Hz : on n'imprime qu'une fois par seconde.
                if Date().timeIntervalSince(lastPrint) >= 1 {
                    lastPrint = Date()
                    print("\n" + describe(state))
                }
            case .disconnected(let reason):
                print("déconnecté\(reason.map { " : \($0)" } ?? "")")
            }
        }
    }
    await client.start()
    try? await Task.sleep(for: .seconds(seconds))

default:
    print("""
    usage : atemctl <atem|canoe> <action> [options]

      atem watch                    suit l'état du mélangeur
      atem list                     liste les macros
      atem run <index>              déclenche une macro
      atem sectors <i...>           déroule un plan de secteurs
      atem cadrage <duo|plein>      pose le cadrage, sans rien graver
      atem grave                    grave les 12 macros de régie
      atem incrust                  grave l'incrustation chroma d'une source

    options : --host h  --port p  --seconds n
              --cameras 1,2,3,4,5  --depart 0  --fond 0  --cam1 n  --cam2 n
              --source 8  --couleur CC00CC|melangeur  --keyer 1  --emplacement n
              --echelle 1000  --sonde (lit la couleur du mélangeur, ne grave pas)
              --essai (n'envoie rien)  --force (écrase les macros occupées)
              --sans-arret (ne grave pas la macro de retrait)
    """)
}
