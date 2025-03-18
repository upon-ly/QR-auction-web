"use client";
import Image from "next/image";

interface WarpcastLogoProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  username?: string;
}

export function WarpcastLogo({ className = "", size = 'sm', username }: WarpcastLogoProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (!username) return;
    
    e.stopPropagation();
    e.preventDefault();
    
    let cleanUsername = username.startsWith('@') ? username.slice(1) : username;
    
    // Quick temp fix - replace !217978 with softwarecurator
    cleanUsername = cleanUsername === "!217978" ? "softwarecurator" : cleanUsername;
    
    window.open(`https://warpcast.com/${cleanUsername}`, '_blank');
  };
  
  const sizes = {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20
  };
  
  return (
    <div 
      className={`inline-flex items-center cursor-pointer ${className}`} 
      onClick={handleClick}
      title={username ? `View @${username} on Warpcast` : 'Warpcast profile'}
    >
      <Image 
        src="https://warpcast.com/og-logo.png" 
        alt="Warpcast" 
        width={sizes[size]}
        height={sizes[size]}
      />
    </div>
  );
} 