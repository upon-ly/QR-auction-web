"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { frameSdk } from "@/lib/frame-sdk";

export function useSafetyDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const isFrameRef = useRef(false);
  
  // Check if we're in a frame context
  useEffect(() => {
    async function checkFrameContext() {
      try {
        const context = await frameSdk.getContext();
        isFrameRef.current = !!context?.user;
        console.log("Safety dialog frame context check:", isFrameRef.current ? "In frame" : "Not in frame");
      } catch (error) {
        console.error("Error checking frame context:", error);
        isFrameRef.current = false;
      }
    }
    
    checkFrameContext();
  }, []);

  const openDialog = useCallback((url: string) => {
    const hideSafetyWarning =
      localStorage.getItem("hideSafetyWarning") || "false";
    if (hideSafetyWarning === "false") {
      setIsOpen(true);
      setPendingUrl(url);
      return true;
    }

    return false;
  }, []);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setPendingUrl(null);
  }, []);

  const handleContinue = useCallback(async () => {
    if (pendingUrl) {
      if (isFrameRef.current) {
        try {
          await frameSdk.redirectToUrl(pendingUrl);
        } catch (error) {
          console.error("Error opening URL in frame:", error);
        }
      } else {
        window.open(pendingUrl, "_blank", "noopener,noreferrer");
      }
    }
    closeDialog();
  }, [pendingUrl, closeDialog]);

  return {
    isOpen,
    pendingUrl,
    openDialog,
    closeDialog,
    handleContinue,
    isFrame: isFrameRef.current
  };
}
