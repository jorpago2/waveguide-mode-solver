import { useId, type ReactNode, type Ref } from "react";
import {
  Checkbox,
  ContentSwitcher,
  NumberInput,
  Select,
  SelectItem,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@carbon/react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  id?: string;
  controlsId?: string;
}

export function CarbonNumberField({
  id,
  label,
  unit,
  value,
  min,
  max,
  step,
  displayDigits,
  disabled = false,
  onChange,
}: {
  id?: string;
  label: ReactNode;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayDigits?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const generatedId = useId();
  const invalid = !Number.isFinite(value) || value < min || value > max;
  const visibleDigits = displayDigits ?? (disabled ? 5 : undefined);
  const visibleValue = Number.isFinite(value) && visibleDigits !== undefined ? Number(value.toFixed(visibleDigits)) : value;
  return <NumberInput
    id={id ?? generatedId}
    className="carbon-field"
    label={<>{label ?? ""} <span className="field-unit">({unit})</span></>}
    value={Number.isFinite(visibleValue) ? visibleValue : ""}
    min={min}
    max={max}
    step={step}
    disabled={disabled}
    invalid={invalid}
    invalidText={`Enter a value from ${min} to ${max} ${unit}.`}
    size="sm"
    onChange={(_, state) => onChange(typeof state.value === "number" ? state.value : Number(state.value))}
  />;
}

export function CarbonSelectField({
  id,
  label,
  value,
  options,
  disabled = false,
  inline = false,
  inputRef,
  onChange,
}: {
  id?: string;
  label: ReactNode;
  value: string;
  options: SelectOption[];
  disabled?: boolean;
  inline?: boolean;
  inputRef?: Ref<HTMLSelectElement>;
  onChange: (value: string) => void;
}) {
  const generatedId = useId();
  return <Select
    id={id ?? generatedId}
    ref={inputRef}
    className="carbon-field"
    labelText={label}
    value={value}
    disabled={disabled}
    inline={inline}
    size="sm"
    onChange={(event) => onChange(event.target.value)}
  >
    {options.map((option) => <SelectItem key={option.value} value={option.value} text={option.label} disabled={option.disabled} />)}
  </Select>;
}

export function CarbonCheckboxField({
  id,
  label,
  checked,
  disabled = false,
  onChange,
}: {
  id?: string;
  label: NonNullable<ReactNode>;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const generatedId = useId();
  return <Checkbox
    id={id ?? generatedId}
    className="carbon-field"
    labelText={label}
    checked={checked}
    disabled={disabled}
    onChange={(_, state) => onChange(state.checked)}
  />;
}

export function CarbonSwitcher({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  return <ContentSwitcher
    className="carbon-switcher"
    data-option-count={options.length}
    aria-label={label}
    selectedIndex={selectedIndex}
    size="sm"
    onChange={({ index }) => index !== undefined && onChange(options[index].value)}
  >
    {options.map((option) => <Switch key={option.value} id={option.id} aria-controls={option.controlsId} name={option.value} disabled={option.disabled}>{option.label}</Switch>)}
  </ContentSwitcher>;
}

type TableCellValue = ReactNode | { content: ReactNode; colSpan?: number; className?: string };

export function CarbonTable({
  title,
  headers,
  rows,
  className,
}: {
  title: ReactNode;
  headers: ReactNode[];
  rows: Array<{ id: string; cells: TableCellValue[] }>;
  className?: string;
}) {
  return <TableContainer title={title} className={className}>
    <Table size="sm">
      <TableHead><TableRow>{headers.map((header, index) => <TableHeader key={index}>{header}</TableHeader>)}</TableRow></TableHead>
      <TableBody>{rows.map((row) => <TableRow key={row.id}>{row.cells.map((cell, index) => {
        const value = typeof cell === "object" && cell !== null && "content" in cell ? cell : { content: cell };
        return <TableCell key={index} colSpan={value.colSpan} className={value.className} data-label={typeof headers[index] === "string" ? headers[index] : undefined}>{value.content}</TableCell>;
      })}</TableRow>)}</TableBody>
    </Table>
  </TableContainer>;
}
