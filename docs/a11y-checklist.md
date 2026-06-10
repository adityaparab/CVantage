# Accessibility & responsive audit (issue #85 / 10.2)

## Automated (CI)

`src/test/a11y.spec.tsx`: axe over landing, login, dashboard, upload,
analysis results and the admin dashboard in BOTH themes - zero
serious/critical violations is a hard gate (12 checks). It already caught
and fixed a nested-interactive dropzone.

## Keyboard-only pass (manual matrix - sign-off per release)

| Journey | Mechanics verified |
|---|---|
| Register → dashboard | tab order top-down; strength meter announced (aria-live); submit on Enter |
| Login incl. lockout | countdown announced via role=alert; disabled submit reachable but inert |
| Dashboard table | sort buttons focusable; row actions reachable; ConfirmDialog traps + restores focus |
| Upload | dropzone = label-for-input (focusable input, visible focus ring); cancel reachable |
| Editor (all 12 sections) | section nav anchors; array add/remove/reorder buttons labelled with index; new row focuses first input |
| Resume view pencils | pencil focusable, Enter opens, Escape cancels, focus returns |
| Analysis progress | aria-live container announces step changes; bell button labelled with count |
| Results + apply | accordions are native details/summary; card focus drives the field highlight |
| Admin screens | search labelled; modals trap; temp-password copy reachable |

Focus management rules implemented globally: modals trap + restore
(Modal.tsx), route changes reset scroll (ScrollRestoration), first errored
field focused on submit (forms), :focus-visible outline tokens on every
interactive element.

## Screen-reader sanity notes

- Editor: every Field wires label + description + error via
  aria-describedby; required markers are visual with aria-required set.
- Progress: ProgressSteps renders an ordered list with sr-only status text
  per step ("Comparing resume & JD: in progress").
- Toasts: single polite live region; confirmations are real dialogs.

## Responsive QA matrix

| Breakpoint | Result |
|---|---|
| 360 (portrait) | nav collapses; tables overflow-x inside cards (no page scroll); review screen tabs |
| 768 portrait+landscape | 2-col feature grids; editor single column + sticky save |
| 1024 | split views activate (review, apply) |
| 1440 / 1920 | max-w containers hold line lengths; no stretch artifacts |

Touch targets: kit buttons are >=36px visual with >=44px hit area at `md`
size on mobile via padding; icon buttons sized 36-38px square (within
WCAG 2.5.8 minimum with spacing).
