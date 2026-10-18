"""
Le palmarès des engagés en PDF, pour diffusion (speaker, presse, juges) :
ws_live/canoe/palmares/palmares_slalom.pdf, depuis palmares_slalom.json.

Mêmes règles que la carte à l'antenne (tv_palmares_depart) : les lignes « à
vérifier » sont écartées, les compteurs MetaSlalom ne servent que faute de
titre, et le rang mondial suit la catégorie courue. Rendu par Chrome (mise en
page HTML imprimée), A4 portrait.

  python3 tools/palmares_pdf.py
"""
import html, json, os, subprocess, tempfile

ICI = os.path.dirname(os.path.abspath(__file__))
DOSSIER = os.path.join(ICI, '..', 'ws_live', 'canoe', 'palmares')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

CATS = [('K1H', 'Kayak homme'), ('K1D', 'Kayak dame'), ('C1H', 'Canoë homme'), ('C1D', 'Canoë dame'), ('INV', 'Invités')]
CLASSE = {'K1H': 'MK1', 'K1D': 'WK1', 'C1H': 'MC1', 'C1D': 'WC1'}
CROSS = {'K1H': ['MX1', 'MX1I'], 'K1D': ['WX1', 'WX1I'], 'C1H': ['MX1', 'MX1I'], 'C1D': ['WX1', 'WX1I']}
e = html.escape


def lignes(a, cat):
    """Comme Lignes() de tv_palmares_depart.js, sans limite de nombre."""
    palm = a['palmares']
    titres = [p['ligne'] for p in palm if p.get('type') != 'compteur' and not p.get('a_verifier')]
    compteurs = [] if titres else [p['ligne'] for p in palm if p.get('type') == 'compteur']
    rangs = a.get('rangs', {})
    r = []
    if CLASSE.get(cat) in rangs:
        r.append(rangs[CLASSE[cat]]['ligne'])
    cross = [rangs[c] for c in CROSS.get(cat, []) if c in rangs]
    if cross:
        r.append(min(cross, key=lambda x: x['rang'])['ligne'])
    return titres + compteurs + r


doc = json.load(open(os.path.join(DOSSIER, 'palmares_slalom.json')))
sections = []
for cat, libelle in CATS:
    engages = [(a, next(x for x in a['engagements'] if x['cat'] == cat)) for a in doc['athletes']
               if any(x['cat'] == cat for x in a['engagements'])]
    engages.sort(key=lambda t: t[1]['depart'])
    rows = []
    for a, eng in engages:
        ls = lignes(a, cat)
        nation = f' <span class="nat">{e(a["nation"])}</span>' if a.get('nation') and a['nation'] != 'FRA' else ''
        palm = ''.join(f'<li>{e(l)}</li>' for l in ls) if ls else '<li class="rien">—</li>'
        rows.append(f'''<tr>
  <td class="dos">{eng["dossard"]}</td>
  <td class="h">{e(eng["depart"][:5])}</td>
  <td class="qui"><b>{e(a["nom"])}</b>{nation}<br><span class="club">{e(a["club"])}</span></td>
  <td class="palm"><ul>{palm}</ul></td>
</tr>''')
    sections.append(f'''<section>
<h2>{e(libelle)} <span>({cat}) · {len(engages)} bateaux · ordre de départ des demi-finales</span></h2>
<table><thead><tr><th>Dos.</th><th>Départ</th><th>Athlète</th><th>Palmarès</th></tr></thead>
<tbody>{"".join(rows)}</tbody></table>
</section>''')

page = f'''<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Palmarès des engagés — {e(doc["titre"])}</title>
<style>
@page {{ size: A4; margin: 14mm 12mm 16mm 12mm; }}
* {{ box-sizing: border-box; }}
body {{ font: 9.2pt/1.3 'Calibri', 'Carlito', 'Helvetica Neue', Arial, sans-serif; color: #111; margin: 0; }}
header {{ border-bottom: 3px solid #097AFF; padding-bottom: 6px; margin-bottom: 10px; }}
h1 {{ font-size: 17pt; margin: 0; color: #09006D; }}
header p {{ margin: 2px 0 0; color: #444; }}
section {{ break-before: page; }}
section:first-of-type {{ break-before: auto; }}
h2 {{ font-size: 13pt; color: #09006D; margin: 4px 0 6px; }}
h2 span {{ font-size: 9pt; font-weight: normal; color: #555; }}
table {{ width: 100%; border-collapse: collapse; }}
thead th {{ text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #fff; background: #1D1580; padding: 4px 5px; }}
thead {{ display: table-header-group; }}
tr {{ break-inside: avoid; }}
td {{ vertical-align: top; padding: 4px 5px; border-bottom: 1px solid #d9deea; }}
tbody tr:nth-child(even) td {{ background: #f4f6fb; }}
td.dos {{ width: 9mm; font-weight: bold; text-align: right; color: #097AFF; }}
td.h {{ width: 12mm; color: #444; }}
td.qui {{ width: 62mm; }}
.club {{ color: #555; font-size: 8pt; }}
.nat {{ font-size: 7.5pt; background: #c0182a; color: #fff; padding: 0 3px; border-radius: 2px; }}
ul {{ margin: 0; padding-left: 11px; }}
li {{ margin: 0 0 1px; }}
li.rien {{ list-style: none; margin-left: -11px; color: #999; }}
footer {{ margin-top: 10px; font-size: 7.5pt; color: #666; border-top: 1px solid #ccc; padding-top: 4px; }}
</style></head><body>
<header>
<h1>{e(doc["titre"])} — palmarès des engagés</h1>
<p>Cesson-Sévigné · demi-finales et finales du 18 octobre 2026 · mis à jour le {e(doc["maj"])}</p>
</header>
{"".join(sections)}
<footer>Sources : titres relevés sur Wikipedia, canoeicf.com, paddle-europe.eu, canoeslalom.net et presse, une source vérifiée par ligne
(détail : palmares_verif.html) ; rangs mondiaux et compteurs de podiums et finales en Coupe du monde et aux Mondiaux : MetaSlalom
(classement mondial ICF, version non officielle). « — » : aucun résultat international vérifiable trouvé, ce qui ne préjuge pas d'un palmarès national.</footer>
</body></html>'''

with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False) as f:
    f.write(page)
    src = f.name
dest = os.path.abspath(os.path.join(DOSSIER, 'palmares_slalom.pdf'))
subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
                f'--print-to-pdf={dest}', 'file://' + src], check=True, capture_output=True)
os.unlink(src)
print(os.path.relpath(dest))
