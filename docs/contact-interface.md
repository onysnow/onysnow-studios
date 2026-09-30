# Contact interface: two panes resting dry (item 29, light engine step G)

## Physics (sources)

- **Airy reflectance of an air film between two glasses** (Hecht, *Optics*, §9.7):
  R = F sin²(δ/2) / (1 + F sin²(δ/2)), where δ = 4πd·cosθ/λ and F = 4R₀/(1−R₀)².
  - Where the panes touch (d = 0), R = 0, so the two faces vanish. This is the black spot
    at the centre of Newton's rings.
  - The peak is 15.6%, a quarter wave thick. The mean over a cycle is 8.1%, which is the
    incoherent sum the stack solver already uses.
- **White light** gives Newton's colour sequence: grey, then straw, purple, blue, and
  second-order yellow. The colours wash out to grey past about 1.5 µm. We integrate
  the CIE 1931 colour-matching functions (the Wyman–Sloan–Shirley fit, JCGT 2013) and
  convert to linear sRGB.
- **Roughness removes the colours.** The interference term falls by
  exp(−½(4πσcosθ/λ)²) (Bennett & Porteus, JOSA 51, 123, 1961).
  - A satin-etched face (σ ≈ 1 µm) shows none. So the site's frosted panes, resting
    dry, show only the incoherent grey.
  - Polished plates show rings. They are the classic optical flats.
- **Frustrated TIR** (Zhu et al., *Am. J. Phys.* 54, 601, 1986): T = exp(−2κd).
  - Below about 100 nm, guided light crosses the gap. This is the same statement as
    R → 0: the interface is gone.
  - It is tested in `thin-film.ts`. It adds no separate glow, because the light only
    crosses into the upper pane, which guides it on in the same way.
- **The gap is a physical bow, not generated noise.** The panes are flat to a bow
  radius of a couple of hundred metres, R ≈ 150 m across and 260 m down.
  - They touch in the middle of their overlap, and the upper pane's weight presses
    them 30 nm into a small black disc.
  - Out from there the gap is d = x²/2Rₓ + y²/2R_y, so the rings are Newton's: the
    m-th dark ring sits at r = √(mλR), a few millimetres out.
  - Rₓ and R_y differ, so the rings are ellipses.

## Build

- **`effects/optics/thin-film.ts`**: the Airy film, the coherence factor, FTIR, the
  film colour, and a 256-entry lookup table. It also holds the contact gap and its
  GLSL twin.
- **The glass shader, upper pane of a `contact` stack, `?try=contact`**: over the
  overlap, it adds the film's reflectance minus the incoherent mean, times what the
  faces reflect. That is the room, plus each light's image and highlight, seen back
  through the front face.
- **Materials**: a polished preset (optical crown, flint) now stays polished. The
  site's Frost setting only deepens an etch.
- **Lab samples, with `?try=contact`**: a fourth stack, "Contact, polished" (optical
  crown), sits beside the satin one.

## What you see

The rings show wherever the pair reflects something bright. They are strongest at the
edge of the lamp's reflection, and faint in a dim room. Real ones behave the same way:
you see Newton's rings in reflected light.
