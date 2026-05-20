import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function SectionCard({ title, description, children, className }: SectionCardProps) {
  return (
    <Card className={className}>
      {title || description ? (
        <CardHeader>
          {title ? <CardTitle>{title}</CardTitle> : null}
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn(!title && !description && "pt-5")}>{children}</CardContent>
    </Card>
  );
}
