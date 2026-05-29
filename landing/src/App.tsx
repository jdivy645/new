import { useEffect, useRef, useState } from 'react';
import Experiences from '@/components/Experiences';
import PlayerOverlay from '@/components/PlayerOverlay';
import { type Experience } from '@/data/experiences';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4';

export default function App() {
  const [active, setActive] = useState<Experience['id'] | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Pause the background video while a visualization is open so it doesn't
  // steal GPU/CPU from the experience running in the iframe (kills lag).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) v.pause();
    else v.play().catch(() => {});
  }, [active]);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Fullscreen looping background video */}
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-0"
        src={VIDEO_SRC}
      />

      {/* Subtle contrast scrim so glass tiles + text stay legible over any
          video frame (does not block clicks) */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 120% 90% at 50% 50%, rgba(5,20,16,0.10) 0%, rgba(5,20,16,0.42) 100%)',
        }}
      />

      {/* The 4 tabs, centered in a single 100% view */}
      <Experiences onLaunch={(id) => setActive(id)} />

      {active && <PlayerOverlay id={active} onClose={() => setActive(null)} />}
    </div>
  );
}
