// Scene 2: THE PROBLEM — "Everyone launches tokens. Nobody earns them."
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 700),
      setTimeout(() => setPhase(3), 1600),
      setTimeout(() => setPhase(4), 2800),
      setTimeout(() => setPhase(5), 5500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const oldTokens = ['SHIB 2.0', 'MOON69', 'ELON INU', 'WEN RICH', 'SAFE PUMP'];
  const lines = [
    { text: 'Anyone can', color: '#6a84a8' },
    { text: 'LAUNCH', color: '#d0d0d0' },
    { text: 'a token.', color: '#6a84a8' },
  ];

  return (
    <motion.div
      className="absolute inset-0"
      initial={{ clipPath: 'inset(0 100% 0 0)' }}
      animate={{ clipPath: 'inset(0 0% 0 0)' }}
      exit={{ opacity: 0, filter: 'blur(15px)', scale: 0.97 }}
      transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* Pure black background */}
      <div className="absolute inset-0" style={{ background: '#000000' }} />

      {/* Subtle grid lines */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.06]" preserveAspectRatio="none">
        {Array.from({ length: 12 }, (_, i) => (
          <line key={`v${i}`} x1={`${(i + 1) * 8.33}%`} y1="0" x2={`${(i + 1) * 8.33}%`} y2="100%" stroke="#3b8ef3" strokeWidth="1" />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={`${(i + 1) * 12.5}%`} x2="100%" y2={`${(i + 1) * 12.5}%`} stroke="#3b8ef3" strokeWidth="1" />
        ))}
      </svg>

      {/* Left side: old model */}
      <div className="absolute left-0 top-0 bottom-0" style={{ width: '48%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 4vw' }}>
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
          transition={{ duration: 0.6, ease: 'circOut' }}
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.6vw', letterSpacing: '0.4em', color: '#3a5070', marginBottom: '2vh', textTransform: 'uppercase' }}
        >
          The Old Way
        </motion.div>

        {oldTokens.map((token, i) => (
          <motion.div
            key={token}
            initial={{ opacity: 0, x: -30 }}
            animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
            transition={{ duration: 0.4, delay: i * 0.1, ease: 'circOut' }}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '1.1vw',
              color: '#ef4444',
              marginBottom: '1.2vh',
              display: 'flex',
              alignItems: 'center',
              gap: '1vw',
              textDecoration: 'line-through',
              opacity: 0.65,
            }}
          >
            <span style={{ color: '#ef4444', opacity: 0.5, fontSize: '0.85vw' }}>✗</span>
            {token}
          </motion.div>
        ))}

        <motion.div
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5 }}
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.75vw', color: '#3a5070', marginTop: '2vh', lineHeight: 1.5 }}
        >
          Deploy → dump → disappear
        </motion.div>
      </div>

      {/* Center divider */}
      <motion.div
        className="absolute top-0 bottom-0"
        style={{ left: '48%', width: 2, background: 'linear-gradient(to bottom, transparent, #3b8ef3, transparent)' }}
        initial={{ scaleY: 0 }}
        animate={phase >= 1 ? { scaleY: 1 } : { scaleY: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Right side: the verdict */}
      <div className="absolute right-0 top-0 bottom-0" style={{ width: '50%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 4vw' }}>
        {lines.map((line, i) => (
          <motion.div
            key={line.text}
            initial={{ opacity: 0, y: 30 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.5, delay: 0.1 + i * 0.15, ease: 'circOut' }}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: line.text === 'LAUNCH' ? '4.4vw' : '2.2vw',
              color: line.color,
              lineHeight: 1.05,
              textTransform: 'uppercase',
            }}
          >
            {line.text}
          </motion.div>
        ))}

        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={phase >= 3 ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }}
          style={{ transformOrigin: 'left', height: 2, background: 'linear-gradient(90deg, #ef4444, transparent)', margin: '2vh 0', borderRadius: 2 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />

        <motion.div
          initial={{ opacity: 0, filter: 'blur(8px)' }}
          animate={phase >= 4 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(8px)' }}
          transition={{ duration: 0.6 }}
          style={{ fontFamily: 'var(--font-body)', fontSize: '1.1vw', lineHeight: 1.4 }}
        >
          <span style={{ color: '#6a84a8' }}>Nobody </span>
          <span style={{ color: '#d0d0d0', fontWeight: 600 }}>earns</span>
          <span style={{ color: '#6a84a8' }}>. </span>
          <br />
          <span style={{ color: '#6a84a8' }}>Nobody </span>
          <span style={{ color: '#d0d0d0', fontWeight: 600 }}>deserves</span>
          <span style={{ color: '#6a84a8' }}>.</span>
          <br />
          <span style={{ color: '#6a84a8' }}>Nobody </span>
          <span style={{ color: '#ef4444', fontWeight: 700 }}>cares</span>
          <span style={{ color: '#6a84a8' }}>.</span>
        </motion.div>
      </div>

      {/* Exit overlay */}
      <motion.div
        className="absolute inset-0"
        style={{ background: '#000000' }}
        initial={{ opacity: 0 }}
        animate={phase >= 5 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.8 }}
      />
    </motion.div>
  );
}
