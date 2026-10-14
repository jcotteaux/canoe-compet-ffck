import Foundation

/// Une valeur de cellule. competFFCK mélange nombres et chaînes dans la même
/// colonne — les pénalités slalom arrivent en chaînes `"2"` / `"50"`, les
/// chronos en nombres — donc on garde les deux et on convertit à la lecture.
public enum AdvValue: Sendable, Equatable {
    case string(String)
    case number(Double)
    case null

    public var stringValue: String {
        switch self {
        case .string(let s): s
        case .number(let n): n == n.rounded() ? String(Int(n)) : String(n)
        case .null: ""
        }
    }

    public var intValue: Int? {
        switch self {
        case .string(let s): Int(s.trimmingCharacters(in: .whitespaces))
        case .number(let n): Int(n)
        case .null: nil
        }
    }

    init(json: Any?) {
        switch json {
        case let s as String: self = .string(s)
        case let n as NSNumber: self = .number(n.doubleValue)
        default: self = .null
        }
    }
}

/// Une table sérialisée par competFFCK : `{ name, columns, rows }`.
///
/// Une colonne est un tuple positionnel dont seul l'indice 0 (le nom) nous
/// intéresse ; les autres portent libellé, format et type SQL, que seule la
/// mise en forme du front officiel utilise.
public struct AdvTable: Sendable {
    public let name: String
    public let columns: [String]
    public let rows: [[AdvValue]]

    public init(name: String, columns: [String], rows: [[AdvValue]]) {
        self.name = name
        self.columns = columns
        self.rows = rows
    }

    init?(json: Any?) {
        guard let dict = json as? [String: Any],
              let rawColumns = dict["columns"] as? [Any],
              let rawRows = dict["rows"] as? [Any] else { return nil }

        name = dict["name"] as? String ?? ""
        columns = rawColumns.map { ($0 as? [Any])?.first as? String ?? "" }
        rows = rawRows.map { row in ((row as? [Any]) ?? []).map(AdvValue.init(json:)) }
    }

    public var rowCount: Int { rows.count }

    public func index(of column: String) -> Int? {
        columns.firstIndex(of: column)
    }

    /// Cherche la première colonne existante parmi plusieurs noms.
    ///
    /// competFFCK n'envoie pas les mêmes noms selon l'activité : en descente
    /// les noms finaux (`Tps1_1`) arrivent tels quels, en slalom des noms
    /// génériques (`@TIME_1_1_1`) que le front officiel renomme au vol. Plutôt
    /// que de rejouer ce renommage, on accepte les deux orthographes.
    public func index(ofAny names: [String]) -> Int? {
        for name in names {
            if let i = index(of: name) { return i }
        }
        return nil
    }

    public func value(_ column: String, row: Int) -> AdvValue {
        guard let c = index(of: column), rows.indices.contains(row), rows[row].indices.contains(c) else { return .null }
        return rows[row][c]
    }

    public func value(anyOf names: [String], row: Int) -> AdvValue {
        guard let c = index(ofAny: names), rows.indices.contains(row), rows[row].indices.contains(c) else { return .null }
        return rows[row][c]
    }

    public func string(_ column: String, row: Int) -> String { value(column, row: row).stringValue }
    public func int(_ column: String, row: Int) -> Int? { value(column, row: row).intValue }

    public func rowIndex(where column: String, equals value: Int) -> Int? {
        guard let c = index(of: column) else { return nil }
        return rows.firstIndex { $0.indices.contains(c) && $0[c].intValue == value }
    }
}

/// Une trame reçue. Les tables sont rangées sous une clé suffixée
/// `<sqlTable>`, soit au premier niveau, soit sous `tables`.
/// Pas `Sendable` : elle enveloppe le résultat de `JSONSerialization`, qui est
/// un graphe de `Any`. Elle est décodée en types propres sans quitter l'acteur
/// qui l'a reçue.
public struct AdvFrame {
    public let key: String
    private let raw: [String: Any]

    init?(data: Data) {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        key = object["key"] as? String ?? ""
        raw = object
    }

    public func string(_ field: String) -> String? { raw[field] as? String }
    public func int(_ field: String) -> Int? { (raw[field] as? NSNumber)?.intValue ?? Int(raw[field] as? String ?? "") }

    /// Table au premier niveau (`adv.GetTableUnique`).
    public func table(_ name: String) -> AdvTable? {
        AdvTable(json: raw["\(name)<sqlTable>"])
    }

    /// Table imbriquée sous `tables` (`adv.GetTable`).
    public func nestedTable(_ name: String) -> AdvTable? {
        guard let tables = raw["tables"] as? [String: Any] else { return nil }
        return AdvTable(json: tables["\(name)<sqlTable>"])
    }
}
