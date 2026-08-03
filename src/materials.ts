export type MaterialId = "custom" | "tabulated" | "air" | "silica" | "silicon" | "germanium" | "silicon-nitride"
  | "arsenic-trisulfide" | "lithium-niobate" | "sapphire" | "magnesium-fluoride" | "aluminum-nitride"
  | "gallium-arsenide" | "indium-phosphide" | "silicon-carbide" | "diamond" | "gallium-nitride"
  | "calcium-fluoride" | "pmma" | "arsenic-selenide"
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
  lossModel?: string;
  lossRanges?: Array<[minimumUm: number, maximumUm: number]>;
  lossSources?: Array<{ label: string; url: string }>;
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
  { id: "silicon", name: "Crystalline silicon", formula: "Li dispersion at 293 K", minimumWavelengthUm: 1.2, maximumWavelengthUm: 14, lossModel: "Green band-edge and Chandler-Horowitz mid-IR k", lossRanges: [[1.2, 1.45], [6.25, 14]], lossSources: [{ label: "Green (2008)", url: "https://doi.org/10.1016/j.solmat.2008.06.009" }, { label: "Chandler-Horowitz & Amirtharaj (2005)", url: "https://doi.org/10.1063/1.1923612" }], sourceUrl: "https://doi.org/10.1063/1.555624", sourceLabel: "Li (1980)" },
  { id: "germanium", name: "Crystalline germanium", formula: "Li dispersion at 293 K", minimumWavelengthUm: 1.9, maximumWavelengthUm: 16, lossModel: "Nunley near-band-edge k at 300 K", lossRanges: [[1.9, 2.2]], lossSources: [{ label: "Nunley et al. (2016)", url: "https://doi.org/10.1116/1.4963075" }], sourceUrl: "https://doi.org/10.1063/1.555624", sourceLabel: "Li (1980)" },
  { id: "silicon-nitride", name: "Stoichiometric Si₃N₄", formula: "Luke Sellmeier", minimumWavelengthUm: 0.31, maximumWavelengthUm: 5.5, sourceUrl: "https://doi.org/10.1364/OL.40.004823", sourceLabel: "Luke et al. (2015)" },
  { id: "arsenic-trisulfide", name: "Arsenic trisulfide (As₂S₃)", formula: "Rodney–Malitson–King Sellmeier at 25 °C", minimumWavelengthUm: 0.57, maximumWavelengthUm: 11.8, lossModel: "AMTIR-6 absorption data at 25 °C", lossRanges: [[0.6439, 8]], lossSources: [{ label: "AMTIR-6 data sheet", url: "https://refractiveindex.info/download/data/2012/AMTIR-6%20Information.pdf" }], sourceUrl: "https://doi.org/10.1364/JOSA.48.000633", sourceLabel: "Rodney et al. (1958)" },
  { id: "lithium-niobate", name: "5% MgO:LiNbO₃", formula: "Zelmon ordinary/extraordinary Sellmeier", minimumWavelengthUm: 0.4, maximumWavelengthUm: 5, anisotropic: true, sourceUrl: "https://doi.org/10.1364/JOSAB.14.003319", sourceLabel: "Zelmon et al. (1997)" },
  { id: "sapphire", name: "Sapphire (Al₂O₃)", formula: "Malitson–Dodge ordinary/extraordinary Sellmeier", minimumWavelengthUm: 0.2, maximumWavelengthUm: 5, anisotropic: true, sourceUrl: "https://opg.optica.org/josa/abstract.cfm?uri=josa-62-11-1405", sourceLabel: "Malitson & Dodge (1972)" },
  { id: "magnesium-fluoride", name: "Magnesium fluoride (MgF₂)", formula: "Dodge ordinary/extraordinary Sellmeier at 19 °C", minimumWavelengthUm: 0.2026, maximumWavelengthUm: 7.04, anisotropic: true, sourceUrl: "https://doi.org/10.1364/AO.23.001980", sourceLabel: "Dodge (1984)" },
  { id: "aluminum-nitride", name: "Aluminum nitride", formula: "Pastrňák ordinary/extraordinary Sellmeier", minimumWavelengthUm: 0.22, maximumWavelengthUm: 5, anisotropic: true, sourceUrl: "https://doi.org/10.1002/pssb.19660140140", sourceLabel: "Pastrňák & Roskovcová (1966)" },
  { id: "gallium-arsenide", name: "Gallium arsenide", formula: "Skauli Sellmeier at 22 °C", minimumWavelengthUm: 0.97, maximumWavelengthUm: 17, sourceUrl: "https://doi.org/10.1063/1.1621740", sourceLabel: "Skauli et al. (2003)" },
  { id: "indium-phosphide", name: "Indium phosphide", formula: "Pettit–Turner Sellmeier", minimumWavelengthUm: 0.95, maximumWavelengthUm: 10, sourceUrl: "https://doi.org/10.1063/1.1714393", sourceLabel: "Pettit & Turner (1965)" },
  { id: "silicon-carbide", name: "4H silicon carbide", formula: "Wang ordinary/extraordinary Sellmeier", minimumWavelengthUm: 0.405, maximumWavelengthUm: 2.325, anisotropic: true, sourceUrl: "https://doi.org/10.1002/lpor.201300068", sourceLabel: "Wang et al. (2013)" },
  { id: "diamond", name: "CVD diamond (type IIa)", formula: "Turri one-term Sellmeier", minimumWavelengthUm: 0.3, maximumWavelengthUm: 1.65, sourceUrl: "https://doi.org/10.1364/OME.7.000855", sourceLabel: "Turri et al. (2017)" },
  { id: "gallium-nitride", name: "Wurtzite gallium nitride", formula: "Barker–Ilegems ordinary/extraordinary Sellmeier at 300 K", minimumWavelengthUm: 0.35, maximumWavelengthUm: 10, anisotropic: true, sourceUrl: "https://doi.org/10.1103/PhysRevB.7.743", sourceLabel: "Barker & Ilegems (1973)" },
  { id: "calcium-fluoride", name: "Calcium fluoride (CaF₂)", formula: "Malitson Sellmeier at 24 °C", minimumWavelengthUm: 0.23, maximumWavelengthUm: 9.7, sourceUrl: "https://doi.org/10.1364/AO.2.001103", sourceLabel: "Malitson (1963)" },
  { id: "pmma", name: "PMMA (bulk optical polymer)", formula: "Sultanova one-term Sellmeier at 20 °C", minimumWavelengthUm: 0.4368, maximumWavelengthUm: 1.052, sourceUrl: "https://doi.org/10.12693/APhysPolA.116.585", sourceLabel: "Sultanova et al. (2009)" },
  { id: "arsenic-selenide", name: "Arsenic selenide glass (As₄₀Se₆₀)", formula: "Dantanarayana two-term Sellmeier", minimumWavelengthUm: 0.7, maximumWavelengthUm: 11.7, sourceUrl: "https://doi.org/10.1364/OME.4.001444", sourceLabel: "Dantanarayana et al. (2014)" },
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
  else if (id === "diamond") ordinary = extraordinary = Math.sqrt(1 + 4.658 * wavelengthSquared / (wavelengthSquared - 0.1125 ** 2));
  else if (id === "gallium-nitride") {
    ordinary = Math.sqrt(1 + 2.60 + 1.75 * wavelengthSquared / (wavelengthSquared - 0.256 ** 2)
      + 4.1 * wavelengthSquared / (wavelengthSquared - 17.86 ** 2));
    extraordinary = Math.sqrt(1 + 4.35 + 5.08 * wavelengthSquared / (wavelengthSquared - 18.76 ** 2));
  } else if (id === "calcium-fluoride") ordinary = extraordinary = sellmeier(wavelengthSquared,
    [0.5675888, 0.4710914, 3.8484723], [0.050263605 ** 2, 0.1003909 ** 2, 34.649040 ** 2]);
  else if (id === "pmma") ordinary = extraordinary = Math.sqrt(1 + 1.1819 * wavelengthSquared / (wavelengthSquared - 0.011313));
  else if (id === "arsenic-selenide") ordinary = extraordinary = Math.sqrt(3.3344
    + 3.3105 * wavelengthSquared / (wavelengthSquared - 0.43834 ** 2)
    + 0.89672 * wavelengthSquared / (wavelengthSquared - 41.395 ** 2));
  else {
    ordinary = Math.sqrt(1
      + 0.20075 * wavelengthSquared / (wavelengthSquared + 12.07224)
      + 5.54861 * wavelengthSquared / (wavelengthSquared - 0.02641)
      + 35.65066 * wavelengthSquared / (wavelengthSquared - 1268.24708));
    extraordinary = Math.sqrt(6.79485 + 0.15558 / (wavelengthSquared - 0.03535) - 0.02296 * wavelengthSquared);
  }
  return { ordinary, extraordinary };
}

const SILICON_LOSS: Array<[number, number]> = [
  [1.2, 2.1008e-7], [1.25, 9.9472e-9], [1.3, 4.6553e-10], [1.35, 1.8263e-11], [1.4, 1.5597e-12], [1.45, 1.3846e-13],
  [6.25, 2.67e-6], [6.5, 2.23e-6], [7, 2.4254025951577572e-5], [7.5, 2.1065189050515086e-5], [8, 2.01e-5],
  [8.5, 4.1610125548530126e-5], [9, 7.557759159628781e-5], [9.5, 4.688272083033315e-5], [10, 7.4e-5],
  [10.5, 1.2519018614610223e-4], [11, 1.8980556179712711e-4], [11.5, 2.0534525758065055e-4],
  [12, 1.512556714286768e-4], [12.5, 1.68e-4], [13, 2.261473032298921e-4], [13.5, 3.2773572157203769e-4], [14, 1.6410956610270425e-4],
];

const GERMANIUM_LOSS: Array<[number, number]> = [
  [1.9, 2.558362305135162e-5], [1.95, 1.0942047256596234e-5], [2, 4.634e-6], [2.05, 1.9153838011317644e-6],
  [2.1, 7.828969879207351e-7], [2.15, 3.2514059394482003e-7], [2.2, 0],
];

const ARSENIC_TRISULFIDE_ABSORPTION: Array<[number, number]> = [
  [0.6439, 0.42], [0.7065, 0.13], [1.014, 0.01], [1.53, 0.01], [1.97, 0.01],
  [3, 0.03], [4, 0.03], [5, 0.006], [6, 0.005], [7, 0.02], [8, 0.036],
];

/** Built-in extinction data. Undefined means that the user-supplied k is retained rather than extrapolated. */
export function evaluateMaterialExtinction(id: BuiltInMaterialId, wavelengthUm: number): number | undefined {
  if (isMetalMaterial(id)) return complexRefractiveIndex(evaluateMetalPermittivity(id, wavelengthUm)).k;
  if (id === "silicon") {
    if (wavelengthUm >= 1.2 && wavelengthUm <= 1.45) return interpolatePositive(SILICON_LOSS.slice(0, 6), wavelengthUm);
    if (wavelengthUm >= 6.25 && wavelengthUm <= 14) return interpolatePositive(SILICON_LOSS.slice(6), wavelengthUm);
  }
  if (id === "germanium" && wavelengthUm >= 1.9 && wavelengthUm <= 2.2) return interpolatePositive(GERMANIUM_LOSS, wavelengthUm);
  if (id === "arsenic-trisulfide" && wavelengthUm >= 0.6439 && wavelengthUm <= 8) {
    const absorptionCm = interpolatePositive(ARSENIC_TRISULFIDE_ABSORPTION, wavelengthUm);
    return absorptionCm * wavelengthUm * 1e-4 / (4 * Math.PI);
  }
  return undefined;
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

function interpolatePositive(points: Array<[number, number]>, wavelengthUm: number): number {
  const upper = points.findIndex(([wavelength]) => wavelength >= wavelengthUm);
  if (upper <= 0) return points[0][1];
  const [x0, y0] = points[upper - 1];
  const [x1, y1] = points[upper];
  const fraction = (wavelengthUm - x0) / (x1 - x0);
  return y0 > 0 && y1 > 0
    ? Math.exp(Math.log(y0) + fraction * (Math.log(y1) - Math.log(y0)))
    : y0 + fraction * (y1 - y0);
}

function lithiumNiobateTemperatureShift(wavelengthUm: number, temperatureC: number, extraordinary: boolean): number {
  const temperatureK = temperatureC + 273.15;
  const referenceK = 294.15;
  const a = extraordinary ? -2.6 : 0.89 * wavelengthUm - 2.267;
  const b = extraordinary ? -2.918 * wavelengthUm + 24.244 : -4.377 * wavelengthUm + 9.666;
  return a * 1e-5 * (temperatureK - referenceK) + 0.5 * b * 1e-8 * (temperatureK ** 2 - referenceK ** 2);
}
