export type NotificationKind = "info" | "success" | "warning" | "error";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  kind: NotificationKind;
  read: boolean;
  createdAt: string;
}
