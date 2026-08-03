import type { ComplexPermittivity } from "./materials";

interface ComplexValue { real: number; imaginary: number }

export interface ComplexPlanarMode {
  effectiveIndex: ComplexValue;
  residual: number;
  iterations: number;
}

/** Fundamental even TE mode of a symmetric, lossless dielectric slab. */
export function symmetricSlabTe0EffectiveIndex(
  wavelengthUm: number,
  thicknessUm: number,
  coreIndex: number,
  claddingIndex: number,
): number {
  if (!(wavelengthUm > 0 && thicknessUm > 0 && coreIndex > claddingIndex && claddingIndex > 0)) {
    throw new Error("The slab benchmark requires positive dimensions and core index above cladding index.");
  }
  const k0 = 2 * Math.PI / wavelengthUm;
  const residual = (effectiveIndex: number) => {
    const transverseCore = k0 * Math.sqrt(Math.max(0, coreIndex ** 2 - effectiveIndex ** 2));
    const decay = k0 * Math.sqrt(Math.max(0, effectiveIndex ** 2 - claddingIndex ** 2));
    return transverseCore * thicknessUm - 2 * Math.atan2(decay, transverseCore);
  };
  let lower = claddingIndex + 1e-12;
  let upper = coreIndex - 1e-12;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (residual(middle) > 0) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

/** Even-H TM mode of a symmetric three-layer MIM or IMI slab. */
export function symmetricPlanarTmMode(
  wavelengthUm: number,
  layerThicknessUm: number,
  layerPermittivity: ComplexPermittivity,
  claddingPermittivity: ComplexPermittivity,
  initialEffectiveIndex?: ComplexValue,
): ComplexPlanarMode {
  if (!(wavelengthUm > 0 && layerThicknessUm > 0)) throw new Error("Planar benchmark dimensions must be positive.");
  const k0 = 2 * Math.PI / wavelengthUm;
  let effectiveIndex = initialEffectiveIndex ?? singleInterfaceIndex(layerPermittivity, claddingPermittivity);
  const equation = (index: ComplexValue): ComplexValue => {
    const betaSquared = multiply(index, index);
    const layerDecay = squareRoot(subtract(betaSquared, layerPermittivity));
    const claddingDecay = squareRoot(subtract(betaSquared, claddingPermittivity));
    const hyperbolic = tanh(scale(layerDecay, k0 * layerThicknessUm / 2));
    return add(hyperbolic, divide(
      multiply(layerPermittivity, claddingDecay),
      multiply(claddingPermittivity, layerDecay),
    ));
  };
  let residual = equation(effectiveIndex);
  let iteration = 0;
  for (; iteration < 60 && magnitude(residual) > 1e-10; iteration += 1) {
    const step = 1e-6 * Math.max(1, magnitude(effectiveIndex));
    const derivative = scale(subtract(
      equation(add(effectiveIndex, { real: step, imaginary: 0 })),
      equation(add(effectiveIndex, { real: -step, imaginary: 0 })),
    ), 1 / (2 * step));
    if (magnitude(derivative) < 1e-14) break;
    effectiveIndex = subtract(effectiveIndex, divide(residual, derivative));
    residual = equation(effectiveIndex);
  }
  return { effectiveIndex, residual: magnitude(residual), iterations: iteration };
}

function singleInterfaceIndex(first: ComplexValue, second: ComplexValue): ComplexValue {
  return squareRoot(divide(multiply(first, second), add(first, second)));
}

function add(first: ComplexValue, second: ComplexValue): ComplexValue {
  return { real: first.real + second.real, imaginary: first.imaginary + second.imaginary };
}

function subtract(first: ComplexValue, second: ComplexValue): ComplexValue {
  return { real: first.real - second.real, imaginary: first.imaginary - second.imaginary };
}

function scale(value: ComplexValue, factor: number): ComplexValue {
  return { real: value.real * factor, imaginary: value.imaginary * factor };
}

function multiply(first: ComplexValue, second: ComplexValue): ComplexValue {
  return {
    real: first.real * second.real - first.imaginary * second.imaginary,
    imaginary: first.real * second.imaginary + first.imaginary * second.real,
  };
}

function divide(numerator: ComplexValue, denominator: ComplexValue): ComplexValue {
  const norm = denominator.real ** 2 + denominator.imaginary ** 2;
  return {
    real: (numerator.real * denominator.real + numerator.imaginary * denominator.imaginary) / norm,
    imaginary: (numerator.imaginary * denominator.real - numerator.real * denominator.imaginary) / norm,
  };
}

function squareRoot(value: ComplexValue): ComplexValue {
  const modulus = magnitude(value);
  const root = {
    real: Math.sqrt(Math.max(0, (modulus + value.real) / 2)),
    imaginary: Math.sign(value.imaginary || 1) * Math.sqrt(Math.max(0, (modulus - value.real) / 2)),
  };
  return root.real < 0 ? scale(root, -1) : root;
}

function tanh(value: ComplexValue): ComplexValue {
  const denominator = Math.cosh(2 * value.real) + Math.cos(2 * value.imaginary);
  return { real: Math.sinh(2 * value.real) / denominator, imaginary: Math.sin(2 * value.imaginary) / denominator };
}

function magnitude(value: ComplexValue): number {
  return Math.hypot(value.real, value.imaginary);
}
