import SwiftUI

@main
struct CanoeJudgeApp: App {
    @State private var model = JudgeModel()

    var body: some Scene {
        Window("Jugement vidéo", id: "judge") {
            ContentView(model: model)
                .frame(minWidth: 900, minHeight: 560)
        }
        .windowToolbarStyle(.unified(showsTitle: false))
        .commands {
            // Le menu Édition d'une app qui n'édite rien ne sert qu'à égarer.
            CommandGroup(replacing: .newItem) {}
            CommandGroup(replacing: .help) {
                Link("Protocole competFFCK",
                     destination: URL(string: "https://github.com")!)
                    .disabled(true)
            }
        }
    }
}
