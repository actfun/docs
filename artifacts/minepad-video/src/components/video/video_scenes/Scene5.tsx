// Scene 5: BUILT ON ARC — fully onchain, no backend, Arc testnet
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

const CODE_LINES = [
  { text: '// LaunchpadFactory.sol', color: '#3a5070', delay: 0 },
  { text: 'contract TokenLauncher {', color: '#6a84a8', delay: 0.1 },
  { text: '  function mine(', color: '#3b8ef3', delay: 0.2 },
  { text: '    string memory post', color: '#f59e0b', delay: 0.3 },
  { text: '  ) external payable {', color: '#3b8ef3', delay: 0.4 },
  { text: '    require(msg.value >= feePerMine);', color: '#6a84a8', delay: 0.5 },
  { text: '    _mintTokens(msg.sender);', color: '#10b981', delay: 0.6 },
  { text: '    _checkGraduation();', color: '#f59e0b', delay: 0.7 },
  { text: '  }', color: '#6a84a8', delay: 0.8 },
  { text: '}', color: '#6a84a8', delay: 0.9 },
];

const CHAIN_STATS = [
  { label: 'Chain ID', value: '5042002', color: '#3b8ef3' },
  { label: 'Network', value: 'Arc Testnet', color: '#f59e0b' },
  { label: 'Backend', value: 'None', color: '#10b981' },
  { label: 'Factory', value: '0x68aa...3B16', color: '#6a84a8' },
];

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 600),
      setTimeout(() => setPhase(3), 1400),
      setTimeout(() => setPhase(4), 2400),
      setTimeout(() => setPhase(5), 8000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const dataStreams = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    left: 10 + i * 11,
    duration: 3 + Math.random() * 3,
    delay: Math.random() * 3,
    chars: Array.from({ length: 15 }, () => Math.random() > 0.5 ? '1' : '0').join(''),
  }));

  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: 30 }}
      transition={{ duration: 0.7 }}
    >
      {/* Pure black background */}
      <div className="absolute inset-0" style={{ background: '#000000' }} />

      {/* Binary data streams */}
      {dataStreams.map(stream => (
        <motion.div
          key={stream.id}
          className="absolute top-0"
          style={{
            left: `${stream.left}%`,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.55vw',
            color: '#3b8ef3',
            opacity: 0.1,
            writingMode: 'vertical-rl',
            letterSpacing: '0.3em',
          }}
          animate={{ y: ['-10vh', '110vh'] }}
          transition={{ duration: stream.duration, delay: stream.delay, repeat: Infinity, ease: 'linear' }}
        >
          {stream.chars}
        </motion.div>
      ))}

      {/* Section label */}
      <motion.div
        className="absolute top-8 left-10"
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
        style={{ fontFamily: 'var(--font-body)', fontSize: '0.55vw', letterSpacing: '0.35em', color: '#3b8ef3', textTransform: 'uppercase' }}
      >
        Built on Arc
      </motion.div>

      {/* Left: headline */}
      <div className="absolute" style={{ left: '7%', top: '18%', width: '40%' }}>
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
          transition={{ duration: 0.6, ease: 'circOut' }}
          style={{ fontFamily: 'var(--font-display)', fontSize: '3.8vw', color: '#d0d0d0', lineHeight: 1, textTransform: 'uppercase' }}
        >
          FULLY
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
          transition={{ duration: 0.6, delay: 0.08, ease: 'circOut' }}
          style={{ fontFamily: 'var(--font-display)', fontSize: '3.8vw', color: '#3b8ef3', lineHeight: 1, textTransform: 'uppercase' }}
        >
          ONCHAIN.
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.8vw', color: '#6a84a8', marginTop: '1.5vh', lineHeight: 1.6 }}
        >
          Zero backend. Zero trust.<br />
          Pure wagmi + viem RPC calls.<br />
          Every limit enforced by contract.
        </motion.div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6vw', marginTop: '2.5vh' }}>
          {CHAIN_STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 15 }}
              animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
              transition={{ duration: 0.4, delay: i * 0.1, ease: 'circOut' }}
              style={{
                background: 'rgba(8,10,16,0.9)',
                border: `1px solid ${stat.color}30`,
                borderRadius: 7,
                padding: '0.7vh 0.8vw',
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48vw', color: '#3a5070', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.2em' }}>{stat.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65vw', color: stat.color, fontWeight: 600 }}>{stat.value}</div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Right: code terminal */}
      <motion.div
        className="absolute"
        style={{ right: '5%', top: '12%', width: '46%' }}
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <div style={{
          background: 'rgba(0,0,0,0.98)',
          border: '1px solid rgba(59,142,243,0.25)',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 0 30px rgba(59,142,243,0.1), 0 24px 48px rgba(0,0,0,0.6)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4vw', padding: '1vh 1.2vw', background: 'rgba(8,10,16,0.9)', borderBottom: '1px solid rgba(59,142,243,0.12)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
            <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.48vw', color: '#3a5070' }}>TokenLauncher.sol</div>
          </div>
          <div style={{ padding: '1.2vh 1.5vw' }}>
            {CODE_LINES.map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
                transition={{ duration: 0.3, delay: phase >= 3 ? line.delay : 0 }}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65vw',
                  color: line.color,
                  lineHeight: 1.7,
                  whiteSpace: 'pre',
                }}
              >
                {line.text}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Arc testnet badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={phase >= 4 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.5, type: 'spring', stiffness: 300, damping: 20 }}
          style={{
            marginTop: '1.5vh',
            display: 'flex',
            alignItems: 'center',
            gap: '0.8vw',
            background: 'rgba(8,10,16,0.95)',
            border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: 8,
            padding: '0.8vh 1.2vw',
          }}
        >
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }}>
            <motion.div
              style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', opacity: 0.4 }}
              animate={{ scale: [1, 2, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6vw', color: '#6a84a8' }}>
            Arc Testnet · <span style={{ color: '#f59e0b' }}>Chain 5042002</span> · testnet.arcscan.app
          </div>
        </motion.div>
      </motion.div>

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
