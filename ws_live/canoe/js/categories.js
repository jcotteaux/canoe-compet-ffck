const nom_long = {

// Programme France elite slalom
  INVK: "Invité Kayak",
  INVC: "Invité Canoe",
  INVB: "Invité Biplace",
  INV:  "Invité",
  
  C1DE: "Canoë Dame",
  K1DE: "Kayak Dame",
  K1HE: "Kayak Homme",
  C1HE:	"Canoë Homme",
    
  C1D:  "Canoë Dame",
  K1D:  "Kayak Dame",
  K1H:  "Kayak Homme",
  C1H:	"Canoë Homme",
  
// Programme kayak slalom inter
  FOR:  "Forunner's",
  FORMK:  "Forunner Men's kayak",
  FORWK:  "Forunner Women's kayak",
  FORMC:  "Forunner Men's Canoe",
  FORWC:  "Forunner Women's Canoe",
  
  MK1:  "Men's Kayak",
  WK1:  "Women's Kayak",
  MC1:  "Men's Canoe",
  WC1:  "Women's Canoe",
  
  FORMXI1:  "Forunner Men's",	
  FORWXI1:	"Forunner Women's",
  MXI1:		"Men's Kayak Cross",
  WXI1:		"Women's Kayak Cross",
 
// Programme chpts de france slalom
  K1HU15:  "Kayak Homme U15",
  C1HU15:  "Canoe Homme U15",
  K1DU15:  "Kayak Dame U15",
  C1DU15:  "Canoe Dame U15",
  K1HU18:  "Kayak Homme U18",
  C1HU18:  "Canoe Homme U18",
  K1DU18:  "Kayak Dame U18",
  C1DU18:  "Canoe Dame U18",
  K1HU23:  "Kayak Homme U23",
  C1HU23:  "Canoe Homme U23",
  K1DU23:  "Kayak Dame U23",
  C1DU23:  "Canoe Dame U23",
  C2HU15:  "Canoe Biplace Homme U15",
  C2DU15:  "Canoe Biplace Dame U15",
  C2MU15:  "Canoe Biplace Mixte U15",
  C2DU18:  "Canoe Biplace Dame U18",
  C2HU18:  "Canoe Biplace Homme U18",
  C2MU18:  "Canoe Biplace Mixte U18",
  C2HU34:  "Canoe Biplace Homme U34",
  C2DU34:  "Canoe Biplace Dame U34",
  C2MU34:  "Canoe Biplace Mixte U34",

// Programme chpts de france kayak cross indiv
  "XK1INV": "Invités",
  "XK1H U15": "Kayak Homme U15",
  "XK1D U15": "Kayak Dame U15",
  "XK1H U18": "Kayak Homme U18",
  "XK1D U15": "Kayak Dame U18",
  "XK1H U23": "Kayak Homme U23",
  "XK1D U15": "Kayak Dame U23",

// Pogramme chpts de France Master
  C1HM35: "Canoe Master 35",
  C1HM45: "Canoe Master 45",
  C1HM55: "Canoe Master 55",
  C1HM65: "Canoe Master 65",
  C1DM:   "Canoe Dame Master",
  C2MM:   "Canoe Bi Mixte Master",
  C2HM:   "Canoe Bi Homme Master",  
  K1HM35: "Kayak Homme Master 35",
  K1HM45: "Kayak Homme Master 45",
  K1HM55: "Kayak Homme Master 55",
  K1HM65: "Kayak Homme Master 65",
  K1DM35: "Kayak Dame Master 35",
  K1DM45: "Kayak Dame Master 45",
  K1DM55: "Kayak Dame Master 55",
  K1DM65: "Kayak Dame Master 65",
    
};

function Categorie_name(code) {
  return nom_long[code] ?? code;
}
