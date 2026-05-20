export type BillingCadence = "monthly" | "yearly";

export interface BillingPlan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  highlighted?: boolean;
}
