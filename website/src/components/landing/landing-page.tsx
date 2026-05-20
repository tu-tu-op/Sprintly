"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, Check, ChevronDown, Clock3, Code2, GitBranch, Menu, Play, Shield, Sparkles, X } from "lucide-react";
import { FormEvent, useState } from "react";

import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Product", href: "#product" },
  { label: "Workflow", href: "#workflow" },
  { label: "Analytics", href: "#analytics" },
  { label: "Pricing", href: "#pricing" },
];

const metrics = [
  { label: "Focus score", value: "87", tone: "text-primary" },
  { label: "Deep work", value: "18.4h", tone: "text-secondary" },
  { label: "Tasks shipped", value: "42", tone: "text-success-streak" },
];

const features = [
  {
    icon: Clock3,
    title: "Session-first execution",
    body: "Plan focused blocks, start the timer, and keep each sprint tied to visible progress.",
  },
  {
    icon: GitBranch,
    title: "Workspace rhythm",
    body: "Track tasks by sprint state, priority, estimate, and the context needed to move fast.",
  },
  {
    icon: BarChart3,
    title: "Developer analytics",
    body: "Understand focus patterns, velocity, productive hours, and consistency without noisy reports.",
  },
  {
    icon: Shield,
    title: "Team-ready foundation",
    body: "Built around clean routes, typed data contracts, and modular product areas.",
  },
];

const workflow = [
  "Choose the sprint outcome",
  "Break work into scoped tasks",
  "Run focused sessions",
  "Review momentum and consistency",
];

const faqs = [
  {
    question: "Does Sprintly need a backend to try the product?",
    answer: "No. The current web app uses typed mock data so the front end can be explored while API contracts mature.",
  },
  {
    question: "Can Stitch pages still be imported route by route?",
    answer: "Yes. The dashboard, workspace, and analytics pages already follow that integration pattern.",
  },
  {
    question: "Is this for solo developers or teams?",
    answer: "The structure supports both. The landing page points users into the product shell, and the architecture is ready for team features later.",
  },
];

function ProductPreview() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-24 w-[920px] -translate-x-[20%] rounded-2xl border border-glass-border bg-surface-graphite/95 p-4 shadow-[0_40px_140px_rgba(0,0,0,0.55)] max-lg:top-52 max-lg:w-[760px] max-lg:-translate-x-1/2 max-sm:top-72 max-sm:w-[560px]">
        <div className="mb-4 flex items-center justify-between border-b border-glass-border pb-3">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-error" />
            <span className="h-3 w-3 rounded-full bg-tertiary" />
            <span className="h-3 w-3 rounded-full bg-success-streak" />
          </div>
          <span className="font-label-sm-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
            Sprintly workspace
          </span>
        </div>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-3 space-y-3 rounded-xl border border-glass-border bg-surface-container p-3">
            <div className="h-8 rounded-lg bg-primary/20" />
            <div className="h-8 rounded-lg bg-surface-bright/50" />
            <div className="h-8 rounded-lg bg-surface-bright/30" />
            <div className="h-8 rounded-lg bg-surface-bright/30" />
          </div>
          <div className="col-span-9 grid grid-cols-3 gap-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-xl border border-glass-border bg-[#171717] p-4">
                <p className="font-label-sm-mono text-[10px] uppercase tracking-widest text-on-surface-variant">{metric.label}</p>
                <p className={cn("mt-3 font-display-lg text-4xl", metric.tone)}>{metric.value}</p>
              </div>
            ))}
            <div className="col-span-2 rounded-xl border border-glass-border bg-[#171717] p-4">
              <div className="mb-5 flex items-center justify-between">
                <span className="font-label-sm-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
                  Focus hours
                </span>
                <span className="rounded bg-primary/10 px-2 py-1 font-label-sm-mono text-[10px] text-primary">1M</span>
              </div>
              <div className="flex h-36 items-end gap-2">
                {["35%", "58%", "72%", "42%", "90%", "68%", "78%", "52%"].map((height, index) => (
                  <span
                    key={height + index}
                    className={cn("w-full rounded-t bg-surface-bright/50", index === 4 && "bg-primary neon-glow")}
                    style={{ height }}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-glass-border bg-[#171717] p-4">
              <span className="font-label-sm-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
                Current sprint
              </span>
              <div className="mt-5 space-y-3">
                <div className="h-3 rounded-full bg-secondary/80" />
                <div className="h-3 w-4/5 rounded-full bg-primary/70" />
                <div className="h-3 w-2/3 rounded-full bg-tertiary/70" />
              </div>
              <div className="mt-6 rounded-lg border border-glass-border bg-surface-container p-3 font-body-sm text-body-sm text-on-surface">
                OAuth flow ready for review
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [yearly, setYearly] = useState(true);
  const [openFaq, setOpenFaq] = useState(0);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    setEmailStatus(email ? "You're on the Sprintly early access list." : "Enter an email to join early access.");
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background text-on-surface selection:bg-primary-container selection:text-on-primary-container">
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-glass-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-container-max items-center justify-between px-margin-mobile md:px-margin-desktop">
          <Link href={ROUTES.home} className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-tr from-primary to-secondary p-[1px]">
              <span className="grid h-full w-full place-items-center rounded-lg bg-surface-graphite font-headline-md text-headline-md font-black text-primary">
                S
              </span>
            </span>
            <span>
              <span className="block font-headline-md text-headline-md font-black text-primary">Sprintly</span>
              <span className="block font-label-sm-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
                Developer Craft
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="font-label-md text-label-md text-on-surface-variant transition-colors hover:text-on-surface">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link href={ROUTES.auth} className="rounded-lg px-4 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:text-on-surface">
              Sign in
            </Link>
            <Link
              href={ROUTES.dashboard}
              className="neon-glow flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-accent to-primary px-4 py-2 font-label-md text-label-md font-semibold text-on-primary"
            >
              Open app
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <button
            className="rounded-lg p-2 text-on-surface-variant md:hidden"
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button className="absolute inset-0 bg-black/70" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
          <div className="relative ml-auto flex h-full w-80 max-w-[86vw] flex-col border-l border-glass-border bg-surface-container p-6">
            <button className="self-end text-on-surface-variant" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>
              <X className="h-6 w-6" />
            </button>
            <nav className="mt-8 flex flex-col gap-4">
              {navItems.map((item) => (
                <a key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 font-label-md text-label-md text-on-surface">
                  {item.label}
                </a>
              ))}
            </nav>
            <Link href={ROUTES.dashboard} className="mt-8 rounded-lg bg-primary px-4 py-3 text-center font-label-md text-label-md text-on-primary">
              Open app
            </Link>
          </div>
        </div>
      ) : null}

      <section className="relative min-h-[860px] overflow-hidden pt-16">
        <ProductPreview />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#131313_0%,rgba(19,19,19,0.94)_35%,rgba(19,19,19,0.72)_58%,rgba(19,19,19,0.35)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />

        <div className="relative z-10 mx-auto flex min-h-[794px] max-w-container-max items-center px-margin-mobile py-24 md:px-margin-desktop">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-glass-border bg-surface-graphite/80 px-3 py-1.5 font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-primary">
              <Sparkles className="h-4 w-4" />
              Built for focused developers
            </div>
            <h1 className="font-display-lg text-[52px] font-black leading-[1.02] tracking-normal text-on-surface md:text-[78px]">
              Ship better sprints without losing the thread.
            </h1>
            <p className="mt-6 max-w-xl font-body-lg text-body-lg text-on-surface-variant">
              Sprintly turns tasks, focus sessions, and developer analytics into one operating surface for high-output engineering work.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={ROUTES.dashboard}
                className="neon-glow flex h-12 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-accent to-primary px-6 font-label-md text-label-md font-semibold text-on-primary"
              >
                Launch dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={ROUTES.workspace}
                className="flex h-12 items-center justify-center gap-2 rounded-lg border border-glass-border bg-surface-graphite/80 px-6 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-bright/60"
              >
                <Play className="h-4 w-4" />
                View workspace
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="mx-auto max-w-container-max px-margin-mobile py-20 md:px-margin-desktop">
        <div className="grid gap-gutter md:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="rounded-xl border border-glass-border bg-surface-graphite p-6 card-gradient">
                <div className="mb-5 grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="font-headline-md text-headline-md text-on-surface">{feature.title}</h2>
                <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">{feature.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="workflow" className="border-y border-glass-border bg-surface-container/50">
        <div className="mx-auto grid max-w-container-max gap-10 px-margin-mobile py-20 md:grid-cols-[0.8fr_1.2fr] md:px-margin-desktop">
          <div>
            <p className="font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-secondary">Workflow</p>
            <h2 className="mt-3 font-headline-lg text-headline-lg text-on-surface">A calm loop for real execution.</h2>
            <p className="mt-4 font-body-md text-body-md text-on-surface-variant">
              Sprintly keeps planning, doing, and review close together, so progress stays visible while the work is happening.
            </p>
          </div>
          <div className="grid gap-4">
            {workflow.map((item, index) => (
              <div key={item} className="flex items-center gap-4 rounded-xl border border-glass-border bg-surface-graphite p-5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-secondary/10 font-label-sm-mono text-label-sm-mono text-secondary">
                  {index + 1}
                </span>
                <span className="font-body-md text-body-md font-semibold text-on-surface">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="analytics" className="mx-auto max-w-container-max px-margin-mobile py-20 md:px-margin-desktop">
        <div className="grid gap-gutter md:grid-cols-12">
          <div className="md:col-span-5">
            <p className="font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-primary">Analytics</p>
            <h2 className="mt-3 font-headline-lg text-headline-lg text-on-surface">Know when your best work happens.</h2>
            <p className="mt-4 font-body-md text-body-md text-on-surface-variant">
              See focus split, velocity, deep work blocks, and productive hours in the same visual system as the product.
            </p>
          </div>
          <div className="card-gradient rounded-2xl border border-glass-border bg-surface-graphite p-6 md:col-span-7">
            <div className="mb-6 flex items-center justify-between">
              <span className="font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-on-surface-variant">Chronotype</span>
              <Code2 className="h-5 w-5 text-secondary" />
            </div>
            <div className="flex h-48 items-end gap-2">
              {["18%", "12%", "24%", "48%", "88%", "100%", "76%", "42%", "58%", "82%", "64%", "28%"].map((height, index) => (
                <span
                  key={height + index}
                  className={cn("w-full rounded-t-sm bg-surface-bright/50", index > 3 && index < 7 && "bg-secondary glow-cyan", index > 8 && "bg-primary/70 glow-violet")}
                  style={{ height }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-container-max px-margin-mobile py-20 md:px-margin-desktop">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-tertiary">Pricing</p>
            <h2 className="mt-3 font-headline-lg text-headline-lg text-on-surface">Start focused. Scale later.</h2>
          </div>
          <div className="glass-panel flex w-fit rounded-lg p-1">
            <button
              className={cn("rounded-md px-4 py-2 font-label-sm-mono text-label-sm-mono", !yearly ? "bg-surface-elevated text-primary" : "text-on-surface-variant")}
              type="button"
              onClick={() => setYearly(false)}
            >
              Monthly
            </button>
            <button
              className={cn("rounded-md px-4 py-2 font-label-sm-mono text-label-sm-mono", yearly ? "bg-surface-elevated text-primary" : "text-on-surface-variant")}
              type="button"
              onClick={() => setYearly(true)}
            >
              Yearly
            </button>
          </div>
        </div>

        <div className="grid gap-gutter md:grid-cols-2">
          {[
            { name: "Starter", price: "$0", body: "Explore the Sprintly workflow with local sample data.", features: ["Task workspace", "Session history", "Basic analytics"] },
            { name: "Pro", price: yearly ? "$120" : "$12", body: "Advanced productivity surface for serious developer rhythm.", features: ["Advanced analytics", "Goal planning", "Developer identity"], highlight: true },
          ].map((plan) => (
            <article key={plan.name} className={cn("rounded-2xl border bg-surface-graphite p-6", plan.highlight ? "border-primary shadow-[0_0_40px_rgba(160,120,255,0.16)]" : "border-glass-border")}>
              <h3 className="font-headline-md text-headline-md text-on-surface">{plan.name}</h3>
              <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">{plan.body}</p>
              <div className="mt-6 flex items-end gap-2">
                <span className="font-display-lg text-display-lg text-on-surface">{plan.price}</span>
                <span className="pb-2 font-body-sm text-body-sm text-on-surface-variant">{plan.name === "Pro" ? (yearly ? "/year" : "/month") : "forever"}</span>
              </div>
              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 font-body-sm text-body-sm text-on-surface">
                    <Check className="h-4 w-4 text-success-streak" />
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-glass-border bg-surface-container/50">
        <div className="mx-auto grid max-w-container-max gap-10 px-margin-mobile py-20 md:grid-cols-2 md:px-margin-desktop">
          <div>
            <p className="font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-secondary">Early access</p>
            <h2 className="mt-3 font-headline-lg text-headline-lg text-on-surface">Get product updates as Sprintly expands.</h2>
          </div>
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
            <input
              className="h-12 flex-1 rounded-lg border border-glass-border bg-[#0A0A0A] px-4 font-body-sm text-body-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-primary"
              name="email"
              placeholder="developer@example.com"
              type="email"
            />
            <button className="h-12 rounded-lg bg-primary px-5 font-label-md text-label-md text-on-primary" type="submit">
              Join list
            </button>
            {emailStatus ? <p className="font-body-sm text-body-sm text-success-streak sm:absolute sm:mt-14">{emailStatus}</p> : null}
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-margin-mobile py-20 md:px-margin-desktop">
        <h2 className="font-headline-lg text-headline-lg text-on-surface">Questions</h2>
        <div className="mt-8 space-y-3">
          {faqs.map((faq, index) => (
            <button
              key={faq.question}
              className="w-full rounded-xl border border-glass-border bg-surface-graphite p-5 text-left"
              type="button"
              onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
            >
              <span className="flex items-center justify-between gap-4 font-body-md text-body-md font-semibold text-on-surface">
                {faq.question}
                <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform", openFaq === index && "rotate-180")} />
              </span>
              {openFaq === index ? <span className="mt-3 block font-body-sm text-body-sm text-on-surface-variant">{faq.answer}</span> : null}
            </button>
          ))}
        </div>
      </section>

      <footer className="border-t border-glass-border">
        <div className="mx-auto flex max-w-container-max flex-col justify-between gap-4 px-margin-mobile py-8 md:flex-row md:items-center md:px-margin-desktop">
          <p className="font-body-sm text-body-sm text-on-surface-variant">Sprintly Developer Craft</p>
          <div className="flex gap-4">
            <Link href={ROUTES.dashboard} className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface">
              Dashboard
            </Link>
            <Link href={ROUTES.workspace} className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface">
              Workspace
            </Link>
            <Link href={ROUTES.analytics} className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface">
              Analytics
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
