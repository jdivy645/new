import { useEffect, useRef, useState } from 'react';
import Experiences from '@/components/Experiences';
import PlayerOverlay from '@/components/PlayerOverlay';
import Intro from '@/components/Intro';
import { type Experience } from '@/data/experiences';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4';

export default function App() {
  const [active, setActive] = useState<Experience['id'] | null>(null);
  const [introFade, setIntroFade] = useState(false);
  const [introGone, setIntroGone] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Intro splash: hold ~2s, fade out, then unmount so it never blocks clicks.
  useEffect(() => {
    const t1 = setTimeout(() => setIntroFade(true), 2000);
    const t2 = setTimeout(() => setIntroGone(true), 2750);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Pause the background video while a visualization is open (saves GPU).
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

      {/* Contrast scrim so glass tiles + text stay legible over any video frame */}
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

      {/* Intro splash on top until it fades away */}
      {!introGone && <Intro fading={introFade} />}
    </div>
  );
}
