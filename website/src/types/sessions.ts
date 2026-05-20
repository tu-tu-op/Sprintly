export type SessionStatus = "scheduled" | "active" | "paused" | "completed";

export interface FocusSession {
  id: string;
  title: string;
  status: SessionStatus;
  startedAt?: string;
  endedAt?: string;
  durationMinutes: number;
  taskIds: string[];
  score: number;
}

export interface SessionMetrics {
  focusMinutesToday: number;
  focusMinutesWeek: number;
  completedSessions: number;
  interruptionCount: number;
  averageScore: number;
}
