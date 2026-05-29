import { useEffect, useState } from 'react';
import { EXPERIENCES, type Experience } from '@/data/experiences';

const PLAY_BASE = (import.meta.env.VITE_PLAY_BASE as string) || '/app';

interface PlayerOverlayProps {
  id: Experience['id'];
  onClose: () => void;
}

export default function PlayerOverlay({ id, onClose }: PlayerOverlayProps) {
  const exp = EXPERIENCES.find((x) => x.id === id);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const src = `${PLAY_BASE}/?tab=${id}&embed=1`;

  return (
    <div className="fixed inset-0 z-50 bg-[#051410]">
      {/* Loading state until the experience iframe is ready (no jarring black flash) */}
      {!ready && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 pointer-events-none">
          <div className="text-6xl animate-pulse" aria-hidden>{exp?.icon}</div>
          <div
            className="text-2xl text-foreground"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            Loading {exp?.name}…
          </div>
          <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/2 animate-[loadbar_1.1s_ease-in-out_infinite] rounded-full bg-[#8fe388]" />
          </div>
        </div>
      )}

      <iframe
        title={exp?.name ?? 'Experience'}
        src={src}
        onLoad={() => setReady(true)}
        className={`absolute inset-0 w-full h-full border-0 transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}
        allow="camera; microphone; fullscreen; autoplay; encrypted-media"
      />

      <button
        onClick={onClose}
        className="liquid-glass absolute top-5 left-5 z-20 rounded-full px-5 py-2.5 text-sm text-foreground transition-transform hover:scale-[1.04] active:scale-[0.98] cursor-pointer"
        aria-label="Back to home"
      >
        ← Back
      </button>
      <div className="liquid-glass absolute top-5 left-1/2 -translate-x-1/2 z-20 rounded-full px-5 py-2.5 text-sm text-foreground pointer-events-none whitespace-nowrap">
        <span className="mr-2" aria-hidden>{exp?.icon}</span>
        {exp?.name}
      </div>
    </div>
  );
}
