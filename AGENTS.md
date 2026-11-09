# AGENTS.md — Sunbee Studio

Sunbee Studio — AI video production app built on a React 19 admin template: Vite 8 · TypeScript ~6 · Tailwind CSS v4 · React Router 8 · Base UI · react-i18next, with an Express 5 + better-sqlite3 backend (`server/`, types shared via `shared/types.ts`) and an Electron shell. Cookie-session auth; no global client store.

## Server and AI (`server/`)

- Each Video Studio step is a module in `server/modules/<step>/` (`routes.ts`, `tasks/`, `sources/`, `repo.ts`), listed in `server/modules/index.ts` and mounted at `/api/<mountPath>`. The frontend twin is `src/pages/main/studio/steps/<step>/`, listed in `steps/registry.ts`.
- Every AI call is a task: `defineTask({ key, module, label, prompts, run })` in the module's `tasks/`, run with `runTask`. Prompts come from `promptOf(ctx, task, slot)` (user override → global override → default), so never hard-code a prompt elsewhere. Call vendors only through `providerFor(ctx, provider)` (`server/services/ai/providers/`), and add skill/example/document context with `buildContext()` (`server/services/ai/context.ts`).
- Features outside the step pipeline use the same module shape and are listed in `featureModules` (`server/modules/index.ts`): their API mounts at `/api/<mountPath>` and their AI tasks get their own tab in Settings → Prompts (`FEATURE_PROMPT_TABS` in `settings/categories/prompts-section.tsx`). The first one is **AI training** (`server/modules/training/`).
- AI training learns a skill (voice, structure, visual style, knowledge) from many sources and stores every run in `skill_versions` (full snapshot + `{kind, id, added}` sources), so versions can be viewed and restored. Training is **cumulative**: re-training re-reads everything the latest version learned (minus `removeSources`) plus the new material, tagged [đã học]/[MỚI], and merges it into the current guide (`refine` prompt) instead of concluding from the new material alone.
- Long material never gets silently truncated: prompt budgets live in `training/budget.ts`; sources that don't fit their share are first read in full — in ~24k-char parts, 3 calls at a time — by the `training.digest` task (`digests.ts`), and the training call gets those notes + an excerpt. Notes are cached in `training_digests` by source text + digest prompt + model, so re-training only reads new or changed sources. Material comes from **training sources** (`server/modules/training/sources/`), one per kind implementing `TrainingSource` (`listCandidates`, `load`, `labels`, optional `attachToSkill`) — today `link`, `upload` (saved script versions, see `script-versions.ts`) and `document`, mirroring the Script step's sources. On the page, each kind also has an **adder** (`src/pages/main/library/training/adders/`) that makes new material through the existing endpoints (fetch a link, transcribe an upload, upload/paste a document). To add a kind: the file + its entry in `sources/index.ts`, its value in `TrainingSourceKind` (`shared/types.ts`), its icon/adder in `src/pages/main/library/training/sources.ts`, and `training.sources.<kind>` labels in both message files — the page renders a picker per kind on its own.
- Scripts run up to ~30k characters. Size a task's `maxTokens` from `server/services/ai/limits.ts` (a whole script ≈ 12–15k tokens of Vietnamese, plus thinking) instead of a literal. Providers stream above 16k output tokens and throw on `max_tokens` / `length` rather than return truncated text — never catch that to keep a partial result. Analysis splits long scripts by text length as well as frame count (`analyzeChunkCount` in `shared/script-cost-estimate.ts`).
- Research sources implement `ResearchSource` (`server/services/research/`); modules add their own via `registerResearchSource`.
- Data hierarchy: Project → Category → Video (`server/services/db/{projects,categories,videos}-repo.ts`, routes in `server/routes/`). All three are soft-deleted (`deleted_at`); a video counts as gone when it, its category or its project is deleted.
- Never trust an id from the client: before reading or writing under a project/category/video, check it with `getProject` / `getCategory` / `canAccessVideo` (owner or admin, not soft-deleted) and answer 404 otherwise. Routes taking an optional `videoId` mount `requireVideoAccess` (`server/middleware/require-access.ts`) after `requireAuth` (and after multer for uploads).
- Schema changes: append a numbered migration to `server/services/db/migrations.ts`. Never edit a shipped one.
- Uploaded binaries go through `server/services/storage/files.ts` (served by `GET /api/files/:id`).
- Client calls go through `src/lib/api-client.ts`.
- Test against a scratch data dir (`SUNBEE_DATA_DIR`), never the real `data/`.

## Commands

| Command            | Purpose                                |
| ------------------ | -------------------------------------- |
| `npm run dev`      | Vite dev server                        |
| `npm run build`    | `tsc -b` + Vite production build       |
| `npm run lint`     | Oxlint + ESLint (`lint:fast` = Oxlint) |
| `npm run lint:fix` | Oxlint fixes, then ESLint fixes        |
| `npm run format`   | Prettier across the repo               |

There is no test suite. **Run `npm run build` and `npm run lint` after every change.**

## Where Things Live

```text
src/
├── App.tsx              # THE route registry (static imports, no lazy loading)
├── main.tsx             # StrictMode → BrowserRouter → ThemeProvider → HelmetProvider
│                        #   → I18nProvider → TooltipProvider → App
├── index.css            # All Tailwind v4 config: @theme tokens, @utility classes,
│                        #   dark variant, third-party CSS overrides
├── components/
│   ├── layout/app-layout/   # Dashboard shell (sidebar, header, Outlet)
│   │   └── sidebar/data.tsx # Sidebar sections + items (separate from routes)
│   ├── layout/layout-*/     # Shells for the six /layout-* example pages
│   ├── shared/              # Cross-route widgets: page-meta, page-breadcrumb,
│   │                        #   confirm-dialog, name-dialog, header controls, …
│   └── ui/                  # Flat Base UI primitives (button.tsx, dialog.tsx, …); no barrel
├── lib/                 # api-client.ts (all API calls), paths.ts (all app URLs)
├── pages/{main,others,support}/<feature>/   # Route features (categories only, see below)
│   └── main/            # The product; folders mirror the sidebar sections:
│       ├── dashboard/overview/   # "Production" → Overview (/)
│       ├── projects/             # "Production" → Projects list + detail/
│       ├── studio/               # Video studio (/studio?video=): step pipeline in steps/
│       ├── library/{media,documents,skills}/   # "Library" section
│       ├── library/training/     # AI training: learn skills from videos + documents, versions
│       ├── settings/, database-admin/          # "System" section
│       └── …                     # Template demo pages (sidebar shows them in dev only)
├── contexts/            # ThemeProvider / useTheme only
├── hooks/<hook-name>.ts # Custom hooks
├── i18n/                # i18next setup, hooks, locales (routing.ts), language metadata
├── messages/{en,vi}.json
├── icons/               # Shared SVG components + barrel; flag-*.svg via `?react`
└── utils/               # cn(), get-initials
```

Path alias: `@/*` → `src/*`.

## Routing

- `src/App.tsx` is the **only** source of routes. Folder structure does not generate URLs, and `pages/main`, `pages/others`, `pages/support` are organizational categories, **not** layout boundaries. Read `App.tsx` to see which layout wraps a page.
- Layout groups in `App.tsx`:
  - **`AppLayout`** (pathless): nearly all pages, including charts, maps, UI elements, and support. Nested layouts under it: `/ai-chat/*`, `/ai-settings/*` (index routes redirect to `text` / `account`), and the email `inbox-layout.tsx` (`/inbox`, `/inbox-details`). `AppLayout` applies full-height handling for `/ai-chat` and `/ai-settings`.
  - **`AuthLayout`** (`pages/others/auth/layout.tsx`): `/signin`, `/signup`, `/reset-password`, `/two-step-verification`. Demo forms only; no guards or sessions.
  - **No layout**: error/status pages (`/error-404`, `/error-500`, `/error-503`, `/coming-soon`, `/maintenance`, `/success`), `/layout-one`…`/layout-six` (own `SidebarProvider`), and the `/*` 404 fallback.
- No dynamic params, locale-prefixed URLs, loaders, or actions. A page about one record reads its id from the query string (`/projects/detail?id=…`, `/studio?video=…`). Import `Link`/hooks from `react-router`, never `react-router-dom`.
- Spell app URLs only in `src/lib/paths.ts`: `App.tsx` registers routes with `paths.*`, and links use `paths.*` or the builders (`projectUrl(id)`, `studioUrl(videoId)`). Retired URLs (`/video-studio/*`) redirect in `App.tsx`; keep such redirects when moving a page.

### Adding a page

1. Create a kebab-case folder under the fitting `pages/` category. Entry is a default export from `index.tsx` (or `page.tsx` when wrapping reusable content with metadata). Some groups export through barrels (`pages/main/pages`, `pages/others/auth`, `pages/main/empty-state`, AI settings, email, support-tickets); follow the neighbor.
2. Colocate page-only components, `data.ts`, `types.ts`, `schema.ts` in that folder. Do not create `src/components/<feature>/`.
3. Add `PageMeta` (`@/components/shared/page-meta`); inner pages usually add `PageBreadcrumb` too.
4. Add the URL to `src/lib/paths.ts`, then register the route in `App.tsx` under the right layout.
5. For navigation, add an item to the right section of `navSections` in `components/layout/app-layout/sidebar/data.tsx` **and** its label key `sidebar.items.<key>` to both message files (`en`, `vi`); a new section also needs `sidebar.groups.<key>`. An item is active on an exact `path` match, or at/below any of its `activePaths` (e.g. Projects stays active on `/projects/detail` and `/studio`).

## Components and State

- Files/folders lower-kebab-case; components PascalCase. Pages default-export; primitives/utilities named-export.
- Import primitives directly: `import { Button } from "@/components/ui/button";`.
- Extend primitives with Base UI composition, `cva` variants, `data-slot` attributes, and `cn()`. Don't introduce another component library pattern.
- Dialogs: controlled `open`/`onOpenChange` with `@/components/ui/dialog`. There is no `Modal` or `useModal`. For "type a name" and "are you sure?" use `NameDialog` / `ConfirmDialog` from `components/shared` (they handle submitting and errors). To start a new video anywhere, open `NewVideoDialog` (`pages/main/projects/new-video-dialog.tsx`).
- A page that shows one record keys its inner component by the id (`<StudioForVideo key={videoId} />`) instead of resetting state in an effect.
- Theme: `useTheme` from `@/contexts` (`light` | `dark` | `auto`). Sidebar: `useSidebar` from `@/components/ui/sidebar`.
- Forms: React Hook Form + Zod resolver + colocated schema + `Field`/`FieldLabel`/`FieldError` from `@/components/ui/field`.
- Tables: TanStack Table **v9**. Copy patterns from `pages/main/tables/{basic-tables,data-tables}`, not from older-version docs.
- UI demo sections use `ComponentCard`.
- Tasks: local React state + React DnD (`HTML5Backend`); shared task UI in `pages/main/task/`, list/kanban specifics in their subfolders.
- ApexCharts/FullCalendar are used directly; no SSR guards or lazy wrappers.

## i18n

- Never reinitialize i18next (`src/i18n/config.ts`; provider mounted once in `main.tsx`).
- Locales: `en` and `vi` (`src/messages/{en,vi}.json`); add every new key to **both**. ICU syntax for interpolation/plurals.
- Use wrappers from `@/i18n`:

  ```tsx
  const t = useTranslations("feature.namespace");
  ```

  `getTranslations` outside components, `useLocale` / `useChangeLocale` for locale. There is no `useLanguage`.

- Some legacy demo text is hardcoded. Don't copy that; translate new or touched UI.

## Styling

- Tailwind v4 config lives only in `src/index.css`. Never add `tailwind.config.*`, CSS Modules, or CSS-in-JS.
- Prefer `@theme` tokens (`brand-*`, `font-outfit`, `text-heading-*`, `text-title-*`, `shadow-theme-*`, custom breakpoints, z-index tokens) and existing `@utility` classes (`menu-item-*`, `menu-dropdown-*`, `nav-icon-item-*`, `custom-scrollbar`, `no-scrollbar`, …) before adding new ones. New utilities need matching groups in `src/utils/cn.ts`.
- Always add `dark:` styles for new surfaces, text, borders, and states.
- There is no `error-*` color token: use `text-red-500 dark:text-red-400` for error text.
- RTL: use logical utilities (`ms/me`, `ps/pe`, `inset-s/e`, `border-s/e`, `text-start/end`, logical radius) and `rtl:` variants to flip directional icons/transforms.
- Third-party CSS overrides go in the matching section of `index.css`.

## Icons and Assets

- Shared icons: kebab-case `.tsx` component taking `IconProps`, exported from `src/icons/index.tsx`; import from `@/icons`. Feature-only icons may live in a colocated `icons.tsx`. Don't inline SVG markup in pages or primitives.
- Flags are SVGR default imports: `import Flag from "./flag-x.svg?react"`.
- `public/` assets use root-relative URLs (`/images/...`).

## Boundaries

- Ask before installing packages.
- Don't add route-level code splitting, auth guards, new providers, or a second routing/navigation source of truth without an explicit requirement.
- Promote code to `components/shared` or `components/ui` only when it is genuinely reused across routes.
