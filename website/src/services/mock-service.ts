import {
  analyticsCharts,
  billingPlans,
  dashboardStats,
  dashboardWidgets,
  mockGoals,
  mockProfileStats,
  mockSessions,
  mockTasks,
  mockUserProfile,
  notifications,
  onboardingSteps,
  sessionMetrics,
} from "@/mock";

export const mockService = {
  getDashboard: async () => ({ stats: dashboardStats, widgets: dashboardWidgets }),
  getTasks: async () => mockTasks,
  getSessions: async () => ({ sessions: mockSessions, metrics: sessionMetrics }),
  getAnalytics: async () => analyticsCharts,
  getGoals: async () => mockGoals,
  getProfile: async () => ({ profile: mockUserProfile, stats: mockProfileStats }),
  getBilling: async () => billingPlans,
  getNotifications: async () => notifications,
  getOnboarding: async () => onboardingSteps,
};
