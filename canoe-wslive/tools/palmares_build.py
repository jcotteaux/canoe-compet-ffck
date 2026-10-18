"""
Fabrique ws_live/canoe/palmares/palmares_slalom.json, le palmarès des engagés
du slalom (liste de départ des demi-finales), pour tv_palmares_depart.html.

Entrées (dossier passé en argument) :
  athletes.json   engagés + fiche MetaSlalom (rang mondial, médailles…)
  titres.json     titres vérifiés à la main ou par recherche :
                  { "NOM Prénom": [{"ligne": "...", "source": "https://..."}] }

Chaque ligne garde sa source : la page de vérification (palmares_verif.html)
l'affiche, rien ne passe à l'antenne sans qu'on puisse dire d'où il vient.

  python3 tools/palmares_build.py <dossier>
"""
import json, os, sys

CLASSE = {'K1H': 'MK1', 'K1D': 'WK1', 'C1H': 'MC1', 'C1D': 'WC1', 'INV': None}
LIBELLE = {'MK1': 'K1', 'WK1': 'K1', 'MC1': 'C1', 'WC1': 'C1',
           'MX1': 'kayak-cross', 'WX1': 'kayak-cross', 'MX1I': 'kayak-cross individuel', 'WX1I': 'kayak-cross individuel'}

src = sys.argv[1]
ath = json.load(open(os.path.join(src, 'athletes.json')))
titres_path = os.path.join(src, 'titres.json')
titres = json.load(open(titres_path)) if os.path.exists(titres_path) else {}

out = []
for a in ath.values():
    f = a.get('meta') or {}
    pid = a.get('metaslalom_id')
    fiche = f'https://www.metaslalom.com/paddlers/{pid}' if pid else None
    rangs = f.get('rangs') or {}

    # Titres d'abord (les plus prestigieux, triés par la recherche).
    palm = [dict(t, type='titre') for t in titres.get(a['nom'], [])]

    # MetaSlalom : compteurs publics de la fiche, à la date du jour.
    med, fin = f.get('medailles_wc') or 0, f.get('finales_wc') or 0
    if med:
        palm.append({'ligne': f"{med} podium{'s' if med > 1 else ''} en Coupe du monde et aux Mondiaux",
                     'source': fiche, 'type': 'compteur'})
    elif fin:
        palm.append({'ligne': f"{fin} finale{'s' if fin > 1 else ''} en Coupe du monde et aux Mondiaux",
                     'source': fiche, 'type': 'compteur'})

    # Rang mondial ICF par classe (version non officielle de MetaSlalom) : la
    # vue n'affiche que celui de la catégorie courue, et le kayak-cross.
    rangs_out = {}
    for c, r in rangs.items():
        if c in LIBELLE and r <= 150:
            rangs_out[c] = {'rang': r, 'ligne': f"{r}{'er' if r == 1 else 'e'} mondial {LIBELLE[c]}", 'source': fiche}

    out.append({
        'nom': a['nom'],
        'club': a['club'],
        'nation': f.get('nation') or 'FRA',
        'engagements': a['engagements'],
        'classes': {e['cat']: CLASSE.get(e['cat']) for e in a['engagements']},
        'palmares': palm,
        'rangs': rangs_out,
        'metaslalom': fiche,
    })

out.sort(key=lambda x: x['nom'])
doc = {
    'titre': 'Championnats de France Elite Slalom',
    'maj': '2026-10-18',
    'sources': ['https://www.metaslalom.com (rang mondial ICF non officiel, compteurs Coupe du monde et Mondiaux)',
                'titres : sources par ligne'],
    'athletes': out,
}
dest = os.path.join(os.path.dirname(__file__), '..', 'ws_live', 'canoe', 'palmares', 'palmares_slalom.json')
os.makedirs(os.path.dirname(dest), exist_ok=True)
json.dump(doc, open(dest, 'w'), ensure_ascii=False, indent=1)
print(len(out), 'athlètes,', sum(1 for x in out if x['palmares'] or x['rangs']), 'avec au moins une ligne ->', os.path.relpath(dest))
