"use client";

import { useEffect, useState } from "react";

export function RandomColorAvatar() {
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

  return (
    <div
      className="w-7 h-7 rounded-full shadow-md"
      style={{
        background: `linear-gradient(135deg, ${color} 0%, rgba(255,255,255,0.7) 100%)`,
      }}
    />
  );
}
