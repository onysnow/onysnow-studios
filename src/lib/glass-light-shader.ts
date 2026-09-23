/**
 * Fragment shader for one pane of glass.
 *
 * Built from the technique the LiquidGlass library uses, rather than from
 * guesswork: a HEIGHT FIELD over the pane, normals taken from its gradient,
 * and the backdrop SAMPLED at an offset along those normals. That last part is
 * the whole difference between refraction and a filter. A CSS filter processes
 * every pixel where it already is; refraction means fetching the backdrop from
 * somewhere else, which is why no amount of blur, brightness or tint ever
 * looked like glass here.
 *
 * The backdrop is the photograph the band is sitting on. LiquidGlass has to
 * rasterise arbitrary DOM to get a texture; this site does not, because the
 * one thing behind every pane that matters is a picture already in the page.
 *
 * Parameters carry LiquidGlass's names and its defaults as the starting point
 * — refraction 0.69, chromatic aberration 0.05, fresnel 1, edge highlight 0.05
 * — so they can be compared against the reference rather than re-invented.
 *
 * What is modelled, in the order light meets it:
 *
 *   height    the bevel. A biconvex profile, deepest at the rim, flat across
 *             the middle, which is what gives an edge its lens.
 *   normal    the gradient of that height field, from the rounded-rect SDF.
 *   refract   the backdrop sampled along the normal, per channel, because
 *             glass disperses and a real edge fringes into colour.
 *   fresnel   reflectivity climbing toward grazing angles, so the rim turns
 *             mirror-like while the centre stays a window.
 *   specular  Blinn-Phong from the cursor light, treated as a real source.
 *   arris     the lit corner, blown out by the tonemap rather than drawn.
 *   sides     the pane's thickness, opening and closing as the page scrolls.
 *   material  photographed grime, shown only where light rakes across it.
 */
export const GLASS_LIGHT_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform vec2  uViewport;      // device pixels
uniform float uScale;         // device pixels per CSS pixel
uniform vec2  uLight;         // CSS pixels, viewport-relative
uniform float uCharge;        // 0 to 1

uniform vec4  uRect;          // x, y, w, h of this pane, CSS pixels
uniform float uRadius;        // corner radius, CSS pixels
uniform float uTilt;          // -1 looking up at it, 1 looking down at it
uniform float uSeed;
uniform float uGrimeRake;   // tunable
uniform float uGrimeSpecks; // tunable
uniform float uGrimeFloor;  // tunable
uniform float uSideReach;   // tunable
uniform float uSheen;       // tunable
uniform float uSheenReach;  // tunable
uniform float uArris;       // tunable

uniform sampler2D uBackdrop;  // the photograph behind this pane
uniform float uHasBackdrop;
uniform vec4  uImage;         // x, y, w, h of the image element, CSS pixels
uniform float uImageAspect;   // intrinsic width / height

uniform sampler2D uSurface;   // R specks, G smears, B wear
uniform float uHasSurface;

uniform vec3  uWarm;
uniform vec3  uCool;

#define TAU 6.28318530718

/* LiquidGlass's defaults, kept by name so they can be compared with it. */
#define REFRACTION 0.69
#define CHROM_ABERRATION 0.05
#define EDGE_HIGHLIGHT 0.05
#define FRESNEL 1.0
#define Z_RADIUS 40.0   // bevel depth in CSS pixels
#define MAX_BEND 34.0   // peak displacement at the rim, CSS pixels

/*
 * The side face is a different optical path from the face, and the numbers
 * below are why it has to look different rather than merely brighter.
 *
 * Through the FACE you look at near-normal incidence and the path through the
 * glass is the pane's thickness — a few millimetres. Through the SIDE you are
 * looking ALONG the pane, so the path is its width: two or three orders of
 * magnitude further. Everything that scales with path length therefore
 * explodes: dispersion separates the channels visibly instead of fringing
 * them, and absorption stops being negligible.
 *
 * That absorption is why the cut edge of ordinary glass is green. Iron in
 * soda-lime absorbs red most, blue next, green least, and over a few
 * millimetres you cannot see it at all — over a few hundred you see nothing
 * else. These are Beer-Lambert coefficients in that order.
 */
#define SIDE_ABSORB vec3(1.15, 0.28, 0.55)
/* How much of the scene is squeezed into the thin band, in backdrop UV. */
#define SIDE_SPAN 0.42
/* Dispersion scales with path length, and the side's path is enormous. */
#define SIDE_DISPERSION 7.0


float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

/* Signed distance to a rounded rectangle. Negative inside, zero on the edge. */
float roundedBox(vec2 p, vec2 halfSize, float radius) {
  float r = min(radius, min(halfSize.x, halfSize.y));
  vec2 q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
}

/* The surface, photographed. A 2x2 atlas; each pane wears one cell. */
vec3 surfaceAt(vec2 uv, float seed) {
  vec2 cell = vec2(mod(seed, 2.0), floor(seed * 0.5));
  vec2 inCell = fract(uv) * 0.49 + 0.005;
  return texture2D(uSurface, (inCell + cell) * 0.5).rgb;
}

void main() {
  // gl_FragCoord counts up from the bottom; the page counts down from the top.
  vec2 frag = vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y) / uScale;

  vec2 halfSize = uRect.zw * 0.5;
  vec2 p = frag - (uRect.xy + halfSize);
  float d = roundedBox(p, halfSize, uRadius);
  float inside = smoothstep(0.5, -0.5, d);

  /*
   * ---- Normal from the height field ----
   *
   * The SDF's gradient is the outward normal of the pane's edge, taken by
   * central difference. Multiplied by the slope of the height field it becomes
   * the direction and strength of the bend: hard in the bevel, nothing at all
   * across the middle, which is exactly how a pane behaves.
   */
  const float EPS = 1.0;
  float dx = roundedBox(p + vec2(EPS, 0.0), halfSize, uRadius)
           - roundedBox(p - vec2(EPS, 0.0), halfSize, uRadius);
  float dy = roundedBox(p + vec2(0.0, EPS), halfSize, uRadius)
           - roundedBox(p - vec2(0.0, EPS), halfSize, uRadius);
  vec2 grad = normalize(vec2(dx, dy) + 1e-6);

  float depth = -d;                       // positive inside
  float band = clamp(depth / Z_RADIUS, 0.0, 1.0);

  /*
   * A displacement CURVE, not the raw derivative of the height field.
   *
   * Differentiating the squircle is correct and useless: its slope is enormous
   * in the first pixel and essentially zero two pixels in, so the bend existed
   * in a band three pixels wide and there was nothing to see. What matters is
   * not the exact surface normal at a point, it is how much displacement the
   * bevel produces across its whole width — strongest at the rim, falling
   * smoothly to nothing at the inner boundary.
   *
   * pow(1 - band, 1.6), from the screen-space refraction write-up at
   * zenn.dev/orectic, which reaches the same conclusion from the other
   * direction: the falloff is what you want, not the gradient.
   */
  float curve = pow(1.0 - band, 1.6);
  // The bevel bends what is behind it toward the middle of the pane.
  vec2 bend = grad * curve * REFRACTION * MAX_BEND;

  /*
   * ---- The backdrop, sampled ----
   *
   * Mapped through object-fit: cover, so the photograph is sampled where it is
   * actually drawn rather than where its element happens to be.
   */
  vec2 rel = (frag - uImage.xy) / max(uImage.zw, vec2(1.0));
  float boxAspect = uImage.z / max(uImage.w, 1.0);
  vec2 coverScale = boxAspect > uImageAspect
    ? vec2(1.0, boxAspect / uImageAspect)
    : vec2(uImageAspect / boxAspect, 1.0);
  vec2 uvBase = (rel - 0.5) / coverScale + 0.5;
  vec2 uvBend = bend / max(uImage.zw, vec2(1.0)) / coverScale;

  /*
   * Per-channel offsets. Long wavelengths refract least, so red travels a
   * shorter path than blue — the fringe on a real glass edge is not a tint
   * applied afterwards, it is three different samples.
   */
  vec3 refracted = vec3(
    texture2D(uBackdrop, uvBase + uvBend * (1.0 - CHROM_ABERRATION)).r,
    texture2D(uBackdrop, uvBase + uvBend).g,
    texture2D(uBackdrop, uvBase + uvBend * (1.0 + CHROM_ABERRATION)).b
  );
  vec3 straight = texture2D(uBackdrop, uvBase).rgb;

  /*
   * Only the bevel refracts. Across the body of the pane the displaced sample
   * and the straight one are the same anyway, but mixing explicitly keeps the
   * middle honest if the slope ever picks up numerical noise.
   */
  float bevel = 1.0 - band;
  bevel *= bevel;
  vec3 backdrop = mix(straight, refracted, bevel) - straight;

  /*
   * ---- Fresnel ----
   * Glass is barely reflective face-on and mirror-like at a grazing angle. On
   * a flat pane the grazing angles are the rim, so reflectivity climbs there.
   */
  float facing = clamp(depth / max(min(halfSize.x, halfSize.y), 1.0), 0.0, 1.0);
  float fresnel = FRESNEL * pow(1.0 - facing, 5.0);

  // ---- The light, and how far it reaches this point ----
  float dl = distance(frag, uLight);
  float direct = 1.0 / (1.0 + (dl * dl) / 3600.0);
  float spill = exp(-dl / 280.0);
  float reach = direct + spill * 0.11;

  /*
   * ---- Grazing reach ----
   *
   * The side faces hold their highlight far longer than the flat face does,
   * and the falloff they ride has to say so.
   *
   * Fresnel at near-normal incidence is a tight lobe: the face only throws the
   * source back at you when the geometry lines up, so its specular dies
   * quickly as the light moves off. At grazing incidence reflectance is close
   * to 1 across a wide spread of angles -- which is why a pane of glass seen
   * edge-on is a mirror at almost any angle, and why the last thing you see as
   * a light leaves a sheet of glass is its edges still lit.
   *
   * The sides were riding the direct term, which is half strength at 60px and
   * 2% by 400px. That is the face's lobe, and on the sides it made the edges
   * go out at the same moment the face did. Weighted toward the broad term,
   * they keep about eight times the reach at 400px for the same brightness
   * directly under the light.
   */
  float grazing = direct * 0.3 + spill * uSideReach;
  float ambient = direct + spill * 0.14;
  /*
   * Grime rides the BROAD falloff, not the core.
   *
   * This was direct + spill * 0.035 -- so almost entirely the direct term,
   * which is half strength at 60px and 2% by 400px. The smears therefore existed only
   * in a tight pool directly under the cursor, which is precisely where the
   * blown core whites everything out. Raising their strength could never fix
   * that: the problem was reach, not amount.
   *
   * A smear catches any light crossing it, and at any distance the light
   * reaching it is the wide scatter rather than the hot centre. So the spill
   * term carries most of this now, and the direct term is pulled back so the
   * area around the pointer stops blowing out.
   */
  float rake = direct * 0.55 + spill * 0.6;

  /*
   * ---- Blinn-Phong specular ----
   * The cursor light is a real source, so the pane answers it with a real
   * highlight: half-vector against the surface normal, tightened by the bevel.
   */
  vec2 toLight = normalize(uLight - frag + 1e-6);
  float ndl = max(dot(grad, toLight), 0.0);
  float specular = pow(ndl, 24.0) * bevel * direct * 3.0;

  // ---- The surface ----
  vec3 surf = surfaceAt((frag - uRect.xy) / 340.0, uSeed) * uHasSurface;
  float handled = 0.35 + 0.95 * surf.b;

  /*
   * Marks, not a film.
   *
   * These were the raw texture values scaled, and the map has signal almost
   * everywhere -- so every pixel of every pane carried a little something and
   * the whole panel read as dusty rather than as glass somebody had touched.
   * A wiped pane is CLEAR across most of its face and dirty in specific
   * places.
   *
   * smoothstep is the clarity control: everything below uGrimeFloor goes to
   * zero and stays there, which is what opens the pane back up, while what is
   * above it survives at close to full strength. Raising the floor removes
   * marks rather than dimming them, which is the difference between cleaning
   * glass and looking at it in worse light.
   */
  float glint = smoothstep(uGrimeFloor, uGrimeFloor + 0.42, surf.r) * 3.4 * handled;
  float smear = smoothstep(uGrimeFloor * 0.85, uGrimeFloor * 0.85 + 0.5, surf.g) * 1.25 * handled;

  // ---- The lit arris ----
  float ad = abs(d);
  float filament = exp(-ad / 2.8);
  float flare = exp(-ad / 15.0);
  float haze = exp(-ad / 48.0);
  float arrisWear = 0.62 + 0.9 * surf.b * uHasSurface + 0.38 * (1.0 - uHasSurface);

  /*
   * Only the edges that are actually in view.
   *
   * The SDF's gradient is the outward normal of the perimeter, so its Y
   * component is 1 along the top and bottom and 0 along the left and right.
   * Weighting by it lights the two faces the viewer can see and leaves the
   * other two alone.
   *
   * These bands run the full width of the page: their left and right edges are
   * off-screen, or butted against the viewport. There is no vertical arris to
   * catch anything, so drawing one put a bright teal line -- the thickness
   * tint, exp(-SIDE_ABSORB) -- down the inside of every pane's right edge,
   * which read as a layer stopping short of the container.
   */
  /*
   * All four edges, at full strength on the top and bottom and a little
   * softer on the sides -- a vertical arris IS there, it is just seen more
   * obliquely. The bright line inboard of the right edge was never this
   * term being wrong; it was the drawing buffer being sized from a viewport
   * width that included the scrollbar.
   */
  // Distinct from the Fresnel 'facing' above: that is how square-on you are
  // to the pane, this is how square-on the EDGE is to the light.
  float edgeFacing = 0.72 + 0.28 * smoothstep(0.35, 0.85, abs(grad.y));
  vec3 rim = vec3(filament * uArris * arrisWear + flare * 4.6 + haze * 0.34) * reach * edgeFacing;

  /*
   * ---- Light piped through the pane ----
   *
   * A pane is a light guide. Light that gets into it is trapped by total
   * internal reflection between the two faces and travels until it reaches an
   * edge, where the angle finally breaks and it escapes — which is the entire
   * principle of an edge-lit acrylic sign, and why the far edge of a pane
   * glows when you put a torch anywhere on it.
   *
   * The rim above only knows about light arriving at each point directly
   * through the air, so the edges away from the source stayed dark. This is
   * the other path: how much is COUPLING into the pane at all, carried along
   * it with the very low loss that total internal reflection implies.
   *
   * The attenuation length is long for the same reason — each bounce loses
   * almost nothing — so this reaches edges the direct term cannot, and it
   * goes green on the way, because the path is now measured in the width of
   * the pane rather than its thickness.
   */
  float toPane = roundedBox(uLight - (uRect.xy + halfSize), halfSize, uRadius);
  float couple = exp(-max(toPane, 0.0) / 130.0);
  float piped = couple * exp(-dl / 780.0);
  vec3 pipedTint = exp(-SIDE_ABSORB * 0.45);
  /*
   * Kept well under the direct term. Piped light has bounced its way along
   * the pane and lost energy at every interface; if it arrives as bright as
   * light coming straight through the air, the edge stops reading as glass
   * and starts reading as a neon outline.
   */
  rim += pipedTint * (filament * 1.7 * arrisWear + flare * 0.8) * piped * edgeFacing;

  /*
   * ---- The side faces ----
   * Which of the pane's two side faces you can see depends on where it sits
   * relative to your eye, so they open against each other as the page scrolls.
   */
  float topOpen = 0.18 + 0.82 * max(0.0, uTilt);
  float botOpen = 0.18 + 0.82 * max(0.0, -uTilt);
  float topT = 3.0 + 13.0 * topOpen;
  float botT = 3.0 + 13.0 * botOpen;
  /*
   * Within the pane's width AND inside its rounded outline. The width test
   * alone is a rectangle, which at the corners describes a region the pane
   * has already curved out of.
   */
  float withinX = step(uRect.x, frag.x) * step(frag.x, uRect.x + uRect.z) * inside;
  float dTop = frag.y - uRect.y;
  float dBot = (uRect.y + uRect.w) - frag.y;
  float glareTop = exp(-pow((dTop - topT * 0.5) / (topT * 0.42), 2.0)) * step(0.0, dTop);
  float glareBot = exp(-pow((dBot - botT * 0.5) / (botT * 0.42), 2.0)) * step(0.0, dBot);
  float farTop = exp(-pow((dTop - topT) / 1.7, 2.0)) * step(0.0, dTop);
  float farBot = exp(-pow((dBot - botT) / 1.7, 2.0)) * step(0.0, dBot);
  /*
   * The side face has no colour of its own.
   *
   * It used to carry a spectrum swept along the pane's LENGTH, which made a
   * rainbow band running the whole width of every section whether or not
   * anything was lighting it. Nothing produces that. The colour in a glass
   * edge comes from what is BEHIND it — refracted, dispersed and absorbed over
   * a long path — and that is computed below. What the light contributes is a
   * glare, and a glare is only where the light is.
   *
   * So this is white, and it is driven by the direct term rather than reach:
   * reach includes the wide scatter term, which is what was smearing the
   * highlight along the entire band instead of putting it where the source is.
   */
  float sideGlare = (glareTop * topOpen + glareBot * botOpen) * withinX;
  rim += vec3(sideGlare) * 11.0 * grazing * edgeFacing;
  rim += vec3((farTop * topOpen + farBot * botOpen) * withinX) * 5.0 * direct;

  /*
   * ---- What you see THROUGH the side face ----
   *
   * Not a tint on the band: the scene itself, seen end-on through the glass.
   *
   * Three things happen to it and all three follow from the path length. It
   * is compressed, because a tall slice of what is behind the pane has to fit
   * into a band a few pixels deep. It separates into colour, because
   * dispersion accumulates over the path and the side's path is the width of
   * the pane. And it goes green, because absorption accumulates too, and iron
   * in soda-lime glass takes the red out first.
   */
  float onTop = step(0.0, dTop) * step(dTop, topT) * withinX;
  float onBot = step(0.0, dBot) * step(dBot, botT) * withinX;
  float across = mix(1.0 - clamp(dBot / botT, 0.0, 1.0),
                     clamp(dTop / topT, 0.0, 1.0),
                     step(0.5, onTop));
  float onSide = max(onTop * topOpen, onBot * botOpen);

  float disp = SIDE_DISPERSION * 0.0035;
  vec2 sideUv = vec2(uvBase.x, uvBase.y + (across - 0.5) * SIDE_SPAN);
  vec3 throughSide = vec3(
    texture2D(uBackdrop, sideUv - vec2(0.0, disp)).r,
    texture2D(uBackdrop, sideUv).g,
    texture2D(uBackdrop, sideUv + vec2(0.0, disp)).b
  ) * exp(-SIDE_ABSORB);

  /*
   * Total internal reflection at the arris. Past the critical angle — about
   * 41 degrees for n = 1.5 — glass reflects everything, which is why the very
   * corner of a plate is the brightest part of it in any light.
   */
  /*
   * It REFLECTS, though; it does not emit. Adding white here put a constant
   * bright line along every edge whether or not anything was lighting it,
   * which is the same mistake as the painted rainbow. It multiplies what is
   * already coming through instead.
   */
  float tir = exp(-across * 5.0);
  throughSide *= 1.0 + tir * 2.2;



  // ---- Light scattered into the body, and off the grime ----
  vec3 face = vec3(inside * (direct * 0.9));

  /*
   * The grime, raked by the light.
   *
   * This is the term that makes a pane look USED, and it had been tuned down
   * far enough to disappear. Dust and finger-smear on glass are invisible
   * until something catches them at a shallow angle -- which is what rake is
   * -- and then they are the most obvious thing on the surface. Weak here does
   * not read as subtle, it reads as clean glass.
   *
   * The smears carry most of it now rather than the specks: a wiped pane is
   * mostly broad films with a few bright points in them, not an even dusting.
   */
  /*
   * The grime is NOT drawn here any more.
   *
   * This canvas is fixed to the viewport above all content, so anything it
   * paints inside a pane's footprint lands on top of whatever is standing in
   * that footprint -- the photographs and the copy, which sit ON the glass.
   * Marks on a surface cannot be in front of the things resting on it, and no
   * amount of weighting fixes that; it is the wrong layer.
   *
   * It moved to '.glass__grime', a span inside each pane at a negative
   * z-index, where the document does the layering. See styles.css.
   *
   * 'smear' and 'glint' stay because the specular below still reads them: a
   * mark catches the tight reflection of the source differently from clean
   * glass, and that IS this pass's job.
   */

  /*
   * And some of it shows without the light raking it at all, because grime
   * scatters whatever is passing through the pane, not only what grazes it.
   * Small, but it stops the surface vanishing entirely between sweeps.
   */


  /*
   * ---- The reflected source ----
   * A pane reflects from its front and its back surface, so a bright source
   * leaves a sharp image and a fainter ghost below it. That doubling is most
   * of what makes a reflection read as glass rather than as a smear of light.
   */
  vec2 toNear = frag - (uLight + vec2(0.0, 9.0));
  float rNear = length(toNear / vec2(1.0, 1.22));
  float rFar = length((frag - (uLight + vec2(4.0, 27.0))) / vec2(1.0, 1.6));
  vec3 image = vec3(
    1.6 / (1.0 + (rNear * rNear) / 620.0),
    1.6 / (1.0 + (rNear * rNear) / 520.0),
    1.6 / (1.0 + (rNear * rNear) / 450.0)
  ) + vec3(0.3) / (1.0 + (rFar * rFar) / 2600.0);
  vec3 mirror = inside * image * (0.24 + 0.76 * fresnel) * (13.0 + glint * 14.0);

  /*
   * ---- The broad sheen ----
   *
   * The term above is the IMAGE of the source: tight, a few tens of pixels
   * across, and sitting directly under the cursor's own blown core, which is
   * why it has been invisible -- it was hidden inside the thing casting it.
   *
   * What was missing is the other half of a specular response. A sheet of
   * glass does not only show you a small bright copy of the lamp; its whole
   * face lifts on the side the light is on, because the surface is reflecting
   * the light's wide falloff as well as its core. That is the part you read as
   * GLARE, and it works at pane scale rather than at cursor scale.
   *
   * Weighted by fresnel, so it climbs toward the rim the way reflectivity
   * actually does, and falling off over hundreds of pixels so it covers the
   * band rather than pooling.
   */
  float sheen = exp(-dl / uSheenReach);
  mirror += inside * (0.12 + 0.88 * fresnel) * sheen * uSheen;

  /*
   * Everything the light does scales with the charge, and there is genuinely
   * nothing at zero: glass does not glow, a light shining on it does. The
   * refraction is NOT gated — a pane bends what is behind it whether or not
   * anybody is shining anything at it.
   */
  float lit = uCharge * uCharge * (3.0 - 2.0 * uCharge);
  vec3 tint = mix(uWarm, uCool, smoothstep(0.0, 1.0, dl / 460.0));

  /*
   * What the glass does to the photograph is not gated on the charge. A pane
   * bends and absorbs what is behind it whether or not anybody is shining
   * anything at it, and the side face is the strongest example — that is the
   * band you can genuinely see THROUGH, along the pane's whole width. It was
   * in the lit path, so the edge went blank the moment the shutter was idle.
   *
   * It is also untinted. The colour in it belongs to the photograph and to
   * the absorption; warming it by distance from the cursor would paint the
   * light's colour onto something the light is not responsible for.
   */
  /*
   * The face's refraction is NOT done here, and cannot be.
   *
   * This canvas composites with plus-lighter, which only ever adds. Refraction
   * means MOVING pixels — the original has to be replaced, not brightened —
   * and adding a displaced copy on top of an image that is still there at full
   * strength produces a faint double exposure, which is exactly what it looked
   * like. The bevel's displacement belongs to the SVG filter in the stylesheet,
   * which samples the backdrop from another position and composites behind the
   * content where it can actually replace it.
   *
   * The side face stays, because it is genuinely additive: a thin band of the
   * scene compressed and absorbed, laid over the edge rather than replacing
   * anything.
   */
  vec3 colour = throughSide * onSide * uHasBackdrop * 2.6;
  colour += (tint * (rim + face) + mirror) * lit;
  colour += vec3(specular + EDGE_HIGHLIGHT * bevel) * inside * (0.35 + 0.65 * lit);

  // The tonemap is what blows the arris out: everything above 1.0 compresses
  // toward white, so colour survives only where the light has fallen off.
  colour = colour / (1.0 + abs(colour));
  colour = sign(colour) * pow(abs(colour), vec3(1.0 / 2.2));

  /*
   * Grain, after the tonemap, where a sensor's noise lands. Analytic falloffs
   * are perfectly smooth, and perfectly smooth gradients both band on an 8-bit
   * display and read as vector art.
   */
  float l = clamp(max(max(colour.r, colour.g), colour.b), 0.0, 1.0);
  float mids = 4.0 * l * (1.0 - l);
  float g1 = hash(gl_FragCoord.xy);
  float g2 = hash(gl_FragCoord.yx * 1.7);
  colour += (vec3(g1, g2, g1 * 0.5 + g2 * 0.5) - 0.5) * 0.09 * mids;

  /*
   * NOT clipped to the pane.
   *
   * Multiplying alpha by 'inside' cut every contribution off at the boundary,
   * which killed the one thing that has no business stopping there: the bloom.
   * A lit edge throws light OUT of the glass as well as into it — that spill
   * above the top of a pane is most of what tells you the edge is bright
   * rather than merely pale — and cutting it at the boundary drew a hard line
   * exactly where the glow should be softest.
   *
   * Everything that genuinely belongs inside the pane already carries its own
   * 'inside' factor: the refracted backdrop, the side band, the scattered
   * face, the reflected source, the specular. What is left unbounded is the
   * rim, which is the part that should escape.
   */
  float alpha = clamp(max(max(abs(colour.r), abs(colour.g)), abs(colour.b)), 0.0, 1.0);
  gl_FragColor = vec4(colour, alpha);
}
`;
