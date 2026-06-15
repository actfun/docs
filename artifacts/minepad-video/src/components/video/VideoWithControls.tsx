import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Download, Repeat, Volume2, VolumeX } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';

const PROGRESS_TICK_MS = 60;

const SCENE_LABELS: Record<string, string> = {
  hook: 'Hook',
  problem: 'Problem',
  mine: 'Mine',
  graduate: 'Graduate',
  arc: 'Arc',
  outro: 'Outro',
};

const VIDEO_DOWNLOAD_URL = `${import.meta.env.BASE_URL}actfun-demo.mp4`;

// ─── Progress segments ────────────────────────────────────────────────────────

function ProgressSegments({
  sceneKeys, activeIndex, activeDuration, tick, onJumpTo,
}: {
  sceneKeys: string[];
  activeIndex: number;
  activeDuration: number;
  tick: number;
  onJumpTo: (index: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const start = performance.now();
    const id = window.setInterval(() => setElapsed(performance.now() - start), PROGRESS_TICK_MS);
    return () => window.clearInterval(id);
  }, [tick]);

  const progress = activeDuration > 0 ? Math.min(1, elapsed / activeDuration) : 0;

  return (
    <div className="flex-1 flex items-center gap-1.5">
      {sceneKeys.map((key, i) => {
        const isActive = i === activeIndex;
        const fill = isActive ? progress * 100 : i < activeIndex ? 100 : 0;
        return (
          <button
            key={key}
            onClick={() => onJumpTo(i)}
            className="flex-1 h-3 bg-white/20 rounded-full overflow-hidden cursor-pointer hover:h-4 transition-all relative min-h-[12px]"
            aria-label={`Jump to ${SCENE_LABELS[key] ?? key}`}
            title={SCENE_LABELS[key] ?? key}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100"
              style={{
                width: `${fill}%`,
                background: isActive
                  ? 'linear-gradient(90deg, #3b8ef3, #5aa3ff)'
                  : 'rgba(255,255,255,0.4)',
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

// ─── Control bar ──────────────────────────────────────────────────────────────

function ControlBar({
  visible, collapsed, locked, muted, sceneKeys, activeIndex, activeDuration, tick,
  onToggleLock, onToggleMute, onJumpTo, onToggleCollapsed,
}: {
  visible: boolean; collapsed: boolean; locked: boolean; muted: boolean;
  sceneKeys: string[]; activeIndex: number; activeDuration: number; tick: number;
  onToggleLock: () => void; onToggleMute: () => void;
  onJumpTo: (i: number) => void; onToggleCollapsed: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 bg-black/60 backdrop-blur-sm px-4 py-3 transition-all duration-200 ease-out ${
        visible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-full opacity-0 pointer-events-none'
      }`}
    >
      <button
        onClick={onToggleLock}
        className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors shrink-0 ${
          locked ? 'text-white bg-white/15' : 'text-white/50 hover:text-white hover:bg-white/10'
        }`}
        title={locked ? 'Loop: on' : 'Loop: off'}
      >
        <Repeat className="w-5 h-5" />
      </button>

      <button
        onClick={onToggleMute}
        className="w-11 h-11 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>

      <div className="w-px self-stretch bg-white/15" />

      <ProgressSegments
        sceneKeys={sceneKeys}
        activeIndex={activeIndex}
        activeDuration={activeDuration}
        tick={tick}
        onJumpTo={onJumpTo}
      />

      <span className="text-xs text-white/50 font-mono tabular-nums shrink-0">
        {activeIndex + 1}/{sceneKeys.length}
      </span>

      <button
        onClick={onToggleCollapsed}
        className="w-11 h-11 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0"
        title={collapsed ? 'Show controls' : 'Hide controls'}
      >
        {collapsed ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
      </button>
    </div>
  );
}

// ─── Download bar ─────────────────────────────────────────────────────────────

function DownloadBar() {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-4 gap-4"
      style={{
        background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)',
        paddingTop: 28,
      }}
    >
      <div className="text-xs text-white/35 font-medium tracking-wide hidden sm:block">
        actfun demo · 16:9 · 58s
      </div>

      <a
        href={VIDEO_DOWNLOAD_URL}
        download="actfun-demo.mp4"
        className="ml-auto flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-white text-sm transition-all active:scale-95 select-none no-underline"
        style={{
          background: 'linear-gradient(135deg, #3b8ef3 0%, #2563eb 100%)',
          boxShadow: '0 0 24px rgba(59,142,243,0.45)',
        }}
      >
        <Download className="w-4 h-4" />
        Download Video
      </a>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function VideoWithControls() {
  const isIframed = typeof window !== 'undefined' && window.self !== window.top;

  const {
    sceneKeys, activeIndex, locked, mountKey, tick,
    durations, activeDuration, onSceneChange, jumpTo, toggleLock,
  } = useSceneControls(SCENE_DURATIONS);

  const [muted, setMuted] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tapPinned, setTapPinned] = useState(false);
  const sensorRef = useRef<HTMLDivElement | null>(null);

  const handlePointerEnter = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') setHovering(true);
  }, []);
  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') setHovering(false);
  }, []);
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' && collapsed) setTapPinned(true);
  }, [collapsed]);
  const handleToggleCollapsed = useCallback(() => {
    setCollapsed(c => {
      if (!c) { setHovering(false); setTapPinned(false); }
      return !c;
    });
  }, []);

  useEffect(() => {
    if (!(collapsed && tapPinned)) return;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      if (!sensorRef.current?.contains(e.target as Node)) setTapPinned(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [collapsed, tapPinned]);

  const barVisible = !collapsed || hovering || tapPinned;

  if (!isIframed) {
    return (
      <div className="relative w-full h-screen overflow-hidden">
        <VideoTemplate />
        <DownloadBar />
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <VideoTemplate
        key={mountKey}
        durations={durations}
        loop
        muted={muted}
        onSceneChange={onSceneChange}
      />

      {/* Scene scrubber — hover zone */}
      <div
        ref={sensorRef}
        className="absolute bottom-[72px] left-0 right-0 z-50 flex flex-col justify-end"
        style={{ height: '18%' }}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
      >
        <div className="flex-1" />
        <ControlBar
          visible={barVisible}
          collapsed={collapsed}
          locked={locked}
          muted={muted}
          sceneKeys={sceneKeys}
          activeIndex={activeIndex}
          activeDuration={activeDuration}
          tick={tick}
          onToggleLock={toggleLock}
          onToggleMute={() => setMuted(m => !m)}
          onJumpTo={jumpTo}
          onToggleCollapsed={handleToggleCollapsed}
        />
      </div>

      <DownloadBar />
    </div>
  );
}
