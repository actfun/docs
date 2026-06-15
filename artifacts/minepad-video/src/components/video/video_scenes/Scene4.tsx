// Scene 4: GRADUATION — 95% → auto-graduates to DEX → gold explosion
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function Scene4() {
  const [phase, setPhase] = useState(0);
  const [progress, setProgress] = useState(75);
  const [exploded, setExploded] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => {
        setPhase(3);
        let val = 75;
        const fillId = setInterval(() => {
          val += 1;
          setProgress(val);
          if (val >= 95) {
            clearInterval(fillId);
            setTimeout(() => {
              setProgress(100);
              setExploded(true);
              setPhase(4);
            }, 400);
          }
        }, 40);
      }, 1800),
      setTimeout(() => setPhase(5), 5500),
      setTimeout(() => setPhase(6), 10000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    angle: (Math.random() * 360 * Math.PI) / 180,
    distance: Math.random() * 45 + 5,
    delay: Math.random() * 0.5,
    size: Math.random() * 5 + 2,
    color: Math.random() > 0.5 ? '#f59e0b' : Math.random() > 0.5 ? '#fbbf24' : '#3b8ef3',
  }));

  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.08 }}
      transition={{ duration: 0.6 }}
    >
      {/* Pure black background */}
      <div className="absolute inset-0" style={{ background: '#000000' }} />

      {/* Gold burst — screen blend on black = subtle glow only */}
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${import.meta.env.BASE_URL}images/gold_burst.png)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          mixBlendMode: 'screen',
        }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={exploded ? { opacity: [0, 0.6, 0.3], scale: [0.5, 1.4, 1.1] } : { opacity: 0, scale: 0.5 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Section label */}
      <motion.div
        className="absolute top-8 left-10"
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
        style={{ fontFamily: 'var(--font-body)', fontSize: '0.55vw', letterSpacing: '0.35em', color: '#f59e0b', textTransform: 'uppercase' }}
      >
        Step 2 — Graduate
      </motion.div>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* Pre-graduation content */}
        <motion.div
          animate={exploded ? { opacity: 0, y: -30, scale: 0.9 } : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5 }}
          style={{ width: '60%', textAlign: 'center' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.5 }}
            style={{ fontFamily: 'var(--font-body)', fontSize: '0.7vw', letterSpacing: '0.3em', color: '#6a84a8', marginBottom: '1.5vh', textTransform: 'uppercase' }}
          >
            When 95% is mined...
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scaleX: 0.8 }}
            animate={phase >= 2 ? { opacity: 1, scaleX: 1 } : { opacity: 0, scaleX: 0.8 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{ marginBottom: '1.5vh' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8vh' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65vw', color: '#3a5070' }}>Mined Supply</span>
              <motion.span
                style={{ fontFamily: 'var(--font-display)', fontSize: '1.6vw', color: progress >= 95 ? '#f59e0b' : '#3b8ef3', lineHeight: 1 }}
              >
                {progress}%
              </motion.span>
            </div>
            <div style={{ height: 14, background: 'rgba(255,255,255,0.05)', borderRadius: 7, overflow: 'hidden', border: '1px solid rgba(59,142,243,0.2)', position: 'relative' }}>
              <motion.div
                style={{
                  height: '100%',
                  background: progress >= 95
                    ? 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)'
                    : 'linear-gradient(90deg, #3b8ef3, #5aa3ff)',
                  borderRadius: 7,
                  width: `${progress}%`,
                  boxShadow: progress >= 95 ? '0 0 16px rgba(245,158,11,0.7)' : '0 0 8px rgba(59,142,243,0.4)',
                }}
                transition={{ duration: 0.05 }}
              />
              <div style={{ position: 'absolute', top: -6, left: '95%', transform: 'translateX(-50%)' }}>
                <div style={{ width: 2, height: 26, background: '#f59e0b', opacity: 0.7 }} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.45vw', color: '#f59e0b', textAlign: 'center', marginTop: 2 }}>95%</div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{ fontFamily: 'var(--font-body)', fontSize: '0.7vw', color: '#3a5070', textAlign: 'center' }}
          >
            ⚡ Contract auto-calls <span style={{ fontFamily: 'var(--font-mono)', color: '#3b8ef3' }}>_graduate()</span>
          </motion.div>
        </motion.div>

        {/* POST-GRADUATION content */}
        {exploded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, type: 'spring', stiffness: 250, damping: 20 }}
            style={{ position: 'absolute', textAlign: 'center' }}
          >
            <motion.div
              style={{ fontFamily: 'var(--font-display)', fontSize: '6.2vw', color: '#f59e0b', lineHeight: 1, textTransform: 'uppercase', textShadow: '0 0 40px rgba(245,158,11,0.8)' }}
              animate={{ scale: [0.9, 1.04, 1], filter: ['blur(8px)', 'blur(0px)'] }}
              transition={{ duration: 0.6 }}
            >
              GRADUATED
            </motion.div>
            <motion.div
              style={{ fontFamily: 'var(--font-body)', fontSize: '1.2vw', color: '#d0d0d0', marginTop: '1.5vh' }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              Built-in AMM is live · x·y=k · No DEX needed
            </motion.div>

            <motion.div
              style={{ display: 'flex', gap: '1.5vw', marginTop: '2.5vh', justifyContent: 'center' }}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.5 }}
            >
              {[
                { label: 'Token Reserve', value: '5% LP', color: '#f59e0b' },
                { label: 'USDC Reserve', value: 'All fees', color: '#3b8ef3' },
                { label: 'Formula', value: 'x·y=k', color: '#10b981' },
              ].map(item => (
                <div key={item.label} style={{
                  background: 'rgba(8,10,16,0.85)',
                  border: `1px solid ${item.color}35`,
                  borderRadius: 10,
                  padding: '1.2vh 1.2vw',
                  textAlign: 'center',
                  minWidth: '8vw',
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4vw', color: item.color }}>{item.value}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.55vw', color: '#6a84a8', marginTop: 4 }}>{item.label}</div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        )}

        {exploded && (
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
            {particles.map(p => (
              <motion.div
                key={p.id}
                style={{
                  position: 'absolute',
                  width: p.size,
                  height: p.size,
                  borderRadius: '50%',
                  background: p.color,
                  left: '50%',
                  top: '50%',
                }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: `${Math.cos(p.angle) * p.distance}vw`,
                  y: `${Math.sin(p.angle) * p.distance}vh`,
                  opacity: 0,
                  scale: 0,
                }}
                transition={{ duration: 1.2, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
          </div>
        )}
      </div>

      <motion.div
        className="absolute inset-0"
        style={{ background: '#000000' }}
        initial={{ opacity: 0 }}
        animate={phase >= 6 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.8 }}
      />
    </motion.div>
  );
}
