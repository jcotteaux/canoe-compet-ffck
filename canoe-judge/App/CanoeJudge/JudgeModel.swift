import Foundation
import Observation
import CanoeLiveKit
import JudgeKit

enum LinkStatus: Equatable {
    case idle, connecting, connected
    case lost(String?)

    var label: String {
        switch self {
        case .idle: "hors ligne"
        case .connecting: "connexion…"
        case .connected: "chronométrage connecté"
        case .lost(let reason): reason ?? "liaison perdue"
        }
    }
}

/// Le modèle de l'app.
///
/// Deux sources indépendantes : le chronométrage, qui dit **qui** et **quand**,
/// et les fichiers du disque, qui montrent **quoi**. Ni l'une ni l'autre n'est
/// indispensable à l'autre : on ouvre un dossier de vidéos sans compétition
/// chargée, et on écoute une compétition avant d'avoir branché le disque.
@Observable
@MainActor
final class JudgeModel {

    // MARK: Réglages persistés

    var host: String { didSet { defaults.set(host, forKey: Keys.host) } }
    var port: Int { didSet { defaults.set(port, forKey: Keys.port) } }
    var videoFolder: URL? { didSet { defaults.set(videoFolder?.path, forKey: Keys.videoFolder) } }
    var exportFolder: URL? { didSet { defaults.set(exportFolder?.path, forKey: Keys.exportFolder) } }
    var quality: ClipQuality { didSet { defaults.set(quality.rawValue, forKey: Keys.quality) } }
    /// Combien de temps on se pose avant une pénalité entendue.
    var prerollSeconds: Double { didSet { defaults.set(prerollSeconds, forKey: Keys.preroll) } }
    /// Afficher le chrono et les pénalités par-dessus l'image.
    var showOverlay: Bool { didSet { defaults.set(showOverlay, forKey: Keys.overlay) } }
    /// Graver cette même incrustation dans les clips extraits.
    ///
    /// Graver impose de réencoder : on ne recopie plus le flux, on refabrique
    /// chaque image. Un clip passe de quelques dixièmes de seconde à plusieurs
    /// secondes, et le rattrapage automatique ne suit plus le rythme d'une
    /// course sur un plateau entier.
    var burnIn: Bool {
        didSet {
            defaults.set(burnIn, forKey: Keys.burnIn)
            // L'empreinte des coupes change : ce qui a été découpé sans
            // incrustation n'est plus ce qu'on demande. Elles se referont
            // d'elles-mêmes à la prochaine relecture.
            if burnIn != oldValue { lastMessage = burnIn
                ? "Incrustation gravée : les clips seront refaits, en réencodage"
                : "Incrustation retirée : les clips seront refaits" }
        }
    }
    /// Découper les descentes terminées sans qu'on le demande.
    ///
    /// Sur une course entière cela fait un clip par bateau et par caméra : de
    /// la place et du disque. Mais quand le jury réclame une descente, elle est
    /// déjà sur le disque, et c'est tout l'intérêt.
    var autoExport: Bool { didSet { defaults.set(autoExport, forKey: Keys.autoExport) } }
    /// Décalage entre l'horloge de l'enregistreur et celle du chronométrage.
    var offsetMs: Int {
        didSet {
            defaults.set(offsetMs, forKey: Keys.offset)
            cluster.offsetMs = offsetMs
        }
    }

    // MARK: État

    private(set) var race = CanoeState()
    private(set) var status: LinkStatus = .idle
    private(set) var sources: [VideoSource] = []
    private(set) var scanning = false
    private(set) var exporting = false
    /// Combien de clips le rattrapage a encore à découper.
    private(set) var catchUpRemaining = 0
    private(set) var lastMessage: String?

    /// Les caméras que le juge a écartées, par nom.
    ///
    /// On mémorise celles qu'on **refuse**, pas celles qu'on garde : le
    /// mélangeur enregistre ses huit ISO quoi qu'il arrive, et une caméra
    /// inconnue doit apparaître plutôt que se cacher. Un ISO qu'on n'a jamais
    /// vu est donc utilisé jusqu'à ce qu'on dise le contraire.
    private(set) var disabledCameras: Set<String> = []

    /// Les 50 que le juge a regardés et validés à la main.
    ///
    /// Ce n'est pas une décision de jury — l'app ne modifie rien au
    /// classement. C'est la coche du juge vidéo : « celui-là, je l'ai vu ».
    private(set) var checkedFifties: Set<FiftyID> = []

    var query = ""
    var filter: FieldFilter = .all
    var order: FieldOrder = .recent
    var selectedBib: Int?

    let cluster = PlayerCluster()

    private var client: CompetFFCKClient?
    private var tasks: [Task<Void, Never>] = []
    private let defaults = UserDefaults.standard

    /// Ce qui a déjà été découpé, et dans quelles conditions.
    private var clipsDone: [ClipKey: ClipStamp] = [:]
    /// Le dossier auquel ce registre se rapporte : ailleurs, il ne vaut rien.
    private var ledgerDirectory: URL?
    /// Les coupes qui ont échoué, avec le nombre d'essais sur cette empreinte.
    private var clipFailures: [ClipKey: (stamp: ClipStamp, attempts: Int)] = [:]
    /// La durée de chaque enregistrement à la lecture précédente, pour savoir
    /// lesquels grandissent encore.
    private var knownDurations: [URL: Double] = [:]
    /// Un rattrapage est déjà en file : le suivant ne doit pas remettre les
    /// mêmes coupes derrière lui. Le registre ne se remplit qu'une fois le
    /// clip écrit, et sur un plateau entier une passe dure plus longtemps que
    /// l'intervalle entre deux relectures.
    private var catchingUp = false
    /// Les découpages se suivent au lieu de se superposer : deux ffmpeg sur le
    /// même fichier de sortie le laisseraient à moitié écrit, et en lancer
    /// trente en parallèle prendrait le processeur dont la lecture a besoin.
    private var exportChain: Task<Void, Never>?

    private enum Keys {
        static let host = "canoe.host", port = "canoe.port"
        static let videoFolder = "video.folder", exportFolder = "export.folder"
        static let offset = "video.offsetMs", preroll = "video.preroll", quality = "export.quality"
        static let autoExport = "export.auto"
        static let checked = "review.checked", checkedRace = "review.race"
        static let disabledCameras = "video.disabledCameras"
        static let overlay = "overlay.show", burnIn = "overlay.burn"
    }

    /// La compétition à laquelle les coches se rapportent. Elles ne valent que
    /// pour elle : rouvrir l'app le lendemain sur une autre course ne doit pas
    /// faire croire que ses 50 sont déjà vus.
    private var checkedRace: String

    init() {
        host = defaults.string(forKey: Keys.host) ?? "127.0.0.1"
        port = defaults.object(forKey: Keys.port) as? Int ?? 20000
        videoFolder = (defaults.string(forKey: Keys.videoFolder)).map(URL.init(fileURLWithPath:))
        exportFolder = (defaults.string(forKey: Keys.exportFolder)).map(URL.init(fileURLWithPath:))
        offsetMs = defaults.integer(forKey: Keys.offset)
        prerollSeconds = defaults.object(forKey: Keys.preroll) as? Double ?? JudgeMarks.defaultPrerollSeconds
        quality = ClipQuality(rawValue: defaults.string(forKey: Keys.quality) ?? "") ?? .copy
        autoExport = defaults.object(forKey: Keys.autoExport) as? Bool ?? true
        showOverlay = defaults.object(forKey: Keys.overlay) as? Bool ?? true
        burnIn = defaults.object(forKey: Keys.burnIn) as? Bool ?? false
        disabledCameras = Set(defaults.stringArray(forKey: Keys.disabledCameras) ?? [])
        checkedRace = defaults.string(forKey: Keys.checkedRace) ?? ""
        checkedFifties = Set((defaults.stringArray(forKey: Keys.checked) ?? [])
            .compactMap(FiftyID.init(token:)))
        cluster.offsetMs = offsetMs
    }

    // MARK: Dérivés

    /// Les enregistrements effectivement utilisés — affichés et découpés.
    ///
    /// Sur huit ISO, la moitié filme souvent autre chose que des kayaks :
    /// les décoder tous coûte le processeur dont le ralenti a besoin, et les
    /// découper tous remplit le disque de clips que personne n'ouvrira.
    var activeSources: [VideoSource] {
        sources.filter { !disabledCameras.contains($0.camera) }
    }

    func isCameraUsed(_ camera: String) -> Bool { !disabledCameras.contains(camera) }

    var entries: [CanoeEntry] {
        FieldSearch.filter(race.field, query: query, filter: filter, order: order,
                           checked: checkedFifties)
    }

    var selected: CanoeEntry? {
        selectedBib.flatMap { race.entry(bib: $0) }
    }

    var sequence: JudgeSequence? {
        guard let selected else { return nil }
        return JudgeMarks.sequence(for: selected,
                                   events: race.penaltyEvents(bib: selected.bib),
                                   gateCount: race.gateCount)
    }

    /// Ce que l'incrustation montre pour le bateau sélectionné.
    var scoreBoard: ScoreBoard? {
        guard let selected, let sequence else { return nil }
        return ScoreBoard.make(entry: selected, sequence: sequence)
    }

    /// Les 50 qui restent à regarder, le plus récent d'abord.
    ///
    /// Ils ne sélectionnent rien tout seuls : on est en train de regarder une
    /// descente, et se faire déplacer par une pénalité qui tombe ailleurs est
    /// exactement ce qu'il ne faut pas. Ils s'affichent, on clique si on veut.
    var fiftiesToCheck: [FiftyToCheck] {
        FiftyReview.toCheck(race: race, checked: checkedFifties)
    }

    /// Combien de 50 ont été validés sur cette compétition.
    var checkedCount: Int { checkedFifties.count }

    func hasCheckedFifty(bib: Int) -> Bool {
        checkedFifties.contains { $0.bib == bib }
    }

    func hasPendingFifty(bib: Int) -> Bool {
        guard let entry = race.entry(bib: bib) else { return false }
        return entry.fifties.contains { !checkedFifties.contains(FiftyID(bib: bib, gate: $0.gate)) }
    }

    /// Le journal est-il en train de se constituer ? S'il ne l'est pas, les
    /// heures de pénalité seront estimées, et il vaut mieux le savoir avant la
    /// course que pendant.
    var isJournalling: Bool { status == .connected }

    // MARK: Chronométrage

    func connect() {
        disconnect()
        status = .connecting
        let client = CompetFFCKClient(host: host, port: UInt16(port))
        self.client = client

        tasks.append(Task { [weak self] in
            await client.start()
            for await event in await client.events {
                guard let self else { return }
                switch event {
                case .connecting:
                    self.status = .connecting
                case .connected(let state), .changed(let state):
                    self.status = .connected
                    self.adopt(state)
                case .disconnected(let reason):
                    self.status = .lost(reason)
                }
            }
        })
    }

    /// Prend le nouveau classement, en jetant les coches si ce n'est plus la
    /// même course.
    ///
    /// L'identité ne se lit **qu'une fois le plateau arrivé**. competFFCK
    /// annonce d'abord la compétition seule (« Coupe de France Slalom »), puis
    /// la course (« … — Slalom Finale ») quand le classement suit — et il
    /// repasse par la forme courte à chaque reconnexion. S'y fier ferait
    /// perdre au juge toutes ses coches sur une coupure réseau de dix
    /// secondes, ce qui est exactement le moment où il en a le plus.
    private func adopt(_ state: CanoeState) {
        if !state.field.isEmpty, !state.headline.isEmpty, state.headline != checkedRace {
            checkedRace = state.headline
            checkedFifties = []
            persistChecked()
        }
        race = state
    }

    func disconnect() {
        tasks.forEach { $0.cancel() }
        tasks = []
        let client = self.client
        self.client = nil
        Task { await client?.stop() }
        status = .idle
    }

    // MARK: Vidéos

    func open(folder: URL) {
        videoFolder = folder
        Task { await loadVideos() }
    }

    func loadVideos() async {
        guard let videoFolder else { return }
        scanning = true
        defer { scanning = false }
        let found = await VideoLibrary.scan(directory: videoFolder)
        sources = found
        guard !found.isEmpty else {
            lastMessage = "Aucune vidéo dans \(videoFolder.lastPathComponent)"
            cluster.close()
            return
        }
        lastMessage = activeSources.isEmpty ? "Aucune caméra sélectionnée" : nil
        cluster.open(activeSources)
        show()
        catchUpClips(growing: growth(in: found))
    }

    /// Relit les durées : l'ISO en cours d'enregistrement grandit pendant qu'on
    /// travaille dessus.
    ///
    /// C'est aussi le moment où l'on rattrape les découpages : entre deux
    /// relectures, des bateaux sont arrivés, et l'enregistrement est allé
    /// assez loin pour contenir ceux qu'on avait laissés en plan.
    func refreshVideos() async {
        guard let videoFolder, !sources.isEmpty else { return }
        let found = await VideoLibrary.scan(directory: videoFolder)
        guard !found.isEmpty else { return }
        let growing = growth(in: found)
        sources = found
        cluster.refresh(with: activeSources)
        catchUpClips(growing: growing)
    }

    /// Les enregistrements dont la durée a augmenté depuis la lecture
    /// précédente.
    ///
    /// Un fichier vu pour la première fois compte comme grandissant : on n'en
    /// sait rien, et attendre un tour coûte vingt secondes là où conclure trop
    /// vite coûte un clip qui s'arrête avant l'arrivée.
    private func growth(in found: [VideoSource]) -> Set<URL> {
        var growing: Set<URL> = []
        for source in found {
            guard let known = knownDurations[source.url] else {
                growing.insert(source.url)
                continue
            }
            if source.durationSeconds > known + 0.02 { growing.insert(source.url) }
        }
        knownDurations = Dictionary(uniqueKeysWithValues: found.map { ($0.url, $0.durationSeconds) })
        return growing
    }

    // MARK: Caméras

    /// Prend ou laisse une caméra, à l'affichage comme au découpage.
    func setCamera(_ camera: String, used: Bool) {
        let changed = used ? disabledCameras.remove(camera) != nil
                           : disabledCameras.insert(camera).inserted
        guard changed else { return }
        defaults.set(Array(disabledCameras), forKey: Keys.disabledCameras)
        reopenCluster()
    }

    func useAllCameras() {
        guard !disabledCameras.isEmpty else { return }
        disabledCameras = []
        defaults.set([String](), forKey: Keys.disabledCameras)
        reopenCluster()
    }

    /// Rouvre la grille sur la nouvelle sélection **sans bouger de l'image**.
    ///
    /// Écarter une caméra pendant qu'on examine un geste ne doit pas renvoyer
    /// au début de l'enregistrement : on retire une vignette, on ne recommence
    /// pas le travail.
    private func reopenCluster() {
        let position = cluster.clockMs
        let active = activeSources
        guard !active.isEmpty else {
            cluster.close()
            lastMessage = "Aucune caméra sélectionnée"
            return
        }
        cluster.open(active)
        if position > 0 { cluster.seek(toClock: position) }
        lastMessage = nil
    }

    // MARK: Navigation

    /// Sélectionne un bateau et se place là où il y a quelque chose à voir.
    ///
    /// S'il y a un 50, c'est lui : personne n'ouvre une descente pour revoir un
    /// départ. Sinon le départ, d'où l'on déroule.
    func select(bib: Int) {
        selectedBib = bib
        show()
    }

    private func show() {
        guard let sequence else { return }
        if let fifty = sequence.fifties.first {
            go(to: fifty)
        } else if let start = sequence.start {
            go(to: start)
        }
    }

    func go(to mark: JudgeMark) {
        cluster.pause()
        // On se pose avant le repère : la trame part quand le juge de porte
        // appuie, et un départ se lit mieux avec l'élan qui le précède.
        let lead = mark.kind == .start ? 2.0 : prerollSeconds
        cluster.seek(toClock: mark.clockMs - Int(lead * 1000))
    }

    /// Ouvre un 50 de la liste de vérification.
    ///
    /// Entendu en direct, on va droit sur son heure. Sinon, sur le repère
    /// placé au prorata du numéro de porte : c'est un point de départ pour
    /// scruter, et la pastille dit qu'il est estimé.
    func review(_ fifty: FiftyToCheck) {
        selectedBib = fifty.bib
        cluster.pause()
        if let clockMs = fifty.clockMs {
            cluster.seek(toClock: clockMs - Int(prerollSeconds * 1000))
        } else if let mark = sequence?.marks.first(where: { $0.gate == fifty.gate }) {
            go(to: mark)
        } else {
            show()
        }
    }

    // MARK: Vérification

    /// « Celui-là, je l'ai vu. » Le 50 sort de la liste.
    ///
    /// Rien n'est envoyé à competFFCK : la décision reste au jury, et l'app
    /// n'a pas à pouvoir changer un classement.
    func validate(_ fifty: FiftyToCheck) {
        checkedFifties.insert(fifty.id)
        persistChecked()
    }

    /// Valide d'un coup tous les 50 d'un bateau, depuis le plateau.
    func validateFifties(bib: Int) {
        guard let entry = race.entry(bib: bib) else { return }
        for penalty in entry.fifties {
            checkedFifties.insert(FiftyID(bib: bib, gate: penalty.gate))
        }
        persistChecked()
    }

    /// Remet à vérifier tous les 50 d'un bateau — pour la coche de trop.
    func uncheck(bib: Int) {
        let before = checkedFifties.count
        checkedFifties = checkedFifties.filter { $0.bib != bib }
        guard checkedFifties.count != before else { return }
        persistChecked()
        lastMessage = "Dossard \(bib) remis à vérifier"
    }

    private func persistChecked() {
        defaults.set(checkedFifties.map(\.token), forKey: Keys.checked)
        defaults.set(checkedRace, forKey: Keys.checkedRace)
    }

    /// Recale les horloges sur ce qu'on a sous les yeux : « l'image affichée,
    /// c'est ce départ-là ».
    func alignCurrentFrame(to mark: JudgeMark) {
        guard let lane = cluster.lanes.first(where: { cluster.covers($0, clockMs: cluster.clockMs) }) else { return }
        var alignment = lane.source.alignment(offsetMs: offsetMs)
        let shown = alignment.videoTime(atClock: cluster.clockMs)
        alignment.align(videoTime: shown, toClock: mark.clockMs)
        offsetMs = alignment.offsetMs
        lastMessage = "Horloges recalées de \(alignment.offsetLabel)"
    }

    func resetAlignment() {
        offsetMs = 0
        lastMessage = "Recalage annulé"
    }

    // MARK: Extraction

    /// La marge laissée de part et d'autre de la descente, en secondes.
    ///
    /// Une seule valeur pour le bouton « Extraire » et pour le rattrapage :
    /// deux marges différentes donneraient deux coupes différentes du même
    /// bateau, écrites dans le même fichier, et la dernière effacerait l'autre
    /// sans rien dire.
    static let clipPadSeconds: Double = 5

    /// Où vont les clips. Par défaut un dossier à nous dans « Séquences ».
    var clipDirectory: URL {
        exportFolder ?? FileManager.default
            .urls(for: .moviesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Jugement vidéo")
    }

    /// Découpe le bateau sélectionné, tout de suite et quoi qu'en dise le
    /// registre : on a cliqué, on veut le fichier.
    func exportSelected() {
        guard let entry = selected, let sequence, !activeSources.isEmpty else { return }
        let directory = clipDirectory
        let pad = Self.clipPadSeconds
        guard let window = sequence.window(padSeconds: pad) else { return }
        let jobs = activeSources.compactMap {
            ClipExporter.job(for: entry, sequence: sequence, source: $0,
                             offsetMs: offsetMs, padSeconds: pad, into: directory)
        }
        guard !jobs.isEmpty else {
            lastMessage = "Le dossard \(entry.bib) n'est dans aucun enregistrement"
            return
        }

        forgetLedger(unless: directory)
        exporting = true
        let quality = self.quality
        let offset = offsetMs
        let burned = burnIn

        serialize { [weak self] in
            guard let self else { return }
            var done = 0
            var failure: String?
            let board = burned ? ScoreBoard.make(entry: entry, sequence: sequence) : nil
            for job in jobs {
                do {
                    if let board {
                        _ = try await ClipBurner.export(job, board: board)
                    } else {
                        _ = try await ClipExporter.export(job, quality: quality)
                    }
                    done += 1
                    // Le rattrapage n'a plus à repasser derrière, sauf si la
                    // coupe était écourtée — auquel cas l'empreinte le dit.
                    self.clipsDone[ClipKey(bib: job.bib, camera: job.camera)] =
                        ClipStamp(windowStartMs: window.lowerBound,
                                  windowEndMs: window.upperBound,
                                  offsetMs: offset,
                                  isShortAtEnd: job.isShortAtEnd,
                                  isBurned: burned)
                } catch {
                    failure = error.localizedDescription
                }
            }
            self.exporting = false
            self.lastMessage = failure ?? "\(done) clip(s) dans \(directory.lastPathComponent)"
            if done > 0 { self.exportFolder = directory }
        }
    }

    /// Rattrape les descentes qui n'ont pas eu leurs clips.
    ///
    /// Appelé à chaque relecture du dossier, c'est-à-dire toutes les vingt
    /// secondes pendant la course. Le plan est recalculé à chaque fois : on ne
    /// tient pas une file, on compare ce qui devrait exister à ce qu'on a déjà
    /// découpé. Un bateau qui vient d'arriver, une coupe rognée sur un ISO qui
    /// s'écrivait encore, une arrivée corrigée par le jury, les horloges
    /// recalées — tout ressort par le même chemin.
    private func catchUpClips(growing: Set<URL>) {
        guard autoExport, !catchingUp, !activeSources.isEmpty, !race.field.isEmpty else { return }

        let directory = clipDirectory
        forgetLedger(unless: directory)

        let items = ClipPlan.pending(race: race,
                                     sources: activeSources,
                                     growing: growing,
                                     done: clipsDone,
                                     offsetMs: offsetMs,
                                     padSeconds: Self.clipPadSeconds,
                                     burnIn: burnIn,
                                     into: directory)
            // Ce qui a échoué trois fois de suite sur la même empreinte ne
            // marchera pas à la quatrième : un fichier source illisible
            // relancerait ffmpeg toutes les vingt secondes, en prenant le
            // processeur au ralenti qu'on est en train de regarder.
            .filter { item in
                guard let failure = clipFailures[item.key], failure.stamp == item.stamp else { return true }
                return failure.attempts < 3
            }
        guard !items.isEmpty else { return }

        // Vérifié avant de mettre quoi que ce soit en file : sans ffmpeg,
        // chaque passage échouerait autant de fois qu'il y a de bateaux. La
        // gravure, elle, passe par AVFoundation et n'en a pas besoin.
        guard burnIn || ClipExporter.locateFFmpeg() != nil else {
            autoExport = false
            lastMessage = ClipError.ffmpegNotFound.errorDescription
            return
        }


        catchingUp = true
        catchUpRemaining = items.count
        let quality = self.quality

        serialize { [weak self] in
            guard let self else { return }
            defer { self.catchingUp = false }
            var cut = 0
            var lastFailure: String?

            for item in items {
                defer { self.catchUpRemaining = max(0, self.catchUpRemaining - 1) }
                do {
                    if let board = item.board {
                        _ = try await ClipBurner.export(item.job, board: board)
                    } else {
                        _ = try await ClipExporter.export(item.job, quality: quality)
                    }
                    self.clipsDone[item.key] = item.stamp
                    self.clipFailures[item.key] = nil
                    cut += 1
                } catch {
                    let previous = self.clipFailures[item.key]
                    let attempts = previous?.stamp == item.stamp ? previous!.attempts + 1 : 1
                    self.clipFailures[item.key] = (item.stamp, attempts)
                    lastFailure = error.localizedDescription
                }
            }

            if cut > 0 { self.exportFolder = directory }
            // Le rattrapage parle quand il a fait quelque chose, et se tait le
            // reste du temps : ce bandeau porte aussi l'état de la liaison, et
            // un message toutes les vingt secondes le rendrait illisible.
            if let lastFailure {
                self.lastMessage = "Découpage : \(lastFailure)"
            } else if cut > 0 {
                self.lastMessage = "\(cut) clip(s) rattrapé(s) dans \(directory.lastPathComponent)"
            }
        }
    }

    /// Vide le registre s'il se rapporte à un autre dossier : ailleurs, les
    /// clips qu'il dit faits n'existent pas.
    private func forgetLedger(unless directory: URL) {
        guard ledgerDirectory?.standardizedFileURL != directory.standardizedFileURL else { return }
        clipsDone.removeAll()
        clipFailures.removeAll()
        ledgerDirectory = directory
    }

    /// Met un découpage à la queue des précédents.
    private func serialize(_ work: @escaping @MainActor () async -> Void) {
        let previous = exportChain
        exportChain = Task { @MainActor in
            await previous?.value
            await work()
        }
    }
}
