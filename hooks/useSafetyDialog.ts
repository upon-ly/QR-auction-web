"use client";

import { useState, useCallback } from "react";
import { frameSdk } from "@/lib/frame-sdk-singleton";
import { useIsMiniApp } from "@/hooks/useIsMiniApp";

export function useSafetyDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const { isMiniApp } = useIsMiniApp();

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
      if (isMiniApp) {
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
  }, [pendingUrl, closeDialog, isMiniApp]);

  return {
    isOpen,
    pendingUrl,
    openDialog,
    closeDialog,
    handleContinue,
    isFrame: isMiniApp
  };
}
