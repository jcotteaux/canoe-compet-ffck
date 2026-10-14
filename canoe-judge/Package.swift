// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CanoeJudge",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "JudgeKit", targets: ["JudgeKit"]),
        .executable(name: "judgectl", targets: ["judgectl"]),
    ],
    dependencies: [
        // Le client competFFCK est celui de l'app de régie : un seul code parle
        // le protocole, et ce qu'on y corrige profite aux deux.
        .package(path: "../canoe-atem"),
    ],
    targets: [
        .target(name: "JudgeKit", dependencies: [
            .product(name: "CanoeLiveKit", package: "canoe-atem"),
        ]),
        .executableTarget(name: "judgectl", dependencies: ["JudgeKit"]),
        .testTarget(name: "JudgeKitTests", dependencies: ["JudgeKit"]),
    ]
)
