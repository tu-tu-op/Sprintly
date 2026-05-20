import { PageHeader, SectionCard } from "@/components/shared";

export default function AuthPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md space-y-6">
        <PageHeader title="Auth" description="Authentication route shell for future Stitch export." />
        <SectionCard>
          <p className="text-sm text-on-surface-variant">
            This page intentionally contains no backend logic. Add the exported auth UI here when it is ready.
          </p>
        </SectionCard>
      </div>
    </main>
  );
}
