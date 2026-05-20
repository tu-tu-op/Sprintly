export type ChartKind = "line" | "bar" | "area" | "radial";

export interface ChartDatum {
  label: string;
  value: number;
  secondaryValue?: number;
}

export interface AnalyticsChart {
  id: string;
  title: string;
  kind: ChartKind;
  data: ChartDatum[];
}
