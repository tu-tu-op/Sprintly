import type { ProductRouteKey } from "@/types";

export interface StitchPageSlot {
  key: ProductRouteKey;
  label: string;
  route: `/${string}`;
  exportFile: `stitch-export/${string}.html`;
  status: "pending" | "exported" | "integrated";
  integrationTarget: string;
}

export const stitchPageSlots: Record<ProductRouteKey, StitchPageSlot> = {
  dashboard: {
    key: "dashboard",
    label: "Dashboard",
    route: "/dashboard",
    exportFile: "stitch-export/dashboard.html",
    status: "exported",
    integrationTarget: "src/app/(app)/dashboard/page.tsx",
  },
  workspace: {
    key: "workspace",
    label: "Workspace",
    route: "/workspace",
    exportFile: "stitch-export/workspace.html",
    status: "integrated",
    integrationTarget: "src/app/(app)/workspace/page.tsx",
  },
  sessions: {
    key: "sessions",
    label: "Sessions",
    route: "/sessions",
    exportFile: "stitch-export/sessions.html",
    status: "pending",
    integrationTarget: "src/app/(app)/sessions/page.tsx",
  },
  analytics: {
    key: "analytics",
    label: "Analytics",
    route: "/analytics",
    exportFile: "stitch-export/analytics.html",
    status: "integrated",
    integrationTarget: "src/app/(app)/analytics/page.tsx",
  },
  goals: {
    key: "goals",
    label: "Goals",
    route: "/goals",
    exportFile: "stitch-export/goals.html",
    status: "pending",
    integrationTarget: "src/app/(app)/goals/page.tsx",
  },
  profile: {
    key: "profile",
    label: "Profile",
    route: "/profile",
    exportFile: "stitch-export/profile.html",
    status: "pending",
    integrationTarget: "src/app/(app)/profile/page.tsx",
  },
  settings: {
    key: "settings",
    label: "Settings",
    route: "/settings",
    exportFile: "stitch-export/settings.html",
    status: "pending",
    integrationTarget: "src/app/(app)/settings/page.tsx",
  },
  billing: {
    key: "billing",
    label: "Billing",
    route: "/billing",
    exportFile: "stitch-export/billing.html",
    status: "pending",
    integrationTarget: "src/app/(app)/billing/page.tsx",
  },
  community: {
    key: "community",
    label: "Community",
    route: "/community",
    exportFile: "stitch-export/community.html",
    status: "pending",
    integrationTarget: "src/app/(app)/community/page.tsx",
  },
};

export function getStitchPageSlot(key: ProductRouteKey) {
  return stitchPageSlots[key];
}
