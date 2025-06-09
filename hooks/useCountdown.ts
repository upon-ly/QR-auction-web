"use client";

/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect } from "react";

export const useCountdown = (
  targetTimestamp: number
): { time: string; isComplete: boolean } => {
  const [timeLeft, setTimeLeft] = useState<number>();
  // Convert the input timestamp (seconds) to milliseconds.
  const targetTime = targetTimestamp * 1000;

  // Helper function to calculate the remaining time (in ms).
  const calculateTimeLeft = () => targetTime - Date.now();

  useEffect(() => {
    // Immediately calculate time left when targetTimestamp changes
    if (targetTimestamp !== 0) {
      setTimeLeft(calculateTimeLeft());
    }
    
    // Set an interval to update the time left every second.
    const intervalId = setInterval(() => {
      if (targetTimestamp !== 0) {
        setTimeLeft(calculateTimeLeft());
      }
    }, 1000);

    // Cleanup interval on unmount.
    return () => clearInterval(intervalId);
  }, [targetTime, targetTimestamp]);

  if (timeLeft === undefined) {
    const time = "00:00:00";
    return { time, isComplete: false };
  } else {
    if (timeLeft <= 0) {
      const time = "00:00:00";
      return { time, isComplete: true };
    }

    // Calculate days, hours, minutes, and seconds.
    // const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

    // Helper function to pad numbers to two digits.
    const padNumber = (num: number): string => num.toString().padStart(2, "0");

    let time = `${padNumber(hours)}:${padNumber(minutes)}:${padNumber(
      seconds
    )}`;

    if (targetTimestamp === 0) {
      time = "00:00:00";
    }

    return { time, isComplete: false };
  }
};
