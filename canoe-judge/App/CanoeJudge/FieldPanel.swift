import SwiftUI
import CanoeLiveKit
import JudgeKit

/// La colonne de gauche : chercher un bateau, et voir tomber les 50.
struct FieldPanel: View {
    @Bindable var model: JudgeModel
    @FocusState.Binding var searchFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            search
            filters
            Divider().overlay(Theme.separator)
            review
            list
        }
        .panelBackground()
    }

    private var search: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass").foregroundStyle(Theme.textMuted)
            TextField("Dossard ou nom", text: $model.query)
                .textFieldStyle(.plain)
                .focused($searchFocused)
                // Entrée renvoie au lecteur : on tape un dossard, on valide, et
                // les touches de transport reprennent la main sans passer par
                // la souris.
                .onSubmit {
                    if let first = model.entries.first { model.select(bib: first.bib) }
                    searchFocused = false
                }
            if !model.query.isEmpty {
                Button { model.query = "" } label: { Image(systemName: "xmark.circle.fill") }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.textMuted)
            }
        }
        .padding(8)
    }

    private var filters: some View {
        HStack(spacing: 4) {
            // Quatre pastilles ne tiennent pas dans une colonne réduite au
            // minimum : elles défilent plutôt que de se faire rogner.
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(FieldFilter.allCases) { option in
                        Button {
                            model.filter = option
                        } label: {
                            Text(option.label)
                                .font(.system(size: 11, weight: .medium))
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .background(model.filter == option ? Theme.accent : Theme.surfaceRaised,
                                            in: Capsule())
                                .foregroundStyle(model.filter == option ? .white : Theme.textMuted)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 1)
            }
            Menu {
                Picker("Ordre", selection: $model.order) {
                    ForEach(FieldOrder.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.inline)
            } label: {
                Image(systemName: "arrow.up.arrow.down")
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
            .help("Ordre de la liste")
        }
        .padding(.horizontal, 8)
        .padding(.bottom, 8)
    }

    /// Les 50 qui restent à regarder. C'est le fil qu'on surveille du coin de
    /// l'œil pendant la course : chaque ligne est une descente qu'on va sans
    /// doute nous demander de revoir, et on la coche quand on l'a vue.
    @ViewBuilder
    private var review: some View {
        let pending = model.fiftiesToCheck
        if !pending.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Text("50 à vérifier")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Theme.fifty)
                    Text("\(pending.count)")
                        .font(.system(size: 10, weight: .bold))
                        .monospacedDigit()
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .background(Theme.fifty, in: Capsule())
                        .foregroundStyle(.white)
                    Spacer(minLength: 0)
                    if model.checkedCount > 0 {
                        Text("\(model.checkedCount) vu(s)")
                            .font(.system(size: 10))
                            .foregroundStyle(Theme.textMuted)
                            .help("Clic droit sur un bateau de la liste pour le remettre à vérifier")
                    }
                }
                .padding(.horizontal, 10).padding(.top, 8).padding(.bottom, 4)

                // Bornée : sur une finale à dix 50, la liste ne doit pas
                // chasser le plateau hors de l'écran.
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(pending) { fifty in
                            FiftyRow(fifty: fifty,
                                     isSelected: fifty.bib == model.selectedBib,
                                     open: { model.review(fifty) },
                                     validate: { model.validate(fifty) })
                        }
                    }
                }
                .frame(maxHeight: 132)

                Divider().overlay(Theme.separator).padding(.top, 6)
            }
            .background(Theme.fifty.opacity(0.08))
        } else if model.checkedCount > 0 {
            // Dire que c'est fini vaut mieux que de faire disparaître le
            // bandeau : sinon on ne sait pas s'il n'y a plus rien à voir ou si
            // la liaison est tombée.
            HStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(Theme.ok)
                Text("Les \(model.checkedCount) 50 sont vérifiés")
                    .font(.system(size: 10))
                    .foregroundStyle(Theme.textMuted)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(Theme.ok.opacity(0.08))
            Divider().overlay(Theme.separator)
        }
    }

    private var list: some View {
        ScrollViewReader { scroll in
            List(model.entries, selection: Binding(
                get: { model.selectedBib },
                set: { if let bib = $0 { model.select(bib: bib) } }
            )) { entry in
                EntryRow(entry: entry, isSlalom: model.race.isSlalom)
                    .tag(entry.bib)
                    .listRowBackground(entry.bib == model.selectedBib
                                       ? Theme.accent.opacity(0.28) : Color.clear)
                    // La coche de trop se rattrape ici : sans cela, un clic
                    // malheureux ferait disparaître un 50 pour la journée.
                    .contextMenu {
                        if model.hasPendingFifty(bib: entry.bib) {
                            Button("Marquer les 50 comme vérifiés") {
                                model.validateFifties(bib: entry.bib)
                            }
                        }
                        if model.hasCheckedFifty(bib: entry.bib) {
                            Button("Remettre les 50 à vérifier") {
                                model.uncheck(bib: entry.bib)
                            }
                        }
                    }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .onChange(of: model.selectedBib) { _, bib in
                guard let bib else { return }
                withAnimation { scroll.scrollTo(bib, anchor: .center) }
            }
            .overlay {
                if model.entries.isEmpty { emptyList }
            }
        }
    }

    private var emptyList: some View {
        VStack(spacing: 8) {
            Text(model.race.field.isEmpty ? "Pas de classement" : "Aucun bateau")
                .foregroundStyle(Theme.textMuted)
            if model.race.field.isEmpty {
                Text(model.status.label)
                    .font(.caption)
                    .foregroundStyle(Theme.textMuted.opacity(0.7))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.surface)
    }
}

/// Une ligne de la liste de vérification : ce qu'il y a à voir, et la coche.
private struct FiftyRow: View {
    let fifty: FiftyToCheck
    let isSelected: Bool
    let open: () -> Void
    let validate: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            HStack(spacing: 6) {
                Text(fifty.clockMs.map(Chrono.formatClock) ?? "--:--:--")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(Theme.textMuted.opacity(fifty.isHeard ? 1 : 0.5))
                Text("p\(fifty.gate)")
                    .font(.system(size: 10, weight: .bold))
                    .padding(.horizontal, 4).padding(.vertical, 1)
                    .background(Theme.fifty, in: RoundedRectangle(cornerRadius: 3))
                    .foregroundStyle(.white)
                Text(fifty.label)
                    .font(.system(size: 11))
                    .lineLimit(1)
                // L'heure n'a pas été entendue : le dire sur la ligne, parce
                // qu'on va chercher autour d'un repère estimé et non à la
                // seconde près.
                if !fifty.isHeard {
                    Image(systemName: "questionmark.circle")
                        .font(.system(size: 9))
                        .foregroundStyle(Theme.textMuted)
                }
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
            .onTapGesture(perform: open)

            Button(action: validate) {
                Image(systemName: "checkmark.circle").font(.system(size: 12))
            }
            .buttonStyle(.plain)
            .foregroundStyle(Theme.ok)
            .help("Vérifié — retirer de la liste")
        }
        .padding(.horizontal, 10).padding(.vertical, 3)
        .background(isSelected ? Theme.accent.opacity(0.22) : Color.clear)
        .help(fifty.isHeard
              ? "\(fifty.label) — porte \(fifty.gate)"
              : "\(fifty.label) — porte \(fifty.gate) : heure inconnue, l'app n'écoutait pas")
    }
}

private struct EntryRow: View {
    let entry: CanoeEntry
    let isSlalom: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("\(entry.bib)")
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .monospacedDigit()
                .frame(width: 34, alignment: .trailing)
                .foregroundStyle(entry.hasFifty ? Theme.fifty : Theme.text)

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.name.isEmpty ? "—" : entry.name)
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(1)
                HStack(spacing: 4) {
                    Text(entry.epreuve)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Theme.textMuted)
                    if !entry.penalties.isEmpty {
                        ForEach(entry.penalties.prefix(4)) { PenaltyBadge(penalty: $0, compact: true) }
                        if entry.penalties.count > 4 {
                            Text("+\(entry.penalties.count - 4)")
                                .font(.system(size: 10))
                                .foregroundStyle(Theme.textMuted)
                        }
                    }
                }
            }

            Spacer(minLength: 4)

            VStack(alignment: .trailing, spacing: 2) {
                Text(entry.hasRun ? Chrono.format(entry.totalMs) : (entry.statusLabel ?? "—"))
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(entry.hasRun ? Theme.text : Theme.textMuted)
                Text(entry.startMs > 0 ? Chrono.formatClock(entry.startMs) : "")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(Theme.textMuted)
            }
        }
        .padding(.vertical, 3)
    }
}
