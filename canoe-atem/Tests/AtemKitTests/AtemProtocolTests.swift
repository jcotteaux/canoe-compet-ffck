import Testing
import Foundation
@testable import AtemKit

/// Ces tests portent sur l'encodage, pas sur le comportement réseau : le
/// protocole ATEM n'étant pas documenté, une erreur d'offset ne se voit ni à
/// la compilation ni à l'exécution — le mélangeur se contente d'ignorer la
/// commande. C'est le seul endroit où on peut la rattraper.

@Test("La trame d'ouverture est celle attendue par un vrai mélangeur")
func helloMatchesReference() {
    let hello = AtemPacket.hello()
    #expect(hello.count == 20)
    // Drapeau « nouvelle session » et longueur 20 dans le premier mot.
    #expect(hello.readUInt16BE(at: 0) == (2 << 11 | 20))
    #expect(hello.readUInt16BE(at: 2) == 0x53ab)
    // L'octet 8-9 vaut 0x003a dans l'implémentation de référence.
    #expect(hello.readUInt16BE(at: 8) == 0x003a)
}

@Test("Un paquet se relit tel qu'il a été écrit")
func packetRoundTrip() throws {
    let payload = AtemRawCommand.encode("MAct", Data([0, 4, 0, 0]))
    let packet = AtemPacket(flags: [.ackRequest], sessionId: 0x1234, packetId: 7, payload: payload)
    let decoded = try #require(AtemPacket(decoding: packet.encoded()))

    #expect(decoded.flags.contains(.ackRequest))
    #expect(decoded.sessionId == 0x1234)
    #expect(decoded.packetId == 7)
    #expect(decoded.payload == payload)
}

@Test("Les drapeaux occupent les cinq bits hauts, la longueur les onze bas")
func flagsAndLengthShareTheFirstWord() throws {
    let packet = AtemPacket(flags: [.ack, .ackRequest], sessionId: 1)
    let word = packet.encoded().readUInt16BE(at: 0)
    #expect(word >> 11 == 0x11)
    #expect(word & 0x07ff == 12)
}

@Test("MAct porte l'index de macro et l'action")
func macroActionEncoding() {
    let run = AtemOutgoing.macroAction(.run, index: 4)
    #expect(run.readUInt16BE(at: 0) == 12)      // longueur totale
    #expect(run.readString(at: 4, length: 4) == "MAct")
    #expect(run.readUInt16BE(at: 8) == 4)       // index
    #expect(run.readUInt8(at: 10) == 0)         // MacroAction.run

    // Les actions sans cible portent 0xffff plutôt qu'un index arbitraire.
    let stop = AtemOutgoing.macroAction(.stop, index: 4)
    #expect(stop.readUInt16BE(at: 8) == 0xffff)
    #expect(stop.readUInt8(at: 10) == 1)
}

@Test("Les commandes s'enchaînent sans se désynchroniser")
func commandsParseInSequence() {
    let payload = AtemRawCommand.encode("PrgI", Data([0, 0, 0, 2]))
        + AtemRawCommand.encode("PrvI", Data([0, 0, 0, 3]))
    let commands = AtemRawCommand.parse(payload)

    #expect(commands.map(\.name) == ["PrgI", "PrvI"])
    #expect(commands[0].data.readUInt16BE(at: 2) == 2)
}

@Test("Une longueur incohérente arrête le découpage au lieu de dériver")
func malformedCommandStopsParsing() {
    var payload = AtemRawCommand.encode("PrgI", Data([0, 0, 0, 2]))
    payload.append(AtemRawCommand.encode("PrvI", Data([0, 0, 0, 3])))
    payload.writeUInt16BE(9000, at: 12) // longueur absurde sur la deuxième

    #expect(AtemRawCommand.parse(payload).map(\.name) == ["PrgI"])
}

@Test("L'état se construit à partir des commandes reçues")
func stateAppliesCommands() throws {
    var state = AtemState()

    var macro = Data(count: 8)
    macro.writeUInt16BE(2, at: 0)
    macro.writeUInt8(1, at: 2)          // isUsed
    macro.writeUInt16BE(6, at: 4)       // longueur du nom
    macro.writeUInt16BE(5, at: 6)       // longueur de la description
    macro.append(Data("PodiumfinX".utf8.prefix(11)))

    for command in AtemRawCommand.parse(
        AtemRawCommand.encode("MPrp", macro)
        + AtemRawCommand.encode("PrgI", Data([0, 0, 0, 3]))
        + AtemRawCommand.encode("MRPr", Data([0x01, 0x00, 0x00, 0x02]))
        + AtemRawCommand.encode("InCm", Data([1, 0, 0, 0]))
    ) {
        state.apply(command)
    }

    let found = try #require(state.macros.first)
    #expect(found.index == 2)
    #expect(found.name == "Podium")
    #expect(found.isUsed)
    #expect(state.program == 3)
    #expect(state.macroRun.isRunning)
    #expect(state.macroRun.index == 2)
    #expect(state.isInitialised)
}

@Test("Une macro sans nom reste identifiable")
func unnamedMacroFallsBackToItsRank() {
    let macro = AtemMacro(index: 3, name: "", description: "", isUsed: true, hasUnsupportedOps: false)
    #expect(macro.displayName == "Macro 4")
}

// MARK: - SuperSource et gravure de macros

@Test("MSRc ouvre l'enregistrement avec le nom et la description")
func macroRecordEncoding() {
    let command = AtemOutgoing.macroRecord(index: 10, name: "Duo", description: "Deux fenetres")

    #expect(command.readString(at: 4, length: 4) == "MSRc")
    #expect(command.readUInt16BE(at: 8) == 10)      // emplacement visé
    #expect(command.readUInt16BE(at: 10) == 3)      // longueur du nom
    #expect(command.readUInt16BE(at: 12) == 13)     // longueur de la description
    #expect(command.readString(at: 14, length: 3) == "Duo")
    #expect(command.readString(at: 17, length: 13) == "Deux fenetres")
    // La longueur déclarée reste un multiple de quatre, sans quoi le mélangeur
    // se décalerait sur la commande suivante.
    #expect(command.readUInt16BE(at: 0) % 4 == 0)
    #expect(Int(command.readUInt16BE(at: 0)) == command.count)
}

@Test("CMPr renomme une macro sans la regraver")
func macroRenameEncoding() {
    let command = AtemOutgoing.macroRename(index: 4, name: "Duo", description: "")

    #expect(command.readString(at: 4, length: 4) == "CMPr")
    #expect(command.readUInt8(at: 8) == 0x03)       // masque : nom + description
    #expect(command.readUInt16BE(at: 10) == 4)
    #expect(command.readUInt16BE(at: 12) == 3)
    #expect(command.readString(at: 16, length: 3) == "Duo")
}

@Test("Changer la caméra d'une fenêtre ne porte que la source")
func windowSourceCarriesOnlyTheSource() {
    let command = MacroStep.windowSource(window: 1, source: 3).encoded()

    #expect(command.readString(at: 4, length: 4) == "CSBP")
    #expect(command.readUInt16BE(at: 8) == 0x02)    // masque : source seule
    #expect(command.readUInt8(at: 10) == 0)         // SuperSource 0
    #expect(command.readUInt8(at: 11) == 1)         // fenêtre 2
    #expect(command.readUInt16BE(at: 14) == 3)
    // Tout le reste est à zéro : hors masque, le mélangeur n'y touche pas —
    // c'est ce qui permet de changer de caméra sans défaire le cadrage.
    #expect(command.readInt16BE(at: 16) == 0)
    #expect(command.readUInt16BE(at: 20) == 0)
}

@Test("Le cadrage d'une fenêtre porte position et taille, pas la source")
func windowLayoutCarriesGeometry() {
    let command = MacroStep.windowLayout(window: 1, enabled: true, geometry: .bottomRight).encoded()

    #expect(command.readUInt16BE(at: 8) == 0x1d)    // enabled + x + y + size
    #expect(command.readUInt8(at: 12) == 1)         // allumée
    #expect(command.readUInt16BE(at: 14) == 0)      // source hors masque
    #expect(command.readInt16BE(at: 16) == 800)
    #expect(command.readInt16BE(at: 18) == -450)    // vers le bas : ordonnée négative
    #expect(command.readUInt16BE(at: 20) == 500)
}

@Test("Les douze macros de régie couvrent les deux fenêtres")
func regiePlanCoversBothWindows() throws {
    let recipes = RegiePlan.recipes(cameras: [1, 2, 3, 4, 5], superSource: 6000, background: 0, firstIndex: 0)

    #expect(recipes.count == 12)
    #expect(recipes.map(\.index) == Array(0...11).map(UInt16.init))
    #expect(recipes[0].name == "Duo")
    #expect(recipes[1].name == "Plein ecran")

    // Le duo pose les deux fenêtres et envoie le SuperSource au programme :
    // c'est ce qui rend la bascule indépendante des caméras choisies.
    #expect(recipes[0].steps.contains(.windowLayout(window: 0, enabled: true, geometry: .topLeft)))
    #expect(recipes[0].steps.contains(.windowLayout(window: 1, enabled: true, geometry: .bottomRight)))
    #expect(recipes[0].steps.contains(.program(source: 6000)))

    // Le plein écran éteint la seconde fenêtre plutôt que de la déplacer.
    #expect(recipes[1].steps.contains(.windowLayout(window: 0, enabled: true, geometry: .fullScreen)))
    #expect(recipes[1].steps.contains(.windowLayout(window: 1, enabled: false, geometry: .bottomRight)))

    // Une macro de caméra ne fait qu'une chose.
    #expect(recipes[2].steps == [.windowSource(window: 0, source: 1)])
    #expect(recipes[6].steps == [.windowSource(window: 0, source: 5)])
    #expect(recipes[7].steps == [.windowSource(window: 1, source: 1)])
    #expect(recipes[11].steps == [.windowSource(window: 1, source: 5)])
}

@Test("Le départ décale les douze emplacements sans rien changer d'autre")
func regiePlanShiftsWithFirstIndex() {
    let recipes = RegiePlan.recipes(cameras: [1, 2, 3], firstIndex: 10)

    #expect(recipes.count == 8)                     // 2 cadrages + 2 × 3 caméras
    #expect(recipes.first?.index == 10)
    #expect(recipes.last?.index == 17)
}

@Test("L'état retient les capacités, le SuperSource et l'enregistreur")
func stateReadsSuperSourceAndRecorder() throws {
    var state = AtemState()

    // Une entrée dont le type de port interne vaut 6 : c'est le SuperSource.
    var input = Data(count: 36)
    input.writeUInt16BE(6000, at: 0)
    input.writeBytes(Array("SuperSource".utf8), at: 2)
    input.writeUInt8(6, at: 32)

    var topology = Data(count: 28)
    topology.writeUInt8(1, at: 0)                   // un M/E
    topology.writeUInt8(2, at: 9)                   // deux DVE (version 2.30)
    topology.writeUInt8(1, at: 11)                  // un SuperSource

    var box = Data(count: 16)
    box.writeUInt8(1, at: 1)                        // fenêtre 2
    box.writeUInt8(1, at: 2)                        // allumée
    box.writeUInt16BE(3, at: 4)
    box.writeInt16BE(800, at: 6)
    box.writeInt16BE(-450, at: 8)
    box.writeUInt16BE(500, at: 10)

    for command in AtemRawCommand.parse(
        AtemRawCommand.encode("_ver", Data([0, 2, 0, 30]))
        + AtemRawCommand.encode("_top", topology)
        + AtemRawCommand.encode("InPr", input)
        + AtemRawCommand.encode("SSBP", box)
        + AtemRawCommand.encode("MRcS", Data([1, 0, 0, 10]))
    ) {
        state.apply(command)
    }

    #expect(state.capabilities.superSources == 1)
    #expect(state.capabilities.dves == 2)
    #expect(state.superSourceInput == 6000)
    #expect(state.macroRecorder.isRecording)
    #expect(state.macroRecorder.index == 10)

    let window = try #require(state.superSourceBoxes.last)
    #expect(window.enabled)
    #expect(window.source == 3)
    #expect(window.x == 800)
    #expect(window.y == -450)
    #expect(window.size == 500)
}

// MARK: - Incrustation chroma

@Test("Une couleur hexadécimale se convertit en luminance et différences")
func chromaColorConvertsToYCbCr() throws {
    let magenta = try #require(ChromaColor(hex: "#CC00CC"))

    #expect(magenta.hex == "#CC00CC")
    // BT.709 : Y = 0,2126 R + 0,7152 V + 0,0722 B, sur 0,8 de rouge et de bleu.
    #expect(abs(magenta.luma - 0.22784) < 0.0001)
    #expect(abs(magenta.blueDifference - 0.30834) < 0.0001)
    #expect(abs(magenta.redDifference - 0.36332) < 0.0001)
    // Magenta pur : 300 degrés, soit 3000 dixièmes pour l'ancien keyer.
    #expect(abs(magenta.hueDegrees - 300) < 0.001)
    #expect(magenta.hueTenths == 3000)

    let sample = magenta.sampled(scale: 1000)
    #expect(sample.y == 228)
    #expect(sample.cb == 308)
    #expect(sample.cr == 363)
}

@Test("Les trois écritures d'une couleur donnent la même chose")
func chromaColorAcceptsCommonSpellings() {
    #expect(ChromaColor(hex: "CC00CC") == ChromaColor(hex: "#cc00cc"))
    #expect(ChromaColor(hex: "0xCC00CC") == ChromaColor(hex: "CC00CC"))
    #expect(ChromaColor(hex: "CC00C") == nil)
    #expect(ChromaColor(hex: "ZZ00CC") == nil)
}

@Test("CACC n'écrit que la couleur échantillonnée")
func chromaSampleEncoding() {
    let command = MacroStep.chromaSample(keyer: 0, y: 228, cb: 308, cr: 363).encoded()

    #expect(command.readString(at: 4, length: 4) == "CACC")
    #expect(command.readUInt8(at: 8) == 0xe0)    // masque : les trois composantes
    #expect(command.readUInt8(at: 9) == 0)       // M/E 1
    #expect(command.readUInt8(at: 10) == 0)      // incrustation 1
    #expect(command.readUInt16BE(at: 20) == 228)
    #expect(command.readInt16BE(at: 22) == 308)
    #expect(command.readInt16BE(at: 24) == 363)
    // Le curseur d'échantillonnage reste hors masque : une macro qui impose une
    // couleur ne doit pas déplacer ce que l'opérateur a réglé à l'écran.
    #expect(command.readUInt16BE(at: 14) == 0)
}

@Test("Le type, la source et l'antenne d'un keyer s'encodent séparément")
func keyerCommandsEncoding() {
    let type = MacroStep.keyType(keyer: 1, type: .chroma).encoded()
    #expect(type.readString(at: 4, length: 4) == "CKTp")
    #expect(type.readUInt8(at: 8) == 0x01)       // masque : le type seul
    #expect(type.readUInt8(at: 10) == 1)         // incrustation 2
    #expect(type.readUInt8(at: 11) == 1)         // MixEffectKeyType.chroma

    let fill = MacroStep.keyFill(keyer: 0, source: 8).encoded()
    #expect(fill.readString(at: 4, length: 4) == "CKeF")
    #expect(fill.readUInt16BE(at: 10) == 8)

    let onAir = MacroStep.keyOnAir(keyer: 0, onAir: true).encoded()
    #expect(onAir.readString(at: 4, length: 4) == "CKOn")
    #expect(onAir.readUInt8(at: 10) == 1)
}

@Test("L'incrustation se grave en deux macros : la poser et la retirer")
func chromaKeyRecipe() throws {
    let magenta = try #require(ChromaColor(hex: "CC00CC"))
    let recipes = RegiePlan.chromaKey(fill: 8, setting: .color(magenta, scale: 1000), keyer: 0, index: 30)

    #expect(recipes.count == 2)
    #expect(recipes[0].index == 30)
    #expect(recipes[1].index == 31)
    // La mise à l'antenne vient en dernier : avant elle, l'incrustation serait
    // visible le temps que la couleur arrive.
    #expect(recipes[0].steps == [
        .keyFill(keyer: 0, source: 8),
        .keyType(keyer: 0, type: .chroma),
        .chromaSample(keyer: 0, y: 228, cb: 308, cr: 363),
        .keyOnAir(keyer: 0, onAir: true),
    ])
    #expect(recipes[1].steps == [.keyOnAir(keyer: 0, onAir: false)])

    // Une couleur relevée sur le mélangeur se regrave telle quelle.
    let relue = RegiePlan.chromaKey(fill: 8, setting: .sampled(y: 2278, cb: 3083, cr: 3633), index: 30, withRemoval: false)
    #expect(relue.count == 1)
    #expect(relue[0].steps.contains(.chromaSample(keyer: 0, y: 2278, cb: 3083, cr: 3633)))
}

@Test("L'état retient ce que le mélangeur dit de ses keyers")
func stateReadsKeyers() throws {
    var state = AtemState()

    var properties = Data(count: 20)
    properties.writeUInt8(0, at: 0)              // M/E 1
    properties.writeUInt8(0, at: 1)              // incrustation 1
    properties.writeUInt8(1, at: 2)              // chroma
    properties.writeUInt16BE(8, at: 6)           // remplissage

    var sample = Data(count: 16)
    sample.writeUInt8(0, at: 1)
    sample.writeUInt16BE(228, at: 10)
    sample.writeInt16BE(308, at: 12)
    sample.writeInt16BE(363, at: 14)

    for command in AtemRawCommand.parse(
        AtemRawCommand.encode("KeBP", properties)
        + AtemRawCommand.encode("KeOn", Data([0, 0, 1, 0]))
        + AtemRawCommand.encode("KACC", sample)
    ) {
        state.apply(command)
    }

    let keyer = try #require(state.keyer(0))
    #expect(keyer.type == .chroma)
    #expect(keyer.fillSource == 8)
    #expect(keyer.onAir)
    #expect(keyer.sampledY == 228)
    #expect(keyer.sampledCb == 308)
    #expect(keyer.sampledCr == 363)
}

// MARK: - Plan de secteurs

@Test("Le plan boucle sur le premier secteur après le dernier")
func sectorPlanWrapsAround() {
    var plan = SectorPlan(count: 3, macros: [10, 11, 12])

    #expect(plan.current == 0)
    #expect(plan.advance() == 11)
    #expect(plan.advance() == 12)
    #expect(plan.advance() == 10)   // retour au premier, prêt pour le bateau suivant
    #expect(plan.current == 0)
}

@Test("Un secteur sans macro n'interrompt pas la progression")
func sectorPlanAdvancesThroughGaps() {
    var plan = SectorPlan(count: 3, macros: [10, nil, 12])

    #expect(plan.advance() == nil)
    #expect(plan.current == 1)
    #expect(plan.advance() == 12)
}

@Test("Réduire le nombre de secteurs conserve les affectations")
func sectorPlanKeepsAssignmentsWhenShrinking() {
    var plan = SectorPlan(count: 6, macros: [1, 2, 3, 4, 5, 6])
    plan.setCount(2)

    #expect(plan.count == 2)
    #expect(plan.macro(for: 5) == 6)   // toujours là si on remonte à 6
    plan.setCount(6)
    #expect(plan.advance() == 2)
}

@Test("Réduire le nombre de secteurs ramène le courant dans les bornes")
func sectorPlanClampsCurrentWhenShrinking() {
    var plan = SectorPlan(count: 5, macros: [1, 2, 3, 4, 5])
    plan.select(4)
    plan.setCount(2)

    #expect(plan.current == 0)
    #expect(plan.nextSector == 1)
}

@Test("Le nombre de secteurs reste entre 1 et 6")
func sectorPlanCountIsBounded() {
    #expect(SectorPlan(count: 0).count == 1)
    #expect(SectorPlan(count: 99).count == SectorPlan.maxSectors)
    #expect(SectorPlan(count: 3).macros.count == SectorPlan.maxSectors)
}

@Test("Un secteur hors bornes ne déplace pas le plan")
func sectorPlanIgnoresOutOfRangeSelection() {
    var plan = SectorPlan(count: 2, macros: [1, 2])
    #expect(plan.select(4) == nil)
    #expect(plan.current == 0)
}
