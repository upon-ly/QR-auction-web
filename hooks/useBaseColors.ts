import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * Custom hook that returns whether the base colors theme is active
 * @returns {boolean} - Returns true if base colors theme is active
 */
export function useBaseColors() {
  const { theme } = useTheme();
  const [isBaseColors, setIsBaseColors] = useState(false);
  
  useEffect(() => {
    // Check local storage for more reliability since theme isn't always synchronized
    const storedTheme = localStorage.getItem("selected-theme");
    setIsBaseColors(theme === "baseColors" || storedTheme === "baseColors");
  }, [theme]);
  
  return isBaseColors;
} 