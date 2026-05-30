interface IntroProps {
  fading: boolean;
}

// Full-screen intro splash: the company name "Digital Hammerr" animates in,
// then the whole layer fades + lifts away to reveal the site.
export default function Intro({ fading }: IntroProps) {
  return (
    <div
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#051410] transition-all duration-700 ease-out ${
        fading ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        background:
          'radial-gradient(120% 90% at 50% 40%, #103a30 0%, #051410 70%)',
      }}
      aria-hidden={fading}
    >
      <div
        className="text-5xl sm:text-6xl mb-5 animate-fade-rise"
        style={{ animation: 'hammerTap 0.85s ease-in-out infinite' }}
        aria-hidden
      >
        🔨
      </div>
      <div
        className="animate-fade-rise text-4xl sm:text-6xl tracking-tight bg-gradient-to-r from-[#8fe388] via-[#3fd3e6] to-[#ffd166] bg-clip-text text-transparent"
        style={{ fontFamily: "'Instrument Serif', serif" }}
      >
        Digital Hammerr
      </div>
      <div className="mt-8 h-1 w-44 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/2 rounded-full bg-[#8fe388] animate-[loadbar_1.1s_ease-in-out_infinite]" />
      </div>
      <div className="animate-fade-rise-delay mt-5 text-xs sm:text-sm tracking-[0.3em] uppercase text-muted-foreground">
        Loading experience
      </div>
    </div>
  );
}
