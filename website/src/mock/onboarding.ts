import type { OnboardingStep } from "@/types";

export const onboardingSteps: OnboardingStep[] = [
  {
    id: "profile",
    title: "Set up developer identity",
    description: "Capture display name, role, and focus defaults.",
    status: "active",
  },
  {
    id: "workspace",
    title: "Create first workspace",
    description: "Add starter tasks and sprint goals.",
    status: "pending",
  },
  {
    id: "preferences",
    title: "Tune preferences",
    description: "Pick theme, notifications, and default views.",
    status: "pending",
  },
];
