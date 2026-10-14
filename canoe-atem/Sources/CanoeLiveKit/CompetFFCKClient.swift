import Foundation

public enum CanoeEvent: Sendable {
    case connecting
    case connected(CanoeState)
    case changed(CanoeState)
    case disconnected(reason: String?)
}

/// Client WebSocket de competFFCK.
///
/// Le serveur est celui qu'interrogent déjà les pages `ws_live` : un message
/// = un objet JSON portant une clé `<...>`. L'enchaînement d'ouverture est
/// celui de `live.html` — charger la liste des compétitions, ouvrir la course
/// active, puis demander le classement de toutes les épreuves — après quoi le
/// serveur pousse `<on_course>` en continu.
///
/// Le protocole est décrit dans canoe-wslive/docs/PROTOCOL.md.
public actor CompetFFCKClient {
    public let host: String
    public let port: UInt16

    public let events: AsyncStream<CanoeEvent>
    private let publish: AsyncStream<CanoeEvent>.Continuation

    private var task: URLSessionWebSocketTask?
    private var supervisor: Task<Void, Never>?
    private var lastReceived = Date.distantPast
    private var hasAnnouncedConnected = false

    private var state = CanoeState()
    /// Le classement, seule source des identités, heures de départ et pénalités.
    private var ranking: AdvTable?
    /// Suffixe de colonne `{Code_course}_{Code_phase}`, ex. `1_1`.
    private var coursePhase = ""
    /// Chronos en cours, tels que les envoie `<on_course>`.
    private var onCourseTimes: [Int: Int] = [:]
    /// Pénalités accumulées en direct par `<penalty_add>`, par dossard.
    private var livePenalties: [Int: Int] = [:]
    /// Journal horodaté des pénalités. Contrairement à `livePenalties`, il
    /// n'est pas vidé par un rechargement du classement ni par une
    /// reconnexion : c'est la seule trace de l'*heure* d'une pénalité, et
    /// elle ne se reconstitue pas après coup.
    private var penaltyLog: [CanoePenaltyEvent] = []

    /// competFFCK parle sans arrêt : au-delà, la session est perdue. Le seuil
    /// est large car le flux se tarit entre deux épreuves.
    private static let silenceTimeout: TimeInterval = 20

    public init(host: String, port: UInt16 = 20000) {
        self.host = host
        self.port = port
        (events, publish) = AsyncStream<CanoeEvent>.makeStream(bufferingPolicy: .bufferingNewest(64))
    }

    public var currentState: CanoeState { state }

    // MARK: - Cycle de vie

    public func start() {
        guard supervisor == nil else { return }
        supervisor = Task { [weak self] in
            while !Task.isCancelled {
                await self?.openSession()
                while !Task.isCancelled, await self?.isAlive() == true {
                    try? await Task.sleep(for: .seconds(1))
                }
                guard !Task.isCancelled else { break }
                await self?.tearDown(reason: "plus de trame de competFFCK")
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    public func stop() {
        supervisor?.cancel()
        supervisor = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        publish.yield(.disconnected(reason: nil))
    }

    private func isAlive() -> Bool {
        Date().timeIntervalSince(lastReceived) < Self.silenceTimeout
    }

    private func tearDown(reason: String?) {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        hasAnnouncedConnected = false
        state = CanoeState()
        ranking = nil
        onCourseTimes = [:]
        livePenalties = [:]
        // `penaltyLog` survit volontairement : une coupure réseau ne doit pas
        // effacer les repères vidéo d'une course déjà courue.
        publish.yield(.disconnected(reason: reason))
    }

    private func openSession() {
        publish.yield(.connecting)
        lastReceived = Date()

        guard let url = URL(string: "ws://\(host):\(port)/") else { return }
        let task = URLSession.shared.webSocketTask(with: url)
        self.task = task
        task.resume()
        receiveNext()

        send(["key": "<competition_load>"])
    }

    // MARK: - Échanges

    private func send(_ message: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: message),
              let text = String(data: data, encoding: .utf8) else { return }
        task?.send(.string(text)) { _ in }
    }

    private func receiveNext() {
        task?.receive { [weak self] result in
            guard let self else { return }
            Task { await self.handle(result) }
        }
    }

    /// Trace des trames, activée par `CANOE_DEBUG=1`. Sur une compétition on
    /// n'a pas de navigateur pour inspecter le flux : c'est le seul moyen de
    /// savoir ce que competFFCK envoie réellement.
    private func trace(_ message: @autoclosure () -> String) {
        guard ProcessInfo.processInfo.environment["CANOE_DEBUG"] == "1" else { return }
        FileHandle.standardError.write(Data("[canoe] \(message())\n".utf8))
    }

    private func handle(_ result: Result<URLSessionWebSocketTask.Message, Error>) {
        switch result {
        case .failure(let error):
            trace("réception interrompue : \(error)")
            tearDown(reason: error.localizedDescription)
        case .success(let message):
            lastReceived = Date()
            let data: Data? = switch message {
            case .string(let text): text.data(using: .utf8)
            case .data(let data): data
            @unknown default: nil
            }
            if let data, let frame = AdvFrame(data: data) {
                trace("<- \(frame.key) (\(data.count) octets)")
                apply(frame)
            } else {
                trace("<- trame illisible")
            }
            receiveNext()
        }
    }

    /// Traite une trame reçue. Interne plutôt que privée pour que les tests
    /// puissent rejouer une séquence sans WebSocket.
    func apply(_ frame: AdvFrame) {
        switch frame.key {
        case "<competition_load>":
            applyCompetitionLoad(frame)
        case "<race_load>":
            applyRaceLoad(frame)
        case "<epreuve_load>":
            applyEpreuveLoad(frame)
        case "<on_course>":
            applyOnCourse(frame)
        case "<bib_time>":
            // Un passage à l'arrivée fige un temps et un classement : seul le
            // classement les porte, on le redemande.
            if (frame.int("passage") ?? 0) < 1 { send(["key": "<epreuve_load>", "epreuve": ""]) }
        case "<penalty_add>":
            applyPenalty(frame)
        case "<run_erase>":
            // La manche est effacée : ses pénalités n'ont plus de sujet.
            livePenalties.removeAll()
            penaltyLog.removeAll()
            send(["key": "<epreuve_load>", "epreuve": ""])
        default:
            return
        }
        rebuild()
    }

    private func applyCompetitionLoad(_ frame: AdvFrame) {
        guard let table = frame.table("competitions"), table.rowCount > 0 else { return }
        // La course active, sinon la première listée.
        let row = (0..<table.rowCount).first { table.int("active", row: $0) == 1 } ?? 0
        state.competition = table.string("Nom", row: row)
        let key = table.string("key", row: row)
        guard !key.isEmpty else { return }
        send(["key": "<race_load>", "key_race": key])
    }

    private func applyRaceLoad(_ frame: AdvFrame) {
        let course = frame.int("Code_course") ?? 0
        let phase = frame.int("Code_phase") ?? 0
        coursePhase = "\(course)_\(phase)"
        if let clock = frame.int("clock") { state.clockMs = clock }

        if let competition = frame.nestedTable("Competition"), competition.rowCount > 0 {
            state.competition = competition.string("Nom", row: 0)
            state.place = competition.string("Lieu", row: 0)
            state.activity = competition.string("Code_activite", row: 0)
        }
        let courseLabel = frame.nestedTable("Competition_Course")?.string("Libelle", row: 0) ?? ""
        let phaseLabel = frame.nestedTable("Competition_Course_Phase")?.string("Libelle", row: 0) ?? ""
        state.raceLabel = [courseLabel, phaseLabel].filter { !$0.isEmpty }.joined(separator: " ")

        // Épreuve vide = toutes les épreuves : l'app suit la course entière,
        // pas une seule catégorie.
        send(["key": "<epreuve_load>", "epreuve": ""])
    }

    private func applyEpreuveLoad(_ frame: AdvFrame) {
        ranking = frame.table("ranking")
        state.gateCount = frame.int("Nb_porte") ?? 0
        if let clock = frame.int("clock") { state.clockMs = clock }
        // Le classement porte les pénalités consolidées : ce qui a été accumulé
        // en direct depuis la dernière recharge n'a plus lieu d'être.
        livePenalties.removeAll()
    }

    private func applyOnCourse(_ frame: AdvFrame) {
        if let clock = frame.int("clock") { state.clockMs = clock }
        guard let table = frame.table("table") else { onCourseTimes = [:]; return }

        var times: [Int: Int] = [:]
        for row in 0..<table.rowCount {
            guard let bib = table.int("bib", row: row) else { continue }
            times[bib] = table.int("time", row: row) ?? 0
        }
        onCourseTimes = times
    }

    private func applyPenalty(_ frame: AdvFrame) {
        // Ces champs-là sont en anglais, contrairement au reste du protocole.
        guard let bib = frame.int("bib") else { return }
        let penalty = frame.string("penalty") ?? String(frame.int("penalty") ?? 0)
        let seconds = penalty == "50" ? 50 : (penalty == "2" ? 2 : 0)
        guard seconds > 0 else { return }
        livePenalties[bib, default: 0] += seconds
        penaltyLog.append(CanoePenaltyEvent(bib: bib,
                                            gate: frame.int("gate") ?? 0,
                                            seconds: seconds,
                                            clockMs: state.clockMs,
                                            receivedAt: Date()))
    }

    // MARK: - Reconstruction de l'état publié

    /// Les portes pénalisées d'une ligne du classement (`'2'` ou `'50'`).
    private func gatePenalties(row: Int) -> [CanoeGatePenalty] {
        guard let ranking, state.gateCount > 0 else { return [] }
        var penalties: [CanoeGatePenalty] = []
        for gate in 1...state.gateCount {
            // `Pena_{n}` en descente, `@PENA_{n}_1` en slalom avant renommage.
            let cell = ranking.value(anyOf: ["Pena_\(gate)", "@PENA_\(gate)_1"], row: row).stringValue
            switch cell {
            case "50": penalties.append(CanoeGatePenalty(gate: gate, seconds: 50))
            case "2": penalties.append(CanoeGatePenalty(gate: gate, seconds: 2))
            default: break
            }
        }
        return penalties
    }

    /// Somme des pénalités d'une ligne du classement.
    private func rankingPenalty(row: Int) -> Int {
        gatePenalties(row: row).reduce(0) { $0 + $1.seconds }
    }

    private func identity(bib: Int) -> (row: Int, name: String, club: String, epreuve: String)? {
        guard let ranking, let row = ranking.rowIndex(where: "Dossard", equals: bib) else { return nil }
        return (row,
                ranking.string("Bateau", row: row),
                ranking.string("Club", row: row),
                ranking.string("Code_categorie", row: row))
    }

    private func rebuild() {
        // Bateaux en course, du plus proche de l'arrivée au plus récemment
        // parti : c'est le temps brut qui dit l'avancement sur le parcours,
        // pas le temps pénalisé.
        state.onCourse = onCourseTimes
            .map { bib, elapsed -> CanoeBoat in
                let who = identity(bib: bib)
                let penalty = max(who.map { rankingPenalty(row: $0.row) } ?? 0, livePenalties[bib] ?? 0)
                return CanoeBoat(bib: bib,
                                 name: who?.name ?? "Dossard \(bib)",
                                 club: who?.club ?? "",
                                 epreuve: who?.epreuve ?? "",
                                 elapsedMs: elapsed,
                                 penaltySeconds: penalty)
            }
            .sorted { $0.elapsedMs > $1.elapsedMs }

        state.nextStarters = nextStarters()
        state.field = buildField()
        state.penaltyLog = penaltyLog
        publishState()
    }

    /// Le plateau complet, tel que le classement le décrit.
    ///
    /// Une seule lecture de la table sert tout le monde : sur l'eau, à venir,
    /// déjà arrivé, abandonné. C'est ce qui permet de chercher un dossard une
    /// heure après sa descente, ce que `<on_course>` ne permet jamais — il ne
    /// porte que `bib` et `time`.
    private func buildField() -> [CanoeEntry] {
        guard let ranking, !coursePhase.isEmpty else { return [] }
        let startColumns = ["Heure_depart\(coursePhase)", "@START_TIME_\(coursePhase)_1"]
        let chronoColumns = ["Tps_chrono\(coursePhase)", "@CHRONO_\(coursePhase)_1"]
        let totalColumns = ["Tps\(coursePhase)", "@TIME_\(coursePhase)_1"]
        let rankColumns = ["Cltc\(coursePhase)", "@RK_\(coursePhase)_1"]

        // Les pénalités entendues en direct, par dossard puis par porte : elles
        // arrivent avant que le classement ne soit rechargé, et un juge appelé
        // sur un 50 ne peut pas attendre le rechargement.
        var heard: [Int: [Int: Int]] = [:]
        for event in penaltyLog where event.gate > 0 {
            heard[event.bib, default: [:]][event.gate] = event.seconds
        }

        return (0..<ranking.rowCount).compactMap { row -> CanoeEntry? in
            guard let bib = ranking.int("Dossard", row: row) else { return nil }
            var entry = CanoeEntry(bib: bib)
            entry.name = ranking.string("Bateau", row: row)
            entry.club = ranking.string("Club", row: row)
            entry.nation = ranking.string("Code_nation", row: row)
            entry.epreuve = ranking.string("Code_categorie", row: row)
            entry.startMs = ranking.value(anyOf: startColumns, row: row).intValue ?? 0
            entry.chronoMs = ranking.value(anyOf: chronoColumns, row: row).intValue ?? 0
            entry.totalMs = ranking.value(anyOf: totalColumns, row: row).intValue ?? 0
            entry.rank = max(0, ranking.value(anyOf: rankColumns, row: row).intValue ?? 0)

            var byGate: [Int: CanoeGatePenalty] = [:]
            for penalty in gatePenalties(row: row) { byGate[penalty.gate] = penalty }
            // Le classement fait foi là où il s'est prononcé ; le direct ne
            // fait qu'ajouter les portes qu'il ne connaît pas encore.
            for (gate, seconds) in heard[bib] ?? [:] where byGate[gate] == nil {
                byGate[gate] = CanoeGatePenalty(gate: gate, seconds: seconds, isLive: true)
            }
            entry.penalties = byGate.values.sorted { $0.gate < $1.gate }
            return entry
        }
    }

    /// Les prochains départs : les bateaux dont l'heure de départ est à venir
    /// et qui n'ont pas encore de temps. `Tps` vide signifie « pas encore
    /// couru » ; une valeur négative est un DNF/DNS, donc un bateau traité.
    private func nextStarters() -> [CanoeStarter] {
        guard let ranking, !coursePhase.isEmpty else { return [] }
        let startColumns = ["Heure_depart\(coursePhase)", "@START_TIME_\(coursePhase)_1"]
        let timeColumns = ["Tps\(coursePhase)", "@TIME_\(coursePhase)_1"]
        guard ranking.index(ofAny: startColumns) != nil else { return [] }

        var starters: [CanoeStarter] = []
        for row in 0..<ranking.rowCount {
            guard let bib = ranking.int("Dossard", row: row), onCourseTimes[bib] == nil else { continue }
            guard let start = ranking.value(anyOf: startColumns, row: row).intValue, start > 0 else { continue }
            let result = ranking.value(anyOf: timeColumns, row: row).intValue ?? 0
            guard result == 0 else { continue }
            // Un départ déjà dépassé de plus d'une minute sans chrono ne
            // reviendra pas : il encombrerait la liste jusqu'à la fin.
            guard start > state.clockMs - 60_000 else { continue }

            starters.append(CanoeStarter(bib: bib,
                                         name: ranking.string("Bateau", row: row),
                                         club: ranking.string("Club", row: row),
                                         epreuve: ranking.string("Code_categorie", row: row),
                                         startMs: start))
        }
        return Array(starters.sorted { $0.startMs < $1.startMs }.prefix(8))
    }

    /// Publie l'état courant. Appelé après chaque trame traitée.
    private func publishState() {
        if hasAnnouncedConnected {
            publish.yield(.changed(state))
        } else {
            hasAnnouncedConnected = true
            publish.yield(.connected(state))
        }
    }
}
