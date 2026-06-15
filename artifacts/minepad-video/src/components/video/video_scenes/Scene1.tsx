// Scene 1: HOOK — "What if you mined crypto just by being funny?"
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
const logoImg = `${import.meta.env.BASE_URL}images/actfun-logo.png`;

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 600),
      setTimeout(() => setPhase(3), 1200),
      setTimeout(() => setPhase(4), 2200),
      setTimeout(() => setPhase(5), 5500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.6 }}
    >
      {/* Pure black background */}
      <div className="absolute inset-0" style={{ background: '#000000' }} />

      {/* Subtle blue scan line */}
      <motion.div
        className="absolute left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, #3b8ef3, transparent)', top: '30%' }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={phase >= 1 ? { scaleX: 1, opacity: [0, 1, 0.2] } : { scaleX: 0, opacity: 0 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Logo top-left */}
      <motion.div
        className="absolute top-8 left-10"
        initial={{ opacity: 0, x: -30 }}
        animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
        transition={{ duration: 0.6, ease: 'circOut' }}
      >
        <img src={logoImg} alt="actfun" style={{ height: 28, filter: 'brightness(1.1)' }} />
      </motion.div>

      {/* Main content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-3 text-center"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.75vw', letterSpacing: '0.3em', color: '#3b8ef3', textTransform: 'uppercase' }}
        >
          What if...
        </motion.div>

        <div style={{ fontFamily: 'var(--font-display)', fontSize: '4.6vw', lineHeight: 1, color: '#d0d0d0', textAlign: 'center', textTransform: 'uppercase' }}>
          {'YOU MINED'.split('').map((ch, i) => (
            <motion.span
              key={`w1-${i}`}
              style={{ display: 'inline-block', whiteSpace: 'pre' }}
              initial={{ opacity: 0, y: 50, rotateX: -50 }}
              animate={phase >= 2 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 50, rotateX: -50 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25, delay: phase >= 2 ? i * 0.04 : 0 }}
            >
              {ch}
            </motion.span>
          ))}
        </div>

        <div style={{ fontFamily: 'var(--font-display)', fontSize: '4.6vw', lineHeight: 1, textAlign: 'center', textTransform: 'uppercase' }}>
          {'CRYPTO'.split('').map((ch, i) => (
            <motion.span
              key={`w2-${i}`}
              style={{ display: 'inline-block', color: '#3b8ef3' }}
              initial={{ opacity: 0, y: 50, rotateX: -50 }}
              animate={phase >= 2 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 50, rotateX: -50 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25, delay: phase >= 2 ? (i + 8) * 0.04 : 0 }}
            >
              {ch}
            </motion.span>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={phase >= 3 ? { opacity: 1, scaleX: 1 } : { opacity: 0, scaleX: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className="my-3"
          style={{ width: '16vw', height: 2, background: 'linear-gradient(90deg, #3b8ef3, #5aa3ff)', borderRadius: 2 }}
        />

        <motion.div
          initial={{ opacity: 0, filter: 'blur(10px)' }}
          animate={phase >= 3 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(10px)' }}
          transition={{ duration: 0.7 }}
          style={{ fontFamily: 'var(--font-body)', fontSize: '1.4vw', color: '#6a84a8', textAlign: 'center', fontWeight: 300 }}
        >
          Just by being funny?
        </motion.div>

        {/* actfun brand badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          transition={{ duration: 0.5, ease: 'circOut', delay: 0.1 }}
          style={{ marginTop: '2vh', display: 'flex', alignItems: 'center', gap: '0.4vw' }}
        >
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9vw', fontWeight: 700, color: '#d0d0d0' }}>act</span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9vw', fontWeight: 700, color: '#3b8ef3' }}>fun</span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.55vw', color: '#3a5070', marginLeft: '0.3vw', letterSpacing: '0.2em', textTransform: 'uppercase' }}>testnet</span>
        </motion.div>
      </div>

      {/* Bottom fade out */}
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
