import { describe, expect, it } from "vitest";
import { createCrossSectionPreviewModel } from "./CrossSectionPreview";
import type { WaveguideConfig } from "./solver";

const base: WaveguideConfig = {
  wavelengthUm: 1.55,
  widthUm: 1,
  heightUm: 0.4,
  coreIndex: 2,
  claddingIndex: 1.44,
  paddingUm: 1,
  gridResolution: 64,
  modeCount: 2,
  coreMaterial: "silicon-nitride",
  claddingMaterial: "silica",
};

describe("live cross-section preview", () => {
  it("represents a channel with the configured physical dimensions", () => {
    const model = createCrossSectionPreviewModel({ ...base, geometry: "channel", sidewallAngleDeg: 90 });
    const core = model.regions.find(({ id }) => id === "core");
    expect(core?.points).toEqual([
      { x: -0.5, y: 0.2 },
      { x: 0.5, y: 0.2 },
      { x: 0.5, y: -0.2 },
      { x: -0.5, y: -0.2 },
    ]);
    expect(model.widthUm).toBe(1);
    expect(model.heightUm).toBe(0.4);
  });

  it("shows independent rails and the configured gap for slot and coupler geometries", () => {
    const slot = createCrossSectionPreviewModel({ ...base, geometry: "slot", slotGapUm: 0.2 });
    expect(slot.regions.filter(({ role }) => role === "core")).toHaveLength(2);
    expect(slot.detail).toBe("slot 0.20 µm");

    const coupler = createCrossSectionPreviewModel({ ...base, geometry: "coupler", couplerGapUm: 0.3 });
    expect(coupler.regions.filter(({ role }) => role === "core")).toHaveLength(2);
    expect(coupler.widthDimension.x2 - coupler.widthDimension.x1).toBeCloseTo(1);
    expect(coupler.detail).toBe("gap 0.30 µm");
  });

  it("includes finite stack layers, substrate and arbitrary polygon regions", () => {
    const stack = createCrossSectionPreviewModel({
      ...base,
      geometry: "multilayer",
      substrateMaterial: "silicon",
      stackLayers: [{ name: "Oxide", thicknessUm: 0.2, material: "silica", index: 1.44 }],
    });
    expect(stack.regions.some(({ role }) => role === "layer")).toBe(true);
    expect(stack.regions.some(({ role }) => role === "substrate")).toBe(true);

    const polygon = createCrossSectionPreviewModel({
      ...base,
      geometry: "polygon",
      polygonRegions: [{
        name: "Triangle",
        material: "silicon",
        index: 3.48,
        vertices: [{ xUm: -0.5, yUm: -0.2 }, { xUm: 0.5, yUm: -0.2 }, { xUm: 0, yUm: 0.2 }],
      }],
    });
    expect(polygon.regions[0].points).toHaveLength(3);
    expect(polygon.legend.some(({ label }) => label === "Triangle")).toBe(true);
  });
});
