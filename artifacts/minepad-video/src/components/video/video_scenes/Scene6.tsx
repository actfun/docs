// Scene 6: OUTRO — minepad lockup + mine to launch
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

const TAGLINE_CHARS = 'MINE SOMETHING FUNNY'.split('');

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 700),
      setTimeout(() => setPhase(3), 1500),
      setTimeout(() => setPhase(4), 2400),
      setTimeout(() => setPhase(5), 3500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      {/* Pure black background */}
      <div className="absolute inset-0" style={{ background: '#000000' }} />

      {/* Very subtle blue ambient glow */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '50vw', height: '50vw',
          left: '25%', top: '15%',
          background: 'radial-gradient(circle, rgba(59,142,243,0.05) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Accent lines */}
      <motion.div
        className="absolute"
        style={{ top: '35%', left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent 5%, rgba(59,142,243,0.15) 40%, rgba(59,142,243,0.15) 60%, transparent 95%)' }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={phase >= 1 ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.div
        className="absolute"
        style={{ top: '65%', left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent 5%, rgba(59,142,243,0.08) 40%, rgba(59,142,243,0.08) 60%, transparent 95%)' }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={phase >= 1 ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }}
        transition={{ duration: 1.2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* actfun brand name */}
        <motion.div
          style={{ display: 'flex', alignItems: 'baseline', marginBottom: '0.8vh' }}
          initial={{ opacity: 0, y: 40 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: '4.5vw',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: '#d0d0d0',
            lineHeight: 1,
          }}>act</span>
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: '4.5vw',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: '#3b8ef3',
            lineHeight: 1,
          }}>fun</span>
        </motion.div>

        {/* Divider */}
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={phase >= 3 ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{ width: '22vw', height: 2, background: 'linear-gradient(90deg, transparent, #3b8ef3, transparent)', borderRadius: 2, marginBottom: '2.5vh' }}
        />

        {/* Tagline kinetic */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.3vw', marginBottom: '2.5vh' }}>
          {TAGLINE_CHARS.map((ch, i) => (
            <motion.span
              key={i}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '1.3vw',
                fontWeight: 600,
                color: ch === ' ' ? 'transparent' : '#d0d0d0',
                letterSpacing: '0.12em',
              }}
              initial={{ opacity: 0, y: 16 }}
              animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={{ duration: 0.4, delay: phase >= 3 ? 0.1 + i * 0.03 : 0, ease: 'circOut' }}
            >
              {ch === ' ' ? '\u00A0' : ch}
            </motion.span>
          ))}
        </div>

        {/* URL + social */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
          transition={{ duration: 0.6, ease: 'circOut' }}
          style={{ display: 'flex', alignItems: 'center', gap: '2vw' }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95vw', color: '#3b8ef3', fontWeight: 600, letterSpacing: '0.05em' }}>actfun.xyz</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.5vw', color: '#3a5070', marginTop: 4, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Launch a token</div>
          </div>
          <div style={{ width: 1, height: '3vh', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95vw', color: '#6a84a8', fontWeight: 600 }}>@ACTFUNmine</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.5vw', color: '#3a5070', marginTop: 4, letterSpacing: '0.2em', textTransform: 'uppercase' }}>X / Twitter</div>
          </div>
          <div style={{ width: 1, height: '3vh', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95vw', color: '#d0d0d0', fontWeight: 700, letterSpacing: '0.08em' }}>Arc</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.5vw', color: '#3a5070', marginTop: 4, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Testnet</div>
          </div>
        </motion.div>
      </div>

      {/* Loop exit fade */}
      <motion.div
        className="absolute inset-0"
        style={{ background: '#000000' }}
        initial={{ opacity: 0 }}
        animate={phase >= 5 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 1.5 }}
      />
    </motion.div>
  );
}
