# The other half: a creative-technical showcase (plan, for Ony to approve)

Ony, 2026-10-02: "I want this to be my photography portfolio but also just my
creative technical systems skills showcase as well. That I believe is an
extremely important and valuable and rare skill set in one person and I want
to also showcase that. Directly, with like words and pitch decks and graphic
design or documents or whatever. Not just the weird and cool custom site I
made."

## The positioning, in one line

A photographer who builds the systems behind the picture: the light, the
glass and the rain on this site are simulated from physics and checked
against a path-traced reference. Most people can do one side of that. Very
few can do both.

## What goes on the site

1. **A second door on the home page and in the menu.** "Photography" and
   "Systems" (working name; alternatives: "Lab", "Engineering", "How it's
   made"). The photography stays first for booking clients; the second door
   is for studios, agencies, employers and collaborators.
2. **A /systems page, written as a pitch, not a CV:**
   - the claim (the line above), and what that combination is worth to a
     client;
   - **3-5 case studies**, each one screen: the problem, what was built, how
     it was proven, the result -- with a picture that makes the point at a
     glance (the rain against the path-traced reference; the broken glass
     against forensic fracture photos; the light engine's before/after);
   - **"Behind the glass"**: a switch on the live site that shows how an
     effect works (the rays, the lamp's light, the slope map of the rain);
   - capabilities and tools, short;
   - one contact form with two choices: book a shoot / talk about a project.
3. **Documents to download**: a capabilities deck (10-12 slides, PDF) and a
   one-page summary (PDF), in the site's look.

## Candidate case studies (Ony picks)

- The optics engine: frosted glass, light and shadow from causes, one WebGL
  context, hundreds of tests.
- Rain on a window: a drop simulation calibrated against Mitsuba 3.
- Broken glass from fractography: radial and concentric cracks, the
  Hertzian cone, faces leaning by kind.
- The site itself as a product: Lovable + Supabase admin, lab, previews,
  per-pane physics knobs.
- Beyond the site, if Ony wants them shown: the Topic Authority System
  (evidence-first investigative method), The Weast Wing, game modding.

## Questions for Ony

1. Who is it for first: clients hiring a creative studio, employers, or
   investors/partners?
2. The section's name.
3. Which case studies, and whether the projects beyond this site go in.
4. Do you offer technical work for hire (with rates or "ask"), or is it a
   showcase only for now?

## Build order once approved

Page and copy behind `?try=systems` → the case-study pictures → the deck and
one-pager → the "Behind the glass" switch.
