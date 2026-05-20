import type { ReactNode } from "react";

import { AppShell } from "@/components/layout";

interface ProductLayoutProps {
  children: ReactNode;
}

export default function ProductLayout({ children }: ProductLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
