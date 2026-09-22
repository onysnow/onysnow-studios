/**
 * The shutter's sound.
 *
 * Three cues, cut from recordings of a real film camera:
 *
 *   flash-charge   the capacitor winding. Looped, and both its level and its
 *                  pitch follow the charge, so it rises as you wind and sags
 *                  the moment you stop — the same curve the light follows.
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

/** The looped charge bed, and the nodes that shape it. */
let whine: AudioBufferSourceNode | null = null;
let whineGain: GainNode | null = null;
let whineFilter: BiquadFilterNode | null = null;

let charge = 0;

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

  // Opens as the charge builds, so the bed gains brightness and not merely
  // volume — a capacitor winding gets shriller, not just louder.
  whineFilter = context.createBiquadFilter();
  whineFilter.type = "lowpass";
  whineFilter.frequency.value = 900;
  whineFilter.Q.value = 0.7;

  whine = context.createBufferSource();
  whine.buffer = buffer;
  whine.loop = true;
  whine.connect(whineFilter);
  whineFilter.connect(whineGain);
  whineGain.connect(master);
  whine.start();
  applyCharge();
}

function applyCharge() {
  if (!context || !whine || !whineGain || !whineFilter) return;
  const now = context.currentTime;

  // Eased in, so the noise floor of a drifting pointer stays silent.
  const level = Math.pow(charge, 1.6) * 0.5;
  // A short time constant: fast enough to track the wind, slow enough that
  // the per-frame charge updates do not granulate into a buzz.
  whineGain.gain.setTargetAtTime(level, now, 0.04);
  whineFilter.frequency.setTargetAtTime(700 + charge * 5200, now, 0.06);
  whine.playbackRate.setTargetAtTime(0.78 + charge * 0.46, now, 0.08);
}

/** Called every frame the charge changes. */
export function setShutterCharge(value: number) {
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
  if (context && whineGain) whineGain.gain.setTargetAtTime(0, context.currentTime, 0.015);
}
