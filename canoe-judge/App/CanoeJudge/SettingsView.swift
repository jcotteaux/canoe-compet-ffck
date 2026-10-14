import SwiftUI
import JudgeKit

struct SettingsView: View {
    @Bindable var model: JudgeModel
    @Binding var isPresented: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Réglages")
                .font(.system(size: 15, weight: .semibold))
                .padding(.bottom, 12)

            Form {
                Section("Chronométrage") {
                    TextField("Adresse competFFCK", text: $model.host)
                    TextField("Port", value: $model.port, format: .number.grouping(.never))
                    HStack {
                        StatusDot(status: model.status)
                        Text(model.status.label).font(.caption).foregroundStyle(Theme.textMuted)
                        Spacer()
                        Button("Reconnecter") { model.connect() }
                    }
                }

                Section("Vidéo") {
                    LabeledContent("Enregistrements") {
                        HStack {
                            Text(model.videoFolder?.path ?? "aucun")
                                .font(.caption).lineLimit(1).truncationMode(.head)
                            Spacer()
                            Button("Choisir…") { pickFolder(model) }
                        }
                    }
                    LabeledContent("Décalage des horloges") {
                        HStack {
                            Slider(value: Binding(
                                get: { Double(model.offsetMs) / 1000 },
                                set: { model.offsetMs = Int($0 * 1000) }
                            ), in: -30...30, step: 0.04)
                            Text(ClockAlignment(recordingStartMs: 0, offsetMs: model.offsetMs).offsetLabel)
                                .font(.system(size: 11, design: .monospaced))
                                .frame(width: 64, alignment: .trailing)
                            Button("0") { model.resetAlignment() }
                        }
                    }
                    Text("Plus simple que ce curseur : se placer sur l'image d'un départ, "
                         + "puis clic droit sur la pastille « Départ » → « Recaler les horloges ».")
                        .font(.caption2)
                        .foregroundStyle(Theme.textMuted)

                    LabeledContent("Avance sur une pénalité") {
                        HStack {
                            Slider(value: $model.prerollSeconds, in: 0...15, step: 0.5)
                            Text("\(model.prerollSeconds, specifier: "%.1f") s")
                                .font(.system(size: 11, design: .monospaced))
                                .frame(width: 50, alignment: .trailing)
                        }
                    }
                    Text("La trame part quand le juge de porte appuie, pas quand le bateau passe : "
                         + "on se pose avant.")
                        .font(.caption2)
                        .foregroundStyle(Theme.textMuted)
                }

                Section("Incrustation") {
                    Toggle("Afficher le chrono et les pénalités sur l'image", isOn: $model.showOverlay)
                    Toggle("Les graver dans les clips extraits", isOn: $model.burnIn)
                    Text("Graver impose de réencoder : un clip passe de quelques dixièmes de "
                         + "seconde à plusieurs secondes, et le découpage automatique ne suit "
                         + "plus le rythme d'une course sur un plateau entier. Changer ce "
                         + "réglage refait les clips déjà sortis.")
                        .font(.caption2)
                        .foregroundStyle(Theme.textMuted)
                }

                Section("Extraction") {
                    Toggle("Découper les descentes terminées", isOn: $model.autoExport)
                    Text("Chaque bateau arrivé est découpé sur chaque caméra, sans qu'on le "
                         + "demande. Une descente dont l'enregistrement n'est pas encore allé "
                         + "jusqu'au bout est reprise à la relecture suivante : quand le jury "
                         + "réclame, le clip est déjà là.")
                        .font(.caption2)
                        .foregroundStyle(Theme.textMuted)

                    Picker("Découpage", selection: $model.quality) {
                        ForEach(ClipQuality.allCases) { Text($0.label).tag($0) }
                    }
                    LabeledContent("Dossier des clips") {
                        HStack {
                            Text(model.exportFolder?.path ?? "Séquences/Jugement vidéo")
                                .font(.caption).lineLimit(1).truncationMode(.head)
                            Spacer()
                            Button("Choisir…") { pickExportFolder() }
                        }
                    }
                    if ClipExporter.locateFFmpeg() == nil, !model.burnIn {
                        Label("ffmpeg introuvable — « brew install ffmpeg »", systemImage: "exclamationmark.triangle")
                            .font(.caption)
                            .foregroundStyle(Theme.running)
                    }
                }
            }
            .formStyle(.grouped)

            HStack {
                Spacer()
                Button("Terminé") { isPresented = false }
                    .keyboardShortcut(.defaultAction)
            }
            .padding(.top, 12)
        }
        .padding(16)
        .frame(width: 520)
        .background(Theme.background)
        .preferredColorScheme(.dark)
    }

    private func pickExportFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.prompt = "Choisir"
        if panel.runModal() == .OK { model.exportFolder = panel.url }
    }
}
