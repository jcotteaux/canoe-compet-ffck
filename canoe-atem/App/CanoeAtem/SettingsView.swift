import SwiftUI
import AtemKit

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        @Bindable var model = model

        NavigationStack {
            Form {
                Section {
                    LabeledContent("Adresse") {
                        TextField(AppModel.defaultAtemHost, text: $model.atemHost)
                            .multilineTextAlignment(.trailing)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.numbersAndPunctuation)
                    }
                } header: {
                    Text("Mélangeur ATEM")
                } footer: {
                    Text("L'adresse IP affichée par ATEM Software Control, onglet réglages. Le port 9910 est celui du protocole, il n'est pas réglable.")
                }

                Section {
                    LabeledContent("Adresse") {
                        TextField(AppModel.defaultCanoeHost, text: $model.canoeHost)
                            .multilineTextAlignment(.trailing)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.numbersAndPunctuation)
                    }
                    LabeledContent("Port") {
                        TextField("\(AppModel.defaultCanoePort)", value: $model.canoePort, format: .number.grouping(.never))
                            .multilineTextAlignment(.trailing)
                            .keyboardType(.numberPad)
                    }
                } header: {
                    Text("competFFCK")
                } footer: {
                    Text("Le poste qui fait tourner competFFCK. Le port est celui du WebSocket de competFFCK (8080), le même que pour les pages ws_live ; le bouchon canoe-wslive écoute sur le même.")
                }

                Section {
                    Picker("Secteurs utilisés", selection: sectorCount) {
                        ForEach(1...SectorPlan.maxSectors, id: \.self) { count in
                            Text("\(count)").tag(count)
                        }
                    }
                    .pickerStyle(.segmented)
                } header: {
                    Text("Nombre de secteurs")
                } footer: {
                    Text("Le bouton « secteur suivant » ne parcourt que les secteurs utilisés, puis revient au premier.")
                }

                Section {
                    // Les six sont réglables, y compris au-delà du nombre
                    // utilisé : on prépare un parcours à six secteurs et on
                    // redescend à trois pour une course, sans rien ressaisir.
                    ForEach(0..<SectorPlan.maxSectors, id: \.self) { sector in
                        Picker(selection: macroBinding(for: sector)) {
                            Text("Aucune").tag(UInt16?.none)
                            ForEach(model.atem.usedMacros) { macro in
                                Text(macro.displayName).tag(UInt16?.some(macro.index))
                            }
                        } label: {
                            HStack(spacing: 8) {
                                Text("Secteur \(sector + 1)")
                                if sector >= model.sectors.count {
                                    Text("inutilisé")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                } header: {
                    Text("Macro de chaque secteur")
                } footer: {
                    Text(model.atem.usedMacros.isEmpty
                         ? "La liste des macros vient du mélangeur : connectez-le pour pouvoir les affecter."
                         : "Un secteur est une portion du parcours couverte par un cadrage. Les secteurs marqués « inutilisé » gardent leur macro et reviennent dès qu'on remonte le nombre.")
                }

                Section {
                    LabeledContent("Mélangeur", value: model.atemStatus.label)
                    LabeledContent("Chronométrage", value: model.canoeStatus.label)
                    Button("Reconnecter") { model.connect() }
                } header: {
                    Text("Liaisons")
                }
            }
            .navigationTitle("Réglages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Terminé") {
                        model.connect()
                        dismiss()
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    /// `sectors` n'est modifiable que par le modèle, qui enregistre au passage :
    /// les liaisons passent donc par lui plutôt que par `@Bindable`.
    private var sectorCount: Binding<Int> {
        Binding(get: { model.sectors.count }, set: { model.setSectorCount($0) })
    }

    private func macroBinding(for sector: Int) -> Binding<UInt16?> {
        Binding(
            get: { model.sectors.macro(for: sector) },
            set: { model.assign(macroIndex: $0, to: sector) }
        )
    }
}
