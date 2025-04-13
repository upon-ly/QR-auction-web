"use client";

import { useEffect, useState } from "react";

interface RandomColorAvatarProps {
  size?: number | { mobile: number; desktop: number };
}

export function RandomColorAvatar({ size }: RandomColorAvatarProps) {
  const [color, setColor] = useState<string>("#cccccc");

  // Generate a random color on component mount
  useEffect(() => {
    generateRandomColor();
  }, []);

  // Function to generate a random color
  const generateRandomColor = () => {
    const randomColor =
      "#" +
      Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, "0");
    setColor(randomColor);
  };

  // Get appropriate class name based on size prop
  const getSizeClass = () => {
    if (!size) {
      return "w-7 h-7"; // Default size
    }
    
    if (typeof size === 'number') {
      return `w-${size} h-${size}`;
    }
    
    // Handle responsive sizing
    return `w-${size.mobile} h-${size.mobile} md:w-${size.desktop} md:h-${size.desktop}`;
  };

  return (
    <div
      className={`${getSizeClass()} rounded-full`}
      style={{
        background: color,
      }}
    />
  );
}
