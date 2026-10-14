// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CanoeAtem",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "AtemKit", targets: ["AtemKit"]),
        .library(name: "CanoeLiveKit", targets: ["CanoeLiveKit"]),
        .executable(name: "atemctl", targets: ["atemctl"]),
    ],
    targets: [
        .target(name: "AtemKit"),
        .target(name: "CanoeLiveKit"),
        .executableTarget(name: "atemctl", dependencies: ["AtemKit", "CanoeLiveKit"]),
        .testTarget(name: "AtemKitTests", dependencies: ["AtemKit", "CanoeLiveKit"]),
    ]
)
