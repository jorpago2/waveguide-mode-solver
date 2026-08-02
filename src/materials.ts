export type MaterialId = "custom" | "air" | "silica" | "silicon" | "silicon-nitride"
  | "lithium-niobate" | "aluminum-nitride" | "gallium-arsenide" | "indium-phosphide" | "silicon-carbide";

export type OpticAxis = "x" | "y" | "z";

export interface MaterialDefinition {
  id: MaterialId;
  name: string;
  formula: string;
  minimumWavelengthUm: number;
  maximumWavelengthUm: number;
  anisotropic?: boolean;
  sourceUrl?: string;
  sourceLabel?: string;
}

export interface MaterialAxes {
  nx: number;
  ny: number;
  nz: number;
}

export const MATERIALS: MaterialDefinition[] = [
  { id: "custom", name: "Custom / linear", formula: "User-defined n, κ and dn/dλ", minimumWavelengthUm: 0.2, maximumWavelengthUm: 1_000 },
  { id: "air", name: "Air", formula: "n = 1", minimumWavelengthUm: 0.2, maximumWavelengthUm: 1_000 },
  { id: "silica", name: "Fused silica", formula: "Malitson Sellmeier", minimumWavelengthUm: 0.21, maximumWavelengthUm: 3.71, sourceUrl: "https://doi.org/10.1364/JOSA.55.001205", sourceLabel: "Malitson (1965)" },
  { id: "silicon", name: "Crystalline silicon", formula: "Li dispersion at 293 K", minimumWavelengthUm: 1.2, maximumWavelengthUm: 14, sourceUrl: "https://doi.org/10.1063/1.555624", sourceLabel: "Li (1980)" },
  { id: "silicon-nitride", name: "Stoichiometric Si₃N₄", formula: "Luke Sellmeier", minimumWavelengthUm: 0.31, maximumWavelengthUm: 5.5, sourceUrl: "https://doi.org/10.1364/OL.40.004823", sourceLabel: "Luke et al. (2015)" },
  { id: "lithium-niobate", name: "5% MgO:LiNbO₃", formula: "Zelmon ordinary/extraordinary Sellmeier", minimumWavelengthUm: 0.4, maximumWavelengthUm: 5, anisotropic: true, sourceUrl: "https://doi.org/10.1364/JOSAB.14.003319", sourceLabel: "Zelmon et al. (1997)" },
  { id: "aluminum-nitride", name: "Aluminum nitride", formula: "Pastrňák ordinary/extraordinary Sellmeier", minimumWavelengthUm: 0.22, maximumWavelengthUm: 5, anisotropic: true, sourceUrl: "https://doi.org/10.1002/pssb.19660140140", sourceLabel: "Pastrňák & Roskovcová (1966)" },
  { id: "gallium-arsenide", name: "Gallium arsenide", formula: "Skauli Sellmeier at 22 °C", minimumWavelengthUm: 0.97, maximumWavelengthUm: 17, sourceUrl: "https://doi.org/10.1063/1.1621740", sourceLabel: "Skauli et al. (2003)" },
  { id: "indium-phosphide", name: "Indium phosphide", formula: "Pettit–Turner Sellmeier", minimumWavelengthUm: 0.95, maximumWavelengthUm: 10, sourceUrl: "https://doi.org/10.1063/1.1714393", sourceLabel: "Pettit & Turner (1965)" },
  { id: "silicon-carbide", name: "4H silicon carbide", formula: "Wang ordinary/extraordinary Sellmeier", minimumWavelengthUm: 0.405, maximumWavelengthUm: 2.325, anisotropic: true, sourceUrl: "https://doi.org/10.1002/lpor.201300068", sourceLabel: "Wang et al. (2013)" },
];

export function materialDefinition(id: MaterialId): MaterialDefinition {
  return MATERIALS.find((material) => material.id === id) ?? MATERIALS[0];
}

export function evaluateMaterial(id: Exclude<MaterialId, "custom">, wavelengthUm: number): number {
  return evaluateMaterialAxes(id, wavelengthUm).nx;
}

export function evaluateMaterialAxes(
  id: Exclude<MaterialId, "custom">,
  wavelengthUm: number,
  temperatureC = 21,
  opticAxis: OpticAxis = "y",
  electricFieldVPerUm = 0,
): MaterialAxes {
  const material = materialDefinition(id);
  if (wavelengthUm < material.minimumWavelengthUm || wavelengthUm > material.maximumWavelengthUm) {
    throw new Error(`${material.name} is valid from ${material.minimumWavelengthUm} to ${material.maximumWavelengthUm} µm.`);
  }
  const wavelengthSquared = wavelengthUm ** 2;
  let ordinary: number;
  let extraordinary: number;
  if (id === "air") ordinary = extraordinary = 1;
  else if (id === "silica") ordinary = extraordinary = Math.sqrt(1
    + 0.6961663 * wavelengthSquared / (wavelengthSquared - 0.0684043 ** 2)
    + 0.4079426 * wavelengthSquared / (wavelengthSquared - 0.1162414 ** 2)
    + 0.8974794 * wavelengthSquared / (wavelengthSquared - 9.896161 ** 2));
  else if (id === "silicon") ordinary = extraordinary = Math.sqrt(11.6858 + 0.939816 / (wavelengthSquared - 0.00810461) + 0.00304347 / (wavelengthSquared - 1.541334));
  else if (id === "silicon-nitride") ordinary = extraordinary = Math.sqrt(1
    + 3.0249 * wavelengthSquared / (wavelengthSquared - 0.1353406 ** 2)
    + 40_314 * wavelengthSquared / (wavelengthSquared - 1_239.842 ** 2));
  else if (id === "lithium-niobate") {
    ordinary = threePoleSellmeier(wavelengthSquared, [2.4272, 1.4617, 9.6536], [0.01478, 0.05612, 371.216]);
    extraordinary = threePoleSellmeier(wavelengthSquared, [2.2454, 1.3005, 6.8972], [0.01242, 0.05313, 331.33]);
    ordinary += lithiumNiobateTemperatureShift(wavelengthUm, temperatureC, false);
    extraordinary += lithiumNiobateTemperatureShift(wavelengthUm, temperatureC, true);
    const fieldVPerM = electricFieldVPerUm * 1e6;
    ordinary += -0.5 * ordinary ** 3 * 8.6e-12 * fieldVPerM;
    extraordinary += -0.5 * extraordinary ** 3 * 30.8e-12 * fieldVPerM;
  } else if (id === "aluminum-nitride") {
    ordinary = Math.sqrt(1 + 2.1399 + 1.3786 * wavelengthSquared / (wavelengthSquared - 0.1715 ** 2) + 3.861 * wavelengthSquared / (wavelengthSquared - 15.03 ** 2));
    extraordinary = Math.sqrt(1 + 2.0729 + 1.6173 * wavelengthSquared / (wavelengthSquared - 0.1746 ** 2) + 4.139 * wavelengthSquared / (wavelengthSquared - 15.03 ** 2));
  } else if (id === "gallium-arsenide") ordinary = extraordinary = Math.sqrt(1 + 4.372514
    + 5.466742 * wavelengthSquared / (wavelengthSquared - 0.4431307 ** 2)
    + 0.02429960 * wavelengthSquared / (wavelengthSquared - 0.8746453 ** 2)
    + 1.957522 * wavelengthSquared / (wavelengthSquared - 36.9166 ** 2));
  else if (id === "indium-phosphide") ordinary = extraordinary = Math.sqrt(1 + 6.255
    + 2.316 * wavelengthSquared / (wavelengthSquared - 0.6263 ** 2)
    + 2.765 * wavelengthSquared / (wavelengthSquared - 32.935 ** 2));
  else {
    ordinary = Math.sqrt(1
      + 0.20075 * wavelengthSquared / (wavelengthSquared + 12.07224)
      + 5.54861 * wavelengthSquared / (wavelengthSquared - 0.02641)
      + 35.65066 * wavelengthSquared / (wavelengthSquared - 1268.24708));
    extraordinary = Math.sqrt(6.79485 + 0.15558 / (wavelengthSquared - 0.03535) - 0.02296 * wavelengthSquared);
  }
  return opticAxis === "x" ? { nx: extraordinary, ny: ordinary, nz: ordinary }
    : opticAxis === "z" ? { nx: ordinary, ny: ordinary, nz: extraordinary }
      : { nx: ordinary, ny: extraordinary, nz: ordinary };
}

function threePoleSellmeier(wavelengthSquared: number, strengths: number[], resonancesSquared: number[]): number {
  return Math.sqrt(1 + strengths.reduce((sum, strength, index) => (
    sum + strength * wavelengthSquared / (wavelengthSquared - resonancesSquared[index])
  ), 0));
}

function lithiumNiobateTemperatureShift(wavelengthUm: number, temperatureC: number, extraordinary: boolean): number {
  const temperatureK = temperatureC + 273.15;
  const referenceK = 294.15;
  const a = extraordinary ? -2.6 : 0.89 * wavelengthUm - 2.267;
  const b = extraordinary ? -2.918 * wavelengthUm + 24.244 : -4.377 * wavelengthUm + 9.666;
  return a * 1e-5 * (temperatureK - referenceK) + 0.5 * b * 1e-8 * (temperatureK ** 2 - referenceK ** 2);
}
