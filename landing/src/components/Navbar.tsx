const LINKS = ['Home', 'Studio', 'About', 'Journal', 'Reach Us'];

interface NavbarProps {
  onBegin: () => void;
}

export default function Navbar({ onBegin }: NavbarProps) {
  return (
    <nav className="relative z-10 flex flex-row items-center justify-between px-8 py-6 max-w-7xl mx-auto w-full">
      {/* Logo */}
      <a
        href="#"
        className="text-3xl tracking-tight text-foreground"
        style={{ fontFamily: "'Instrument Serif', serif" }}
      >
        Digital Hammerr<sup className="text-xs">®</sup>
      </a>

      {/* Nav links */}
      <div className="hidden md:flex items-center gap-8">
        {LINKS.map((link, i) => (
          <a
            key={link}
            href="#"
            className={`text-sm transition-colors ${
              i === 0 ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {link}
          </a>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={onBegin}
        className="liquid-glass rounded-full px-6 py-2.5 text-sm text-foreground transition-transform hover:scale-[1.03] cursor-pointer"
      >
        Begin Journey
      </button>
    </nav>
  );
}
