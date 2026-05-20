You are scaffolding the base architecture for the Sprintly web app.

The UI has already been designed in Stitch and will be exported page-by-page into a local folder named `stitch-export/`. Your job is to create the production-ready base application, architecture, routing, providers, state, types, and integration structure so those exported pages can be dropped in cleanly.

IMPORTANT RULES
- Do NOT redesign the UI.
- Do NOT replace the Stitch-generated visual styling.
- Do NOT recreate page layouts that will be pasted from Stitch.
- Do NOT add backend logic or real API integrations.
- Do NOT make assumptions that break future page imports.
- Build only the foundation, app shell, architecture, and reusable infrastructure.

PROJECT CONTEXT
Sprintly is a full multi-page developer productivity web app with:
- dashboard
- task workspace
- sessions/activity
- analytics
- goals/sprints
- profile/dev identity
- settings
- billing
- community/compare
- onboarding

TECH STACK
Use:
- Next.js 15 App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Framer Motion
- Zustand
- TanStack Query
- Zod
- Lucide React

HIGH-LEVEL GOAL
Create a scalable frontend architecture that is ready to receive Stitch-exported pages one by one from `stitch-export/`, while keeping the app clean, modular, typed, and production-ready.

WHAT TO BUILD

1. APP FOUNDATION
Set up the complete base project structure for a modern SaaS web app.

Use a structure like:

src/
  app/
  components/
    ui/
    layout/
    shared/
    dashboard/
    workspace/
    analytics/
    activity/
    goals/
    profile/
    settings/
    billing/
    onboarding/
    community/
  providers/
  store/
  hooks/
  lib/
  constants/
  types/
  services/
  mock/
  config/
  styles/

Keep the structure clear and scalable.

2. ROUTING SHELL
Create App Router route groups for the full product:

src/app/
  (app)/
    dashboard/
    workspace/
    sessions/
    analytics/
    goals/
    profile/
    settings/
    billing/
    community/
  onboarding/
  auth/
  layout.tsx
  page.tsx

Each route should exist and be ready to receive its Stitch-exported UI.

3. APP SHELL / LAYOUT
Build the common application shell:
- persistent sidebar
- top navigation bar
- mobile drawer navigation
- content area wrapper
- route-aware active nav states
- command palette trigger shell
- page transition readiness

The shell should be reusable across dashboard-style pages.

4. STITCH EXPORT INTEGRATION
Create a clean import strategy for the pages exported from Stitch.

Assume exported page files will be placed in:

stitch-export/

Build the code so that:
- each exported page can be copied into the corresponding route folder
- shared components can be extracted into `src/components/`
- page-specific sections can remain isolated
- no page depends on hidden magic or fragile file paths
- routes have placeholders or wrappers that make integration straightforward

If helpful, create a temporary page registry or adapter layer so the Stitch exports can be wired in cleanly.

5. STATE MANAGEMENT
Create Zustand stores for:

- UI state
  - sidebar open/closed
  - mobile nav open/closed
  - command palette open/closed
  - theme mode
- session state
  - active session
  - streak
  - focus time
  - metrics
- workspace state
  - tasks
  - filters
  - sort mode
  - board/list mode
- user state
  - profile
  - preferences
  - onboarding completion

Use TypeScript types everywhere.

6. MOCK DATA LAYER
Create a centralized typed mock data layer for:
- dashboard stats
- sessions
- tasks
- analytics charts
- goals
- profile stats
- billing plans
- notifications

Do not hardcode data inside pages. Put sample data in `src/mock/` and `src/constants/`.

7. REUSABLE COMPONENTS
Create shared primitives that the Stitch pages can use:
- PageHeader
- SectionCard
- StatCard
- DashboardGrid
- EmptyState
- LoadingSkeleton
- SearchBar
- FilterBar
- Tabs
- MetricChip
- ProgressBar
- StatRing
- ChartContainer
- AppSidebar
- AppTopbar
- MobileNavDrawer

Keep components generic and reusable.

8. DESIGN SYSTEM SUPPORT
Set up:
- global theme tokens
- spacing scale consistency
- color tokens
- typography tokens
- reusable utility classes
- motion helper patterns

Do not overwrite Stitch styling. Just make the foundation compatible.

9. PROVIDERS / APP WRAPPERS
Create:
- TanStack Query provider
- theme/provider wrapper if needed
- app-level layout wrapper
- typed context organization if necessary

10. TYPES AND INTERFACES
Create clean TypeScript types for:
- tasks
- sessions
- charts
- navigation items
- user profile
- plans
- notifications
- onboarding steps
- dashboard widgets

Keep the types future-ready and easy to extend.

11. ARCHITECTURE RULES
- Pages should be thin.
- Shared logic belongs in hooks, stores, lib, or services.
- UI should be separated from data structure.
- No duplicate logic across routes.
- No backend assumptions.
- No unnecessary dependencies.

12. FILES TO CREATE
At minimum, create:
- app shell and layout files
- route folders for all main sections
- provider setup
- Zustand stores
- mock data files
- reusable shared components
- types folder
- utilities/helpers
- config/constants
- placeholder route pages ready for Stitch export replacement

OUTPUT REQUIREMENTS
- Build a clean, scalable, production-ready frontend base.
- Ensure the app can accept Stitch-exported pages one by one without restructuring the whole project.
- Preserve the visual work from Stitch and focus on architecture, modularity, and maintainability.
- Use modern conventions and keep the codebase easy to expand later.

SUCCESS CRITERIA
- The project boots cleanly
- Routes exist for all major product areas
- Shared app shell works
- State and data layers are in place
- Stitch-exported pages can be added route-by-route
- The architecture feels ready for a real product team to continue building