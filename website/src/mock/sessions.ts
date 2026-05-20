import type { FocusSession, SessionMetrics } from "@/types";

export const sessionMetrics: SessionMetrics = {
  focusMinutesToday: 168,
  focusMinutesWeek: 812,
  completedSessions: 14,
  interruptionCount: 6,
  averageScore: 86,
};

export const mockSessions: FocusSession[] = [
  {
    id: "session-1",
    title: "Architecture pass",
    status: "completed",
    startedAt: "2026-05-20T04:30:00.000Z",
    endedAt: "2026-05-20T06:00:00.000Z",
    durationMinutes: 90,
    taskIds: ["task-1"],
    score: 91,
  },
  {
    id: "session-2",
    title: "UI integration prep",
    status: "active",
    startedAt: "2026-05-20T07:00:00.000Z",
    durationMinutes: 60,
    taskIds: ["task-2"],
    score: 83,
  },
];
