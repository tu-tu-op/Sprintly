import Link from "next/link";

import { ROUTES } from "@/constants/routes";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl font-bold text-on-surface">Page not found</h1>
        <p className="mt-2 text-sm text-on-surface-variant">The route does not exist in the Sprintly app shell.</p>
        <Link
          href={ROUTES.dashboard}
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
