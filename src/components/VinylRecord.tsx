import React from 'react';

interface VinylRecordProps {
  isPlaying: boolean;
  coverUrl?: string;
  size?: number; // diameter in pixels, defaults to 384
  onPlayPause?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  albumName?: string;
  artistName?: string;
  currentTime?: number;
  duration?: number;
}

export const VinylRecord: React.FC<VinylRecordProps> = ({
  isPlaying,
  coverUrl = 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=500&q=80',
  size = 384,
  onPlayPause,
  albumName = 'Daydream',
  artistName = 'Indie Pop',
  currentTime = 0,
  duration = 1,
}) => {
  // Angle configuration (in degrees)
  // Rest position is tilted to the far left (off-record)
  // Play start is on the outer rim (tilted left)
  // Play end is near the inner label/spindle (tilted slightly right)
  const restAngle = -28;
  const startAngle = -16;
  const endAngle = 6;

  // Calculate interpolation progress
  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const rotationAngle = isPlaying ? startAngle + (endAngle - startAngle) * progress : restAngle;

  return (
    <div 
      className="relative flex items-center justify-center select-none"
      style={{ width: size, height: size }}
    >
      {/* Vinyl Record Plate Outer Body */}
      <div 
        className={`absolute inset-0 rounded-full bg-zinc-950 vinyl-grooves transition-transform duration-1000 ease-out shadow-2xl flex items-center justify-center overflow-hidden ${
          isPlaying ? 'animate-vinyl-spin' : ''
        }`}
        style={{
          animationPlayState: isPlaying ? 'running' : 'paused',
        }}
      >
        {/* Center Album Cover Label */}
        <div className="w-[38%] h-[38%] rounded-full bg-zinc-900 border-4 border-zinc-950 shadow-inner overflow-hidden relative z-20 flex items-center justify-center">
          {/* Cover image */}
          <img 
            src={coverUrl} 
            alt={`${albumName} by ${artistName}`} 
            className="w-full h-full object-cover select-none pointer-events-none"
          />
          
          {/* Spindle hole rim overlay */}
          <div className="absolute inset-0 rounded-full bg-black/10 border border-white/5 pointer-events-none" />
          
          {/* Center spindle hole */}
          <div className="absolute w-[16%] h-[16%] bg-zinc-900 rounded-full border border-black shadow-inner flex items-center justify-center">
            <div className="w-[40%] h-[40%] bg-zinc-950 rounded-full" />
          </div>
        </div>
      </div>

      {/* STATIC SHEEN OVERLAY (Does not rotate, providing realistic stationary light reflections) */}
      <div className="absolute inset-0 rounded-full vinyl-reflection pointer-events-none z-10" />

      {/* Outer rim overlay for realistic 3D border shine */}
      <div className="absolute inset-0 rounded-full border border-white/5 pointer-events-none z-15" />

      {/* Interactive Tonearm (PNG) */}
      <div 
        className="absolute z-40 cursor-pointer origin-[50%_83%] tonearm-transition group/arm"
        style={{
          width: `${size * 0.42}px`, // Scaled larger proportionally to vinyl size
          height: `${size * 0.78}px`,
          left: `-${size * 0.10}px`,
          bottom: `-${size * 0.10}px`,
          transform: `rotate(${rotationAngle}deg)`,
          transformOrigin: '50% 83%',
        }}
        onClick={(e) => {
          e.stopPropagation();
          onPlayPause?.();
        }}
        title={isPlaying ? "Klikk for å stoppe" : "Klikk for å spille"}
      >
        {/* Tonearm Image */}
        <img 
          src="/vinly-arm.png" 
          alt="Tonearm" 
          className="w-full h-full object-contain drop-shadow-[4px_12px_10px_rgba(0,0,0,0.5)] transition-all duration-300 group-hover/arm:brightness-110 group-hover/arm:drop-shadow-[6px_16px_12px_rgba(0,0,0,0.6)]"
        />

        {/* Interactive indicator glow on base */}
        <div className="absolute left-[36%] bottom-[12%] w-[28%] h-[16%] rounded-full bg-sky-400/0 group-hover/arm:bg-sky-400/10 border border-sky-400/0 group-hover/arm:border-sky-400/20 blur-[1px] transition-all duration-300 pointer-events-none" />
      </div>
    </div>
  );
};
