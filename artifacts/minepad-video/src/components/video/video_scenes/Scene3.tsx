// Scene 3: MINE — Write funny post → tokens rain → community mines
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

const FUNNY_POSTS = [
  '"My portfolio is down 90% and I\'m still bullish"',
  '"Why buy the dip when you can write about it"',
  '"This is financial advice (it is not)"',
  '"ser wen moon ser I am poor"',
  '"I mined PEPE by saying pepe pepe pepe"',
];

const TOKEN_EMOJIS = ['⛏️', '💰', '🪙', '✨', '💎', '🚀', '🤑', '⚡'];

export function Scene3() {
  const [phase, setPhase] = useState(0);
  const [postIdx, setPostIdx] = useState(0);
  const [mineProgress, setMineProgress] = useState(0);
  const [tokens, setTokens] = useState<{ id: number; x: number; emoji: string; delay: number }[]>([]);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1800),
      setTimeout(() => setPhase(4), 2800),
      setTimeout(() => setPhase(5), 4500),
      setTimeout(() => setPhase(6), 9500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (phase < 3) return;
    const id = setInterval(() => setPostIdx(p => (p + 1) % FUNNY_POSTS.length), 1800);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase < 4) return;
    const id = setInterval(() => {
      setMineProgress(p => {
        if (p >= 78) { clearInterval(id); return 78; }
        return p + 1.5;
      });
    }, 80);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase < 4) return;
    let count = 0;
    const id = setInterval(() => {
      setTokens(prev => [
        ...prev.slice(-30),
        {
          id: count++,
          x: Math.random() * 80 + 10,
          emoji: TOKEN_EMOJIS[Math.floor(Math.random() * TOKEN_EMOJIS.length)],
          delay: Math.random() * 0.5,
        },
      ]);
    }, 300);
    return () => clearInterval(id);
  }, [phase]);

  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Pure black background — no human images */}
      <div className="absolute inset-0" style={{ background: '#000000' }} />

      {/* Token rain */}
      {tokens.map(t => (
        <motion.div
          key={t.id}
          className="absolute"
          style={{ left: `${t.x}%`, top: 0, fontSize: '1.4vw', pointerEvents: 'none', zIndex: 10 }}
          initial={{ y: '-5vh', opacity: 0 }}
          animate={{ y: '110vh', opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.5, delay: t.delay, ease: 'linear' }}
        >
          {t.emoji}
        </motion.div>
      ))}

      {/* Section label */}
      <motion.div
        className="absolute top-8 left-10"
        initial={{ opacity: 0, y: -20 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
        transition={{ duration: 0.5, ease: 'circOut' }}
        style={{ fontFamily: 'var(--font-body)', fontSize: '0.55vw', letterSpacing: '0.35em', color: '#3b8ef3', textTransform: 'uppercase' }}
      >
        Step 1 — Mine
      </motion.div>

      {/* Main headline */}
      <div className="absolute" style={{ top: '12%', left: '8%' }}>
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
          transition={{ duration: 0.6, ease: 'circOut' }}
          style={{ fontFamily: 'var(--font-display)', fontSize: '4vw', color: '#d0d0d0', lineHeight: 1, textTransform: 'uppercase' }}
        >
          WRITE.
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
          transition={{ duration: 0.6, delay: 0.1, ease: 'circOut' }}
          style={{ fontFamily: 'var(--font-display)', fontSize: '4vw', color: '#f59e0b', lineHeight: 1, textTransform: 'uppercase' }}
        >
          MINE.
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
          transition={{ duration: 0.6, delay: 0.1, ease: 'circOut' }}
          style={{ fontFamily: 'var(--font-display)', fontSize: '4vw', color: '#3b8ef3', lineHeight: 1, textTransform: 'uppercase' }}
        >
          EARN.
        </motion.div>
      </div>

      {/* Post card */}
      <motion.div
        className="absolute"
        style={{ right: '6%', top: '18%', width: '38%' }}
        initial={{ opacity: 0, y: 30, rotateY: -15 }}
        animate={phase >= 2 ? { opacity: 1, y: 0, rotateY: 0 } : { opacity: 0, y: 30, rotateY: -15 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div style={{
          background: 'rgba(8,10,16,0.95)',
          border: '1px solid rgba(59,142,243,0.3)',
          borderRadius: 14,
          padding: '1.8vh 1.8vw',
          boxShadow: '0 0 24px rgba(59,142,243,0.15), 0 16px 32px rgba(0,0,0,0.6)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8vw', marginBottom: '1.2vh' }}>
            <div style={{ width: '1.8vw', height: '1.8vw', borderRadius: '50%', background: 'linear-gradient(135deg, #3b8ef3, #f59e0b)', flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.65vw', color: '#d0d0d0', fontWeight: 600 }}>community.miner</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5vw', color: '#3b8ef3' }}>⛏ Mining PEPE</div>
            </div>
            <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.5vw', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '0.2vh 0.5vw', borderRadius: 5, border: '1px solid rgba(245,158,11,0.25)' }}>
              +100 PEPE
            </div>
          </div>

          <motion.div
            key={postIdx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            style={{ fontFamily: 'var(--font-body)', fontSize: '0.75vw', color: '#b0bfd0', lineHeight: 1.5, minHeight: '4vh' }}
          >
            {FUNNY_POSTS[postIdx]}
          </motion.div>

          <div style={{ marginTop: '1.2vh', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52vw', color: '#3a5070' }}>0.0001 USDC fee</div>
            <motion.div
              style={{
                fontFamily: 'var(--font-body)', fontSize: '0.6vw', color: '#000000', fontWeight: 700,
                background: 'linear-gradient(90deg, #3b8ef3, #5aa3ff)',
                padding: '0.4vh 1vw', borderRadius: 6,
              }}
              animate={{ scale: [1, 1.03, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              ⛏ Mine
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Mining progress bar */}
      <motion.div
        className="absolute"
        style={{ left: '8%', right: '6%', bottom: '20%' }}
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.5, ease: 'circOut' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8vh' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6vw', color: '#6a84a8' }}>Community Mined</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6vw', color: '#3b8ef3' }}>{mineProgress.toFixed(0)}% / 95%</span>
        </div>
        <div style={{ height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(59,142,243,0.18)' }}>
          <motion.div
            style={{ height: '100%', background: 'linear-gradient(90deg, #3b8ef3, #5aa3ff)', borderRadius: 4, width: `${mineProgress}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.55vw', color: '#3a5070', marginTop: '0.6vh' }}>
          Anyone can mine. Every post counts.
        </div>
      </motion.div>

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
