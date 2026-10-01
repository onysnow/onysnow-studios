# The side menu, redesigned (lab / site editor)

Ony, 2026-10-01: "take another look at the nested side menu and redesign it so
it's more intuitive, organized more intelligently, given a better layout, and
modified to do its job better. And recommend complementary features."

Mockup: `side-menu-redesign-mockup.png` (letters A-I refer to it).

## 1. What it is today, measured

- **One menu, two jobs, one dropdown.** An "Editing" dropdown switches between
  the effects ("Light, glass, shadows & cursor") and 11 admin screens. A
  dropdown is a poor way to get around: you can't see what's there until you
  open it, and switching costs two clicks every time.
- **106 controls and 13 switches in one column 7,283 px tall** (about eight
  screens of scrolling), in 13 groups, every group open. Group sizes run from
  1 control ("Glass shape", "Site & secrets") to 29 ("The lamp").
- **Groups follow the code, not what you're looking at.** "Glass" mixes the
  smudges, the light piped through the pane and the photo paper's sheen.
  "The lamp" holds the black light's eight UV settings. "Water, spray &
  balloons" holds the balloons.
- **Controls that can't do anything are shown anyway.** The laser's five
  settings show when you hold the lamp. The 22 liquid-glass settings show
  greyed out in CSS mode. The UV settings show with no black light in hand.
- **The previews you are asked to approve are scattered** into small "Not
  approved yet" boxes in seven groups. There is no single place to see what's
  waiting on you.
- **The top bar has 13 things in it**, including two that belong in the menu
  (the tool picker, which repeats "What the cursor holds", and the red room).
- **The admin screens are full Studio pages squeezed into the panel**, and
  the panel's width jumps between 23 rem and 44 rem as you switch.
- **Nothing connects the preview to the menu.** To change something you see,
  you have to know which group of 13 it lives in.

## 2. The redesign

```
┌───────────────────────────────── top bar ─────────────────────────────────┐
│ ← Studio  Site editor │ Page ▾ │ Desktop|Tablet|Phone │ CSS|Liquid │ ↶ ↷ │  │
│                         Compare │ Looks ▾ │   ● 3 unsaved  Discard  [Save] … │
├──────┬────────────────────────┬───────────────────────────────────────────┤
│ RAIL │ PANEL                  │ PREVIEW toolbar: path · Inspect · Note ·   │
│      │ breadcrumb + title     │                  Capture · reload · open   │
│Content│ search (everything)   │                                           │
│Look  │ tabs within the area   │        the live site                      │
│In hand│ sections (one open,   │   (click anything with Inspect on →       │
│Weather│  basics first,        │    the panel jumps to its controls)       │
│Review│  "N more" folded)      │                                           │
│Clients│                       │                                           │
│Site  │                        │                                           │
└──────┴────────────────────────┴───────────────────────────────────────────┘
```

### A. A rail instead of the dropdown

Seven areas, always visible, one click each, with counts where something
needs you:

| Rail | What's in it | Today it is |
|---|---|---|
| **Content** | Photos on the pages (by name, with the page in the preview first), Words, Services, Testimonials, Journal, Portfolio photos, Portfolio categories | 7 entries of the dropdown |
| **Look** | The effects, in 5 tabs: Light · Glass · Shadows · Photos · Camera | the one 7,283 px column |
| **In hand** | The cursor's look, and what it holds (lamp, flashlight, laser, black light, magnifier, flare, torch, hammer): pick one and see only ITS settings | Cursor group + the top-bar tool picker + UV settings in "The lamp" |
| **Weather & play** | Rain (type, strength, droplets, which face, condensation), balloons, spray, webs, fireworks, fire, red room | "Water…" group, red-room button, scattered switches |
| **Review** (badge) | Every preview waiting on you, in one list: Try · Approve · Not yet · leave a note | 13 switches in 7 groups |
| **Clients** (badge) | Inquiries, Subscribers | 2 entries of the dropdown |
| **Site** | Site settings, Advanced (custom CSS), Quality tiers / devices, the published history | 2 entries + scattered |

### B. The panel: where you are, then what you can change

- A breadcrumb ("Look › Glass") and a title, so you always know where you are.
- **One search box for everything**: controls, their descriptions, the
  content screens, page photos by name ("hero"), and previews. Press `/` to
  jump to it. Results open the right area.
- **Tabs inside an area** (Look: Light · Glass · Shadows · Photos · Camera).

### C. Sections that show the basics first

Each tab is a short list of sections, **one open at a time**. Each section
shows its 2-4 most-used controls; the rest fold under "N more" with their
names listed, so nothing is hidden without saying what it is. An amber dot
marks a changed control and the section header says "1 changed", as today.

The Look regrouped by what you're looking at (106 controls → 5 tabs, 18
sections):

- **Light**: The lamp (colour temperature, core gain, aperture, growth with
  charge, shutter speed) · Room & backlight (room brightness, backlight 6) ·
  The flash
- **Glass**: Shape (edge width, thickness, waviness; more: height, corners,
  bevel profile) · Surface: smudges & scratches (grime raked, specks,
  clarity) · Light inside the glass (piped, how far, through, spread, caustic
  core, edge at rest, edge rainbow) · Reflections (room HDRI, the lamp's own,
  refraction) · Liquid glass engine (22; only in Liquid mode, otherwise one
  line saying so)
- **Shadows**: strength, light height, light size, room fill, content depth;
  more: bend under glass, glass shadow, light through glass
- **Photos (the prints)**: paper specular, its size, sheen, its spread, paper
  reflection; bokeh
- **Camera**: viewing distance, viewpoint follows, vignetting, polariser +
  angle · Lens flare (17, basics: ghost strength, halo, star spikes, edge
  glare) · Afterimage (3)

**Settings appear only where they can act**: the laser's settings only with
the laser in hand, the UV settings only with the black light, the liquid
engine only in Liquid mode. That alone takes about 40 controls off the
screen at any moment.

### D-E-I. A calmer top bar

Left: back, title, page, device, glass mode. Middle: **Undo / Redo** (every
change, not just the last), **Compare**, **Looks**. Right: one status pill
("● 3 unsaved changes"), Discard, Save for everyone, and a "…" menu for the
rarely used (copy values, source values, show all descriptions, open in a new
tab). The tool picker moves to In hand; Red room to Weather & play.

### F-G-H. The preview gets its own toolbar

- **Inspect (G)**: turn it on and hover the preview: whatever is under the
  pointer is outlined and named ("Glass pane · Services band"), with links
  straight to its controls: Edit glass, Edit photos, Edit words. A photo →
  its page-photo card; a heading → its words; a button → the buttons'
  bevel; the rain → Weather & play › Rain.
- **Note (H)**: click a spot in the preview and type a note for me; it is
  saved with a screenshot and the exact settings, page and device, in a list
  I read. This replaces sending screenshots in chat.
- **Capture**: see 3.4.

### Layout

- The panel keeps **one width (about 22 rem)**. Content screens that need
  room (the journal editor, portfolio grid) open as a wide **drawer over the
  preview** with Close, instead of making the panel jump.
- Below 1024 px wide the rail becomes a bottom bar and the panel a sheet
  over the preview.

## 3. Complementary features, ranked by what they do for your goals

Your goals as I understand them: a photorealistic site that makes people
want to book a session; approving my work quickly; growing your audience on
TikTok, Instagram and Facebook.

1. **Inspect (click-to-edit)** — the biggest single gain in "intuitive".
2. **Undo / redo, Looks, Compare.** Save named Looks (Night rain, Day,
   Halloween) and switch between them; Compare puts a draggable line across
   the preview, "Saved" on one side and "Your changes" on the other (E in
   the mockup). Pairs with Save for everyone.
3. **Review queue.** Every preview I build lands here with a before/after
   picture, a one-line description, and Try / Approve / Not yet / note.
   Approving switches it on for everyone. You stop hunting for switches; I
   see your answers without you writing them in chat.
4. **Notes on the preview** (above): your feedback pinned to the exact spot,
   with a screenshot and the settings attached.
5. **Capture for social.** Record 5-15 s of the live site (the rain running,
   the lamp moving, glass breaking) at 9:16 for TikTok/Reels or 1:1 for
   Instagram, as a video file you download and post. Your site's effects are
   content in themselves.
6. **Photo-quality check.** Each page-photo slot shows how many pixels it
   needs on a 2x screen against what the photo has: green, or red with
   "upload a bigger one". You asked for sharper photos on desktop; this
   catches it at upload.
7. **Scheduled looks.** "Halloween look from Oct 15 to Nov 1" (webs, slime,
   fog), "Fireworks on New Year's Eve"; the site switches itself.
8. **Clients as a pipeline.** Inquiries get a status (new → replied → booked
   → done), one-click reply templates, and a count on the rail. Pairs with
   the "Book a session" buttons.
9. **Effect cost meter.** Each effect's cost in milliseconds a frame on a
   mid-range laptop and a phone, so you see what slows visitors down before
   you save.
10. **Published history.** Every "Save for everyone" kept, with who/when and
    a Restore button. Nothing published is ever lost.

## 4. How it fits together

- **Control metadata** (`src/lib/tuning.ts`): each knob gains `area`, `tab`,
  `section`, `basic: true` for the 2-4 shown first, and `showWhen` (a held
  tool, the glass mode, a preview being on). The menu is generated from it;
  nothing is hand-placed. A test checks every knob has a home and no section
  is empty.
- **Inspect**: elements in the site carry `data-edit` naming what edits them
  (`glass`, `page-photo:hero`, `words:services.intro`, `buttons`, `rain`).
  The preview tells the editor what is under the pointer by the same
  postMessage channel the lab already uses (`onysnow:lab-*`).
- **Undo**: a stack of drafts in memory (the draft is already one string),
  50 deep.
- **Looks, schedule, history**: rows in `site_settings` under new keys
  (`effect_looks`, `effect_schedule`, `effect_history`). No new table; the
  same save path as today.
- **Review queue and notes**: two small tables (`preview_reviews`,
  `lab_notes`) and a storage folder for note screenshots, locked to the
  admin. I write the SQL; you run it once, as with the page photos.
- **Capture**: the browser's own screen capture of the preview tab
  (`getDisplayMedia` with the current tab preferred) cropped to the frame,
  recorded with `MediaRecorder` to WebM/MP4. It asks your permission each
  time. A WebGL canvas can't be read back across all the page's layers, so
  this is the only route that records exactly what you see.

## 5. Trade-offs

- **Rail vs. dropdown**: a rail takes 76 px of width all the time, and in
  return every area is one click and visible. Worth it at desktop widths.
- **One section open at a time** means less to scan but more clicks if you
  are tuning across sections. Shift-click opens several; search ignores it.
- **Basics first** hides things. Mitigated by listing the folded controls'
  names, search finding everything, and "Show all" in the "…" menu.
- **Hiding controls that can't act** could confuse someone looking for the
  laser's colour with the lamp in hand. In hand shows each tool's settings
  under its own name, so they are one click away.
- **Review queue and notes need SQL** you run once. Everything else needs no
  backend change.
- **Capture asks for permission** each time (browser rule), and is
  desktop-only.

## 6. Build order

1. **Phase 1 — the menu itself, no backend**: rail, regrouped panel, basics
   first, settings shown only where they can act, one search, calmer top
   bar, undo/redo, panel at one width with drawers, Inspect.
2. **Phase 2 — Looks, Compare, published history, scheduled looks**
   (site_settings only).
3. **Phase 3 — Review queue, Notes, Clients pipeline** (SQL you run once).
4. **Phase 4 — Capture for social, photo-quality check, effect cost meter.**

What I would revisit as it grows: whether Looks become per page; whether
notes should become shareable with others (a client, a collaborator); and
moving the 22 liquid-glass settings out of the everyday menu altogether once
the CSS and liquid looks are settled.
