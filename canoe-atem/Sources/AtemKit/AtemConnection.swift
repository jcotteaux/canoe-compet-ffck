import Foundation
import Network

public enum AtemEvent: Sendable {
    case connecting
    case connected(AtemState)
    case changed(AtemState)
    case disconnected(reason: String?)
}

/// Client du protocole UDP ATEM.
///
/// Le mélangeur n'expose ni HTTP ni découverte : il faut ouvrir une session
/// UDP, l'entretenir par acquittements, et il pousse son état de lui-même.
/// Cet acteur tient cette session et republie l'état sous forme d'événements.
///
/// La connexion se rétablit toute seule. Sur un site de course le Wi-Fi tombe,
/// et une régie qui perd ses macros au premier paquet perdu ne sert à rien.
public actor AtemConnection {
    public let host: String
    public let port: UInt16

    private var connection: NWConnection?
    private var sessionId: UInt16 = 0
    private var localPacketId: UInt16 = 0
    private var isEstablished = false
    private var state = AtemState()
    private var lastReceived = Date.distantPast
    private var hasAnnouncedConnected = false
    private var supervisor: Task<Void, Never>?

    public let events: AsyncStream<AtemEvent>
    private let publish: AsyncStream<AtemEvent>.Continuation
    private let queue = DispatchQueue(label: "fr.canoe.atem.connection")

    /// Sans nouvelle du mélangeur au-delà de ce délai, la session est morte :
    /// un ATEM émet spontanément plusieurs fois par seconde.
    private static let silenceTimeout: TimeInterval = 4
    private static let helloRetryInterval: TimeInterval = 1

    public init(host: String, port: UInt16 = 9910) {
        self.host = host
        self.port = port
        (events, publish) = AsyncStream<AtemEvent>.makeStream(bufferingPolicy: .bufferingNewest(64))
    }

    public var currentState: AtemState { state }

    // MARK: - Cycle de vie

    public func start() {
        guard supervisor == nil else { return }
        supervisor = Task { [weak self] in
            while !Task.isCancelled {
                await self?.openSession()
                // Boucle de surveillance : tant que la session vit, on ne fait
                // que vérifier qu'elle donne signe de vie.
                while !Task.isCancelled, await self?.isAlive() == true {
                    try? await Task.sleep(for: .seconds(1))
                }
                guard !Task.isCancelled else { break }
                await self?.tearDown(reason: "silence du mélangeur")
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    public func stop() {
        supervisor?.cancel()
        supervisor = nil
        connection?.cancel()
        connection = nil
        isEstablished = false
        publish.yield(.disconnected(reason: nil))
    }

    private func isAlive() -> Bool {
        Date().timeIntervalSince(lastReceived) < Self.silenceTimeout
    }

    private func tearDown(reason: String?) {
        connection?.cancel()
        connection = nil
        isEstablished = false
        hasAnnouncedConnected = false
        sessionId = 0
        localPacketId = 0
        state = AtemState()
        publish.yield(.disconnected(reason: reason))
    }

    private func openSession() async {
        publish.yield(.connecting)
        lastReceived = Date()

        let endpoint = NWEndpoint.Host(host)
        let connection = NWConnection(host: endpoint, port: NWEndpoint.Port(rawValue: port)!, using: .udp)
        self.connection = connection
        connection.start(queue: queue)
        receiveNext()

        // La poignée de main est réémise tant que le mélangeur n'a pas
        // répondu : le premier datagramme se perd volontiers sur un réseau
        // chargé, et UDP ne le retransmettra pas.
        while !isEstablished, !Task.isCancelled, isAlive() {
            connection.send(content: AtemPacket.hello(), completion: .idempotent)
            try? await Task.sleep(for: .seconds(Self.helloRetryInterval))
        }
    }

    // MARK: - Réception

    private func receiveNext() {
        connection?.receiveMessage { [weak self] data, _, _, error in
            guard let self else { return }
            Task { await self.handle(data: data, error: error) }
        }
    }

    private func handle(data: Data?, error: NWError?) {
        if error != nil {
            tearDown(reason: error?.localizedDescription)
            return
        }
        defer { receiveNext() }
        guard let data, let packet = AtemPacket(decoding: data) else { return }

        lastReceived = Date()
        // Le mélangeur attribue l'identifiant de session ; on adopte celui de
        // chaque paquet reçu plutôt que de le figer à la poignée de main, car
        // il change entre la réponse d'ouverture et les paquets suivants.
        sessionId = packet.sessionId

        if packet.flags.contains(.hello) {
            // Acquitter la réponse d'ouverture déclenche le vidage d'état.
            send(packet: AtemPacket(flags: .ack, sessionId: sessionId, ackId: packet.packetId))
            isEstablished = true
            return
        }

        var changed = false
        for command in AtemRawCommand.parse(packet.payload) where state.apply(command) {
            changed = true
        }

        if packet.flags.contains(.ackRequest) {
            send(packet: AtemPacket(flags: .ack, sessionId: sessionId, ackId: packet.packetId))
        }

        // Rien n'est publié avant `InCm` : l'état est alors incomplet, et une
        // interface qui s'affiche à moitié remplie puis se complète clignote.
        guard changed, state.isInitialised else { return }
        if hasAnnouncedConnected {
            publish.yield(.changed(state))
        } else {
            hasAnnouncedConnected = true
            publish.yield(.connected(state))
        }
    }

    // MARK: - Émission

    private func send(packet: AtemPacket) {
        connection?.send(content: packet.encoded(), completion: .idempotent)
    }

    /// Envoie une commande au mélangeur, en demandant son acquittement.
    private func send(command: Data) {
        guard isEstablished else { return }
        localPacketId = (localPacketId &+ 1) % AtemPacket.packetIdModulo
        send(packet: AtemPacket(flags: .ackRequest, sessionId: sessionId,
                                packetId: localPacketId, payload: command))
    }

    public func run(macro index: UInt16) {
        send(command: AtemOutgoing.macroAction(.run, index: index))
    }

    public func stopMacro() {
        send(command: AtemOutgoing.macroAction(.stop, index: 0))
    }

    public func setProgram(source: UInt16) {
        send(command: AtemOutgoing.setProgram(source: source))
    }

    public func setPreview(source: UInt16) {
        send(command: AtemOutgoing.setPreview(source: source))
    }

    /// Joue une opération de cadrage sur le mélangeur. Hors enregistrement,
    /// c'est ce qui permet de voir le résultat avant de le graver.
    public func apply(_ step: MacroStep) {
        send(command: step.encoded())
    }

    /// Ouvre l'enregistrement d'une macro : tout ce que le mélangeur reçoit
    /// ensuite y est gravé, y compris ce qu'enverrait un autre client. Rien
    /// d'autre ne doit toucher au mélangeur pendant ce temps.
    public func startRecording(macro index: UInt16, name: String, details: String) {
        send(command: AtemOutgoing.macroRecord(index: index, name: name, description: details))
    }

    public func stopRecording() {
        send(command: AtemOutgoing.macroAction(.stopRecord, index: 0))
    }

    public func delete(macro index: UInt16) {
        send(command: AtemOutgoing.macroAction(.delete, index: index))
    }

    public func rename(macro index: UInt16, name: String, details: String) {
        send(command: AtemOutgoing.macroRename(index: index, name: name, description: details))
    }
}
