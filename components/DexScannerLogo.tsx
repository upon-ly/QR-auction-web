/* eslint-disable @next/next/no-img-element */
export function DexscreenerLogo({ className }: { className?: string }) {
  return (
    <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center overflow-hidden">
      <img
        src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-BVncWbqGgOADtTeJneYKaQK3RCUPok.png"
        alt="Dexscreener"
        width={40}
        height={40}
        className={className}
      />
    </div>
  );
}
