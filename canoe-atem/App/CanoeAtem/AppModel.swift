import Foundation
import Observation
import AtemKit
import CanoeLiveKit
#if canImport(UIKit)
import UIKit
#endif

enum LinkStatus: Equatable {
    case idle
    case connecting
    case connected
    case lost(String?)

    var isConnected: Bool { self == .connected }

    var label: String {
        switch self {
        case .idle: "hors ligne"
        case .connecting: "connexion…"
        case .connected: "connecté"
        case .lost(let reason): reason ?? "perdu"
        }
    }
}

/// Le modèle de l'app : deux liaisons indépendantes, le mélangeur et
/// competFFCK, chacune se rétablissant seule. L'une peut tomber sans emporter
/// l'autre — on veut garder les macros quand le chrono lâche, et l'inverse.
@Observable
@MainActor
final class AppModel {
    // MARK: Réglages

    var atemHost: String { didSet { defaults.set(atemHost, forKey: Keys.atemHost) } }
    var canoeHost: String { didSet { defaults.set(canoeHost, forKey: Keys.canoeHost) } }
    var canoePort: Int { didSet { defaults.set(canoePort, forKey: Keys.canoePort) } }

    /// Le découpage de la rivière en secteurs et la macro de chacun. Le secteur
    /// courant n'est pas conservé d'un lancement à l'autre : on ouvre l'app
    /// avant une descente, pas au milieu.
    private(set) var sectors = SectorPlan()

    // MARK: État observé

    private(set) var atem = AtemState()
    private(set) var atemStatus: LinkStatus = .idle
    private(set) var canoe = CanoeState()
    private(set) var canoeStatus: LinkStatus = .idle

    /// La dernière macro déclenchée depuis l'app. Le mélangeur confirme
    /// l'exécution par `MRPr`, mais la confirmation met un aller-retour à
    /// revenir : sans retour immédiat, on appuie deux fois.
    private(set) var pendingMacro: UInt16?

    private var atemConnection: AtemConnection?
    private var canoeClient: CompetFFCKClient?
    private var tasks: [Task<Void, Never>] = []
    private let defaults = UserDefaults.standard

    private enum Keys {
        static let atemHost = "atem.host"
        static let canoeHost = "canoe.host"
        static let canoePort = "canoe.port"
        static let sectorCount = "sectors.count"
        static let sectorMacros = "sectors.macros"
    }

    init() {
        atemHost = defaults.string(forKey: Keys.atemHost) ?? ""
        canoeHost = defaults.string(forKey: Keys.canoeHost) ?? ""
        let port = defaults.integer(forKey: Keys.canoePort)
        canoePort = port > 0 ? port : 20_000

        // Les macros sont rangées en entiers, -1 valant « aucune » : le format
        // de liste des réglages ne connaît pas les valeurs absentes.
        let stored = defaults.array(forKey: Keys.sectorMacros) as? [Int] ?? []
        let count = defaults.integer(forKey: Keys.sectorCount)
        sectors = SectorPlan(
            count: count > 0 ? count : 3,
            macros: stored.map { $0 >= 0 ? UInt16($0) : nil }
        )
    }

    private func saveSectors() {
        defaults.set(sectors.count, forKey: Keys.sectorCount)
        defaults.set(sectors.macros.map { $0.map(Int.init) ?? -1 }, forKey: Keys.sectorMacros)
    }

    var isConfigured: Bool { !atemHost.isEmpty || !canoeHost.isEmpty }

    // MARK: Liaisons

    func connect() {
        disconnect()

        if !atemHost.isEmpty {
            let connection = AtemConnection(host: atemHost)
            atemConnection = connection
            atemStatus = .connecting
            tasks.append(Task { [weak self] in
                for await event in await connection.events {
                    guard let self else { return }
                    switch event {
                    case .connecting:
                        atemStatus = .connecting
                    case .connected(let state):
                        atem = state
                        atemStatus = .connected
                    case .changed(let state):
                        // La macro attendue a démarré : le retour optimiste a
                        // fait son office, on rend la main au mélangeur.
                        if let pending = pendingMacro, state.macroRun.isRunning, state.macroRun.index == pending {
                            pendingMacro = nil
                        }
                        atem = state
                    case .disconnected(let reason):
                        atemStatus = .lost(reason)
                        pendingMacro = nil
                    }
                }
            })
            Task { await connection.start() }
        }

        if !canoeHost.isEmpty {
            let client = CompetFFCKClient(host: canoeHost, port: UInt16(canoePort))
            canoeClient = client
            canoeStatus = .connecting
            tasks.append(Task { [weak self] in
                for await event in await client.events {
                    guard let self else { return }
                    switch event {
                    case .connecting:
                        canoeStatus = .connecting
                    case .connected(let state):
                        canoe = state
                        canoeStatus = .connected
                    case .changed(let state):
                        canoe = state
                    case .disconnected(let reason):
                        canoeStatus = .lost(reason)
                    }
                }
            })
            Task { await client.start() }
        }
    }

    func disconnect() {
        let atemConnection = self.atemConnection
        let canoeClient = self.canoeClient
        Task {
            await atemConnection?.stop()
            await canoeClient?.stop()
        }
        tasks.forEach { $0.cancel() }
        tasks = []
        self.atemConnection = nil
        self.canoeClient = nil
        atem = AtemState()
        canoe = CanoeState()
        atemStatus = .idle
        canoeStatus = .idle
        pendingMacro = nil
    }

    // MARK: Actions

    func run(macro: AtemMacro) {
        run(macroIndex: macro.index)
    }

    private func run(macroIndex: UInt16) {
        guard let atemConnection else { return }
        pendingMacro = macroIndex
        haptic()
        Task { await atemConnection.run(macro: macroIndex) }

        // Garde-fou : si le mélangeur ne confirme jamais, le bouton ne doit pas
        // rester allumé indéfiniment.
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(3))
            guard let self, pendingMacro == macroIndex else { return }
            pendingMacro = nil
        }
    }

    // MARK: Secteurs

    /// Passe au secteur suivant et joue sa macro. Le geste principal pendant
    /// une descente : un appui par changement de cadrage.
    func advanceSector() {
        if let macro = sectors.advance() {
            run(macroIndex: macro)
        } else {
            // Rien à envoyer, mais le plan a bougé : le retour tactile confirme
            // l'appui, sinon on croit que le bouton n'a pas pris.
            haptic()
        }
    }

    func selectSector(_ sector: Int) {
        if let macro = sectors.select(sector) {
            run(macroIndex: macro)
        } else {
            haptic()
        }
    }

    func setSectorCount(_ count: Int) {
        sectors.setCount(count)
        saveSectors()
    }

    func assign(macroIndex: UInt16?, to sector: Int) {
        sectors.assign(macro: macroIndex, to: sector)
        saveSectors()
    }

    /// La macro affectée à un secteur, si elle existe encore sur le mélangeur.
    func macro(for sector: Int) -> AtemMacro? {
        guard let index = sectors.macro(for: sector) else { return nil }
        return atem.macros.first { $0.index == index }
    }

    func stopMacro() {
        guard let atemConnection else { return }
        haptic()
        Task { await atemConnection.stopMacro() }
    }

    /// Indique si une macro est en cours, du point de vue de l'interface :
    /// soit le mélangeur l'a confirmée, soit on vient de la demander.
    func isRunning(_ macro: AtemMacro) -> Bool {
        (atem.macroRun.isRunning && atem.macroRun.index == macro.index) || pendingMacro == macro.index
    }

    private func haptic() {
        #if canImport(UIKit)
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        #endif
    }
}
