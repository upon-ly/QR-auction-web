"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export const useCountdown = (
  targetTimestamp: number
): { time: string; isComplete: boolean } => {
  const [isComplete, setIsComplete] = useState(false);
  const [displayTime, setDisplayTime] = useState("00:00:00");
  
  // Use refs to avoid re-renders
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const targetTimeRef = useRef(targetTimestamp * 1000);
  
  // Helper function to format time
  const formatTime = useCallback((timeLeft: number): string => {
    if (timeLeft <= 0) return "00:00:00";
    
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    
    const padNumber = (num: number): string => num.toString().padStart(2, "0");
    
    return `${padNumber(hours)}:${padNumber(minutes)}:${padNumber(seconds)}`;
  }, []);
  
  // Update the target time ref when prop changes
  useEffect(() => {
    targetTimeRef.current = targetTimestamp * 1000;
  }, [targetTimestamp]);
  
  useEffect(() => {
    if (targetTimestamp === 0) {
      setDisplayTime("00:00:00");
      setIsComplete(false);
      return;
    }
    
    // Function to update the display
    const updateDisplay = () => {
      const now = Date.now();
      const timeLeft = targetTimeRef.current - now;
      
      if (timeLeft <= 0) {
        setDisplayTime("00:00:00");
        setIsComplete(true);
        
        // Clear interval when complete
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        // Only update state if the formatted time actually changes
        const newTime = formatTime(timeLeft);
        setDisplayTime(prevTime => {
          if (prevTime !== newTime) {
            return newTime;
          }
          return prevTime;
        });
        setIsComplete(false);
      }
    };
    
    // Initial update
    updateDisplay();
    
    // Set up interval
    intervalRef.current = setInterval(updateDisplay, 1000);
    
    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [targetTimestamp, formatTime]);
  
  return { time: displayTime, isComplete };
};