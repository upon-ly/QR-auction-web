import { useTheme } from "next-themes";
import { useEffect, useState, useRef } from "react";
import { useAccount } from "wagmi";
import { useIsMiniApp } from "@/hooks/useIsMiniApp";

/**
 * Custom hook that returns whether the base colors theme is active
 * @returns {boolean} - Returns true if base colors theme is active
 */
export function useBaseColors() {
  const { theme } = useTheme();
  const { isConnected } = useAccount();
  const [isBaseColors, setIsBaseColors] = useState(false);
  const initialMount = useRef(true);
  const { isMiniApp } = useIsMiniApp();
  
  useEffect(() => {
    // Check local storage for more reliability since theme isn't always synchronized
    const storedTheme = localStorage.getItem("selected-theme");
    const isBaseColorsTheme = theme === "baseColors" || storedTheme === "baseColors";
    
    // During initial page load, we don't want to change the theme if it's already baseColors
    // This prevents flashing during the mounting phase when wallet connection state is resolving
    if (initialMount.current) {
      if (isBaseColorsTheme) {
        setIsBaseColors(true);
      }
      initialMount.current = false;
      return;
    }
    
    // In Frame environment, don't require wallet connection for baseColors theme
    if (isMiniApp) {
      setIsBaseColors(isBaseColorsTheme);
      return;
    }
    
    // Only use base colors theme when wallet is connected
    setIsBaseColors(isConnected && isBaseColorsTheme);
    
    // Only reset theme if wallet has been disconnected for more than just the initial mount
    if (!isConnected && isBaseColorsTheme && !initialMount.current && !isMiniApp) {
      localStorage.setItem("selected-theme", "light");
      // Clear custom colors
      document.documentElement.style.removeProperty("--primary");
      document.documentElement.style.removeProperty("--background");
      document.documentElement.style.removeProperty("--foreground");
    }
  }, [theme, isConnected, isMiniApp]);
  
  return isBaseColors;
} 