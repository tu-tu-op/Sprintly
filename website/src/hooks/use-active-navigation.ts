"use client";

import { usePathname } from "next/navigation";

export function useActiveNavigation() {
  const pathname = usePathname();

  return {
    pathname,
    isActive: (href: string) => pathname === href || pathname.startsWith(`${href}/`),
  };
}
