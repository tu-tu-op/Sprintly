import {
  Activity,
  BarChart3,
  CreditCard,
  Gauge,
  Goal,
  LayoutDashboard,
  Settings,
  UserRound,
  UsersRound,
} from "lucide-react";

import { ROUTES } from "@/constants/routes";
import type { NavigationItem } from "@/types";

export const APP_NAVIGATION: NavigationItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    href: ROUTES.dashboard,
    icon: LayoutDashboard,
    description: "Overview, stats, and current momentum.",
  },
  {
    key: "workspace",
    label: "Workspace",
    href: ROUTES.workspace,
    icon: Gauge,
    description: "Tasks, execution mode, and sprint work.",
  },
  {
    key: "sessions",
    label: "Sessions",
    href: ROUTES.sessions,
    icon: Activity,
    description: "Focus sessions and activity history.",
  },
  {
    key: "analytics",
    label: "Analytics",
    href: ROUTES.analytics,
    icon: BarChart3,
    description: "Trends, throughput, and developer metrics.",
  },
  {
    key: "goals",
    label: "Goals",
    href: ROUTES.goals,
    icon: Goal,
    description: "Sprint goals and longer-horizon outcomes.",
  },
  {
    key: "profile",
    label: "Profile",
    href: ROUTES.profile,
    icon: UserRound,
    description: "Developer identity and public stats.",
  },
  {
    key: "settings",
    label: "Settings",
    href: ROUTES.settings,
    icon: Settings,
    description: "Preferences, notifications, and integrations.",
  },
  {
    key: "billing",
    label: "Billing",
    href: ROUTES.billing,
    icon: CreditCard,
    description: "Plans, usage, and invoices.",
  },
  {
    key: "community",
    label: "Community",
    href: ROUTES.community,
    icon: UsersRound,
    description: "Compare progress and team benchmarks.",
  },
];
