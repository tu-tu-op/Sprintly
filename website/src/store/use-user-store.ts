"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { mockUserProfile } from "@/mock";
import type { UserPreferences, UserProfile } from "@/types";

interface UserState {
  profile: UserProfile;
  preferences: UserPreferences;
  onboardingComplete: boolean;
  setProfile: (profile: UserProfile) => void;
  setPreferences: (preferences: Partial<UserPreferences>) => void;
  setOnboardingComplete: (complete: boolean) => void;
}

const defaultPreferences: UserPreferences = {
  theme: "dark",
  notificationsEnabled: true,
  compactMode: false,
  defaultWorkspaceView: "board",
};

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      profile: mockUserProfile,
      preferences: defaultPreferences,
      onboardingComplete: false,
      setProfile: (profile) => set({ profile }),
      setPreferences: (preferences) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            ...preferences,
          },
        })),
      setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
    }),
    {
      name: "sprintly-user",
    },
  ),
);
