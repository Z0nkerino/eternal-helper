// Cloudy's tiny sounds, synthesised with WebAudio (no files). Off by default; toggled in his room.
let ctx: AudioContext | null = null;

export function chirp(kind: 'pop' | 'joy' | 'chomp' | 'lift') {
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    const notes: Record<typeof kind, [number, number, number][]> = {
      pop: [[880, 0, 0.08]],
      joy: [[784, 0, 0.09], [1046, 0.08, 0.12]],
      chomp: [[220, 0, 0.06], [180, 0.14, 0.06], [240, 0.28, 0.07]],
      lift: [[523, 0, 0.06], [659, 0.05, 0.08]],
    };
    for (const [f, at, dur] of notes[kind]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = kind === 'chomp' ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f, t + at);
      o.frequency.exponentialRampToValueAtTime(f * (kind === 'chomp' ? 0.8 : 1.12), t + at + dur);
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(0.12, t + at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur + 0.06);
      o.connect(g).connect(ctx.destination);
      o.start(t + at);
      o.stop(t + at + dur + 0.08);
    }
  } catch {
    /* no audio */
  }
}
