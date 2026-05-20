export interface UserProfile {
  id: string;
  name: string;
  handle: string;
  role: string;
  avatarUrl?: string;
  timezone: string;
  joinedAt: string;
}

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  notificationsEnabled: boolean;
  compactMode: boolean;
  defaultWorkspaceView: "board" | "list";
}

export interface ProfileStats {
  currentStreak: number;
  longestStreak: number;
  totalFocusHours: number;
  tasksCompleted: number;
}
