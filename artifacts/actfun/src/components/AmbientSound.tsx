import { useState, useRef } from "react";
import { Volume2, VolumeX } from "lucide-react";

/* ─────────────────────────────────────────────
   Audio rig — built on Web Audio API.
   No files needed. Pure synthesis:
     · Bass drone   (55 Hz sine)
     · Sub harmonic (110 Hz, slight detune)
     · Pad chord    (220 / 261.6 / 329.6 Hz Am)
     · Pad filter   (slow LFO sweep)
     · High shimmer (880 Hz sine, barely audible)
     · Feedback delay for depth / space
───────────────────────────────────────────── */
interface Rig {
  ctx: AudioContext;
  master: GainNode;
  oscs: OscillatorNode[];
  pingTimer: ReturnType<typeof setInterval>;
}

function buildRig(): Rig {
  const ctx = new AudioContext();
  const oscs: OscillatorNode[] = [];

  /* master volume — fades in over 5 s */
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.13, ctx.currentTime + 5);
  master.connect(ctx.destination);

  /* feedback delay → pseudo-reverb */
  const dly1 = ctx.createDelay(1.2);
  dly1.delayTime.value = 0.38;
  const dly2 = ctx.createDelay(1.2);
  dly2.delayTime.value = 0.57;
  const fbGain = ctx.createGain();
  fbGain.gain.value = 0.38;
  const wetGain = ctx.createGain();
  wetGain.gain.value = 0.45;

  master.connect(dly1);
  dly1.connect(dly2);
  dly2.connect(fbGain);
  fbGain.connect(dly1);
  dly2.connect(wetGain);
  wetGain.connect(ctx.destination);

  /* low-pass filter on pad oscillators */
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 650;
  padFilter.Q.value = 1.4;
  padFilter.connect(master);

  /* slow LFO sweeps the filter cutoff */
  const fLfo = ctx.createOscillator();
  fLfo.frequency.value = 0.07;
  const fLfoG = ctx.createGain();
  fLfoG.gain.value = 280;
  fLfo.connect(fLfoG);
  fLfoG.connect(padFilter.frequency);
  fLfo.start();
  oscs.push(fLfo as unknown as OscillatorNode);

  /* bass drone — A1 55 Hz */
  const makeOsc = (
    freq: number,
    type: OscillatorType,
    gain: number,
    dest: AudioNode,
    detune = 0,
  ) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g);
    g.connect(dest);
    o.start();
    oscs.push(o);
    return o;
  };

  makeOsc(55, "sine", 0.75, master);
  makeOsc(110, "sine", 0.38, master, 4);

  /* pad — Am chord (220 / 261.6 / 329.6 Hz) */
  const padFreqs = [220, 261.63, 329.63];
  padFreqs.forEach((freq, i) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    o.detune.value = (i % 2 === 0 ? 1 : -1) * 5;
    const g = ctx.createGain();
    g.gain.value = 0.2 / (i + 1);

    /* per-oscillator slow vibrato */
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.035 + i * 0.02;
    const lg = ctx.createGain();
    lg.gain.value = 2;
    lfo.connect(lg);
    lg.connect(o.frequency);
    lfo.start();
    oscs.push(lfo as unknown as OscillatorNode);

    o.connect(g);
    g.connect(padFilter);
    o.start();
    oscs.push(o);
  });

  /* shimmer layer — 880 Hz, barely audible */
  makeOsc(880, "sine", 0.022, master, -3);

  /* periodic "ping" — blockchain pulse every ~3.2 s */
  const pingFreqs = [659.25, 783.99, 987.77]; // E5 G5 B5 (Em chord tones)
  let pingIdx = 0;
  const schedulePing = () => {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = pingFreqs[pingIdx % pingFreqs.length];
    pingIdx++;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.06, t + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(env);
    env.connect(ctx.destination);
    o.start(t);
    o.stop(t + 1.9);
  };
  schedulePing();
  const pingTimer = setInterval(schedulePing, 3200);

  return { ctx, master, oscs, pingTimer };
}

export default function AmbientSound() {
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const rigRef = useRef<Rig | null>(null);

  const toggle = () => {
    if (playing) {
      const rig = rigRef.current;
      if (rig) {
        rig.master.gain.setTargetAtTime(0, rig.ctx.currentTime, 0.6);
        clearInterval(rig.pingTimer);
        setTimeout(() => {
          rig.oscs.forEach(o => { try { o.stop(); } catch { /* already stopped */ } });
          rig.ctx.close();
          rigRef.current = null;
        }, 2200);
      }
      setPlaying(false);
    } else {
      rigRef.current = buildRig();
      setPlaying(true);
    }
  };

  const isOn = playing;

  return (
    <button
      onClick={toggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={isOn ? "Mute ambient" : "Play ambient sound"}
      style={{
        position: "fixed",
        bottom: 24,
        right: 20,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "8px 14px",
        borderRadius: 999,
        border: isOn
          ? "1px solid rgba(59,142,243,0.45)"
          : "1px solid rgba(255,255,255,0.12)",
        background: isOn
          ? "rgba(59,142,243,0.12)"
          : "rgba(15,15,15,0.88)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        color: isOn ? "#93c5fd" : "rgba(255,255,255,0.45)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.06em",
        cursor: "pointer",
        transition: "all 0.2s ease",
        opacity: hovered ? 1 : isOn ? 0.9 : 0.6,
        boxShadow: isOn ? "0 0 18px rgba(59,142,243,0.18)" : "none",
      }}
    >
      {/* animated bars when playing */}
      {isOn ? (
        <span style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 12 }}>
          {[0, 1, 2].map(i => (
            <span
              key={i}
              style={{
                display: "block",
                width: 3,
                borderRadius: 2,
                background: "#93c5fd",
                animation: `eq-bar 0.9s ease-in-out ${i * 0.18}s infinite alternate`,
                height: [8, 12, 6][i],
              }}
            />
          ))}
        </span>
      ) : (
        <VolumeX size={12} />
      )}
      <span>{isOn ? "Ambient" : "Sound off"}</span>
    </button>
  );
}
