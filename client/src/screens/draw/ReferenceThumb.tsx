import { useRef, type MouseEvent } from 'react';
import { motion } from 'framer-motion';

interface Props {
  url: string;
  mirrored: boolean;
  eyedropper: boolean;
  onPick: (hex: string) => void;
  onClose: () => void;
}

const toHex = (n: number) => n.toString(16).padStart(2, '0');

/** Draggable reference thumbnail. With the eyedropper active, tapping samples the photo's color. */
export function ReferenceThumb({ url, mirrored, eyedropper, onPick, onClose }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const constraints = useRef<HTMLDivElement>(null);

  const sample = (e: MouseEvent<HTMLImageElement>) => {
    if (!eyedropper || !imgRef.current) return;
    const img = imgRef.current;
    const rect = img.getBoundingClientRect();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * img.naturalWidth);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * img.naturalHeight);
    const d = ctx.getImageData(x, y, 1, 1).data;
    onPick(`#${toHex(d[0])}${toHex(d[1])}${toHex(d[2])}`);
  };

  return (
    <div ref={constraints} className="pointer-events-none fixed inset-2 z-30">
      <motion.div
        drag
        dragMomentum={false}
        dragConstraints={constraints}
        className="paper pointer-events-auto absolute bottom-[214px] right-2 w-36 cursor-grab p-1.5 active:cursor-grabbing sm:w-56 lg:bottom-auto lg:right-6 lg:top-24"
        aria-label="Reference photo (draggable)"
      >
        <div className="mb-1 flex items-center justify-between px-1">
          <span className="font-display text-xs">Reference{mirrored ? ' 🪞' : ''}</span>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full border-2 border-ink bg-paperdim text-sm font-bold" aria-label="Hide reference">
            ×
          </button>
        </div>
        <img
          ref={imgRef}
          src={url}
          alt="Reference photo"
          draggable={false}
          onClick={sample}
          className={`aspect-[4/3] w-full select-none rounded-xl border-2 border-ink object-cover ${eyedropper ? 'cursor-crosshair ring-4 ring-sun' : ''}`}
        />
        {eyedropper && <p className="mt-1 text-center text-[11px] font-extrabold">Tap the photo to pick a color</p>}
      </motion.div>
    </div>
  );
}
