/* eslint-disable @next/next/no-img-element */
export function DexscreenerLogo({ className }: { className?: string }) {
  return (
    <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center overflow-hidden">
      <img
        src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-BVncWbqGgOADtTeJneYKaQK3RCUPok.png"
        alt="Dexscreener"
        width={16}
        height={16}
        className={className}
      />
    </div>
  );
}
