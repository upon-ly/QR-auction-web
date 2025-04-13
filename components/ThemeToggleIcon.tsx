"use client";

import React from "react";
import { useTheme } from "next-themes";
import { useBaseColors } from "@/hooks/useBaseColors";

interface ThemeToggleIconProps {
  onClick?: () => void;
  className?: string;
}

export function ThemeToggleIcon({ onClick, className = "" }: ThemeToggleIconProps) {
  const { theme } = useTheme();
  const isBaseColors = useBaseColors();
  
  // SVG for the half-circle icon (resembling a half-moon)
  return (
    <div 
      className={`cursor-pointer flex items-center justify-center ${className}`}
      onClick={onClick}
      role="button"
      aria-label="Toggle theme"
    >
      <svg 
        width="20" 
        height="20" 
        viewBox="0 0 20 20" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path 
          d="M10 2.5C5.85786 2.5 2.5 5.85786 2.5 10C2.5 14.1421 5.85786 17.5 10 17.5V2.5Z" 
          fill={isBaseColors ? "#FFFFFF" : (theme === "dark" ? "#FFFFFF" : "#000000")}
          strokeWidth="1.5"
          stroke={isBaseColors ? "#FFFFFF" : (theme === "dark" ? "#FFFFFF" : "#000000")}
        />
      </svg>
    </div>
  );
} 