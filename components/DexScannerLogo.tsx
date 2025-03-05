/* eslint-disable @next/next/no-img-element */
export function DexscreenerLogo({ className }: { className?: string }) {
  return (
    <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center overflow-hidden">
      <img
        src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-BVncWbqGgOADtTeJneYKaQK3RCUPok.png"
        alt="Dexscreener"
        width={30}
        height={30}
        className={className}
      />
    </div>
  );
}
