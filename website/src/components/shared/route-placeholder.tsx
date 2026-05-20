import { FileCode2 } from "lucide-react";

import { EmptyState, PageHeader, SectionCard } from "@/components/shared";
import { getStitchPageSlot } from "@/config/stitch-registry";
import type { ProductRouteKey } from "@/types";

interface RoutePlaceholderProps {
  routeKey: ProductRouteKey;
}

export function RoutePlaceholder({ routeKey }: RoutePlaceholderProps) {
  const slot = getStitchPageSlot(routeKey);

  return (
    <div className="space-y-6">
      <PageHeader
        title={slot.label}
        description="This route is wired into the app shell and ready for its Stitch-exported page component."
      />
      <EmptyState
        icon={<FileCode2 className="size-8" />}
        title={`${slot.label} page slot`}
        description={`Copy the exported page into ${slot.integrationTarget} or extract it into a local component and render it from this route.`}
      />
      <SectionCard title="Stitch import contract" description="Temporary integration metadata for page-by-page imports.">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-on-surface-variant">Export file</dt>
            <dd className="mt-1 font-mono text-on-surface">{slot.exportFile}</dd>
          </div>
          <div>
            <dt className="text-on-surface-variant">Route</dt>
            <dd className="mt-1 font-mono text-on-surface">{slot.route}</dd>
          </div>
          <div>
            <dt className="text-on-surface-variant">Status</dt>
            <dd className="mt-1 font-mono text-on-surface">{slot.status}</dd>
          </div>
        </dl>
      </SectionCard>
    </div>
  );
}
