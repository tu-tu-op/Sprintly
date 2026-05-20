import { PageHeader, SectionCard } from "@/components/shared";
import { onboardingSteps } from "@/mock";

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground md:px-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeader title="Onboarding" description="Ready for the Stitch onboarding export." />
        <SectionCard title="Onboarding steps">
          <div className="space-y-3">
            {onboardingSteps.map((step) => (
              <div key={step.id} className="rounded-md border border-outline-variant bg-surface-container p-4">
                <p className="font-medium text-on-surface">{step.title}</p>
                <p className="mt-1 text-sm text-on-surface-variant">{step.description}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
