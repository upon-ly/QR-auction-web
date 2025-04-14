import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UniswapWidget } from "./uniswap-widget";

interface UniswapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputCurrency?: string;
  outputCurrency?: string;
}

export function UniswapModal({
  open,
  onOpenChange,
  inputCurrency = "NATIVE",
  outputCurrency = "0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF", // QR token address
}: UniswapModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md md:max-w-lg lg:max-w-xl">
        <DialogHeader className="flex flex-row justify-between items-center">
          <DialogTitle>Buy $QR</DialogTitle>
        </DialogHeader>
        <div className="h-[500px] md:h-[500px]">
          <UniswapWidget 
            className="!border-none"
            inputCurrency={inputCurrency} 
            outputCurrency={outputCurrency} 
          />
        </div>
      </DialogContent>
    </Dialog>
  );
} 