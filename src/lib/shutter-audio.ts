/**
 * The shutter's sound.
 *
 * Three cues, cut from recordings of a real film camera:
 *
 *   flash-charge   the capacitor winding. Looped, and both its level and its
 *                  pitch follow the charge, so it rises as you wind and sags
 *                  the moment you stop — the same curve the light follows.
 *                  Played backwards and faster while the charge is draining,
 *                  since a rise reversed IS a fall: the same recording read
 *                  the other way is a capacitor dumping what it had.
 *   shutter-click  the mechanism alone, for a click that takes no photograph.
 *   shutter-flash  the mechanism and the flash together, for one that does.
 *
 * The charge recording is a near-pure 18 kHz tone, which is what a real flash
 * capacitor actually whines at and almost exactly what a person cannot hear:
 * most adults lose 18 kHz entirely, and most laptop speakers never produced it
 * in the first place. It was pitched down to about 4 kHz before shipping, so
 * the asset is audible on the hardware people own rather than authentic on
 * hardware they do not.
 */

const CLICK = "/sfx/shutter-click.mp3";
const FLASH = "/sfx/shutter-flash.mp3";
const CHARGE = "/sfx/flash-charge.mp3";

let context: AudioContext | null = null;
let master: GainNode | null = null;
let ready = false;

const buffers = new Map<string, AudioBuffer>();
const pending = new Set<string>();

/**
 * The charge bed: the same recording running forwards and backwards at once,
 * crossfaded by which way the charge is going. Two sources rather than one
 * reversed on demand, because swapping a buffer means restarting the source,
 * and a restart in the middle of a sustained tone is an audible click.
 */
let whine: AudioBufferSourceNode | null = null;
let whineGain: GainNode | null = null;
let dump: AudioBufferSourceNode | null = null;
let dumpGain: GainNode | null = null;
let whineFilter: BiquadFilterNode | null = null;

let charge = 0;
/** 0 while winding, 1 while draining. Smoothed; see noteDirection. */
let draining = 0;
/** How hard it is draining, in charge per second. */
let drainRate = 0;
let lastCharge = 0;
let lastAt = 0;
/**
 * Spending the charge drops it to zero in one step. That is not a drain, it is
 * a photograph, and letting it read as one would put a dying whine underneath
 * every shutter fire.
 */
let spent = false;

function reversed(buffer: AudioBuffer, ctx: AudioContext) {
  const copy = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const from = buffer.getChannelData(c);
    const to = copy.getChannelData(c);
    for (let i = 0, n = from.length; i < n; i += 1) to[i] = from[n - 1 - i] ?? 0;
  }
  return copy;
}

function silent() {
  // The cursor light, the aperture and the winding are all switched off under
  // this setting; a whine with nothing to look at would be stranger than
  // silence.
  return (
    typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

async function load(url: string) {
  if (buffers.has(url) || pending.has(url) || !context) return;
  pending.add(url);
  try {
    const response = await fetch(url);
    const bytes = await response.arrayBuffer();
    buffers.set(url, await context.decodeAudioData(bytes));
  } catch {
    // A cue that will not load simply does not sound. Nothing here is load
    // bearing, and a broken fetch should not take the shutter with it.
  } finally {
    pending.delete(url);
  }
}

/**
 * Bring the audio up on a real gesture.
 *
 * Browsers will not let a page make noise until someone has clicked or typed,
 * and winding the shutter is neither — it is pointer movement, which does not
 * count. That restriction is doing something useful here, so it is left alone
 * rather than worked around: nobody hears anything until they have chosen to
 * interact with the page at least once.
 */
export function primeShutterAudio() {
  if (ready || silent()) return;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ready = true;

  context = new Ctor();
  master = context.createGain();
  master.gain.value = 0.55;
  master.connect(context.destination);

  void Promise.all([load(CLICK), load(FLASH), load(CHARGE)]).then(startWhine);
}

function startWhine() {
  const buffer = buffers.get(CHARGE);
  if (!context || !master || !buffer || whine) return;

  /*
   * Started once and left running for the life of the page, silent until the
   * charge lifts it. Starting a source per wind would mean a click at the
   * attack every time and no way to cross a decay smoothly.
   */
  whineGain = context.createGain();
  whineGain.gain.value = 0;
  dumpGain = context.createGain();
  dumpGain.gain.value = 0;

  // Opens as the charge builds, so the bed gains brightness and not merely
  // volume — a capacitor winding gets shriller, not just louder.
  whineFilter = context.createBiquadFilter();
  whineFilter.type = "lowpass";
  whineFilter.frequency.value = 900;
  whineFilter.Q.value = 0.7;

  whine = context.createBufferSource();
  whine.buffer = buffer;
  whine.loop = true;
  whine.connect(whineGain);
  whineGain.connect(whineFilter);

  // The loop is seamless forwards, so it is seamless backwards too.
  dump = context.createBufferSource();
  dump.buffer = reversed(buffer, context);
  dump.loop = true;
  dump.connect(dumpGain);
  dumpGain.connect(whineFilter);

  whineFilter.connect(master);
  whine.start();
  dump.start();
  applyCharge();
}

function applyCharge() {
  if (!context || !whine || !whineGain || !dump || !dumpGain || !whineFilter) return;
  const now = context.currentTime;

  // Eased in, so the noise floor of a drifting pointer stays silent.
  const level = Math.pow(charge, 1.6) * 0.5;

  /*
   * Winding and draining are the same recording read in opposite directions,
   * so they crossfade rather than one stopping and the other starting. The
   * drain is given a little more level: losing a charge you worked for should
   * be more conspicuous than gaining it.
   */
  whineGain.gain.setTargetAtTime(level * (1 - draining), now, 0.04);
  dumpGain.gain.setTargetAtTime(level * draining * 1.25, now, 0.04);

  whineFilter.frequency.setTargetAtTime(700 + charge * 5200, now, 0.06);
  whine.playbackRate.setTargetAtTime(0.78 + charge * 0.46, now, 0.08);

  /*
   * A drain runs fast, and faster the harder it is draining. The bleed is
   * around 0.5 per second at rest, so that is the reference: at the standard
   * bleed it plays at about 1.7x, and a collapse from full runs quicker still.
   */
  const urgency = Math.min(1, drainRate / 0.55);
  dump.playbackRate.setTargetAtTime(1.35 + urgency * 0.95, now, 0.05);
}

/**
 * Which way the charge is moving, smoothed.
 *
 * The raw per-frame delta is far too noisy to switch on — the charge is
 * reported in hundredths, so a steady wind still produces frames where it
 * does not change at all, and flipping direction on those would chatter
 * between the two beds. This eases toward the current direction instead.
 */
function noteDirection(value: number) {
  const now = performance.now();
  const dt = lastAt ? Math.min(0.25, (now - lastAt) / 1000) : 0;
  lastAt = now;

  if (spent) {
    // Consumed, not lost. Reset the baseline so the drop is never measured.
    spent = false;
    draining = 0;
    drainRate = 0;
    lastCharge = value;
    return;
  }

  if (dt > 0) {
    const velocity = (value - lastCharge) / dt;
    const falling = velocity < -0.02 ? 1 : 0;
    if (falling) drainRate = Math.max(drainRate * 0.7, -velocity);
    else drainRate *= 0.85;
    // Roughly a tenth of a second to swing fully from one bed to the other.
    const ease = Math.min(1, dt / 0.1);
    draining += (falling - draining) * ease;
  }
  lastCharge = value;
}

/** Called every frame the charge changes. */
export function setShutterCharge(value: number) {
  noteDirection(value);
  charge = value;
  applyCharge();
}

function fire(url: string, gain: number) {
  const buffer = buffers.get(url);
  if (!context || !master || !buffer) return;
  if (context.state === "suspended") void context.resume();
  const source = context.createBufferSource();
  source.buffer = buffer;
  const level = context.createGain();
  level.gain.value = gain;
  source.connect(level);
  level.connect(master);
  source.start();
}

/** A click that takes no photograph: the mechanism alone. */
export function playShutterClick() {
  fire(CLICK, 0.5);
}

/**
 * A click that does. The charge is spent, so the bed has to go with it —
 * silenced here rather than waiting for the next charge report, so the whine
 * stops on the same frame as the shutter rather than a beat after it.
 */
export function playShutterFlash() {
  fire(FLASH, 0.9);
  spent = true;
  if (!context) return;
  const now = context.currentTime;
  whineGain?.gain.setTargetAtTime(0, now, 0.015);
  dumpGain?.gain.setTargetAtTime(0, now, 0.015);
}
