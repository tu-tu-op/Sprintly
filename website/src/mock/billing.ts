import type { BillingPlan } from "@/types";

export const billingPlans: BillingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Core personal productivity tracking.",
    priceMonthly: 0,
    priceYearly: 0,
    features: ["Task workspace", "Session history", "Basic analytics"],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Advanced analytics and identity features.",
    priceMonthly: 12,
    priceYearly: 120,
    features: ["Advanced analytics", "Goal planning", "Profile benchmarks"],
    highlighted: true,
  },
];
