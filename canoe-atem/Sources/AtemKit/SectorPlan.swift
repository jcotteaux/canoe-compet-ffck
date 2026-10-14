import Foundation

/// L'affectation des secteurs de la rivière aux macros du mélangeur.
///
/// Un secteur, c'est une portion du parcours couverte par un cadrage. Suivre un
/// bateau qui descend, c'est passer de l'un au suivant, toujours dans le même
/// ordre — d'où un plan ordonné et un seul geste pour avancer, plutôt que de
/// viser la bonne macro dans une grille pendant qu'on regarde la rivière.
///
/// Le plan boucle : après le dernier secteur, on revient au premier, prêt pour
/// le bateau suivant. C'est ce qui évite d'avoir à penser à réarmer.
public struct SectorPlan: Sendable, Equatable {
    public static let maxSectors = 6

    /// Nombre de secteurs utilisés, entre 1 et `maxSectors`.
    public private(set) var count: Int
    /// La macro de chaque secteur, `nil` si aucune n'est affectée. Le tableau
    /// garde toujours `maxSectors` entrées : réduire le nombre de secteurs ne
    /// doit pas effacer les affectations qu'on retrouvera en le remontant.
    public private(set) var macros: [UInt16?]
    /// Secteur courant, indexé à partir de 0 et toujours inférieur à `count`.
    public private(set) var current: Int

    public init(count: Int = 3, macros: [UInt16?] = [], current: Int = 0) {
        self.count = min(max(count, 1), Self.maxSectors)
        self.macros = Array((macros + Array(repeating: nil, count: Self.maxSectors)).prefix(Self.maxSectors))
        self.current = min(max(current, 0), self.count - 1)
    }

    public mutating func setCount(_ newCount: Int) {
        count = min(max(newCount, 1), Self.maxSectors)
        if current >= count { current = 0 }
    }

    public mutating func assign(macro: UInt16?, to sector: Int) {
        guard macros.indices.contains(sector) else { return }
        macros[sector] = macro
    }

    public func macro(for sector: Int) -> UInt16? {
        macros.indices.contains(sector) ? macros[sector] : nil
    }

    public var currentMacro: UInt16? { macro(for: current) }

    /// Le secteur qui viendra au prochain appui.
    public var nextSector: Int { (current + 1) % count }
    public var nextMacro: UInt16? { macro(for: nextSector) }

    /// Avance d'un secteur et rend la macro à jouer, `nil` si ce secteur n'en a
    /// pas. On avance quand même : le plan reste calé sur la descente, et un
    /// secteur sans macro est un oubli de réglage, pas une raison de bloquer.
    @discardableResult
    public mutating func advance() -> UInt16? {
        current = nextSector
        return currentMacro
    }

    /// Se place sur un secteur donné et rend sa macro. Sert aussi à revenir au
    /// premier après une fausse manœuvre.
    @discardableResult
    public mutating func select(_ sector: Int) -> UInt16? {
        guard sector >= 0, sector < count else { return nil }
        current = sector
        return currentMacro
    }

    /// Les secteurs actifs, pour l'affichage.
    public var activeSectors: Range<Int> { 0..<count }
}
