import SwiftUI

@main
struct CanoeAtemApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(model)
        }
    }
}
