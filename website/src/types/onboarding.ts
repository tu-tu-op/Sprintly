export type OnboardingStepStatus = "pending" | "active" | "completed";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  status: OnboardingStepStatus;
}
