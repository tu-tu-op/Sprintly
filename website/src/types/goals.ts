export type GoalStatus = "not_started" | "active" | "completed" | "paused";

export interface Goal {
  id: string;
  title: string;
  description?: string;
  status: GoalStatus;
  progress: number;
  targetDate?: string;
}
