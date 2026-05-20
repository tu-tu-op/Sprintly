const languageSplit = [
  { label: "TypeScript", value: "45%", color: "bg-primary", text: "text-primary", glow: "glow-violet" },
  { label: "Rust", value: "30%", color: "bg-secondary", text: "text-secondary", glow: "glow-cyan" },
  { label: "Python", value: "25%", color: "bg-tertiary", text: "text-tertiary", glow: "" },
];

const productiveHours = [
  { height: "10%", className: "bg-surface-bright/30 hover:bg-secondary/50", label: "12a", labelClass: "text-secondary" },
  { height: "5%", className: "bg-surface-bright/30" },
  { height: "2%", className: "bg-surface-bright/30" },
  { height: "2%", className: "bg-surface-bright/30" },
  { height: "5%", className: "bg-surface-bright/30" },
  { height: "15%", className: "bg-surface-bright/30" },
  { height: "30%", className: "bg-surface-bright/30" },
  { height: "60%", className: "bg-secondary/80 glow-cyan" },
  { height: "85%", className: "bg-secondary glow-cyan", label: "Peak: 8AM", labelClass: "text-secondary", peak: true },
  { height: "95%", className: "bg-secondary glow-cyan" },
  { height: "100%", className: "bg-secondary/90 glow-cyan" },
  { height: "75%", className: "bg-secondary/80 glow-cyan" },
  { height: "40%", className: "bg-surface-bright/50" },
  { height: "45%", className: "bg-surface-bright/50" },
  { height: "55%", className: "bg-surface-bright/60" },
  { height: "65%", className: "bg-surface-bright/70" },
  { height: "70%", className: "bg-primary/70 glow-violet" },
  { height: "80%", className: "bg-primary/80 glow-violet" },
  { height: "60%", className: "bg-primary/60 glow-violet" },
  { height: "40%", className: "bg-surface-bright/50" },
  { height: "30%", className: "bg-surface-bright/40" },
  { height: "20%", className: "bg-surface-bright/30" },
  { height: "15%", className: "bg-surface-bright/30" },
  { height: "10%", className: "bg-surface-bright/30 hover:bg-primary/50", label: "11p", labelClass: "text-primary" },
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

function StatTrend({
  tone,
  icon,
  value,
  label,
}: {
  tone: "success" | "warning";
  icon: string;
  value: string;
  label: string;
}) {
  const className =
    tone === "success"
      ? "border-success-streak/20 bg-success-streak/10 text-success-streak"
      : "border-tertiary/20 bg-tertiary/10 text-tertiary";

  return (
    <div className="mt-auto flex items-center">
      <span className={`mr-3 flex items-center rounded-md border px-2 py-1 font-label-sm-mono text-label-sm-mono ${className}`}>
        <MaterialIcon className="mr-1 text-[14px]">{icon}</MaterialIcon>
        {value}
      </span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">{label}</span>
    </div>
  );
}

function ProductiveHourBar({
  hour,
}: {
  hour: {
    height: string;
    className: string;
    label?: string;
    labelClass?: string;
    peak?: boolean;
  };
}) {
  return (
    <div
      className={`group relative w-full rounded-t-sm transition-colors ${hour.className}`}
      style={{ height: hour.height }}
    >
      {hour.label ? (
        <div
          className={
            hour.peak
              ? "absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-glass-border bg-surface-elevated px-2 py-1 font-label-sm-mono text-[10px] opacity-0 transition-opacity group-hover:opacity-100 text-secondary"
              : `absolute -top-6 left-1/2 -translate-x-1/2 font-label-sm-mono text-[10px] opacity-0 transition-opacity group-hover:opacity-100 ${hour.labelClass ?? ""}`
          }
        >
          {hour.label}
        </div>
      ) : null}
    </div>
  );
}

export function StitchAnalytics() {
  return (
    <div className="stitch-page-root">
      <div className="mb-8">
        <h2 className="font-headline-lg text-headline-lg-mobile tracking-tight text-on-surface md:text-headline-lg">
          Performance Analytics
        </h2>
        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
          Analyzing coding velocity and focus patterns over the last 30 days.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-gutter md:grid-cols-12">
        <section className="card-gradient flex flex-col rounded-2xl border border-glass-border bg-surface-graphite p-6 md:col-span-4">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h3 className="font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-on-surface-variant">
                Focus Split
              </h3>
              <div className="mt-1 font-headline-md text-headline-md text-on-surface">Languages</div>
            </div>
            <MaterialIcon className="text-primary">pie_chart</MaterialIcon>
          </div>

          <div className="relative flex flex-1 items-center justify-center">
            <svg className="h-48 w-48 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" fill="transparent" r="40" stroke="#262626" strokeWidth="10" />
              <circle
                className="donut-segment"
                cx="50"
                cy="50"
                fill="transparent"
                r="40"
                stroke="#d0bcff"
                strokeDasharray="251.2"
                strokeDashoffset="138.16"
                strokeWidth="10"
                style={{ filter: "drop-shadow(0 0 4px rgba(208, 188, 255, 0.4))" }}
              />
              <circle
                className="donut-segment"
                cx="50"
                cy="50"
                fill="transparent"
                r="40"
                stroke="#4cd7f6"
                strokeDasharray="251.2"
                strokeDashoffset="175.84"
                strokeWidth="10"
                transform="rotate(162 50 50)"
              />
              <circle
                className="donut-segment"
                cx="50"
                cy="50"
                fill="transparent"
                r="40"
                stroke="#ffb95f"
                strokeDasharray="251.2"
                strokeDashoffset="188.4"
                strokeWidth="10"
                transform="rotate(270 50 50)"
              />
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-headline-md text-headline-md text-on-surface">142</span>
              <span className="font-label-sm-mono text-label-sm-mono text-on-surface-variant">HOURS</span>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {languageSplit.map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`mr-3 h-3 w-3 rounded-full ${item.color} ${item.glow}`} />
                  <span className="font-body-sm text-body-sm text-on-surface">{item.label}</span>
                </div>
                <span className={`font-label-sm-mono text-label-sm-mono ${item.text}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-gutter md:col-span-8">
          <div className="grid h-full grid-cols-1 gap-gutter sm:grid-cols-2">
            <section className="group relative overflow-hidden rounded-2xl border border-glass-border bg-surface-graphite p-6">
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl transition-all duration-500 group-hover:bg-primary/20" />
              <h3 className="mb-1 font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-on-surface-variant">
                Code Velocity
              </h3>
              <div className="mb-4 flex items-baseline">
                <span className="mr-2 font-display-lg text-display-lg text-on-surface">8.4k</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">lines/wk</span>
              </div>
              <StatTrend tone="success" icon="trending_up" value="+12%" label="vs last week" />
            </section>

            <section className="group relative overflow-hidden rounded-2xl border border-glass-border bg-surface-graphite p-6">
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-secondary/10 blur-3xl transition-all duration-500 group-hover:bg-secondary/20" />
              <h3 className="mb-1 font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-on-surface-variant">
                Deep Work Blocks
              </h3>
              <div className="mb-4 flex items-baseline">
                <span className="mr-2 font-display-lg text-display-lg text-on-surface">24</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">sessions</span>
              </div>
              <StatTrend tone="warning" icon="trending_down" value="-2%" label="vs last week" />
            </section>
          </div>

          <section className="card-gradient flex flex-1 flex-col rounded-2xl border border-glass-border bg-surface-graphite p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-on-surface-variant">
                  Momentum
                </h3>
                <div className="mt-1 font-headline-md text-headline-md text-on-surface">Commits &amp; Output</div>
              </div>
              <div className="flex gap-2">
                <button className="rounded-lg border border-glass-border bg-surface-elevated px-3 py-1 font-label-sm-mono text-label-sm-mono text-on-surface transition-colors hover:bg-surface-bright">
                  1W
                </button>
                <button className="rounded-lg border border-primary/30 bg-primary-container/10 px-3 py-1 font-label-sm-mono text-label-sm-mono text-primary transition-colors">
                  1M
                </button>
              </div>
            </div>

            <div className="relative h-32 w-full flex-1 items-end justify-between pt-4">
              <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 40">
                <defs>
                  <linearGradient id="analyticsChartGradient" x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#d0bcff" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#d0bcff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,40 L0,25 Q10,35 20,20 T40,15 T60,28 T80,10 T100,5 L100,40 Z"
                  fill="url(#analyticsChartGradient)"
                />
                <path
                  d="M0,25 Q10,35 20,20 T40,15 T60,28 T80,10 T100,5"
                  fill="none"
                  stroke="#d0bcff"
                  strokeWidth="0.5"
                  style={{ filter: "drop-shadow(0 0 2px rgba(208,188,255,0.8))" }}
                />
              </svg>
              <div className="absolute bottom-0 flex w-full translate-y-full justify-between pt-2">
                <span className="font-label-sm-mono text-[10px] text-on-surface-variant">Aug 1</span>
                <span className="font-label-sm-mono text-[10px] text-on-surface-variant">Aug 15</span>
                <span className="font-label-sm-mono text-[10px] text-on-surface-variant">Aug 30</span>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-8 rounded-2xl border border-glass-border bg-surface-graphite p-6 md:col-span-12">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-on-surface-variant">
                Chronotype
              </h3>
              <div className="mt-1 font-headline-md text-headline-md text-on-surface">Most Productive Hours</div>
            </div>
            <MaterialIcon className="text-secondary">schedule</MaterialIcon>
          </div>

          <div className="mt-8 flex h-32 items-end justify-between gap-1">
            {productiveHours.map((hour, index) => (
              <ProductiveHourBar key={index} hour={hour} />
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t border-glass-border pt-2">
            <span className="font-label-sm-mono text-[10px] text-on-surface-variant">Midnight</span>
            <span className="font-label-sm-mono text-[10px] text-on-surface-variant">Noon</span>
            <span className="font-label-sm-mono text-[10px] text-on-surface-variant">11 PM</span>
          </div>
        </section>
      </div>
    </div>
  );
}
