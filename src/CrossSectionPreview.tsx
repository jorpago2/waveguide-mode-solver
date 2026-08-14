import { materialDefinition, type MaterialId } from "./materials";
import type { GeometryType, WaveguideConfig } from "./solver";

interface PreviewPoint {
  x: number;
  y: number;
}

export interface PreviewRegion {
  id: string;
  label: string;
  material: MaterialId;
  role: "core" | "layer" | "substrate" | "polygon";
  points: PreviewPoint[];
  colorIndex: number;
}

export interface CrossSectionPreviewModel {
  geometry: GeometryType;
  geometryLabel: string;
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number };
  regions: PreviewRegion[];
  legend: Array<{ id: string; label: string; material: MaterialId; role: PreviewRegion["role"] | "cladding"; colorIndex: number }>;
  widthUm: number;
  heightUm: number;
  widthDimension: { x1: number; x2: number; y: number };
  heightDimension: { x: number; y1: number; y2: number };
  detail?: string;
}

const GEOMETRY_LABELS: Record<GeometryType, string> = {
  channel: "Channel",
  rib: "Rib",
  slot: "Slot",
  coupler: "Two-guide coupler",
  multilayer: "Multilayer ridge",
  polygon: "Polygon regions",
};

function positiveFinite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

function trapezoid(centerX: number, topWidth: number, bottomWidth: number, bottomY: number, topY: number): PreviewPoint[] {
  return [
    { x: centerX - topWidth / 2, y: topY },
    { x: centerX + topWidth / 2, y: topY },
    { x: centerX + bottomWidth / 2, y: bottomY },
    { x: centerX - bottomWidth / 2, y: bottomY },
  ];
}

function rectangle(x1: number, x2: number, y1: number, y2: number): PreviewPoint[] {
  return [{ x: x1, y: y2 }, { x: x2, y: y2 }, { x: x2, y: y1 }, { x: x1, y: y1 }];
}

function pointBounds(points: PreviewPoint[]) {
  return {
    xMin: Math.min(...points.map(({ x }) => x)),
    xMax: Math.max(...points.map(({ x }) => x)),
    yMin: Math.min(...points.map(({ y }) => y)),
    yMax: Math.max(...points.map(({ y }) => y)),
  };
}

function uniqueLegend(regions: PreviewRegion[], claddingMaterial: MaterialId) {
  const entries: CrossSectionPreviewModel["legend"] = [{
    id: "cladding",
    label: "Cladding",
    material: claddingMaterial,
    role: "cladding",
    colorIndex: 0,
  }];
  for (const region of regions) {
    if (entries.some(({ id }) => id === region.id)) continue;
    entries.push({ id: region.id, label: region.label, material: region.material, role: region.role, colorIndex: region.colorIndex });
  }
  return entries;
}

export function createCrossSectionPreviewModel(config: WaveguideConfig): CrossSectionPreviewModel {
  const geometry = config.geometry ?? "channel";
  const widthUm = positiveFinite(config.widthUm, 1);
  const heightUm = positiveFinite(config.heightUm, 0.4);
  const coreBottom = -heightUm / 2;
  const coreTop = heightUm / 2;
  const angleDeg = Math.min(90, Math.max(20, positiveFinite(config.sidewallAngleDeg, 90)));
  const etchedHeight = geometry === "rib"
    ? Math.max(0, heightUm - Math.min(heightUm, positiveFinite(config.slabHeightUm, heightUm / 2)))
    : heightUm;
  const sidewallExpansion = ["slot", "polygon"].includes(geometry)
    ? 0
    : etchedHeight / Math.tan(angleDeg * Math.PI / 180);
  const bottomWidth = widthUm + 2 * sidewallExpansion;
  const coreMaterial = config.coreMaterial ?? "custom";
  const claddingMaterial = config.claddingMaterial ?? "custom";
  const substrateMaterial = config.substrateMaterial ?? claddingMaterial;
  const regions: PreviewRegion[] = [];
  let detail: string | undefined;

  const addCore = (id: string, label: string, points: PreviewPoint[], colorIndex = 0) => regions.push({
    id,
    label,
    material: coreMaterial,
    role: "core",
    points,
    colorIndex,
  });

  if (geometry === "polygon") {
    for (const [index, region] of (config.polygonRegions ?? []).entries()) {
      const points = region.vertices
        .filter(({ xUm, yUm }) => Number.isFinite(xUm) && Number.isFinite(yUm))
        .map(({ xUm, yUm }) => ({ x: xUm, y: yUm }));
      if (points.length < 3) continue;
      regions.push({
        id: `polygon-${index}`,
        label: region.name || `Region ${index + 1}`,
        material: region.material,
        role: "polygon",
        points,
        colorIndex: index,
      });
    }
    detail = `${regions.length} region${regions.length === 1 ? "" : "s"}`;
  } else if (geometry === "rib") {
    const slabHeight = Math.min(heightUm, positiveFinite(config.slabHeightUm, heightUm / 2));
    const slabTop = coreBottom + slabHeight;
    addCore("core", "Core", trapezoid(0, widthUm, bottomWidth, slabTop, coreTop));
    regions.push({
      id: "slab",
      label: "Core slab",
      material: coreMaterial,
      role: "core",
      points: [],
      colorIndex: 0,
    });
    detail = `slab ${slabHeight.toFixed(2)} µm`;
  } else if (geometry === "slot") {
    const gap = Math.min(widthUm, positiveFinite(config.slotGapUm, widthUm / 5));
    addCore("core", "Core rails", rectangle(-widthUm / 2, -gap / 2, coreBottom, coreTop));
    addCore("core", "Core rails", rectangle(gap / 2, widthUm / 2, coreBottom, coreTop));
    detail = `slot ${gap.toFixed(2)} µm`;
  } else if (geometry === "coupler") {
    const gap = positiveFinite(config.couplerGapUm, widthUm / 2);
    const offset = gap / 2 + widthUm / 2;
    addCore("core", "Guide cores", trapezoid(-offset, widthUm, bottomWidth, coreBottom, coreTop));
    addCore("core", "Guide cores", trapezoid(offset, widthUm, bottomWidth, coreBottom, coreTop));
    detail = `gap ${gap.toFixed(2)} µm`;
  } else {
    addCore("core", "Core", trapezoid(0, widthUm, bottomWidth, coreBottom, coreTop));
  }

  const shapePoints = regions.flatMap(({ points }) => points);
  const fallbackPoints = rectangle(-widthUm / 2, widthUm / 2, coreBottom, coreTop);
  const preliminary = pointBounds(shapePoints.length > 0 ? shapePoints : fallbackPoints);
  const stackLayers = geometry === "polygon" ? [] : (config.stackLayers ?? []);
  const substrateActive = geometry !== "polygon" && (geometry === "multilayer" || stackLayers.length > 0);
  let stackTop = coreBottom;
  const layerBands = stackLayers.map((layer, index) => {
    const thickness = positiveFinite(layer.thicknessUm, 0.1);
    const bottom = stackTop - thickness;
    const band = { layer, index, top: stackTop, bottom };
    stackTop = bottom;
    return band;
  });
  const geometryHeight = Math.max(0.1, preliminary.yMax - Math.min(preliminary.yMin, stackTop));
  const substrateBottom = substrateActive ? stackTop - Math.max(heightUm * 0.7, geometryHeight * 0.35) : preliminary.yMin;

  let xMin = preliminary.xMin;
  let xMax = preliminary.xMax;
  let yMin = Math.min(preliminary.yMin, substrateBottom);
  let yMax = preliminary.yMax;
  const xSpan = Math.max(0.1, xMax - xMin);
  const ySpan = Math.max(0.1, yMax - yMin);
  xMin -= Math.max(0.08, xSpan * 0.32);
  xMax += Math.max(0.08, xSpan * 0.32);
  yMin -= Math.max(0.06, ySpan * 0.2);
  yMax += Math.max(0.08, ySpan * 0.32);

  const targetAspect = 2.15;
  const expandedXSpan = xMax - xMin;
  const expandedYSpan = yMax - yMin;
  if (expandedXSpan / expandedYSpan < targetAspect) {
    const expansion = (targetAspect * expandedYSpan - expandedXSpan) / 2;
    xMin -= expansion;
    xMax += expansion;
  } else {
    const expansion = (expandedXSpan / targetAspect - expandedYSpan) / 2;
    yMin -= expansion;
    yMax += expansion;
  }

  if (geometry === "rib") {
    const slab = regions.find(({ id }) => id === "slab");
    const slabHeight = Math.min(heightUm, positiveFinite(config.slabHeightUm, heightUm / 2));
    if (slab) slab.points = rectangle(xMin, xMax, coreBottom, coreBottom + slabHeight);
  }

  layerBands.forEach(({ layer, index, top, bottom }) => regions.unshift({
    id: `layer-${index}`,
    label: layer.name || `Layer ${index + 1}`,
    material: layer.material,
    role: "layer",
    points: rectangle(xMin, xMax, bottom, top),
    colorIndex: index,
  }));
  if (substrateActive) regions.unshift({
    id: "substrate",
    label: "Base substrate",
    material: substrateMaterial,
    role: "substrate",
    points: rectangle(xMin, xMax, yMin, stackTop),
    colorIndex: 0,
  });

  const widthCenter = geometry === "coupler"
    ? -(positiveFinite(config.couplerGapUm, widthUm / 2) / 2 + widthUm / 2)
    : 0;

  return {
    geometry,
    geometryLabel: GEOMETRY_LABELS[geometry],
    bounds: { xMin, xMax, yMin, yMax },
    regions,
    legend: uniqueLegend(regions, claddingMaterial),
    widthUm,
    heightUm,
    widthDimension: { x1: widthCenter - widthUm / 2, x2: widthCenter + widthUm / 2, y: coreTop },
    heightDimension: { x: preliminary.xMax, y1: coreBottom, y2: coreTop },
    detail,
  };
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function CrossSectionPreview({ config }: { config: WaveguideConfig }) {
  const model = createCrossSectionPreviewModel(config);
  const { xMin, xMax, yMin, yMax } = model.bounds;
  const plot = { x: 18, y: 18, width: 324, height: 152 };
  const mapX = (x: number) => plot.x + (x - xMin) / (xMax - xMin) * plot.width;
  const mapY = (y: number) => plot.y + (yMax - y) / (yMax - yMin) * plot.height;
  const points = (region: PreviewRegion) => region.points.map(({ x, y }) => `${mapX(x)},${mapY(y)}`).join(" ");
  const widthY = Math.max(plot.y + 10, mapY(model.widthDimension.y) - 13);
  const heightX = Math.min(plot.x + plot.width - 11, mapX(model.heightDimension.x) + 14);
  const description = `${model.geometryLabel} cross-section, ${formatNumber(model.widthUm)} by ${formatNumber(model.heightUm)} micrometres${model.detail ? `, ${model.detail}` : ""}.`;

  return (
    <figure className="cross-section-preview">
      <div className="cross-section-preview__heading">
        <strong>Live cross-section</strong>
        <span>x–y plane · geometry to scale</span>
      </div>
      <svg className="cross-section-preview__canvas" viewBox="0 0 360 188" role="img" aria-label={description}>
        <defs>
          <marker id="preview-dimension-arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
            <path d="M 0 0 L 6 3 L 0 6 z" />
          </marker>
        </defs>
        <rect className="cross-section-preview__cladding" x={plot.x} y={plot.y} width={plot.width} height={plot.height} />
        <line className="cross-section-preview__axis" x1={mapX(0)} x2={mapX(0)} y1={plot.y} y2={plot.y + plot.height} />
        <line className="cross-section-preview__axis" x1={plot.x} x2={plot.x + plot.width} y1={mapY(0)} y2={mapY(0)} />
        {model.regions.map((region, index) => <polygon
          key={`${region.id}-${index}`}
          className="cross-section-preview__region"
          data-role={region.role}
          data-color={region.colorIndex % 6}
          points={points(region)}
        />)}
        <g className="cross-section-preview__dimension">
          <line x1={mapX(model.widthDimension.x1)} x2={mapX(model.widthDimension.x2)} y1={widthY} y2={widthY} markerStart="url(#preview-dimension-arrow)" markerEnd="url(#preview-dimension-arrow)" />
          <text x={(mapX(model.widthDimension.x1) + mapX(model.widthDimension.x2)) / 2} y={widthY - 5} textAnchor="middle">w {formatNumber(model.widthUm)} µm</text>
          <line x1={heightX} x2={heightX} y1={mapY(model.heightDimension.y1)} y2={mapY(model.heightDimension.y2)} markerStart="url(#preview-dimension-arrow)" markerEnd="url(#preview-dimension-arrow)" />
          <text x={heightX + 5} y={(mapY(model.heightDimension.y1) + mapY(model.heightDimension.y2)) / 2} dominantBaseline="middle">h {formatNumber(model.heightUm)} µm</text>
        </g>
        <text className="cross-section-preview__axis-label" x={plot.x + plot.width - 5} y={mapY(0) - 5} textAnchor="end">x</text>
        <text className="cross-section-preview__axis-label" x={mapX(0) + 5} y={plot.y + 11}>y</text>
      </svg>
      <figcaption>
        <span className="cross-section-preview__geometry">{model.geometryLabel}{model.detail ? ` · ${model.detail}` : ""}</span>
        <ul className="cross-section-preview__legend" aria-label="Cross-section materials">
          {model.legend.map((entry) => <li key={entry.id}>
            <span className="cross-section-preview__swatch" data-role={entry.role} data-color={entry.colorIndex % 6} aria-hidden="true" />
            <span><strong>{entry.label}</strong><small>{materialDefinition(entry.material).name}</small></span>
          </li>)}
        </ul>
      </figcaption>
    </figure>
  );
}
