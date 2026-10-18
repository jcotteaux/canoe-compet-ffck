/*
 * Scénarios de régie : une demi-journée de compétition chacun, joués par
 * tv_regie.html?scenario=<id>.
 *
 * Source : tableaux de bord des horaires competFFCK du 13-10-2026
 * (france-elite/planning/horaires slalom V2.pdf et horaires KCROSS avec 15
 * invités.pdf).
 *
 * Par catégorie :
 *   epreuve   code competFFCK (Code_categorie du classement)
 *   libelle   nom affiché sur les titres
 *   depart    heure du premier départ, fin : heure du dernier départ
 *   nb        nombre de bateaux
 * palmares : { avant : 60, coupe : 5 } — pendant la course, la carte du
 *   prochain partant et son palmarès (tv_palmares_depart), de `avant` à
 *   `coupe` s avant son départ.
 *
 *   vue       'duo', 'duo_kx' (tv_duo_kx, contre-la-montre kayak-cross),
 *             'plein_kx' (tv_duo_kx?plein=1 : une caméra plein cadre, macro
 *             « Plein ecran » de l'ATEM),
 *             'inrace' ou 'kcross' ; absent = déduit de l'intervalle entre deux
 *             départs, (fin - depart) / (nb - 1) : moins de 2 min, plusieurs
 *             bateaux sont sur l'eau en même temps, d'où tv_duo ; 2 min et
 *             plus, un seul à la fois, d'où tv_inrace.
 *
 * date : jour du scénario (AAAA-MM-JJ) ; null = aujourd'hui (scénario de test).
 *
 * vue 'kcross' : les séries de kayak-cross, gérées par competCrossFFCK
 * (gestion_kcross_series) et non par competFFCK. L'écran de course est alors
 * l'incrustation video/video_incrustation.html de cette application, pilotée
 * par video/video_pilote.html. `kcross.competition` : son code de compétition ;
 * l'adresse du serveur se passe à la régie par ?kx=http://hote/chemin.
 */

const REGIE_SPEAKER = { nom : 'Frédéric Castryck', role : 'Speaker' };

const REGIE_SCENARIOS = {

	'vendredi-matin' : {
		titre : 'Championnats de France Elite Slalom',
		phase : 'Qualifications — Manche 1',
		date : '2026-10-16',
		categories : [
			{ epreuve : 'INV', libelle : 'Invités',      depart : '09:00:00', fin : '09:14:00', nb : 15 },
			{ epreuve : 'K1H', libelle : 'Kayak Homme',  depart : '09:18:00', fin : '10:13:00', nb : 56 },
			{ epreuve : 'K1D', libelle : 'Kayak Dame',   depart : '10:17:00', fin : '11:03:00', nb : 47 },
			{ epreuve : 'C1H', libelle : 'Canoë Homme',  depart : '11:07:00', fin : '11:44:00', nb : 38 },
			{ epreuve : 'C1D', libelle : 'Canoë Dame',   depart : '11:48:00', fin : '12:18:00', nb : 31 },
		],
	},

	'vendredi-apres-midi' : {
		titre : 'Championnats de France Elite Slalom',
		phase : 'Qualifications — Manche 2',
		date : '2026-10-16',
		categories : [
			{ epreuve : 'K1H', libelle : 'Kayak Homme',  depart : '14:00:00', fin : '14:25:00', nb : 26 },
			{ epreuve : 'K1D', libelle : 'Kayak Dame',   depart : '14:29:00', fin : '14:45:00', nb : 17 },
			{ epreuve : 'C1H', libelle : 'Canoë Homme',  depart : '14:49:00', fin : '15:06:00', nb : 18 },
			{ epreuve : 'C1D', libelle : 'Canoë Dame',   depart : '15:10:00', fin : '15:20:00', nb : 11 },
		],
	},

	'samedi-matin' : {
		titre : 'Championnats de France Elite Kayak-Cross',
		phase : 'Kayak-Cross — contre-la-montre',
		date : '2026-10-17',
		categories : [
			{ epreuve : 'XK1INV', libelle : 'Invités',     depart : '10:15:00', fin : '10:29:00', nb : 15, vue : 'plein_kx' },
			{ epreuve : 'XK1H',   libelle : 'Kayak Homme', depart : '10:33:00', fin : '11:06:00', nb : 34, vue : 'plein_kx' },
			{ epreuve : 'XK1D',   libelle : 'Kayak Dame',  depart : '11:10:00', fin : '11:38:00', nb : 29, vue : 'plein_kx' },
		],
	},

	// Les séries (phases finales) de kayak-cross. Horaires à confirmer : la
	// première série et la fin sont des estimations.
	'samedi-apres-midi' : {
		titre : 'Championnats de France Elite Kayak-Cross',
		phase : 'Kayak-Cross — phases finales',
		date : '2026-10-17',
		// competCrossFFCK sur 192.168.1.65. Les invités courent mais ne sont pas
		// suivis : la régie et l'incrustation ignorent leurs séries. Avant le
		// premier départ : le présentateur, puis l'arbre à H - 2 min, puis la
		// caméra et la rampe des premiers Kayak Homme à H - 1 min.
		kcross : { competition : '62', ignorer : ['XK1INV'], tableauAvant : 120, rampeAvant : 60 },
		categories : [
			{ epreuve : 'KX', libelle : 'Kayak-Cross', depart : '15:00:00', fin : '18:00:00', nb : 0, vue : 'kcross' },
		],
	},

	'dimanche-matin' : {
		titre : 'Championnats de France Elite Slalom',
		phase : 'Demi-finales',
		date : '2026-10-18',
		// Heures de la liste de départ competFFCK (éditée le 16/10, départs toutes les 80 s).
		categories : [
			{ epreuve : 'INV', libelle : 'Invités',      depart : '09:00:00', fin : '09:18:40', nb : 15 },
			{ epreuve : 'K1H', libelle : 'Kayak Homme',  depart : '09:22:40', fin : '10:14:40', nb : 40 },
			{ epreuve : 'K1D', libelle : 'Kayak Dame',   depart : '10:18:40', fin : '11:10:40', nb : 40 },
			{ epreuve : 'C1H', libelle : 'Canoë Homme',  depart : '11:14:40', fin : '11:53:20', nb : 30 },
			{ epreuve : 'C1D', libelle : 'Canoë Dame',   depart : '11:57:20', fin : '12:29:20', nb : 25 },
		],
	},

	'dimanche-apres-midi' : {
		titre : 'Championnats de France Elite Slalom',
		phase : 'Finales',
		date : '2026-10-18',
		// Le palmarès du prochain partant, au départ : 60 s avant, coupé 5 s
		// avant. Premier départ : titre à H - 100 s, liste de départ jusqu'à
		// H - 60 s, puis la course et la carte du premier partant.
		palmares : { avant : 60, coupe : 5, listeAvant : 100 },
		categories : [
			{ epreuve : 'K1H', libelle : 'Kayak Homme',  depart : '14:00:00', fin : '14:22:00', nb : 12 },
			{ epreuve : 'K1D', libelle : 'Kayak Dame',   depart : '14:28:00', fin : '14:50:00', nb : 12 },
			{ epreuve : 'C1H', libelle : 'Canoë Homme',  depart : '14:56:00', fin : '15:18:00', nb : 12 },
			{ epreuve : 'C1D', libelle : 'Canoë Dame',   depart : '15:24:00', fin : '15:46:00', nb : 12 },
		],
	},

	// Répétition avec le bouchon : npm run regie (fixture france-elite-test).
	// Trois catégories courtes, la dernière à 2 min d'intervalle (tv_inrace).
	'test' : {
		titre : 'Championnats de France Elite Slalom',
		phase : 'Répétition',
		date : null,
		categories : [
			{ epreuve : 'INV', libelle : 'Invités',     depart : '09:00:00', fin : '09:02:00', nb : 3 },
			{ epreuve : 'K1H', libelle : 'Kayak Homme', depart : '09:07:00', fin : '09:10:00', nb : 4 },
			{ epreuve : 'K1D', libelle : 'Kayak Dame',  depart : '09:15:00', fin : '09:19:00', nb : 3 },
		],
	},
};
