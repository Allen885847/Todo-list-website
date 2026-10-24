---
name: Todo List Blue Workspace
description: A clear, calm planning workspace for tasks, events, and calendar decisions.
colors:
  primary-blue: "#5b82f6"
  primary-blue-deep: "#3763d8"
  primary-action: "#416bdc"
  event-purple: "#8170bd"
  extra-lavender: "#f1edff"
  overdue-red: "#b64353"
  completed-blue-gray: "#7d8ca6"
  cyan-detail: "#158cad"
  light-ground: "#edf3fb"
  light-paper: "#f8faff"
  light-surface: "#ffffff"
  light-ink: "#17243b"
  light-muted: "#66758d"
  light-line: "#dce5f2"
  dark-ground: "#09111f"
  dark-paper: "#111a2a"
  dark-surface: "#18243a"
  dark-ink: "#edf4ff"
  dark-muted: "#9caac1"
  dark-line: "#2b3b57"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "2.75rem"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  title:
    fontFamily: "DM Sans, ui-sans-serif, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "DM Sans, ui-sans-serif, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "DM Sans, ui-sans-serif, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.4
rounded:
  control: "10px"
  item: "12px"
  panel: "16px"
  shell: "24px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  xl: "42px"
components:
  button-primary:
    backgroundColor: "{colors.primary-action}"
    textColor: "{colors.light-surface}"
    rounded: "{rounded.control}"
    padding: "11px 18px 12px"
  button-primary-hover:
    backgroundColor: "{colors.primary-blue-deep}"
    textColor: "{colors.light-surface}"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
  task-card:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.item}"
    padding: "15px 16px"
  extra-label:
    backgroundColor: "{colors.extra-lavender}"
    textColor: "{colors.event-purple}"
    rounded: "{rounded.control}"
    padding: "3px 7px"
---

# Design System: Todo List Blue Workspace

## Overview

**Creative North Star: "The Precise Blue Planner"**

This interface is a quiet productivity workspace: structured enough for dense schedules, calm enough to stay open all day. Cool white and navy-gray grounds create continuity between the To-Do List, Calendar, creation flows, review screens, and account surfaces. Vivid blue appears where the user acts or navigates; secondary semantic colors clarify content without competing with it.

The visual system favors readable type, clear alignment, restrained borders, and tonal layering over decoration. Motion confirms context changes and preserves orientation, especially between the To-Do List and Calendar, without delaying input.

**Key Characteristics:**

- Cool, blue-led neutral surfaces in both appearance modes.
- Full-canvas Calendar with compact, legible information density.
- One primary action color and distinct semantic roles for Events, Extra, Overdue, and completed work.
- Flat panels at rest; elevation is reserved for transient overlays and dragged items.

## Colors

The palette is cool and purposeful: blue leads interaction, while purple, lavender, red, blue-gray, and small cyan details encode task meaning.

### Primary

- **Planner Blue:** Primary controls, active navigation, selected dates, focus, and task indicators.
- **Deep Planner Blue:** Hover, pressed, and readable text-accent states.

### Secondary

- **Event Purple:** Personal events and event indicators.
- **Extra Lavender:** Optional-task badges without competing with Overdue.

### Tertiary

- **Signal Cyan:** Voice controls and small success or utility details.
- **Soft Overdue Red:** Past-due status, destructive actions, and recoverable errors.
- **Completed Blue-Gray:** Completed titles, task surfaces, and strikethroughs.

### Neutral

- **Cool Ground:** The browser background outside primary work surfaces.
- **Paper:** Main To-Do and Calendar shells.
- **Surface:** Inputs, task rows, day columns, and nested controls.
- **Ink / Muted / Line:** Primary copy, supporting copy, and structural dividers.

**The Color Role Rule.** Blue is the only primary action color; purple never represents tasks, red never represents a normal action, and completed work always recedes into blue-gray.

**The Appearance Pair Rule.** Light and dark modes use the same semantic hierarchy, not independent palettes. System mode resolves live from the device setting.

## Typography

**Display Font:** Fraunces (with Georgia and serif fallbacks)<br>
**Body Font:** DM Sans (with the documented UI sans fallbacks)

**Character:** Fraunces gives the To-Do List, Tasks, and Calendar headings a coordinated editorial voice; DM Sans keeps working text direct, contemporary, and compact.

### Hierarchy

- **Display** (700, 2.75rem, 1.08): Editable To-Do List title on desktop.
- **Headline** (700, 2rem, 1.05): Tasks, Calendar, and account page titles.
- **Title** (650, 1.5rem, 1.2): Task sections, dialogs, and review headings.
- **Body** (400–600, 0.95rem, 1.5): Task names, instructions, and form content.
- **Label** (700, 0.75rem, 1.4): Compact metadata, tabs, status badges, and calendar labels.
- **Due Date** (700, 0.88rem, 1.4): Tabular task timing and review date inputs, visually separated from the task title.

**The Sentence-Case Rule.** Headings and controls use natural sentence case; hierarchy never depends on wide-tracked all caps.

**The Inline Status Rule.** Extra and Past Due badges follow the task title in the same wrapping row; due dates remain on their own line for fast scanning.

## Layout

The To-Do List uses a centered work surface capped at 1040px with 42px desktop padding. It becomes an edge-to-edge mobile surface at 720px, with 20px horizontal padding and a title/action header that remains on one row.

The Calendar uses nearly the full viewport: 16px outer margins on desktop and a 32px total width reduction. Desktop Week view is a true seven-column grid with no horizontal scrolling. Month cells grow with viewport height; Year view uses four columns, then three, two, and one as space decreases. Below 900px, Week view may scroll horizontally to keep day content readable.

Primary spacing follows a 6/10/16/24/42px rhythm. Form controls remain tightly grouped; new sections receive visibly more space above than labels receive below.

## Elevation & Depth

The system is flat by default. Borders and one-step tonal changes separate persistent surfaces. Shadows belong only to dialogs, menus, drag ghosts, and transient notifications where physical elevation communicates interaction state.

**The Flat Workspace Rule.** Main cards, calendar cells, and task rows never rely on a large ambient shadow for structure.

## Shapes

Controls use 10px corners, task rows 12px, form and review panels 16px, and outer application shells 24px. Small circular shapes are reserved for icon-only controls, checkboxes, recording controls, and calendar date markers. Compact status badges may use pill geometry because their content is short and categorical.

Borders are quiet 1px strokes. Semantic color is carried by text, icons, fills, or markers—not thick side stripes.

## Components

### Buttons

- **Shape:** Gently rounded rectangles (10px), with circular geometry only for icon-only controls.
- **Primary:** Planner Blue with white text in light mode and dark navy text on the lighter blue dark-mode control.
- **Hover / Focus:** Darken or lighten within the blue family; retain a visible palette-derived keyboard focus ring.
- **Secondary / Ghost:** Tonal blue or transparent surfaces with clear borders and ink-colored labels.

### Chips

- **Extra:** Lavender fill with purple text and border.
- **Overdue:** Soft red fill with red text and border.
- **Combined state:** Extra and Overdue sit in one aligned badge row without replacing each other.

### Cards / Containers

- **Corner Style:** 12–16px for internal content and 24px for the top-level shell.
- **Background:** Paper for the shell, Surface for nested content.
- **Shadow Strategy:** Flat at rest; overlay-only elevation.
- **Border:** One quiet line token.
- **Internal Padding:** 15–28px according to content density.

### Inputs / Fields

- **Style:** Surface fill, 1px line border, 10px corners, and complete vertical padding for descenders.
- **Focus:** Blue border plus a low-opacity blue focus ring.
- **Error / Disabled:** Soft red for recoverable errors; disabled controls preserve legibility while reducing emphasis.

### Navigation

Calendar views use a restrained tab row with a blue active underline. To-Do / Calendar transitions slide in the navigation direction over 220ms with exponential ease-out. The Appearance control writes one shared Light, Dark, or System preference and updates every loaded surface immediately.

### Calendar Items

Tasks use blue indicators, Events use muted purple, completed tasks use blue-gray, and holidays use a deeper blue-gray tonal field. Compact task stacks expand with short easing and never hide Events.

## Do's and Don'ts

### Do:

- **Do** keep blue reserved for primary task and navigation actions.
- **Do** show all seven weekdays together on desktop Week view.
- **Do** preserve 1px structural borders and tonal layering across both appearance modes.
- **Do** use the shared Appearance preference on every page and react live to system theme changes.
- **Do** keep iconography as consistent outlined SVG or simple CSS geometry.

### Don't:

- **Don't** reintroduce orange or green as interface accents.
- **Don't** constrain the Calendar to the To-Do List's content width.
- **Don't** use gradients, thick semantic side stripes, decorative glass, or permanent card shadows.
- **Don't** use uppercase eyebrow labels above headings.
- **Don't** invent new task, event, or account data to make a screen look populated.
