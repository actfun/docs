import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';

export const SCENE_DURATIONS = {
  hook: 8000,
  problem: 8000,
  mine: 10000,
  graduate: 12000,
  arc: 10000,
  outro: 10000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  hook: Scene1,
  problem: Scene2,
  mine: Scene3,
  graduate: Scene4,
  arc: Scene5,
  outro: Scene6,
};

const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let cum = 0;
  for (const [key, ms] of Object.entries(SCENE_DURATIONS)) {
    out[key] = cum / 1000;
    cum += ms;
  }
  return out;
})();

const AUDIO_SEEK_EPSILON_SEC = 0.18;

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey]);

  // Persistent background orb that shifts position per scene
  const orbPositions = [
    { x: '10%', y: '20%', scale: 1.8, color: 'rgba(59,142,243,0.12)' },
    { x: '70%', y: '60%', scale: 1.4, color: 'rgba(239,68,68,0.08)' },
    { x: '50%', y: '10%', scale: 2.0, color: 'rgba(59,142,243,0.10)' },
    { x: '30%', y: '70%', scale: 1.6, color: 'rgba(245,158,11,0.15)' },
    { x: '80%', y: '30%', scale: 1.3, color: 'rgba(59,142,243,0.12)' },
    { x: '20%', y: '50%', scale: 2.2, color: 'rgba(59,142,243,0.08)' },
  ];
  const orb = orbPositions[sceneIndex] ?? orbPositions[0];

  return (
    <>
      <div className="relative w-full h-screen overflow-hidden" style={{ background: '#000000' }}>
        {/* Persistent ambient orb — lives outside AnimatePresence */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: '60vw',
            height: '60vw',
            background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
            filter: 'blur(60px)',
            pointerEvents: 'none',
          }}
          animate={{ left: orb.x, top: orb.y, scale: orb.scale }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* Persistent thin accent line */}
        <motion.div
          className="absolute left-0 right-0"
          style={{
            height: 1,
            background: 'linear-gradient(90deg, transparent 0%, rgba(59,142,243,0.3) 30%, rgba(245,158,11,0.3) 70%, transparent 100%)',
          }}
          animate={{ top: ['15%', '85%', '25%', '60%', '40%', '70%'][sceneIndex] ?? '50%' }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />

        <AnimatePresence mode="popLayout">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>
      </div>

      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </>
  );
}
