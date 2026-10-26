/**
 * Reference dataset extracted from the repository's catalog/stars.json and
 * catalog/constellations.json (catalog version hyg-4.4-mag6.5-20261025).
 * Twenty-three named bright stars plus Polaris. No invented measurements.
 * Positions are J2000: catalog RA is degrees, not hours.
 * HYG v4.4 and Stellarium geometry: CC BY-SA 4.0. Preserve the attribution
 * below if this derived dataset is redistributed. See catalog/README.md.
 */

export interface StarRecord {
  id: number;
  name: string;
  bayerLabel: string | null;
  constellation: string;
  constellationAbbr: string;
  raDegrees: number;
  decDegrees: number;
  magnitude: number;
  distanceLightYears: number | null;
}

export interface ConstellationPoint {
  id: number;
  name: string | null;
  raDegrees: number;
  decDegrees: number;
  magnitude: number;
}

export interface ConstellationGeometry {
  abbr: string;
  name: string;
  stars: ConstellationPoint[];
  /** Connected polylines of HYG IDs; all endpoints are present in stars. */
  lines: number[][];
}

export const DEFAULT_STAR_ID = 90979; // Vega
export const PAGE_SIZE = 8;
export const CATALOG_VERSION = "hyg-4.4-mag6.5-20261025";
export const CATALOG_LICENSE = {
  name: "CC BY-SA 4.0",
  href: "https://creativecommons.org/licenses/by-sa/4.0/",
};
export const CATALOG_ATTRIBUTION = [
  { name: "HYG Database v4.4", author: "astronexus", href: "https://codeberg.org/astronexus/hyg", license: "CC BY-SA 4.0" },
  { name: "Stellarium modern sky culture", author: "Stellarium", href: "https://stellarium.org/", license: "CC BY-SA 4.0" },
  { name: "IAU Catalog of Star Names", author: "IAU WGSN", href: "https://www.iau.org/public/themes/naming_stars/", license: "CC BY" },
] as const;

export const STAR_CATALOG: StarRecord[] = [
  {"id": 32263,"name": "Sirius","bayerLabel": "α CMa","constellation": "Canis Major","constellationAbbr": "CMa","raDegrees": 101.28722,"decDegrees": -16.71612,"magnitude": -1.44,"distanceLightYears": 8.6},
  {"id": 30365,"name": "Canopus","bayerLabel": "α Car","constellation": "Carina","constellationAbbr": "Car","raDegrees": 95.98792,"decDegrees": -52.69566,"magnitude": -0.62,"distanceLightYears": 309.15},
  {"id": 69451,"name": "Arcturus","bayerLabel": "α Boo","constellation": "Boötes","constellationAbbr": "Boo","raDegrees": 213.91545,"decDegrees": 19.18241,"magnitude": -0.05,"distanceLightYears": 36.72},
  {"id": 71456,"name": "Rigil Kentaurus","bayerLabel": "α¹ Cen","constellation": "Centaurus","constellationAbbr": "Cen","raDegrees": 219.91147,"decDegrees": -60.83398,"magnitude": -0.01,"distanceLightYears": 4.32},
  {"id": 90979,"name": "Vega","bayerLabel": "α Lyr","constellation": "Lyra","constellationAbbr": "Lyr","raDegrees": 279.2346,"decDegrees": 38.78369,"magnitude": 0.03,"distanceLightYears": 25.04},
  {"id": 24549,"name": "Capella","bayerLabel": "α Aur","constellation": "Auriga","constellationAbbr": "Aur","raDegrees": 79.17225,"decDegrees": 45.99799,"magnitude": 0.08,"distanceLightYears": 42.8},
  {"id": 24378,"name": "Rigel","bayerLabel": "β Ori","constellation": "Orion","constellationAbbr": "Ori","raDegrees": 78.63447,"decDegrees": -8.20164,"magnitude": 0.18,"distanceLightYears": 862.85},
  {"id": 37173,"name": "Procyon","bayerLabel": "α CMi","constellation": "Canis Minor","constellationAbbr": "CMi","raDegrees": 114.8255,"decDegrees": 5.22499,"magnitude": 0.4,"distanceLightYears": 11.46},
  {"id": 7574,"name": "Achernar","bayerLabel": "α Eri","constellation": "Eridanus","constellationAbbr": "Eri","raDegrees": 24.42834,"decDegrees": -57.23676,"magnitude": 0.45,"distanceLightYears": 139.44},
  {"id": 27919,"name": "Betelgeuse","bayerLabel": "α Ori","constellation": "Orion","constellationAbbr": "Ori","raDegrees": 88.79293,"decDegrees": 7.40706,"magnitude": 0.45,"distanceLightYears": 497.95},
  {"id": 68483,"name": "Hadar","bayerLabel": "β Cen","constellation": "Centaurus","constellationAbbr": "Cen","raDegrees": 210.95594,"decDegrees": -60.37304,"magnitude": 0.61,"distanceLightYears": 392.01},
  {"id": 97338,"name": "Altair","bayerLabel": "α Aql","constellation": "Aquila","constellationAbbr": "Aql","raDegrees": 297.69582,"decDegrees": 8.86832,"magnitude": 0.76,"distanceLightYears": 16.73},
  {"id": 60530,"name": "Acrux","bayerLabel": "α¹ Cru","constellation": "Crux","constellationAbbr": "Cru","raDegrees": 186.64966,"decDegrees": -63.09909,"magnitude": 0.77,"distanceLightYears": 321.97},
  {"id": 21368,"name": "Aldebaran","bayerLabel": "α Tau","constellation": "Taurus","constellationAbbr": "Tau","raDegrees": 68.98016,"decDegrees": 16.5093,"magnitude": 0.87,"distanceLightYears": 66.64},
  {"id": 65269,"name": "Spica","bayerLabel": "α Vir","constellation": "Virgo","constellationAbbr": "Vir","raDegrees": 201.29825,"decDegrees": -11.16132,"magnitude": 0.98,"distanceLightYears": 249.74},
  {"id": 80519,"name": "Antares","bayerLabel": "α Sco","constellation": "Scorpius","constellationAbbr": "Sco","raDegrees": 247.35192,"decDegrees": -26.432,"magnitude": 1.06,"distanceLightYears": 553.75},
  {"id": 37718,"name": "Pollux","bayerLabel": "β Gem","constellation": "Gemini","constellationAbbr": "Gem","raDegrees": 116.32916,"decDegrees": 28.0262,"magnitude": 1.16,"distanceLightYears": 33.78},
  {"id": 113008,"name": "Fomalhaut","bayerLabel": "α PsA","constellation": "Piscis Austrinus","constellationAbbr": "PsA","raDegrees": 344.41257,"decDegrees": -29.62224,"magnitude": 1.17,"distanceLightYears": 25.13},
  {"id": 101767,"name": "Deneb","bayerLabel": "α Cyg","constellation": "Cygnus","constellationAbbr": "Cyg","raDegrees": 310.35798,"decDegrees": 45.28034,"magnitude": 1.25,"distanceLightYears": 1411.93},
  {"id": 62239,"name": "Mimosa","bayerLabel": "β Cru","constellation": "Crux","constellationAbbr": "Cru","raDegrees": 191.93039,"decDegrees": -59.68876,"magnitude": 1.25,"distanceLightYears": 278.53},
  {"id": 71453,"name": "Toliman","bayerLabel": "α² Cen","constellation": "Centaurus","constellationAbbr": "Cen","raDegrees": 219.90519,"decDegrees": -60.8383,"magnitude": 1.35,"distanceLightYears": 4.32},
  {"id": 49528,"name": "Regulus","bayerLabel": "α Leo","constellation": "Leo","constellationAbbr": "Leo","raDegrees": 152.09298,"decDegrees": 11.96721,"magnitude": 1.36,"distanceLightYears": 79.3},
  {"id": 33492,"name": "Adhara","bayerLabel": "ε CMa","constellation": "Canis Major","constellationAbbr": "CMa","raDegrees": 104.65645,"decDegrees": -28.97208,"magnitude": 1.5,"distanceLightYears": 405.16},
  {"id": 11734,"name": "Polaris","bayerLabel": "α UMi","constellation": "Ursa Minor","constellationAbbr": "UMi","raDegrees": 37.94625,"decDegrees": 89.26411,"magnitude": 1.97,"distanceLightYears": 432.57}
];

export const CONSTELLATIONS: { abbr: string; name: string }[] = [
  {"abbr": "Aql","name": "Aquila"},
  {"abbr": "Aur","name": "Auriga"},
  {"abbr": "Boo","name": "Boötes"},
  {"abbr": "CMa","name": "Canis Major"},
  {"abbr": "CMi","name": "Canis Minor"},
  {"abbr": "Car","name": "Carina"},
  {"abbr": "Cen","name": "Centaurus"},
  {"abbr": "Cru","name": "Crux"},
  {"abbr": "Cyg","name": "Cygnus"},
  {"abbr": "Eri","name": "Eridanus"},
  {"abbr": "Gem","name": "Gemini"},
  {"abbr": "Leo","name": "Leo"},
  {"abbr": "Lyr","name": "Lyra"},
  {"abbr": "Ori","name": "Orion"},
  {"abbr": "PsA","name": "Piscis Austrinus"},
  {"abbr": "Sco","name": "Scorpius"},
  {"abbr": "Tau","name": "Taurus"},
  {"abbr": "UMi","name": "Ursa Minor"},
  {"abbr": "Vir","name": "Virgo"}
];

const CONSTELLATION_GEOMETRY: Record<string, ConstellationGeometry> = {
  "Aql": {
    abbr: "Aql",
    name: "Aquila",
    stars: [
      {"id": 92951,"name": null,"raDegrees": 284.90566,"decDegrees": 15.0683,"magnitude": 4.02},
      {"id": 93452,"name": "Okab","raDegrees": 286.35253,"decDegrees": 13.86348,"magnitude": 2.99},
      {"id": 93510,"name": null,"raDegrees": 286.56225,"decDegrees": -4.88255,"magnitude": 3.43},
      {"id": 95207,"name": null,"raDegrees": 291.37458,"decDegrees": 3.11477,"magnitude": 3.36},
      {"id": 96970,"name": "Tarazed","raDegrees": 296.56491,"decDegrees": 10.61326,"magnitude": 2.72},
      {"id": 97338,"name": "Altair","raDegrees": 297.69582,"decDegrees": 8.86832,"magnitude": 0.76},
      {"id": 97493,"name": null,"raDegrees": 298.1182,"decDegrees": 1.00566,"magnitude": 3.87},
      {"id": 97725,"name": "Alshain","raDegrees": 298.82831,"decDegrees": 6.40676,"magnitude": 3.71},
      {"id": 99156,"name": "Antinous","raDegrees": 302.82619,"decDegrees": -0.82146,"magnitude": 3.24}
    ],
    lines: [[97725, 97338, 96970], [97338, 95207, 97493], [99156, 97493], [95207, 93452, 92951], [95207, 93510]],
  },
  "Aur": {
    abbr: "Aur",
    name: "Auriga",
    stars: [
      {"id": 22961,"name": "Hassaleh","raDegrees": 74.24841,"decDegrees": 33.16609,"magnitude": 2.69},
      {"id": 23398,"name": "Saclateni","raDegrees": 75.61951,"decDegrees": 41.07584,"magnitude": 3.69},
      {"id": 24549,"name": "Capella","raDegrees": 79.17225,"decDegrees": 45.99799,"magnitude": 0.08},
      {"id": 25364,"name": "Elnath","raDegrees": 81.57297,"decDegrees": 28.60745,"magnitude": 1.65},
      {"id": 28288,"name": "Menkalinan","raDegrees": 89.88224,"decDegrees": 44.94743,"magnitude": 1.9},
      {"id": 28309,"name": "Mahasim","raDegrees": 89.93027,"decDegrees": 37.21258,"magnitude": 2.65}
    ],
    lines: [[28309, 28288, 24549, 23398, 22961], [25364, 22961], [25364, 28309]],
  },
  "Boo": {
    abbr: "Boo",
    name: "Boötes",
    stars: [
      {"id": 67246,"name": null,"raDegrees": 207.36935,"decDegrees": 15.79791,"magnitude": 4.05},
      {"id": 67711,"name": "Muphrid","raDegrees": 208.67117,"decDegrees": 18.39772,"magnitude": 2.68},
      {"id": 69451,"name": "Arcturus","raDegrees": 213.91545,"decDegrees": 19.18241,"magnitude": -0.05},
      {"id": 70828,"name": "Kalasungsang","raDegrees": 217.9575,"decDegrees": 30.37144,"magnitude": 3.57},
      {"id": 70851,"name": "Seginus","raDegrees": 218.01954,"decDegrees": 38.30825,"magnitude": 3.04},
      {"id": 71569,"name": null,"raDegrees": 220.2873,"decDegrees": 13.7283,"magnitude": 3.78},
      {"id": 71879,"name": "Izar","raDegrees": 221.24676,"decDegrees": 27.07422,"magnitude": 2.35},
      {"id": 73327,"name": "Nekkar","raDegrees": 225.48654,"decDegrees": 40.39057,"magnitude": 3.49},
      {"id": 74438,"name": "Qigong","raDegrees": 228.87564,"decDegrees": 33.31483,"magnitude": 3.46}
    ],
    lines: [[71569, 69451, 71879, 74438, 73327, 70851, 70828, 69451, 67711, 67246]],
  },
  "CMa": {
    abbr: "CMa",
    name: "Canis Major",
    stars: [
      {"id": 30049,"name": "Furud","raDegrees": 95.07829,"decDegrees": -30.06337,"magnitude": 3.02},
      {"id": 30251,"name": "Mirzam","raDegrees": 95.67494,"decDegrees": -17.95592,"magnitude": 1.98},
      {"id": 31339,"name": null,"raDegrees": 98.76411,"decDegrees": -22.96479,"magnitude": 4.54},
      {"id": 31512,"name": null,"raDegrees": 99.17098,"decDegrees": -19.25588,"magnitude": 3.95},
      {"id": 32263,"name": "Sirius","raDegrees": 101.28722,"decDegrees": -16.71612,"magnitude": -1.44},
      {"id": 32672,"name": null,"raDegrees": 102.46025,"decDegrees": -32.50848,"magnitude": 3.5},
      {"id": 33073,"name": null,"raDegrees": 103.54751,"decDegrees": -12.03863,"magnitude": 4.08},
      {"id": 33078,"name": null,"raDegrees": 103.55434,"decDegrees": -23.92834,"magnitude": 6.65},
      {"id": 33260,"name": null,"raDegrees": 104.03427,"decDegrees": -17.05424,"magnitude": 4.36},
      {"id": 33492,"name": "Adhara","raDegrees": 104.65645,"decDegrees": -28.97208,"magnitude": 1.5},
      {"id": 33769,"name": "Nganurganity","raDegrees": 105.42978,"decDegrees": -27.93483,"magnitude": 3.49},
      {"id": 33888,"name": null,"raDegrees": 105.75614,"decDegrees": -23.83329,"magnitude": 3.02},
      {"id": 33956,"name": "Muliphein","raDegrees": 105.93955,"decDegrees": -15.63329,"magnitude": 4.11},
      {"id": 34354,"name": "Wezen","raDegrees": 107.09785,"decDegrees": -26.3932,"magnitude": 1.83},
      {"id": 34943,"name": null,"raDegrees": 108.70274,"decDegrees": -26.77267,"magnitude": 4.01},
      {"id": 35806,"name": "Aludra","raDegrees": 111.02376,"decDegrees": -29.3031,"magnitude": 2.45}
    ],
    lines: [[33073, 33956, 33260, 32263, 33888, 34354, 34943, 35806], [33492, 33769, 34354], [33769, 33078, 31512, 31339], [31512, 30251], [31512, 32263], [33492, 32672], [30049, 33492], [33260, 33073]],
  },
  "CMi": {
    abbr: "CMi",
    name: "Canis Minor",
    stars: [
      {"id": 36087,"name": "Gomeisa","raDegrees": 111.78768,"decDegrees": 8.28932,"magnitude": 2.89},
      {"id": 37173,"name": "Procyon","raDegrees": 114.8255,"decDegrees": 5.22499,"magnitude": 0.4}
    ],
    lines: [[37173, 36087]],
  },
  "Car": {
    abbr: "Car",
    name: "Carina",
    stars: [
      {"id": 30365,"name": "Canopus","raDegrees": 95.98792,"decDegrees": -52.69566,"magnitude": -0.62},
      {"id": 31605,"name": "Pipit","raDegrees": 99.4403,"decDegrees": -43.19593,"magnitude": 3.17},
      {"id": 39318,"name": "Naos","raDegrees": 120.89606,"decDegrees": -40.00315,"magnitude": 2.21},
      {"id": 40921,"name": "Avior","raDegrees": 125.62854,"decDegrees": -59.50948,"magnitude": 1.86},
      {"id": 42449,"name": null,"raDegrees": 130.15429,"decDegrees": -59.761,"magnitude": 4.31},
      {"id": 44952,"name": null,"raDegrees": 137.74206,"decDegrees": -58.9669,"magnitude": 3.43},
      {"id": 45106,"name": "Miaplacidus","raDegrees": 138.30061,"decDegrees": -69.71721,"magnitude": 1.67},
      {"id": 45425,"name": "Aspidiske","raDegrees": 139.27257,"decDegrees": -59.27523,"magnitude": 2.21},
      {"id": 49958,"name": null,"raDegrees": 153.43442,"decDegrees": -70.0379,"magnitude": 3.29},
      {"id": 50229,"name": null,"raDegrees": 154.2708,"decDegrees": -61.3323,"magnitude": 3.39},
      {"id": 51087,"name": null,"raDegrees": 156.96973,"decDegrees": -58.7394,"magnitude": 3.81},
      {"id": 52268,"name": null,"raDegrees": 160.73924,"decDegrees": -64.39445,"magnitude": 2.74},
      {"id": 52317,"name": null,"raDegrees": 160.88458,"decDegrees": -60.56662,"magnitude": 4.58},
      {"id": 53099,"name": null,"raDegrees": 163.37339,"decDegrees": -58.85317,"magnitude": 3.78},
      {"id": 54304,"name": null,"raDegrees": 167.14747,"decDegrees": -58.97504,"magnitude": 3.93}
    ],
    lines: [[45106, 49958, 52268, 52317, 54304, 53099, 51087, 50229, 45425], [42449, 40921, 30365], [44952, 45425], [44952, 42449], [30365, 31605], [40921, 39318]],
  },
  "Cen": {
    abbr: "Cen",
    name: "Centaurus",
    stars: [
      {"id": 56311,"name": null,"raDegrees": 173.69033,"decDegrees": -54.26409,"magnitude": 4.62},
      {"id": 56392,"name": null,"raDegrees": 173.94545,"decDegrees": -63.01984,"magnitude": 3.11},
      {"id": 59016,"name": null,"raDegrees": 182.08965,"decDegrees": -50.72243,"magnitude": 2.58},
      {"id": 60635,"name": null,"raDegrees": 187.00996,"decDegrees": -50.23063,"magnitude": 3.91},
      {"id": 61739,"name": null,"raDegrees": 190.37957,"decDegrees": -48.95989,"magnitude": 2.2},
      {"id": 64904,"name": "Kulou","raDegrees": 200.14944,"decDegrees": -36.71229,"magnitude": 2.75},
      {"id": 65729,"name": null,"raDegrees": 202.76108,"decDegrees": -39.40731,"magnitude": 3.9},
      {"id": 66447,"name": null,"raDegrees": 204.97194,"decDegrees": -53.46639,"magnitude": 2.29},
      {"id": 67251,"name": "Heng","raDegrees": 207.37617,"decDegrees": -41.68771,"magnitude": 3.41},
      {"id": 67259,"name": null,"raDegrees": 207.40414,"decDegrees": -42.47373,"magnitude": 3.47},
      {"id": 67786,"name": "Leepwal","raDegrees": 208.88501,"decDegrees": -47.28838,"magnitude": 2.55},
      {"id": 68064,"name": null,"raDegrees": 209.6698,"decDegrees": -44.80358,"magnitude": 3.87},
      {"id": 68483,"name": "Hadar","raDegrees": 210.95594,"decDegrees": -60.37304,"magnitude": 0.61},
      {"id": 68714,"name": "Menkent","raDegrees": 211.67093,"decDegrees": -36.36995,"magnitude": 2.06},
      {"id": 71125,"name": null,"raDegrees": 218.87679,"decDegrees": -42.15782,"magnitude": 2.33},
      {"id": 71453,"name": "Toliman","raDegrees": 219.90519,"decDegrees": -60.8383,"magnitude": 1.35},
      {"id": 71456,"name": "Rigil Kentaurus","raDegrees": 219.91147,"decDegrees": -60.83398,"magnitude": -0.01},
      {"id": 73107,"name": null,"raDegrees": 224.79037,"decDegrees": -42.10419,"magnitude": 3.13}
    ],
    lines: [[71456, 68483, 66447, 67786, 68064, 67259, 67251, 65729, 64904], [67251, 68714], [67259, 71125, 73107], [67786, 61739, 60635, 59016, 56311, 56392]],
  },
  "Cru": {
    abbr: "Cru",
    name: "Crux",
    stars: [
      {"id": 59565,"name": "Imai","raDegrees": 183.78641,"decDegrees": -58.74893,"magnitude": 2.79},
      {"id": 60530,"name": "Acrux","raDegrees": 186.64966,"decDegrees": -63.09909,"magnitude": 0.77},
      {"id": 60893,"name": "Gacrux","raDegrees": 187.79144,"decDegrees": -57.11321,"magnitude": 1.59},
      {"id": 62239,"name": "Mimosa","raDegrees": 191.93039,"decDegrees": -59.68876,"magnitude": 1.25}
    ],
    lines: [[60893, 60530], [62239, 59565]],
  },
  "Cyg": {
    abbr: "Cyg",
    name: "Cygnus",
    stars: [
      {"id": 94484,"name": null,"raDegrees": 289.2756,"decDegrees": 53.36846,"magnitude": 3.8},
      {"id": 95554,"name": null,"raDegrees": 292.42647,"decDegrees": 51.72978,"magnitude": 3.76},
      {"id": 95648,"name": "Albireo","raDegrees": 292.68034,"decDegrees": 27.95968,"magnitude": 3.05},
      {"id": 96858,"name": "Fawaris","raDegrees": 296.24361,"decDegrees": 45.13081,"magnitude": 2.86},
      {"id": 97799,"name": null,"raDegrees": 299.07657,"decDegrees": 35.08342,"magnitude": 3.89},
      {"id": 100128,"name": "Sadr","raDegrees": 305.5571,"decDegrees": 40.25668,"magnitude": 2.23},
      {"id": 101767,"name": "Deneb","raDegrees": 310.35798,"decDegrees": 45.28034,"magnitude": 1.25},
      {"id": 102157,"name": "Aljanah","raDegrees": 311.55267,"decDegrees": 33.97026,"magnitude": 2.48},
      {"id": 104394,"name": null,"raDegrees": 318.2341,"decDegrees": 30.22692,"magnitude": 3.21},
      {"id": 106967,"name": null,"raDegrees": 326.03565,"decDegrees": 28.74263,"magnitude": 4.49}
    ],
    lines: [[94484, 95554, 96858, 100128, 101767], [100128, 102157, 104394, 106967], [100128, 97799, 95648]],
  },
  "Eri": {
    abbr: "Eri",
    name: "Eridanus",
    stars: [
      {"id": 7574,"name": "Achernar","raDegrees": 24.42834,"decDegrees": -57.23676,"magnitude": 0.45},
      {"id": 8989,"name": null,"raDegrees": 28.98846,"decDegrees": -51.6089,"magnitude": 3.69},
      {"id": 10578,"name": null,"raDegrees": 34.12731,"decDegrees": -51.51217,"magnitude": 3.56},
      {"id": 11380,"name": null,"raDegrees": 36.74632,"decDegrees": -47.70384,"magnitude": 4.24},
      {"id": 12381,"name": null,"raDegrees": 39.94989,"decDegrees": -42.89167,"magnitude": 4.74},
      {"id": 12452,"name": null,"raDegrees": 40.16671,"decDegrees": -39.85538,"magnitude": 4.11},
      {"id": 12810,"name": null,"raDegrees": 41.27573,"decDegrees": -18.57256,"magnitude": 4.47},
      {"id": 13667,"name": "Azha","raDegrees": 44.10687,"decDegrees": -8.89814,"magnitude": 3.89},
      {"id": 13813,"name": "Acamar","raDegrees": 44.56535,"decDegrees": -40.30467,"magnitude": 2.88},
      {"id": 14112,"name": null,"raDegrees": 45.59795,"decDegrees": -23.62447,"magnitude": 4.08},
      {"id": 15159,"name": "Zibal","raDegrees": 48.95844,"decDegrees": -8.81973,"magnitude": 4.8},
      {"id": 15436,"name": null,"raDegrees": 49.87917,"decDegrees": -21.75786,"magnitude": 3.7},
      {"id": 15471,"name": "82 G. Eri","raDegrees": 49.97916,"decDegrees": -43.06978,"magnitude": 4.26},
      {"id": 16496,"name": "Ran","raDegrees": 53.23272,"decDegrees": -9.45826,"magnitude": 3.72},
      {"id": 16570,"name": null,"raDegrees": 53.44698,"decDegrees": -21.63288,"magnitude": 4.26},
      {"id": 17336,"name": "Rana","raDegrees": 55.81209,"decDegrees": -9.76339,"magnitude": 3.52},
      {"id": 17609,"name": null,"raDegrees": 56.71206,"decDegrees": -23.24972,"magnitude": 4.22},
      {"id": 17757,"name": null,"raDegrees": 57.14945,"decDegrees": -37.62015,"magnitude": 4.3},
      {"id": 17833,"name": null,"raDegrees": 57.36356,"decDegrees": -36.20025,"magnitude": 4.17},
      {"id": 19992,"name": null,"raDegrees": 64.47356,"decDegrees": -33.79835,"magnitude": 3.55},
      {"id": 20483,"name": "Beemim","raDegrees": 66.0092,"decDegrees": -34.01685,"magnitude": 3.97},
      {"id": 21340,"name": "Theemin","raDegrees": 68.88768,"decDegrees": -30.56234,"magnitude": 3.81},
      {"id": 21391,"name": null,"raDegrees": 69.07976,"decDegrees": -3.35246,"magnitude": 3.93},
      {"id": 21541,"name": "Sceptrum","raDegrees": 69.5451,"decDegrees": -14.30402,"magnitude": 3.86},
      {"id": 22056,"name": null,"raDegrees": 71.37562,"decDegrees": -3.25466,"magnitude": 4.01},
      {"id": 22648,"name": null,"raDegrees": 73.22362,"decDegrees": -5.4527,"magnitude": 4.36},
      {"id": 23820,"name": "Cursa","raDegrees": 76.96243,"decDegrees": -5.08645,"magnitude": 2.78},
      {"id": 23917,"name": null,"raDegrees": 77.2866,"decDegrees": -8.75408,"magnitude": 4.25}
    ],
    lines: [[7574, 8989, 10578, 11380, 12381, 12452, 13813, 15471, 17757, 17833, 19992, 20483, 21340, 17609, 16570, 15436, 14112, 12810, 13667, 15159, 16496, 17336, 21391, 22056, 22648, 23820, 23917, 21541]],
  },
  "Gem": {
    abbr: "Gem",
    name: "Gemini",
    stars: [
      {"id": 28664,"name": null,"raDegrees": 91.03007,"decDegrees": 23.26334,"magnitude": 4.16},
      {"id": 29582,"name": "Propus","raDegrees": 93.71941,"decDegrees": 22.5068,"magnitude": 3.31},
      {"id": 30270,"name": "Tejat","raDegrees": 95.74009,"decDegrees": 22.51359,"magnitude": 2.87},
      {"id": 30810,"name": null,"raDegrees": 97.24079,"decDegrees": 20.21213,"magnitude": 4.13},
      {"id": 31601,"name": "Alhena","raDegrees": 99.42792,"decDegrees": 16.39925,"magnitude": 1.93},
      {"id": 32161,"name": "Mebsuta","raDegrees": 100.98303,"decDegrees": 25.13112,"magnitude": 3.06},
      {"id": 32276,"name": "Alzirr","raDegrees": 101.32236,"decDegrees": 12.89559,"magnitude": 3.35},
      {"id": 32932,"name": null,"raDegrees": 103.19724,"decDegrees": 33.96125,"magnitude": 3.6},
      {"id": 34000,"name": "Mekbuda","raDegrees": 106.02721,"decDegrees": 20.5703,"magnitude": 4.01},
      {"id": 34601,"name": null,"raDegrees": 107.78489,"decDegrees": 30.24516,"magnitude": 4.41},
      {"id": 35253,"name": null,"raDegrees": 109.52325,"decDegrees": 16.54038,"magnitude": 3.58},
      {"id": 35453,"name": "Wasat","raDegrees": 110.03074,"decDegrees": 21.98232,"magnitude": 3.5},
      {"id": 35946,"name": null,"raDegrees": 111.43168,"decDegrees": 27.79808,"magnitude": 3.78},
      {"id": 36744,"name": "Castor","raDegrees": 113.64951,"decDegrees": 31.88828,"magnitude": 1.58},
      {"id": 36856,"name": null,"raDegrees": 113.98062,"decDegrees": 26.89574,"magnitude": 4.06},
      {"id": 37633,"name": null,"raDegrees": 116.1119,"decDegrees": 24.39799,"magnitude": 3.57},
      {"id": 37718,"name": "Pollux","raDegrees": 116.32916,"decDegrees": 28.0262,"magnitude": 1.16}
    ],
    lines: [[31601, 34000, 35453, 35253, 32276], [35453, 36856, 37633], [36856, 37718], [36856, 35946, 34601, 36744], [34601, 32932], [34601, 32161, 30810], [32161, 30270, 29582, 28664]],
  },
  "Leo": {
    abbr: "Leo",
    name: "Leo",
    stars: [
      {"id": 47772,"name": "Ras Elased Australis","raDegrees": 146.46282,"decDegrees": 23.77426,"magnitude": 2.97},
      {"id": 48318,"name": "Rasalas","raDegrees": 148.19097,"decDegrees": 26.00695,"magnitude": 3.88},
      {"id": 49441,"name": null,"raDegrees": 151.83313,"decDegrees": 16.76266,"magnitude": 3.48},
      {"id": 49528,"name": "Regulus","raDegrees": 152.09298,"decDegrees": 11.96721,"magnitude": 1.36},
      {"id": 50193,"name": "Adhafera","raDegrees": 154.17257,"decDegrees": 23.41731,"magnitude": 3.43},
      {"id": 50440,"name": "Algieba","raDegrees": 154.99309,"decDegrees": 19.84149,"magnitude": 2.01},
      {"id": 54712,"name": "Zosma","raDegrees": 168.52707,"decDegrees": 20.52372,"magnitude": 2.56},
      {"id": 54718,"name": "Chertan","raDegrees": 168.56002,"decDegrees": 15.42957,"magnitude": 3.33},
      {"id": 57459,"name": "Denebola","raDegrees": 177.26494,"decDegrees": 14.57206,"magnitude": 2.14}
    ],
    lines: [[57459, 54718, 49528, 49441, 50440, 54712, 57459], [50440, 50193, 48318, 47772], [54712, 54718]],
  },
  "Lyr": {
    abbr: "Lyr",
    name: "Lyra",
    stars: [
      {"id": 90979,"name": "Vega","raDegrees": 279.2346,"decDegrees": 38.78369,"magnitude": 0.03},
      {"id": 91684,"name": null,"raDegrees": 281.19313,"decDegrees": 37.60511,"magnitude": 4.34},
      {"id": 92133,"name": "Sheliak","raDegrees": 282.51998,"decDegrees": 33.36267,"magnitude": 3.52},
      {"id": 92502,"name": null,"raDegrees": 283.62618,"decDegrees": 36.89861,"magnitude": 4.22},
      {"id": 92902,"name": "Sulafat","raDegrees": 284.73593,"decDegrees": 32.68956,"magnitude": 3.25}
    ],
    lines: [[90979, 91684, 92133, 92902, 92502, 91684]],
  },
  "Ori": {
    abbr: "Ori",
    name: "Orion",
    stars: [
      {"id": 22396,"name": "Tabit","raDegrees": 72.46004,"decDegrees": 6.96128,"magnitude": 3.19},
      {"id": 22456,"name": null,"raDegrees": 72.65301,"decDegrees": 8.90018,"magnitude": 4.35},
      {"id": 22496,"name": null,"raDegrees": 72.80151,"decDegrees": 5.6051,"magnitude": 3.68},
      {"id": 22677,"name": null,"raDegrees": 73.34489,"decDegrees": 2.50822,"magnitude": 5.33},
      {"id": 22744,"name": null,"raDegrees": 73.56289,"decDegrees": 2.44067,"magnitude": 3.71},
      {"id": 22792,"name": null,"raDegrees": 73.72386,"decDegrees": 10.15083,"magnitude": 4.64},
      {"id": 23069,"name": null,"raDegrees": 74.63709,"decDegrees": 1.71402,"magnitude": 4.47},
      {"id": 24378,"name": "Rigel","raDegrees": 78.63447,"decDegrees": -8.20164,"magnitude": 0.18},
      {"id": 25273,"name": "Bellatrix","raDegrees": 81.28276,"decDegrees": 6.3497,"magnitude": 1.64},
      {"id": 25865,"name": "Mintaka","raDegrees": 83.00168,"decDegrees": -0.29909,"magnitude": 2.25},
      {"id": 26142,"name": "Meissa","raDegrees": 83.78449,"decDegrees": 9.93416,"magnitude": 3.39},
      {"id": 26246,"name": "Alnilam","raDegrees": 84.05338,"decDegrees": -1.20192,"magnitude": 1.69},
      {"id": 26662,"name": "Alnitak","raDegrees": 85.1897,"decDegrees": -1.94257,"magnitude": 1.74},
      {"id": 27298,"name": "Saiph","raDegrees": 86.93912,"decDegrees": -9.66961,"magnitude": 2.07},
      {"id": 27844,"name": null,"raDegrees": 88.59579,"decDegrees": 20.27617,"magnitude": 4.39},
      {"id": 27919,"name": "Betelgeuse","raDegrees": 88.79293,"decDegrees": 7.40706,"magnitude": 0.45},
      {"id": 28543,"name": null,"raDegrees": 90.59583,"decDegrees": 9.64728,"magnitude": 4.12},
      {"id": 28645,"name": null,"raDegrees": 90.97993,"decDegrees": 20.13845,"magnitude": 4.64},
      {"id": 28966,"name": null,"raDegrees": 91.89302,"decDegrees": 14.76847,"magnitude": 4.42},
      {"id": 29353,"name": null,"raDegrees": 92.98498,"decDegrees": 14.20876,"magnitude": 4.45},
      {"id": 29361,"name": null,"raDegrees": 93.01366,"decDegrees": 16.13041,"magnitude": 4.95}
    ],
    lines: [[26662, 26246, 25865], [29361, 29353], [29361, 28645, 27844], [29353, 28966, 27844], [29353, 28543, 27919, 26662, 27298, 24378, 25865, 25273, 26142, 27919], [25273, 22396, 22496, 22677, 22744, 23069], [22396, 22456, 22792], [28966, 28543]],
  },
  "PsA": {
    abbr: "PsA",
    name: "Piscis Austrinus",
    stars: [
      {"id": 107265,"name": null,"raDegrees": 326.93397,"decDegrees": -30.8983,"magnitude": 5.02},
      {"id": 108316,"name": null,"raDegrees": 330.20926,"decDegrees": -28.45374,"magnitude": 5.43},
      {"id": 109076,"name": null,"raDegrees": 332.5364,"decDegrees": -32.54841,"magnitude": 4.94},
      {"id": 110841,"name": null,"raDegrees": 337.87635,"decDegrees": -32.34607,"magnitude": 4.29},
      {"id": 111601,"name": null,"raDegrees": 340.16391,"decDegrees": -27.04362,"magnitude": 4.18},
      {"id": 112886,"name": null,"raDegrees": 343.98708,"decDegrees": -32.53963,"magnitude": 4.2},
      {"id": 113008,"name": "Fomalhaut","raDegrees": 344.41257,"decDegrees": -29.62224,"magnitude": 1.17}
    ],
    lines: [[113008, 111601, 108316, 107265, 109076, 110841, 112886]],
  },
  "Sco": {
    abbr: "Sco",
    name: "Scorpius",
    stars: [
      {"id": 78029,"name": "Fang","raDegrees": 239.71298,"decDegrees": -26.1141,"magnitude": 2.89},
      {"id": 78165,"name": "Dschubba","raDegrees": 240.08335,"decDegrees": -22.62171,"magnitude": 2.29},
      {"id": 78580,"name": "Acrab","raDegrees": 241.3593,"decDegrees": -19.80545,"magnitude": 2.56},
      {"id": 80519,"name": "Antares","raDegrees": 247.35192,"decDegrees": -26.432,"magnitude": 1.06},
      {"id": 81020,"name": "Paikauhale","raDegrees": 248.97065,"decDegrees": -28.21602,"magnitude": 2.82},
      {"id": 82144,"name": "Larawag","raDegrees": 252.5412,"decDegrees": -34.29323,"magnitude": 2.29},
      {"id": 82263,"name": "Xamidimura","raDegrees": 252.96764,"decDegrees": -38.04738,"magnitude": 3.0},
      {"id": 82419,"name": null,"raDegrees": 253.49886,"decDegrees": -42.36203,"magnitude": 4.7},
      {"id": 83885,"name": null,"raDegrees": 258.03828,"decDegrees": -43.23919,"magnitude": 3.32},
      {"id": 85665,"name": "Shaula","raDegrees": 263.40217,"decDegrees": -37.10382,"magnitude": 1.62},
      {"id": 85965,"name": "Sargas","raDegrees": 264.3297,"decDegrees": -42.99782,"magnitude": 1.86},
      {"id": 86403,"name": null,"raDegrees": 265.62198,"decDegrees": -39.02998,"magnitude": 2.39},
      {"id": 86804,"name": null,"raDegrees": 266.89617,"decDegrees": -40.127,"magnitude": 2.99}
    ],
    lines: [[85665, 86403, 86804, 85965, 83885, 82419, 82263, 82144, 81020, 80519, 78165], [80519, 78029], [80519, 78580]],
  },
  "Tau": {
    abbr: "Tau",
    name: "Taurus",
    stars: [
      {"id": 15861,"name": null,"raDegrees": 51.20331,"decDegrees": 9.02887,"magnitude": 3.61},
      {"id": 17805,"name": "Atlas","raDegrees": 57.2906,"decDegrees": 24.05342,"magnitude": 3.62},
      {"id": 18677,"name": "Bibing","raDegrees": 60.17007,"decDegrees": 12.49035,"magnitude": 3.41},
      {"id": 20155,"name": "Prima Hyadum","raDegrees": 64.94834,"decDegrees": 15.62764,"magnitude": 3.65},
      {"id": 20405,"name": "Secunda Hyadum","raDegrees": 65.7337,"decDegrees": 17.54251,"magnitude": 3.77},
      {"id": 20597,"name": null,"raDegrees": 66.37242,"decDegrees": 17.92791,"magnitude": 4.3},
      {"id": 20837,"name": "Ain","raDegrees": 67.15414,"decDegrees": 19.18043,"magnitude": 3.53},
      {"id": 20842,"name": "Chamukuy","raDegrees": 67.16558,"decDegrees": 15.87088,"magnitude": 3.4},
      {"id": 21368,"name": "Aldebaran","raDegrees": 68.98016,"decDegrees": 16.5093,"magnitude": 0.87},
      {"id": 21828,"name": "Gaja","raDegrees": 70.56126,"decDegrees": 22.95693,"magnitude": 4.27},
      {"id": 25364,"name": "Elnath","raDegrees": 81.57297,"decDegrees": 28.60745,"magnitude": 1.65},
      {"id": 26386,"name": "Tianguan","raDegrees": 84.41119,"decDegrees": 21.14255,"magnitude": 2.97}
    ],
    lines: [[25364, 21828, 20837], [21368, 26386], [20155, 20405], [20155, 18677, 15861], [21368, 20837], [21368, 20842, 20155], [20837, 20597, 20405, 17805]],
  },
  "UMi": {
    abbr: "UMi",
    name: "Ursa Minor",
    stars: [
      {"id": 11734,"name": "Polaris","raDegrees": 37.94625,"decDegrees": 89.26411,"magnitude": 1.97},
      {"id": 72380,"name": "Kochab","raDegrees": 222.67658,"decDegrees": 74.15551,"magnitude": 2.07},
      {"id": 74868,"name": "Pherkad","raDegrees": 230.18224,"decDegrees": 71.83402,"magnitude": 3.0},
      {"id": 76819,"name": null,"raDegrees": 236.01449,"decDegrees": 77.79449,"magnitude": 4.29},
      {"id": 79580,"name": null,"raDegrees": 244.37687,"decDegrees": 75.75533,"magnitude": 4.95},
      {"id": 81830,"name": null,"raDegrees": 251.49238,"decDegrees": 82.03726,"magnitude": 4.21},
      {"id": 85560,"name": "Yildun","raDegrees": 263.05377,"decDegrees": 86.58646,"magnitude": 4.35}
    ],
    lines: [[11734, 85560, 81830, 76819, 79580, 74868, 72380, 76819]],
  },
  "Vir": {
    abbr: "Vir",
    name: "Virgo",
    stars: [
      {"id": 57208,"name": null,"raDegrees": 176.46483,"decDegrees": 6.52938,"magnitude": 4.04},
      {"id": 59945,"name": "Zaniah","raDegrees": 184.97649,"decDegrees": -0.6668,"magnitude": 3.89},
      {"id": 61748,"name": "Porrima","raDegrees": 190.41518,"decDegrees": -1.44938,"magnitude": 2.74},
      {"id": 62890,"name": "Minelauva","raDegrees": 193.90087,"decDegrees": 3.39747,"magnitude": 3.39},
      {"id": 63405,"name": "Vindemiatrix","raDegrees": 195.54417,"decDegrees": 10.95915,"magnitude": 2.85},
      {"id": 65269,"name": "Spica","raDegrees": 201.29825,"decDegrees": -11.16132,"magnitude": 0.98},
      {"id": 66040,"name": "Heze","raDegrees": 203.6733,"decDegrees": -0.59582,"magnitude": 3.38},
      {"id": 68302,"name": null,"raDegrees": 210.41164,"decDegrees": 1.54453,"magnitude": 4.23},
      {"id": 69205,"name": "Kang","raDegrees": 213.22393,"decDegrees": -10.2737,"magnitude": 4.18},
      {"id": 69479,"name": "Syrma","raDegrees": 214.00362,"decDegrees": -6.00055,"magnitude": 4.07},
      {"id": 71731,"name": null,"raDegrees": 220.7651,"decDegrees": -5.65821,"magnitude": 3.87},
      {"id": 71994,"name": "Maenalus","raDegrees": 221.56218,"decDegrees": 1.89288,"magnitude": 3.73}
    ],
    lines: [[57208, 59945, 61748, 65269, 69205, 69479, 71731], [65269, 66040, 68302, 71994], [66040, 62890, 63405], [62890, 61748]],
  },
};

export function getConstellationGeometry(abbr: string): ConstellationGeometry | undefined {
  return CONSTELLATION_GEOMETRY[abbr];
}

/** Sexagesimal RA, rounded to the nearest second; wraps correctly at 24h. */
export function formatRA(degrees: number): string {
  if (!Number.isFinite(degrees)) return "—";
  const totalSeconds = Math.round((((degrees % 360) + 360) % 360) * 240) % 86400;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

/** Signed declination, rounded to arcseconds, with a true minus glyph. */
export function formatDec(degrees: number): string {
  if (!Number.isFinite(degrees) || Math.abs(degrees) > 90) return "—";
  const totalSeconds = Math.round(Math.abs(degrees) * 3600);
  const wholeDegrees = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const sign = degrees < 0 || Object.is(degrees, -0) ? "−" : "+";
  return `${sign}${String(wholeDegrees).padStart(2, "0")}° ${String(minutes).padStart(2, "0")}′ ${String(seconds).padStart(2, "0")}″`;
}

export type StarSort = "brightness" | "name";

/** Returns a new array; leaves the catalog's stable default ordering intact. */
export function filterStars({
  query = "",
  constellation = "all",
  sort = "brightness",
}: {
  query?: string;
  constellation?: string;
  sort?: StarSort;
} = {}): StarRecord[] {
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  const search = normalize(query.trim());
  return STAR_CATALOG.filter((star) => {
    const matchesConstellation = !constellation || constellation === "all" || star.constellationAbbr === constellation;
    const matchesSearch = !search || normalize(`${star.name} ${star.constellation} ${star.constellationAbbr} ${star.bayerLabel ?? ""}`).includes(search);
    return matchesConstellation && matchesSearch;
  }).sort((a, b) => sort === "name"
    ? a.name.localeCompare(b.name)
    : a.magnitude - b.magnitude || a.name.localeCompare(b.name));
}
