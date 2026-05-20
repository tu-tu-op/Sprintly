import type { AppNotification } from "@/types";

export const notifications: AppNotification[] = [
  {
    id: "notification-1",
    title: "Session completed",
    body: "Architecture pass finished with a 91 focus score.",
    kind: "success",
    read: false,
    createdAt: "2026-05-20T06:00:00.000Z",
  },
  {
    id: "notification-2",
    title: "Dashboard export ready",
    body: "The Stitch dashboard export is available for integration.",
    kind: "info",
    read: false,
    createdAt: "2026-05-20T04:10:00.000Z",
  },
];
