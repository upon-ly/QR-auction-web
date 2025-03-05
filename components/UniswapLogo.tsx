/* eslint-disable @next/next/no-img-element */
export function UniswapLogo({ className }: { className?: string }) {
  return (
    <div className="w-5 h-5 rounded-full overflow-hidden">
      <img
        src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-B0P5Aka1GMn2k8ZEXIPPS50afpkcbP.png"
        alt="Uniswap"
        width={20}
        height={20}
        className={className}
      />
    </div>
  );
}
