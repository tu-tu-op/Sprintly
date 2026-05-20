export interface DashboardStat {
  id: string;
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "flat";
}

export interface DashboardWidget {
  id: string;
  title: string;
  description?: string;
  kind: "stat" | "chart" | "list" | "progress";
}
