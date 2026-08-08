import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  CarbonCheckboxField,
  CarbonNumberField,
  CarbonSelectField,
  CarbonSwitcher,
} from "../CarbonControls";

function ScientificControlsPreview() {
  const [widthUm, setWidthUm] = useState(1);
  const [material, setMaterial] = useState("sin");
  const [section, setSection] = useState("geometry");
  const [enabled, setEnabled] = useState(true);

  return <div style={{ display: "grid", gap: "1rem", maxWidth: "40rem" }}>
    <CarbonSwitcher
      label="Configuration section"
      value={section}
      options={[
        { value: "geometry", label: "Geometry" },
        { value: "materials", label: "Materials" },
        { value: "solver", label: "Solver" },
      ]}
      onChange={setSection}
    />
    <CarbonNumberField
      id="story-width"
      label="Core width"
      unit="µm"
      value={widthUm}
      min={0.05}
      max={20}
      step={0.05}
      onChange={setWidthUm}
    />
    <CarbonSelectField
      id="story-material"
      label="Core material"
      value={material}
      options={[
        { value: "sin", label: "Silicon nitride" },
        { value: "si", label: "Silicon" },
        { value: "sio2", label: "Fused silica" },
      ]}
      onChange={setMaterial}
    />
    <CarbonCheckboxField
      id="story-enabled"
      label="Enable subpixel averaging"
      checked={enabled}
      onChange={setEnabled}
    />
  </div>;
}

const meta = {
  title: "Scientific interface/Carbon controls",
  component: ScientificControlsPreview,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ScientificControlsPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
