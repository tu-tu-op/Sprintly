import type { Metadata } from "next";

import { LandingPage } from "@/components/landing";

export const metadata: Metadata = {
  title: "Sprintly - Developer Productivity Workspace",
  description: "Plan focused sprints, run deep work sessions, and understand developer momentum.",
};

export default function HomePage() {
  return <LandingPage />;
}
