'use client';

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LiFiWidgetComponent } from "./lifi-widget";
import { toast } from "sonner";
import { useTheme } from "next-themes";

interface LiFiModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputCurrency?: string;
  outputCurrency?: string;
}

export function LiFiModal({
  open,
  onOpenChange,
  inputCurrency = "NATIVE",
  outputCurrency = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC token address on Base
}: LiFiModalProps) {
  const { theme, resolvedTheme } = useTheme();
  const isDarkMode = theme === 'dark' || resolvedTheme === 'dark';
  
  // Handle widget events
  const handleWidgetEvent = (name: string) => {
    if (name === 'onRouteExecutionCompleted') {
      toast.success("Transaction completed successfully!");
      // Close modal after successful transaction
      setTimeout(() => onOpenChange(false), 2000);
    } else if (name === 'onRouteExecutionFailed') {
      toast.error("Transaction failed. Please try again.");
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={`
          w-[95vw] max-w-md mx-auto
          p-2 sm:p-4 md:p-6 
          sm:max-w-md md:max-w-lg lg:max-w-xl 
          ${isDarkMode ? 'bg-[#111111] border-[#333333]' : ''}
        `}
      >
        <DialogHeader className="flex flex-row justify-between items-center pb-2">
          <DialogTitle className={isDarkMode ? 'text-white' : ''}>Buy USDC</DialogTitle>
        </DialogHeader>
        <div className="h-[450px] sm:h-[500px] md:h-[500px] overflow-hidden">
          <LiFiWidgetComponent 
            className="!border-none"
            inputCurrency={inputCurrency} 
            outputCurrency={outputCurrency}
            onWidgetEvent={handleWidgetEvent} 
          />
        </div>
      </DialogContent>
    </Dialog>
  );
} 