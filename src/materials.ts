export type MaterialId = "custom" | "air" | "silica" | "silicon" | "silicon-nitride";

export interface MaterialDefinition {
  id: MaterialId;
  name: string;
  formula: string;
  minimumWavelengthUm: number;
  maximumWavelengthUm: number;
  sourceUrl?: string;
  sourceLabel?: string;
}

export const MATERIALS: MaterialDefinition[] = [
  { id: "custom", name: "Custom / linear", formula: "User-defined n, κ and dn/dλ", minimumWavelengthUm: 0.2, maximumWavelengthUm: 1_000 },
  { id: "air", name: "Air", formula: "n = 1", minimumWavelengthUm: 0.2, maximumWavelengthUm: 1_000 },
  { id: "silica", name: "Fused silica", formula: "Malitson Sellmeier", minimumWavelengthUm: 0.21, maximumWavelengthUm: 3.71, sourceUrl: "https://doi.org/10.1364/JOSA.55.001205", sourceLabel: "Malitson (1965)" },
  { id: "silicon", name: "Crystalline silicon", formula: "Li dispersion at 293 K", minimumWavelengthUm: 1.2, maximumWavelengthUm: 14, sourceUrl: "https://doi.org/10.1063/1.555624", sourceLabel: "Li (1980)" },
  { id: "silicon-nitride", name: "Stoichiometric Si₃N₄", formula: "Luke Sellmeier", minimumWavelengthUm: 0.31, maximumWavelengthUm: 5.5, sourceUrl: "https://doi.org/10.1364/OL.40.004823", sourceLabel: "Luke et al. (2015)" },
];

export function materialDefinition(id: MaterialId): MaterialDefinition {
  return MATERIALS.find((material) => material.id === id) ?? MATERIALS[0];
}

export function evaluateMaterial(id: Exclude<MaterialId, "custom">, wavelengthUm: number): number {
  const material = materialDefinition(id);
  if (wavelengthUm < material.minimumWavelengthUm || wavelengthUm > material.maximumWavelengthUm) {
    throw new Error(`${material.name} is valid from ${material.minimumWavelengthUm} to ${material.maximumWavelengthUm} µm.`);
  }
  const wavelengthSquared = wavelengthUm ** 2;
  if (id === "air") return 1;
  if (id === "silica") {
    return Math.sqrt(1
      + 0.6961663 * wavelengthSquared / (wavelengthSquared - 0.0684043 ** 2)
      + 0.4079426 * wavelengthSquared / (wavelengthSquared - 0.1162414 ** 2)
      + 0.8974794 * wavelengthSquared / (wavelengthSquared - 9.896161 ** 2));
  }
  if (id === "silicon") {
    return Math.sqrt(11.6858 + 0.939816 / (wavelengthSquared - 0.00810461) + 0.00304347 / (wavelengthSquared - 1.541334));
  }
  return Math.sqrt(1
    + 3.0249 * wavelengthSquared / (wavelengthSquared - 0.1353406 ** 2)
    + 40_314 * wavelengthSquared / (wavelengthSquared - 1_239.842 ** 2));
}
