import Image from "next/image";

type TaskTone = "primary" | "secondary";
type PriorityTone = "high" | "medium";

interface WorkspaceTask {
  id: string;
  title: string;
  project: string;
  ticket?: string;
  estimate?: string;
  priority?: string;
  priorityTone?: PriorityTone;
  tone: TaskTone;
  assignees?: string[];
}

const avatarUrls = [
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDWq3nIHWomMseIzbH3-ID-237W6lehqTcZRZb-d4jzaP7ZR3NKf667QlhxrGajuvTm0NywAFlOOZ5gKNuktxXUAMJTYfOP_qMbpmCUla-iZ9dltX1T9DJpwYWSXMmdJ8D06zD8YNqvHtDhTWOUEiS7Mr18NiNmrxsoOOTvTIceo2tyjsEQ3O_szrLu4KuTg9Mwso162o0EQcWp-m-NNnT2Qb-xFQGeS3jr9-T_zvuVRsIAd4P4UD-e-TS7cih5PhJAMCuYZpzyVak",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDYTs6r-Hrp13sjTawJ0C1t3jovTg0UnXTo720MgJ3w-IkNG3nVwBL0nQSThhfQEPTSalEb95tpLoUN0k9fFR4Cecd2Z6IWMfQHvoCprzixjJIUbdsS6xvY5jp64EoQGT0hE2NPsElilDVerL-8eNVNcIlAX7nEJ9CJKcNfHGUKavcDIDyUKHBjVoR2WXOSI9f_MUjjodMA-wdX09k4-peWtFVDGt7A0Iq5H5DwUTJNUvgujJtvDSv5tFX2EEDrsvYmlFjSPoGWr-M",
];

const inProgressTasks: WorkspaceTask[] = [
  {
    id: "SNT-42",
    title: "Implement OAuth2 flow for third-party integrations",
    project: "Core API",
    ticket: "SNT-42",
    estimate: "4h est.",
    priority: "High",
    priorityTone: "high",
    tone: "secondary",
    assignees: [avatarUrls[0]],
  },
  {
    id: "SNT-45",
    title: "Build responsive grid layout for analytics dashboard",
    project: "Frontend",
    ticket: "SNT-45",
    estimate: "6h est.",
    priority: "Med",
    priorityTone: "medium",
    tone: "primary",
    assignees: [avatarUrls[1]],
  },
];

const todoTasks: WorkspaceTask[] = [
  {
    id: "todo-typography",
    title: "Update typography tokens in Tailwind config",
    project: "Design System",
    tone: "primary",
  },
  {
    id: "todo-query",
    title: "Optimize database query for user dashboard load",
    project: "Core API",
    tone: "secondary",
  },
];

function MaterialIcon({ children, className }: { children: string; className?: string }) {
  return <span className={className ? `material-symbols-outlined ${className}` : "material-symbols-outlined"}>{children}</span>;
}

function projectBadgeClass(tone: TaskTone) {
  return tone === "secondary" ? "bg-secondary/10 text-secondary" : "bg-primary/10 text-primary";
}

function priorityBadgeClass(tone?: PriorityTone) {
  return tone === "high" ? "bg-error/10 text-error" : "bg-tertiary/10 text-tertiary";
}

function WorkspaceHeader() {
  return (
    <div className="border-b border-glass-border px-margin-mobile py-6 md:px-margin-desktop">
      <div className="mx-auto flex max-w-container-max flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile tracking-tight text-on-surface md:font-headline-lg md:text-headline-lg">
            Active Sprints
          </h2>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
            Manage and track your current development cycles.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="glass-panel flex rounded-lg p-1">
            <button className="flex items-center gap-2 rounded-md bg-surface-elevated px-3 py-1.5 font-label-sm-mono text-label-sm-mono text-primary shadow-sm">
              <MaterialIcon className="text-[16px]">view_list</MaterialIcon>
              List
            </button>
            <button className="flex items-center gap-2 rounded-md px-3 py-1.5 font-label-sm-mono text-label-sm-mono text-on-surface-variant transition-colors hover:text-on-surface">
              <MaterialIcon className="text-[16px]">calendar_view_week</MaterialIcon>
              Board
            </button>
          </div>
          <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label-md text-label-md text-on-primary shadow-[0_0_10px_rgba(208,188,255,0.2)] transition-colors hover:bg-primary-fixed-dim">
            <MaterialIcon className="text-[18px]">add</MaterialIcon>
            New Task
          </button>
        </div>
      </div>
    </div>
  );
}

function InProgressTaskCard({ task }: { task: WorkspaceTask }) {
  return (
    <div className="task-card group relative flex cursor-pointer flex-col justify-between gap-4 overflow-hidden rounded-xl border border-glass-border bg-[#171717] p-4 md:flex-row md:items-center">
      <div
        className={`pointer-events-none absolute right-0 top-0 h-full w-64 bg-gradient-to-l ${
          task.tone === "secondary" ? "from-secondary/5" : "from-primary/5"
        } to-transparent`}
      />
      <div className="z-10 flex items-start gap-4">
        <button className="mt-1 flex-shrink-0 text-on-surface-variant transition-colors hover:text-secondary">
          <MaterialIcon>radio_button_unchecked</MaterialIcon>
        </button>
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 font-label-sm-mono text-[10px] uppercase ${projectBadgeClass(task.tone)}`}>
              {task.project}
            </span>
            {task.priority ? (
              <span className={`rounded px-2 py-0.5 font-label-sm-mono text-[10px] ${priorityBadgeClass(task.priorityTone)}`}>
                {task.priority}
              </span>
            ) : null}
          </div>
          <h4 className="font-body-md text-body-md text-on-surface transition-colors group-hover:text-primary">
            {task.title}
          </h4>
          <div className="mt-2 flex items-center gap-4 font-body-sm text-[12px] text-on-surface-variant">
            {task.ticket ? (
              <span className="flex items-center gap-1">
                <MaterialIcon className="text-[14px]">tag</MaterialIcon>
                {task.ticket}
              </span>
            ) : null}
            {task.estimate ? (
              <span className="flex items-center gap-1">
                <MaterialIcon className="text-[14px]">schedule</MaterialIcon>
                {task.estimate}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <TaskActions assignees={task.assignees} />
    </div>
  );
}

function TodoTaskCard({ task }: { task: WorkspaceTask }) {
  return (
    <div className="task-card group flex cursor-pointer flex-col justify-between gap-4 rounded-xl border border-glass-border/50 bg-[#171717]/80 p-4 md:flex-row md:items-center">
      <div className="flex items-start gap-4">
        <button className="mt-1 flex-shrink-0 text-on-surface-variant transition-colors hover:text-on-surface">
          <MaterialIcon>radio_button_unchecked</MaterialIcon>
        </button>
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 font-label-sm-mono text-[10px] uppercase ${projectBadgeClass(task.tone)}`}>
              {task.project}
            </span>
          </div>
          <h4 className="font-body-md text-body-md text-on-surface transition-colors group-hover:text-primary">
            {task.title}
          </h4>
        </div>
      </div>
    </div>
  );
}

function TaskActions({ assignees }: { assignees?: string[] }) {
  return (
    <div className="z-10 flex items-center gap-3 opacity-100 transition-opacity md:opacity-0 group-hover:opacity-100">
      <button className="rounded-lg border border-glass-border bg-surface p-2 text-on-surface-variant transition-colors hover:bg-surface-elevated">
        <MaterialIcon className="text-[18px]">edit</MaterialIcon>
      </button>
      <button className="rounded-lg border border-glass-border bg-surface p-2 text-on-surface-variant transition-colors hover:bg-surface-elevated">
        <MaterialIcon className="text-[18px]">more_horiz</MaterialIcon>
      </button>
      {assignees?.length ? (
        <div className="ml-2 flex -space-x-2">
          {assignees.map((assignee) => (
            <div key={assignee} className="h-8 w-8 overflow-hidden rounded-full border border-glass-border bg-surface-container-high">
              <Image alt="Assignee" className="h-full w-full object-cover" height={32} src={assignee} width={32} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StitchWorkspace() {
  return (
    <div className="stitch-page-root -mx-margin-mobile -mb-12 -mt-6 flex min-h-[calc(100vh-4rem)] flex-col md:-mx-margin-desktop">
      <WorkspaceHeader />
      <div className="mx-auto w-full max-w-container-max flex-1 overflow-y-auto p-margin-mobile md:p-margin-desktop">
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-secondary shadow-[0_0_8px_rgba(76,215,246,0.5)]" />
            <h3 className="font-headline-md text-body-lg text-on-surface">
              In Progress <span className="ml-2 text-body-sm text-on-surface-variant">2</span>
            </h3>
          </div>
          <div className="space-y-3">
            {inProgressTasks.map((task) => (
              <InProgressTaskCard key={task.id} task={task} />
            ))}
          </div>
        </section>

        <section className="mb-10 opacity-80 transition-opacity hover:opacity-100">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-on-surface-variant" />
            <h3 className="font-headline-md text-body-lg text-on-surface">
              Todo <span className="ml-2 text-body-sm text-on-surface-variant">3</span>
            </h3>
          </div>
          <div className="space-y-3">
            {todoTasks.map((task) => (
              <TodoTaskCard key={task.id} task={task} />
            ))}
          </div>
        </section>

        <section className="mb-10">
          <button className="group flex w-full items-center gap-3 text-left">
            <MaterialIcon className="text-[20px] text-on-surface-variant transition-colors group-hover:text-on-surface">
              chevron_right
            </MaterialIcon>
            <h3 className="font-headline-md text-body-lg text-on-surface-variant transition-colors group-hover:text-on-surface">
              Done <span className="ml-2 text-body-sm text-on-surface-variant">12</span>
            </h3>
          </button>
        </section>
      </div>
    </div>
  );
}
