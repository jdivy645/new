import { EXPERIENCES, type Experience } from '@/data/experiences';

interface ExperiencesProps {
  onLaunch: (id: Experience['id']) => void;
}

// Single 100% view: 4 glass tiles centered over the video. Clicking one
// launches that visualization. No nav, no hero text, no scroll.
export default function Experiences({ onLaunch }: ExperiencesProps) {
  return (
    <div className="relative z-10 h-full w-full flex items-center justify-center px-4 sm:px-6">
      {/* Minimal brand lockup (replaces the removed nav, keeps the brand present) */}
      <div className="absolute top-6 sm:top-8 left-1/2 -translate-x-1/2">
        <span
          className="text-2xl sm:text-3xl tracking-tight bg-gradient-to-r from-[#8fe388] via-[#3fd3e6] to-[#ffd166] bg-clip-text text-transparent"
          style={{ fontFamily: "'Instrument Serif', serif" }}
        >
          Digital Hammerr<sup className="text-[0.5em] align-super">®</sup>
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5 md:gap-6 w-full max-w-[20rem] sm:max-w-2xl md:max-w-5xl mx-auto">
        {EXPERIENCES.map((x, i) => (
          <button
            key={x.id}
            onClick={() => onLaunch(x.id)}
            className="liquid-glass animate-fade-rise group min-w-0 aspect-square rounded-3xl flex flex-col items-center justify-center gap-2 sm:gap-3 text-foreground ring-1 ring-white/10 transition-all duration-300 hover:ring-white/40 hover:scale-[1.04] active:scale-[0.98] cursor-pointer"
            style={{ animationDelay: `${i * 0.12}s` }}
            aria-label={`Launch ${x.name}`}
          >
            <span
              className="text-4xl sm:text-5xl transition-transform duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_12px_rgba(143,227,136,0.45)]"
              aria-hidden
            >
              {x.icon}
            </span>
            <span
              className="text-sm sm:text-lg md:text-xl font-normal text-center px-1 leading-tight"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              {x.name}
            </span>
            <span className="text-[0.62rem] sm:text-xs tracking-wide uppercase text-muted-foreground opacity-0 group-hover:opacity-90 transition-opacity duration-300">
              Launch ↗
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
