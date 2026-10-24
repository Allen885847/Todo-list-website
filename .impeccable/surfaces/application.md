# Application surfaces

Mode: Operate

Scope: To-Do List, Calendar, Add Task, Add Event, generated review states, authentication, and account/profile surfaces.

Audience: a repeat user planning schoolwork and personal events. The job is to identify what needs attention, capture new work quickly, and inspect the schedule without losing saved state.

Primary actions: complete or edit a task, add tasks, open Calendar, add events, and confirm AI-generated drafts.

Constraints: preserve all existing behavior, storage boundaries, data, responsive access, reduced-motion support, and current English interface copy. Calendar desktop Week view must show seven days without horizontal scrolling.

## Direction contract

THESIS: A precise blue planning workspace where due work reads first and configuration recedes. It refuses the narrow floating-card dashboard and the previous warm editorial palette.

OWN-WORLD: Cool-white and deep navy-gray surfaces; vivid but soft blue controls; muted purple events; lavender Extra badges; soft red Overdue badges; blue-gray completed states; sparse cyan focus details. Controls use one compact sans-led vocabulary, 12–16px radii, crisp borders, and depth only on active overlays.

STORY: The user immediately sees the editable list title, today/total counts, and ordered tasks; adding work reveals a focused input flow. Calendar becomes a full working canvas where all seven weekdays, events, and task density are legible. Review and account states use the same control grammar.

FIRST VIEWPORT: To-Do uses a centered but generous work column with the title and primary Add tasks action on one aligned masthead. Calendar occupies almost the entire viewport with a compact top toolbar, full-width seven-column Week grid, and an anchored legend/settings footer. Primary actions remain top-right and visible without crowding content.

FORM: Code-first Operate redesign pinned by the user’s modern blue direction; seed: none (unavailable). Signature move: route changes slide the working canvas directionally while controls and data remain visually stable, using 180–220ms exponential ease-out.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
