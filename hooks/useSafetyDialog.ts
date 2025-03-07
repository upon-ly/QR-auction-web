"use client";

import { useState, useCallback } from "react";

export function useSafetyDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

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

  const handleContinue = useCallback(() => {
    if (pendingUrl) {
      window.open(pendingUrl, "_blank", "noopener,noreferrer");
    }
    closeDialog();
  }, [pendingUrl, closeDialog]);

  return {
    isOpen,
    pendingUrl,
    openDialog,
    closeDialog,
    handleContinue,
  };
}
