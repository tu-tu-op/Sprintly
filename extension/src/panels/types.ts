export type SprintlyMood = 'Grind Mode' | 'Flow State' | 'Rough Day';
export type LeaderboardScope = 'Region' | 'Global' | 'Friends';
export type LeaderboardTimeframe = 'This Week' | 'Month' | 'All';

export interface SprintlyStats {
  rankTier: string;
  streakDays: number;
  streakDaysPattern: number[];
  avgSessionMinutes: number;
  currentRank: number;
  rankPercentileLabel: string;
  region: string;
  lastSessionName: string;
  lastSessionDurationMs: number;
  lastSessionAgo: string;
  lastSessionVibePct: number;
  lastSessionHardPct: number;
  lastSessionMood: string;
  weeklyGoalCurrent?: number;
  weeklyGoalMax?: number;
}

export interface SessionData {
  startedAt: Date;
  elapsedMs?: number;
  vibePct: number;
  hardPct: number;
  buildFails: number;
  aiPromptsUsed: number;
  currentRank: number;
  rankDeltaToday: number;
  region: string;
  overtakenBy?: string;
  overtakenMinutesAgo?: number;
  goalText?: string;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  points: number;
  delta?: number;
  isCurrentUser?: boolean;
}

export interface LeaderboardData {
  scope: LeaderboardScope;
  timeframe: LeaderboardTimeframe;
  region: string;
  entries: LeaderboardEntry[];
  currentUser: LeaderboardEntry;
}

export interface HistoryEntry {
  dateLabel: string;
  sessionName: string;
  durationMs: number;
  rank: number;
  vibePct: number;
  hardPct: number;
  mood: string;
}

export interface HistoryData {
  streakDays: number;
  streakStartLabel: string;
  streakEndLabel: string;
  heatmapWeeks: number[][];
  longestSessionMs: number;
  bestRankAchieved: number;
  bestRankDetail: string;
  cleanDays: number;
  sessions: HistoryEntry[];
}

export interface SessionResult {
  durationMs: number;
  mood: SprintlyMood | null;
  vibePct: number;
  hardPct: number;
  buildFails: number;
  aiPromptsUsed: number;
  finalRank: number;
  rankDelta: number;
  bestRankAchieved: number;
}
