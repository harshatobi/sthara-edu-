# Handoff: Sthara role-color redesign ("Dusk" preset)

**For:** Claude Code in the terminal, working in `sthara-edu-` (branch `live-lab` at the time of writing; main is `main`).
**From:** a design session with Moses (COO), 16–23 Oct 2026. Nothing has been written to the codebase yet.
**Visual reference:** the private studies page https://claude.ai/artifact/EVc6Sxt93g52g43wX5VhAy. Press **★ Recommended** to load exactly the settings below. Open it with your Artifact tool (`action: "read"`) if you have one, or ask Moses for screenshots.

---

## ⛔ Rule zero: ask before you build

**Do not edit, create or delete any file until Moses has answered the questions in "Questions to ask first" below.**

1. Read this whole document and the files under "Where it lives in the code".
2. Ask the questions in one batch: use the AskUserQuestion tool if you have it, otherwise a numbered list. Wait for answers.
3. Play back a short plan (files, order, what ships in the first PR) and get an explicit "go".
4. Only then branch off (`git checkout -b <name>`, never commit on `main`) and build.
5. If a new decision comes up mid-build that this doc doesn't settle, **stop and ask** instead of choosing.

This repo's `AGENTS.md` warns that its Next.js version differs from what you know. Read the relevant guide in `node_modules/next/dist/docs/` before touching routing, layouts or config.

---

## The chosen settings (the ★ Recommended preset)

| Setting | Value |
|---|---|
| Sidebar study | **D · Dusk** |
| Palette | **Marketing site** hexes (`site/refinement.css`) |
| Crimson | **Alerts + AI**: crimson means risk *or* AI, nothing else |
| Ops treatment | **Navy + four-role band** |
| Score colors | **TML bands** on every mastery score, all roles |
| App background | **White** (0% tint) |
| Icons | **Phosphor, app style** (duotone at rest, fill when active), colored by **role**, not per-icon |
| Font | **Plus Jakarta Sans** (already in use) |
| Phone navigation | per role, see "Phone layouts" |

### 1. Role palette (from `site/refinement.css`, lines 1–4)

| Role | Deep: fills and text on white | Pastel: accents on navy | Kicker (`subtitle` in CanonShell) |
|---|---|---|---|
| Student · Sky | `#315FA9` | `#9AC2FF` | HONEST DESK |
| Teacher · Teal | `#167762` | `#79DFC6` | TEACHING COPILOT |
| Admin · Amber | `#996219` | `#F1C482` | COMMAND CENTRE |
| Parent · Rose | `#A13C5A` | `#EFA5BC` | PARENT PORTAL |
| Ops · Navy | `#002147` | `#AFC4E3` (derived) | PLATFORM MANAGER |

White text on every deep color passes 4.5:1. Amber is the tightest at about 4.9:1, so avoid thin weights on it.
Washes are mixes of the deep color into white: `color-mix(in srgb, <deep> N%, #fff)`, with N = 6, 10 or 18.

### 2. Dusk sidebar

- **Fill:** a vertical gradient from `--dusk` at the top to Sthara navy `#002147` at the bottom.
  `--dusk = color-mix(in srgb, <role deep> P%, #0A1324)` with P = **Student 38, Teacher 38, Admin 42, Parent 36**. Ops uses plain navy.
  - Blend into near-black navy `#0A1324`, **not** `#002147`. Amber blended into `#002147` turns olive. This was checked visually.
- **Nav text:** `rgba(255,255,255,.74)`.
- **Active item:** solid **role pastel** pill with navy `#002147` text, weight 700. This replaces today's `--navActive` background and the crimson left tab.
- **Kicker** (`.brand i`): role pastel. Today it is `var(--red)`.
- **Top rule:** a 3px line in role deep across the top of the main content area.
- **Hero banners:** navy `#002147` with a role glow, `radial-gradient(120% 140% at 100% 0%, <deep 70% alpha>, transparent 60%), #002147`.
- **Ops:** the same Dusk shell on navy, plus a 4px stripe across the top of the sidebar in the four role pastels (Sky → Teal → Amber → Rose, 25% each). The active tab indicator uses the same gradient.
- **Tablet (681–900px):** keep today's 78px icon strip. The active state becomes the role pastel instead of crimson.

### 3. Crimson rules ("Alerts + AI")

Crimson `#E11D48` (`--red` in canon.css) is reserved for exactly two meanings.

**Risk.** Errors, at-risk students, and the TML "Needs support" band.

**AI.** Every AI entry point:
- nav icons for AI Tutor, AI Assistant, Probe and Ask the School OS (Phosphor `Brain`, `Sparkle`, `ChatsCircle`)
- AI primary buttons ("Start AI Tutor", "Ask the School OS")
- Ask bars: crimson outline, a sparkle icon and a small "AI" tag
- AI-suggested items, such as "28 of 32 marked by Sthara" shown as a "✦ Confirm 28" chip
- the phone centre button when it is Tutor or Ask

**Hard rule:** an AI use of crimson always carries a ✦ sparkle or an "AI" tag. A risk use never does. That mark is the only thing that tells them apart.

**On dark surfaces** (the navy sidebar or hero), use the lighter crimson `#FB7185`.

**Everything else that is crimson today becomes role deep** (or navy where noted): ordinary primary buttons such as "Assign homework" and "Export board pack", page eyebrows (`.pbar .eyebrow`), the active nav tab, the tablet active pill, and the phone tab bar's active label. canon.css has about 177 uses of `var(--red)` and about 137 literal crimson hexes in `.tsx` files, so each needs triage: risk, AI, or neither.

### 4. TML score bands (identical in every role)

| Band | Range | Color | Text on the color |
|---|---|---|---|
| Exemplary | 90+ | `#10B981` | white |
| Proficient | 75–89 | `#34D399` | navy `#0B1F3A` |
| Developing | 50–74 | `#F5B60B` | navy |
| Critical gap | 35–49 | `#F98A4B` | navy |
| Needs support | under 35 | `#E11D48` | white |

- **Where scores get the band color:** every TML / mastery number, progress bar, chart bar and band pill.
- **Where they don't:** non-score numbers (fees, attendance, counts) keep the role color.
- **Always show the band label**, never color alone. Admin amber `#996219` sits close to Developing `#F5B60B`.
- **Wording mismatch:** the parent carousel says "Needs support", but the code says "Severe need" (`src/lib/tml/engine.ts:222`, `src/lib/admin/desk.ts:62`). This is an open question.
- **Hard-coded copies:** band hexes are repeated across many files (StudentDashboard, YourWork, Ops consoles, admin pages, `parent/common.tsx:88`, and others).

### 5. Icons

- **Library:** keep Phosphor (`@phosphor-icons/react`) and the existing `InteractiveIcon` component (duotone at rest, fill when active).
- **Color:** change `InteractiveIcon` coloring from the per-icon palette in `src/lib/iconColors.ts` to **role color**:
  - **Navy sidebar:** pastel when idle, navy inside the active pill.
  - **White surfaces** (such as the phone tab bar): role deep.
- **AI icons:** crimson per section 3.
- **Why:** the per-icon colors clash with role colors (Quiz teal on Teacher, Bell amber on Admin, Heart rose on Parent) and with the TML bands.

### 6. Typography

**Plus Jakarta Sans** stays everywhere. Use `font-variant-numeric: tabular-nums` on scores and KPI numbers. Add **Noto Sans Devanagari** as a fallback for Hindi text (still to be confirmed).

### 7. Phone layouts (≤680px)

The phone screen leads with each role's most-used content:

| Role | Leads the screen | Navigation pattern | Centre action |
|---|---|---|---|
| Student | Homework due this week, then the tutor | Bottom bar + raised centre button | Tutor (crimson, AI) |
| Teacher | Marks waiting for confirmation, then today's periods, plus quick "Take attendance" and "Assign homework" | Bottom bar + centre button | Confirm |
| Parent | Ask bar, child switcher, the child's mastery, then fees and messages | Home grid launcher (or bottom bar + Ask) | Ask (crimson, AI) |
| Admin | What needs a decision, then school-wide TML | Top tabs + drawer (the Dusk sidebar slides in) | n/a |
| Ops | Watch list, then schools live | Top tabs + drawer | n/a |

### Not chosen (don't build)

- Studies A, B, C, E, F and G.
- The Tailwind palette.
- A background tint, and the "Appearance" user setting. Both are concepts only.
- Per-icon "App colors" mode.

---

## Where it lives in the code (verified 23 Oct 2026)

| Area | File | What changes |
|---|---|---|
| Shell tokens | `src/styles/canon.css:13-17` | `--nav`, `--navActive`, `--red` and friends; add role tokens |
| Sidebar | `src/styles/canon.css:42-62` | aside background, `.brand i` (kicker), `.nv.on` and `.nv.on::before` |
| Tablet / phone | `src/styles/canon.css:246-316` | 78px strip active state, `.tabbar`, `.more-sheet` (crimson today) |
| Shell component | `src/components/canon/CanonShell.tsx` | needs to know the role, e.g. a new `role` prop or a `data-role` on `.canon` |
| Role layouts | `src/app/{student,teacher,parent,admin}/layout.tsx`, `src/app/ops/OpsShell.tsx` | pass the role; nav lists live here |
| Icons | `src/components/ui/InteractiveIcon.tsx`, `src/lib/iconColors.ts`, `src/app/globals.css:34-110` | role-colored mode; AI icons crimson |
| TML bands | `src/lib/tml/engine.ts:222-231`, `src/lib/admin/desk.ts:56-63`, `src/components/parent/common.tsx:88` and many hard-coded hexes | single source of truth, label wording |
| Marketing palette | `site/refinement.css:1-4` | source of the role hexes; `data-role` pattern to mirror |
| Base colors | `src/app/globals.css:5-16` | `--color-sthara-crimson #dc143c` vs canon `--red #E11D48` (two crimsons today) |

A suggested mechanism, to confirm with Moses: mirror the site's pattern. Put `data-role="student|teacher|admin|parent|ops"` on the `.canon` root and define `--role-deep`, `--role-soft`, `--role-dusk` and `--ai` per role in canon.css. Components then use only those variables.

---

## Questions to ask first

Ask all of these before building. Suggested defaults are in brackets, but don't assume them.

**Scope and delivery**
1. Which roles go first: all five at once, or a pilot role? [suggest Teacher or Parent first]
2. One PR or several (shell and sidebar → crimson triage → TML bands → icons → phone layouts)? [suggest several, in that order]
3. Which branch should this start from: `main`, or the current `live-lab`? Should a feature flag or env toggle guard the new look?
4. Do the demo portals (`src/components/admin/AdminDemoPortal.tsx`, `src/components/teacher/TeacherDemoPortal.tsx`) and the marketing `site/` need to match too, or only the app?

**Visual decisions still open**

5. Admin's primary button: keep amber `#996219` (it sits next to amber "Developing" pills) or switch to navy?
6. Lowest TML band label: "Needs support" (parent carousel) or "Severe need" (current code)? Same label for every role, or parent-facing only?
7. Crimson: which of the two do we standardise on, `#E11D48` (canon) or `#DC143C` (globals)?
8. AI marking: is a ✦ sparkle and "AI" tag acceptable as the mandatory marker on every AI crimson element? Any AI features I haven't listed (Teacher Copilot, Quiz Creator generation, Live Lab, WhatsApp summaries)?
9. Is the phone navigation per role (section 7) approved as-is, or is the bottom bar only for now?
10. Should Hindi / regional text get Noto Sans Devanagari now, or later?

**Engineering**

11. TML bands: may I centralise the band colors into one module and replace the hard-coded hexes across the files listed, or keep the change visual-only for now?
12. How should the shell learn the role: a `role` prop on CanonShell, or derive it from the route?
13. Should `InteractiveIcon` keep the per-icon palette available behind an option, or remove it?
14. Testing: there's Playwright (`playwright.config.ts`) and a `qa/` folder. Which checks must pass, and should I add visual snapshots per role?
15. Anything off-limits: files, flows or demo data I shouldn't touch?

After the answers, play back the plan and wait for "go".

---

## Decided (Moses, 23 Oct 2026)

1. **Roles:** all five at once (Student, Teacher, Admin, Parent, Ops).
2. **Delivery:** one PR.
3. **Branch:** fresh from `main` **after PR 36 (Living Record) merges**. No feature flag; the new look replaces the old.
4. **Coverage:** the app and the demo portals (`AdminDemoPortal`, `TeacherDemoPortal`). The marketing `site/` is not part of this.
5. **Admin primary buttons:** navy `#002147`. Amber stays for the admin sidebar and accents.
6. **Lowest TML band label, by audience:** "Needs support" for parents and students, "Severe need" for staff.
7. **Crimson:** standardise on `#E11D48`. `--color-sthara-crimson #dc143c` in globals.css goes.
8. **AI marker:** the Phosphor `Sparkle` icon (not the ✦ text glyph; no emoji anywhere) plus a small "AI" tag. AI crimson also covers Teacher Copilot and Live Lab, Quiz Creator and paper generation, and Ask the School OS / WhatsApp AI summaries.
9. **Phone navigation:** approved as written in section 7.
10. **Fonts:** Noto Sans fallbacks for all Indian scripts in the curriculum (Devanagari, Telugu, Tamil, Kannada, Malayalam, Bengali, Gujarati, Gurmukhi, Odia, ...), loaded only when that script appears.
11. **TML bands:** centralised in one module (ranges, labels per audience, colours, text colours). Hard-coded band hexes removed.
12. **Role source:** a `role` prop on CanonShell, set by each role layout, which sets `data-role` on the `.canon` root.
13. **InteractiveIcon:** role colour by default; the per-icon palette stays available behind an option.
14. **Testing:** the full regression rule, plus Playwright visual snapshots per role (desktop, tablet, phone) and an automated 4.5:1 contrast check on role tokens and band pills.
15. **Off-limits:** nothing, but the change is **visual only**. Buttons, controls and navigation items stay where they are; no flows, behaviour or data change. (Section 7's phone layouts restyle the existing phone navigation; confirm with Moses before moving anything if a layout would reposition a control.)
