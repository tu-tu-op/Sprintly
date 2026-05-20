import type { ProfileStats, UserProfile } from "@/types";

export const mockUserProfile: UserProfile = {
  id: "user-1",
  name: "Sprintly Developer",
  handle: "sprintly-dev",
  role: "Full-stack developer",
  timezone: "Asia/Calcutta",
  joinedAt: "2026-05-01T00:00:00.000Z",
};

export const mockProfileStats: ProfileStats = {
  currentStreak: 9,
  longestStreak: 18,
  totalFocusHours: 143,
  tasksCompleted: 214,
};
