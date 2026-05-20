import type { LucideIcon } from "lucide-react";
import type { Route } from "next";

export type ProductRouteKey =
  | "dashboard"
  | "workspace"
  | "sessions"
  | "analytics"
  | "goals"
  | "profile"
  | "settings"
  | "billing"
  | "community";

export interface NavigationItem {
  key: ProductRouteKey;
  label: string;
  href: Route;
  icon: LucideIcon;
  description: string;
}
