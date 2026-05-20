const focusBars = [
  { day: "Mon", height: "40%", label: "2h" },
  { day: "Tue", height: "60%", label: "4h" },
  { day: "Wed", height: "80%", label: "5h" },
  { day: "Thu", height: "30%", label: "1.5h" },
  { day: "Fri", height: "90%", label: "6h", active: true },
  { day: "Sat", height: "70%", label: "4.5h" },
  { day: "Sun", height: "50%", label: "3h" },
];

const heatmapCells = [
  "bg-surface-variant",
  "bg-primary/20",
  "bg-primary/40",
  "bg-surface-variant",
  "bg-primary/80 neon-glow",
  "bg-primary/20",
  "bg-surface-variant",
  "bg-primary/60",
  "bg-primary/80 neon-glow",
  "bg-surface-variant",
  "bg-primary/40",
  "bg-primary/60",
  "bg-primary/20",
  "bg-surface-variant",
  "bg-primary/80 neon-glow",
  "bg-primary/80 neon-glow",
  "bg-primary/80 neon-glow",
  "bg-primary/80 neon-glow",
  "animate-pulse rounded-full border border-white/20 bg-primary neon-glow-strong",
  "border border-dashed border-glass-border bg-surface-container",
  "border border-dashed border-glass-border bg-surface-container",
];

const recentSessions = [
  {
    title: "API Refactoring",
    project: "Project: Core Backend - 2h 15m",
    icon: "terminal",
    iconTone: "primary",
    points: "+24 pts",
    time: "Today, 2:00 PM",
  },
  {
    title: "Squash Auth Bugs",
    project: "Project: Web Client - 45m",
    icon: "bug_report",
    iconTone: "secondary",
    points: "+8 pts",
    time: "Today, 10:30 AM",
  },
  {
    title: "UI Component Updates",
    project: "Project: Design System - 1h 30m",
    icon: "design_services",
    iconTone: "muted",
    points: "+15 pts",
    time: "Yesterday",
    muted: true,
  },
];

function MaterialIcon({
  children,
  className,
  filled,
}: {
  children: string;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span className={className ? `material-symbols-outlined ${className}` : "material-symbols-outlined"} style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}>
      {children}
    </span>
  );
}

function iconToneClass(tone: string) {
  if (tone === "primary") {
    return "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-on-primary";
  }

  if (tone === "secondary") {
    return "bg-secondary/10 text-secondary group-hover:bg-secondary group-hover:text-on-secondary";
  }

  return "bg-surface-variant text-on-surface-variant";
}

export function StitchDashboard() {
  return (
    <div className="stitch-page-root">
      <div className="mb-8 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <h2 className="mb-2 font-display-lg text-display-lg text-on-surface">Good morning, Dev.</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Your momentum is building. You&apos;re on a 5-day streak.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-glass-border bg-transparent px-6 py-2.5 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-graphite md:flex-none">
            <MaterialIcon className="text-[18px]">add_task</MaterialIcon>
            Quick Task
          </button>
          <button className="neon-glow flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-accent to-primary px-6 py-2.5 font-label-md text-label-md font-semibold text-on-primary transition-opacity hover:opacity-90 md:flex-none">
            <MaterialIcon className="text-[18px]" filled>
              play_arrow
            </MaterialIcon>
            Start Session
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <section className="relative flex min-h-[200px] flex-col justify-between overflow-hidden rounded-xl border border-glass-border bg-surface-graphite p-6 md:col-span-4">
          <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-primary/10 blur-[40px]" />
          <div className="z-10 flex items-start justify-between">
            <div>
              <h3 className="mb-1 font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-on-surface-variant">
                Momentum Score
              </h3>
              <p className="font-body-sm text-body-sm text-outline">Based on recent activity</p>
            </div>
            <MaterialIcon className="text-primary">speed</MaterialIcon>
          </div>
          <div className="z-10 mt-6 flex items-end gap-4">
            <div className="font-display-lg text-5xl text-primary">87</div>
            <div className="flex flex-col pb-1">
              <span className="flex items-center font-label-sm-mono text-label-sm-mono text-success-streak">
                <MaterialIcon className="text-[14px]">arrow_upward</MaterialIcon>
                +12 pts
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">vs last week</span>
            </div>
          </div>
          <div className="z-10 mt-6 h-1.5 w-full overflow-hidden rounded-full bg-surface-variant">
            <div className="neon-glow h-full rounded-full bg-gradient-to-r from-indigo-accent to-primary" style={{ width: "87%" }} />
          </div>
        </section>

        <section className="flex min-h-[200px] flex-col justify-between rounded-xl border border-glass-border bg-surface-graphite p-6 md:col-span-4">
          <div className="flex items-start justify-between">
            <h3 className="font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-on-surface-variant">
              Session Streak
            </h3>
            <MaterialIcon className="text-tertiary">local_fire_department</MaterialIcon>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-display-lg text-display-lg text-on-surface">5</span>
            <span className="font-body-lg text-body-lg text-on-surface-variant">days</span>
          </div>
          <div className="mt-auto flex items-center justify-between border-t border-glass-border pt-4">
            <span className="font-body-sm text-body-sm text-on-surface-variant">Best: 14 days</span>
            <span className="rounded bg-surface-container-high px-2 py-1 font-label-sm-mono text-label-sm-mono text-on-surface">
              Keep going!
            </span>
          </div>
        </section>

        <div className="grid gap-6 md:col-span-4 md:grid-rows-2">
          <section className="flex items-center justify-between rounded-xl border border-glass-border bg-surface-graphite p-5">
            <div>
              <h3 className="mb-2 font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-on-surface-variant">
                Focus Time (Today)
              </h3>
              <span className="font-headline-lg text-headline-lg text-on-surface">4h 12m</span>
            </div>
            <div className="flex h-12 w-12 -rotate-45 items-center justify-center rounded-full border-4 border-surface-variant border-t-secondary">
              <MaterialIcon className="rotate-45 text-[20px] text-secondary">schedule</MaterialIcon>
            </div>
          </section>

          <section className="flex items-center justify-between rounded-xl border border-glass-border bg-surface-graphite p-5">
            <div>
              <h3 className="mb-2 font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-on-surface-variant">
                Completion Rate
              </h3>
              <span className="font-headline-lg text-headline-lg text-on-surface">92%</span>
            </div>
            <div className="flex h-12 w-12 rotate-45 items-center justify-center rounded-full border-4 border-surface-variant border-t-success-streak">
              <MaterialIcon className="-rotate-45 text-[20px] text-success-streak">task_alt</MaterialIcon>
            </div>
          </section>
        </div>

        <section className="relative rounded-xl border border-glass-border bg-surface-graphite p-6 md:col-span-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface">Focus Hours</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Last 7 days</p>
            </div>
            <div className="flex gap-2">
              <button className="rounded bg-surface-variant px-3 py-1 font-label-sm-mono text-[10px] text-on-surface">W</button>
              <button className="rounded px-3 py-1 font-label-sm-mono text-[10px] text-on-surface-variant hover:bg-surface-variant">
                M
              </button>
              <button className="rounded px-3 py-1 font-label-sm-mono text-[10px] text-on-surface-variant hover:bg-surface-variant">
                Y
              </button>
            </div>
          </div>

          <div className="relative flex h-[200px] w-full items-end justify-between px-2">
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between border-b border-glass-border pb-8">
              <div className="h-px w-full border-t border-dashed border-glass-border opacity-50" />
              <div className="h-px w-full border-t border-dashed border-glass-border opacity-50" />
              <div className="h-px w-full border-t border-dashed border-glass-border opacity-50" />
            </div>
            {focusBars.map((bar) => (
              <div
                key={bar.day}
                className={
                  bar.active
                    ? "neon-glow group relative w-8 cursor-pointer rounded-t-sm border border-primary/50 bg-primary/80"
                    : "group relative w-8 cursor-pointer rounded-t-sm bg-surface-variant"
                }
                style={{ height: bar.height }}
              >
                <div
                  className={
                    bar.active
                      ? "absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-surface-elevated px-2 py-1 font-label-sm-mono text-[10px] text-primary opacity-0 transition-opacity group-hover:opacity-100"
                      : "absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-surface-elevated px-2 py-1 font-label-sm-mono text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
                  }
                >
                  {bar.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-between px-2 font-label-sm-mono text-[10px] text-on-surface-variant">
            {focusBars.map((bar) => (
              <span key={bar.day} className={bar.active ? "font-bold text-primary" : undefined}>
                {bar.day}
              </span>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-6 md:col-span-4">
          <div className="rounded-xl border border-glass-border bg-surface-graphite p-6">
            <h3 className="mb-4 font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-on-surface-variant">
              Consistency
            </h3>
            <div className="grid grid-cols-7 gap-1">
              {heatmapCells.map((className, index) => (
                <div key={index} className={`aspect-square w-full rounded-sm ${className}`} />
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-glass-border bg-surface-graphite p-6 md:col-span-12">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="font-headline-md text-headline-md text-on-surface">Recent Sessions</h3>
            <a className="flex items-center gap-1 font-label-md text-label-md text-primary hover:underline" href="#">
              View All
              <MaterialIcon className="text-[16px]">arrow_forward</MaterialIcon>
            </a>
          </div>
          <div className="space-y-2">
            {recentSessions.map((session) => (
              <div
                key={session.title}
                className={`group flex items-center justify-between rounded-lg border border-transparent p-4 transition-colors hover:border-glass-border hover:bg-surface-container-high ${
                  session.muted ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${iconToneClass(
                      session.iconTone,
                    )}`}
                  >
                    <MaterialIcon className="text-[20px]" filled={session.iconTone !== "muted"}>
                      {session.icon}
                    </MaterialIcon>
                  </div>
                  <div>
                    <h4 className="font-body-md text-body-md font-semibold text-on-surface">{session.title}</h4>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">{session.project}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={
                      session.muted
                        ? "inline-block rounded bg-surface-variant px-2 py-1 font-label-sm-mono text-label-sm-mono text-on-surface-variant"
                        : "inline-block rounded border border-success-streak/20 bg-success-streak/10 px-2 py-1 font-label-sm-mono text-label-sm-mono text-success-streak"
                    }
                  >
                    {session.points}
                  </span>
                  <p className="mt-1 font-body-sm text-body-sm text-outline">{session.time}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
