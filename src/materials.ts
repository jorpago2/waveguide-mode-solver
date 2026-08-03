export type MaterialId = "custom" | "tabulated" | "air" | "silica" | "silicon" | "germanium" | "silicon-nitride"
  | "arsenic-trisulfide" | "lithium-niobate" | "sapphire" | "magnesium-fluoride" | "aluminum-nitride"
  | "gallium-arsenide" | "indium-phosphide" | "silicon-carbide"
  | "silver" | "gold" | "aluminum";

export type BuiltInMaterialId = Exclude<MaterialId, "custom" | "tabulated">;

export type OpticAxis = "x" | "y" | "z";

export interface MaterialDefinition {
  id: MaterialId;
  name: string;
  formula: string;
  minimumWavelengthUm: number;
  maximumWavelengthUm: number;
  anisotropic?: boolean;
  metallic?: boolean;
  sourceUrl?: string;
  sourceLabel?: string;
}

export interface MaterialAxes {
  nx: number;
  ny: number;
  nz: number;
}

export interface PrincipalMaterialIndices {
  ordinary: number;
  extraordinary: number;
}

export interface ComplexPermittivity {
  real: number;
  imaginary: number;
}

export interface TabulatedMaterialData {
  name: string;
  wavelengthUm: number[];
  refractiveIndex: number[];
  extinctionCoefficient: number[];
}

export interface SymmetricTensor {
  xx: number;
  yy: number;
  zz: number;
  xy: number;
  xz: number;
  yz: number;
}

export const MATERIALS: MaterialDefinition[] = [
  { id: "custom", name: "Custom / linear", formula: "User-defined n, κ and dn/dλ", minimumWavelengthUm: 0.2, maximumWavelengthUm: 1_000 },
  { id: "tabulated", name: "Imported n,k table", formula: "Linear interpolation of wavelength_um,n,k CSV data", minimumWavelengthUm: 0.2, maximumWavelengthUm: 1_000 },
  { id: "air", name: "Air", formula: "n = 1", minimumWavelengthUm: 0.2, maximumWavelengthUm: 1_000 },
  { id: "silica", name: "Fused silica", formula: "Malitson Sellmeier", minimumWavelengthUm: 0.21, maximumWavelengthUm: 3.71, sourceUrl: "https://doi.org/10.1364/JOSA.55.001205", sourceLabel: "Malitson (1965)" },
  { id: "silicon", name: "Crystalline silicon", formula: "Li dispersion at 293 K", minimumWavelengthUm: 1.2, maximumWavelengthUm: 14, sourceUrl: "https://doi.org/10.1063/1.555624", sourceLabel: "Li (1980)" },
  { id: "germanium", name: "Crystalline germanium", formula: "Li dispersion at 293 K", minimumWavelengthUm: 1.9, maximumWavelengthUm: 16, sourceUrl: "https://doi.org/10.1063/1.555624", sourceLabel: "Li (1980)" },
  { id: "silicon-nitride", name: "Stoichiometric Si₃N₄", formula: "Luke Sellmeier", minimumWavelengthUm: 0.31, maximumWavelengthUm: 5.5, sourceUrl: "https://doi.org/10.1364/OL.40.004823", sourceLabel: "Luke et al. (2015)" },
  { id: "arsenic-trisulfide", name: "Arsenic trisulfide (As₂S₃)", formula: "Rodney–Malitson–King Sellmeier at 25 °C", minimumWavelengthUm: 0.57, maximumWavelengthUm: 11.8, sourceUrl: "https://doi.org/10.1364/JOSA.48.000633", sourceLabel: "Rodney et al. (1958)" },
  { id: "lithium-niobate", name: "5% MgO:LiNbO₃", formula: "Zelmon ordinary/extraordinary Sellmeier", minimumWavelengthUm: 0.4, maximumWavelengthUm: 5, anisotropic: true, sourceUrl: "https://doi.org/10.1364/JOSAB.14.003319", sourceLabel: "Zelmon et al. (1997)" },
  { id: "sapphire", name: "Sapphire (Al₂O₃)", formula: "Malitson–Dodge ordinary/extraordinary Sellmeier", minimumWavelengthUm: 0.2, maximumWavelengthUm: 5, anisotropic: true, sourceUrl: "https://opg.optica.org/josa/abstract.cfm?uri=josa-62-11-1405", sourceLabel: "Malitson & Dodge (1972)" },
  { id: "magnesium-fluoride", name: "Magnesium fluoride (MgF₂)", formula: "Dodge ordinary/extraordinary Sellmeier at 19 °C", minimumWavelengthUm: 0.2026, maximumWavelengthUm: 7.04, anisotropic: true, sourceUrl: "https://doi.org/10.1364/AO.23.001980", sourceLabel: "Dodge (1984)" },
  { id: "aluminum-nitride", name: "Aluminum nitride", formula: "Pastrňák ordinary/extraordinary Sellmeier", minimumWavelengthUm: 0.22, maximumWavelengthUm: 5, anisotropic: true, sourceUrl: "https://doi.org/10.1002/pssb.19660140140", sourceLabel: "Pastrňák & Roskovcová (1966)" },
  { id: "gallium-arsenide", name: "Gallium arsenide", formula: "Skauli Sellmeier at 22 °C", minimumWavelengthUm: 0.97, maximumWavelengthUm: 17, sourceUrl: "https://doi.org/10.1063/1.1621740", sourceLabel: "Skauli et al. (2003)" },
  { id: "indium-phosphide", name: "Indium phosphide", formula: "Pettit–Turner Sellmeier", minimumWavelengthUm: 0.95, maximumWavelengthUm: 10, sourceUrl: "https://doi.org/10.1063/1.1714393", sourceLabel: "Pettit & Turner (1965)" },
  { id: "silicon-carbide", name: "4H silicon carbide", formula: "Wang ordinary/extraordinary Sellmeier", minimumWavelengthUm: 0.405, maximumWavelengthUm: 2.325, anisotropic: true, sourceUrl: "https://doi.org/10.1002/lpor.201300068", sourceLabel: "Wang et al. (2013)" },
  { id: "silver", name: "Silver (Ag)", formula: "Lorentz-Drude bulk-metal model", minimumWavelengthUm: 0.207, maximumWavelengthUm: 12.4, metallic: true, sourceUrl: "https://doi.org/10.1364/AO.37.005271", sourceLabel: "Rakic et al. (1998)" },
  { id: "gold", name: "Gold (Au)", formula: "Lorentz-Drude bulk-metal model", minimumWavelengthUm: 0.207, maximumWavelengthUm: 12.4, metallic: true, sourceUrl: "https://doi.org/10.1364/AO.37.005271", sourceLabel: "Rakic et al. (1998)" },
  { id: "aluminum", name: "Aluminum (Al)", formula: "Lorentz-Drude bulk-metal model", minimumWavelengthUm: 0.207, maximumWavelengthUm: 12.4, metallic: true, sourceUrl: "https://doi.org/10.1364/AO.37.005271", sourceLabel: "Rakic et al. (1998)" },
];

export function materialDefinition(id: MaterialId): MaterialDefinition {
  return MATERIALS.find((material) => material.id === id) ?? MATERIALS[0];
}

export function evaluateMaterial(id: BuiltInMaterialId, wavelengthUm: number): number {
  return evaluateMaterialAxes(id, wavelengthUm).nx;
}

export function evaluateMaterialAxes(
  id: BuiltInMaterialId,
  wavelengthUm: number,
  temperatureC = 21,
  opticAxis: OpticAxis = "y",
  electricFieldVPerUm = 0,
): MaterialAxes {
  const { ordinary, extraordinary } = evaluateMaterialPrincipalIndices(id, wavelengthUm, temperatureC, electricFieldVPerUm);
  return opticAxis === "x" ? { nx: extraordinary, ny: ordinary, nz: ordinary }
    : opticAxis === "z" ? { nx: ordinary, ny: ordinary, nz: extraordinary }
      : { nx: ordinary, ny: extraordinary, nz: ordinary };
}

export function evaluateMaterialPrincipalIndices(
  id: BuiltInMaterialId,
  wavelengthUm: number,
  temperatureC = 21,
  electricFieldVPerUm = 0,
): PrincipalMaterialIndices {
  const material = materialDefinition(id);
  if (wavelengthUm < material.minimumWavelengthUm || wavelengthUm > material.maximumWavelengthUm) {
    throw new Error(`${material.name} is valid from ${material.minimumWavelengthUm} to ${material.maximumWavelengthUm} µm.`);
  }
  const wavelengthSquared = wavelengthUm ** 2;
  if (material.metallic) {
    const permittivity = evaluateMetalPermittivity(id as MetalMaterialId, wavelengthUm);
    const n = complexRefractiveIndex(permittivity).n;
    return { ordinary: n, extraordinary: n };
  }
  let ordinary: number;
  let extraordinary: number;
  if (id === "air") ordinary = extraordinary = 1;
  else if (id === "silica") ordinary = extraordinary = Math.sqrt(1
    + 0.6961663 * wavelengthSquared / (wavelengthSquared - 0.0684043 ** 2)
    + 0.4079426 * wavelengthSquared / (wavelengthSquared - 0.1162414 ** 2)
    + 0.8974794 * wavelengthSquared / (wavelengthSquared - 9.896161 ** 2));
  else if (id === "silicon") ordinary = extraordinary = Math.sqrt(11.6858 + 0.939816 / (wavelengthSquared - 0.00810461) + 0.00304347 / (wavelengthSquared - 1.541334));
  else if (id === "germanium") ordinary = extraordinary = Math.sqrt(9.28156
    + 6.72880 * wavelengthSquared / (wavelengthSquared - 0.44105)
    + 0.21307 * wavelengthSquared / (wavelengthSquared - 3870.1));
  else if (id === "silicon-nitride") ordinary = extraordinary = Math.sqrt(1
    + 3.0249 * wavelengthSquared / (wavelengthSquared - 0.1353406 ** 2)
    + 40_314 * wavelengthSquared / (wavelengthSquared - 1_239.842 ** 2));
  else if (id === "arsenic-trisulfide") ordinary = extraordinary = sellmeier(wavelengthSquared,
    [1.8983678, 1.9222979, 0.8765134, 0.1188704, 0.9569903],
    [0.0225, 0.0625, 0.1225, 0.2025, 750]);
  else if (id === "lithium-niobate") {
    ordinary = sellmeier(wavelengthSquared, [2.4272, 1.4617, 9.6536], [0.01478, 0.05612, 371.216]);
    extraordinary = sellmeier(wavelengthSquared, [2.2454, 1.3005, 6.8972], [0.01242, 0.05313, 331.33]);
    ordinary += lithiumNiobateTemperatureShift(wavelengthUm, temperatureC, false);
    extraordinary += lithiumNiobateTemperatureShift(wavelengthUm, temperatureC, true);
    const fieldVPerM = electricFieldVPerUm * 1e6;
    ordinary += -0.5 * ordinary ** 3 * 8.6e-12 * fieldVPerM;
    extraordinary += -0.5 * extraordinary ** 3 * 30.8e-12 * fieldVPerM;
  } else if (id === "sapphire") {
    ordinary = sellmeier(wavelengthSquared, [1.4313493, 0.65054713, 5.3414021], [0.0726631 ** 2, 0.1193242 ** 2, 18.028251 ** 2]);
    extraordinary = sellmeier(wavelengthSquared, [1.5039759, 0.55069141, 6.5927379], [0.0740288 ** 2, 0.1216529 ** 2, 20.072248 ** 2]);
  } else if (id === "magnesium-fluoride") {
    ordinary = sellmeier(wavelengthSquared, [0.48755108, 0.39875031, 2.3120353], [0.04338408 ** 2, 0.09461442 ** 2, 23.793604 ** 2]);
    extraordinary = sellmeier(wavelengthSquared, [0.41344023, 0.50497499, 2.4904862], [0.03684262 ** 2, 0.09076162 ** 2, 23.771995 ** 2]);
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
  return { ordinary, extraordinary };
}

export type MetalMaterialId = "silver" | "gold" | "aluminum";

interface LorentzDrudeModel {
  plasmaEnergyEv: number;
  drude: [strength: number, dampingEv: number];
  oscillators: Array<[strength: number, dampingEv: number, resonanceEv: number]>;
}

const LORENTZ_DRUDE_MODELS: Record<MetalMaterialId, LorentzDrudeModel> = {
  silver: { plasmaEnergyEv: 9.01, drude: [0.845, 0.048], oscillators: [
    [0.065, 3.886, 0.816], [0.124, 0.452, 4.481], [0.011, 0.065, 8.185],
    [0.840, 0.916, 9.083], [5.646, 2.419, 20.29],
  ] },
  gold: { plasmaEnergyEv: 9.03, drude: [0.760, 0.053], oscillators: [
    [0.024, 0.241, 0.415], [0.010, 0.345, 0.830], [0.071, 0.870, 2.969],
    [0.601, 2.494, 4.304], [4.384, 2.214, 13.32],
  ] },
  aluminum: { plasmaEnergyEv: 14.98, drude: [0.523, 0.047], oscillators: [
    [0.227, 0.333, 0.162], [0.050, 0.312, 1.544], [0.166, 1.351, 1.808],
    [0.030, 3.382, 3.473],
  ] },
};

/** Relative permittivity for exp(i beta z - i omega t); passive media have Im(epsilon) > 0. */
export function evaluateMetalPermittivity(id: MetalMaterialId, wavelengthUm: number): ComplexPermittivity {
  const material = materialDefinition(id);
  if (wavelengthUm < material.minimumWavelengthUm || wavelengthUm > material.maximumWavelengthUm) {
    throw new Error(`${material.name} is valid from ${material.minimumWavelengthUm} to ${material.maximumWavelengthUm} µm.`);
  }
  const model = LORENTZ_DRUDE_MODELS[id];
  const photonEnergyEv = 1.239841984 / wavelengthUm;
  const plasmaSquared = model.plasmaEnergyEv ** 2;
  const [drudeStrength, drudeDamping] = model.drude;
  const drude = complexDivide(-drudeStrength * plasmaSquared, 0, photonEnergyEv ** 2, drudeDamping * photonEnergyEv);
  return model.oscillators.reduce((epsilon, [strength, damping, resonance]) => {
    const oscillator = complexDivide(strength * plasmaSquared, 0, resonance ** 2 - photonEnergyEv ** 2, -damping * photonEnergyEv);
    return { real: epsilon.real + oscillator.real, imaginary: epsilon.imaginary + oscillator.imaginary };
  }, { real: 1 + drude.real, imaginary: drude.imaginary });
}

export function complexRefractiveIndex(permittivity: ComplexPermittivity): { n: number; k: number } {
  const magnitude = Math.hypot(permittivity.real, permittivity.imaginary);
  return {
    n: Math.sqrt(Math.max(0, (magnitude + permittivity.real) / 2)),
    k: Math.sqrt(Math.max(0, (magnitude - permittivity.real) / 2)),
  };
}

export function isMetalMaterial(id: MaterialId | undefined): id is MetalMaterialId {
  return Boolean(id && materialDefinition(id).metallic);
}

function complexDivide(aReal: number, aImaginary: number, bReal: number, bImaginary: number): ComplexPermittivity {
  const denominator = bReal ** 2 + bImaginary ** 2;
  return {
    real: (aReal * bReal + aImaginary * bImaginary) / denominator,
    imaginary: (aImaginary * bReal - aReal * bImaginary) / denominator,
  };
}

export function opticAxisDirection(opticAxis: OpticAxis = "y", tiltDeg?: number, azimuthDeg?: number): [number, number, number] {
  if (tiltDeg === undefined && azimuthDeg === undefined) {
    return opticAxis === "x" ? [1, 0, 0] : opticAxis === "z" ? [0, 0, 1] : [0, 1, 0];
  }
  const tilt = (tiltDeg ?? 0) * Math.PI / 180;
  const azimuth = (azimuthDeg ?? 0) * Math.PI / 180;
  return [Math.sin(tilt) * Math.sin(azimuth), Math.cos(tilt), Math.sin(tilt) * Math.cos(azimuth)];
}

export function uniaxialPermittivityTensor(ordinaryIndex: number, extraordinaryIndex: number, axis: [number, number, number]): SymmetricTensor {
  const ordinary = ordinaryIndex ** 2;
  const contrast = extraordinaryIndex ** 2 - ordinary;
  const [x, y, z] = axis;
  return {
    xx: ordinary + contrast * x ** 2,
    yy: ordinary + contrast * y ** 2,
    zz: ordinary + contrast * z ** 2,
    xy: contrast * x * y,
    xz: contrast * x * z,
    yz: contrast * y * z,
  };
}

export function parseMaterialCsv(text: string, name = "Imported material"): TabulatedMaterialData {
  const rows = text.trim().split(/\r?\n/).filter((row) => row.trim());
  if (rows.length < 3) throw new Error("The material CSV needs a header and at least two data rows.");
  if (rows.length > 10_001) throw new Error("The material CSV is limited to 10,000 data rows.");
  const delimiter = rows[0].includes(";") ? ";" : ",";
  const headers = rows[0].split(delimiter).map((header) => header.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  const wavelengthColumn = headers.findIndex((header) => ["wavelengthum", "wavelength", "lambdaum", "lambda"].includes(header));
  const indexColumn = headers.findIndex((header) => ["n", "index", "refractiveindex"].includes(header));
  const extinctionColumn = headers.findIndex((header) => ["k", "kappa", "extinction", "extinctioncoefficient"].includes(header));
  if (wavelengthColumn < 0 || indexColumn < 0) throw new Error("The material CSV header must contain wavelength_um and n columns; k is optional.");
  const data = rows.slice(1).map((row, rowIndex) => {
    const columns = row.split(delimiter).map((value) => value.trim());
    const wavelengthUm = Number(columns[wavelengthColumn]);
    const refractiveIndex = Number(columns[indexColumn]);
    const extinctionCoefficient = extinctionColumn < 0 || columns[extinctionColumn] === "" ? 0 : Number(columns[extinctionColumn]);
    if (!Number.isFinite(wavelengthUm) || !Number.isFinite(refractiveIndex) || !Number.isFinite(extinctionCoefficient)) {
      throw new Error(`Material CSV row ${rowIndex + 2} contains a non-numeric value.`);
    }
    if (wavelengthUm < 0.2 || wavelengthUm > 1_000 || refractiveIndex < 0 || refractiveIndex > 50
      || extinctionCoefficient < 0 || extinctionCoefficient > 50) {
      throw new Error(`Material CSV row ${rowIndex + 2} is outside the supported wavelength, n or k range.`);
    }
    return { wavelengthUm, refractiveIndex, extinctionCoefficient };
  }).sort((first, second) => first.wavelengthUm - second.wavelengthUm);
  if (data.some((entry, index) => index > 0 && entry.wavelengthUm === data[index - 1].wavelengthUm)) {
    throw new Error("Material CSV wavelengths must be unique.");
  }
  return {
    name: (name.replace(/\.csv$/i, "") || "Imported material").slice(0, 120),
    wavelengthUm: data.map((entry) => entry.wavelengthUm),
    refractiveIndex: data.map((entry) => entry.refractiveIndex),
    extinctionCoefficient: data.map((entry) => entry.extinctionCoefficient),
  };
}

export function evaluateTabulatedMaterial(data: TabulatedMaterialData, wavelengthUm: number): { n: number; k: number } {
  validateTabulatedMaterial(data);
  const minimum = data.wavelengthUm[0];
  const maximum = data.wavelengthUm[data.wavelengthUm.length - 1];
  if (wavelengthUm < minimum || wavelengthUm > maximum) {
    throw new Error(`${data.name} is tabulated from ${minimum} to ${maximum} µm; extrapolation is disabled.`);
  }
  const upper = data.wavelengthUm.findIndex((value) => value >= wavelengthUm);
  if (upper <= 0) return { n: data.refractiveIndex[0], k: data.extinctionCoefficient[0] };
  const lower = upper - 1;
  const fraction = (wavelengthUm - data.wavelengthUm[lower]) / (data.wavelengthUm[upper] - data.wavelengthUm[lower]);
  return {
    n: data.refractiveIndex[lower] + fraction * (data.refractiveIndex[upper] - data.refractiveIndex[lower]),
    k: data.extinctionCoefficient[lower] + fraction * (data.extinctionCoefficient[upper] - data.extinctionCoefficient[lower]),
  };
}

export function validateTabulatedMaterial(data: TabulatedMaterialData | undefined): void {
  if (!data || !data.name?.trim() || data.name.length > 120 || !Array.isArray(data.wavelengthUm) || !Array.isArray(data.refractiveIndex)
    || !Array.isArray(data.extinctionCoefficient) || data.wavelengthUm.length < 2
    || data.wavelengthUm.length > 10_000
    || data.refractiveIndex.length !== data.wavelengthUm.length || data.extinctionCoefficient.length !== data.wavelengthUm.length) {
    throw new Error("The imported material table is incomplete.");
  }
  for (let index = 0; index < data.wavelengthUm.length; index += 1) {
    const wavelength = data.wavelengthUm[index];
    const refractiveIndex = data.refractiveIndex[index];
    const extinction = data.extinctionCoefficient[index];
    if (!Number.isFinite(wavelength) || !Number.isFinite(refractiveIndex) || !Number.isFinite(extinction)
      || wavelength < 0.2 || wavelength > 1_000 || refractiveIndex < 0 || refractiveIndex > 50 || extinction < 0 || extinction > 50
      || (index > 0 && wavelength <= data.wavelengthUm[index - 1])) {
      throw new Error("The imported material table must contain strictly increasing, finite wavelength, n and k values within the supported ranges.");
    }
  }
}

function sellmeier(wavelengthSquared: number, strengths: number[], resonancesSquared: number[]): number {
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
