"use client";
import { ShieldCheck, Trophy, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBaseColors } from "@/hooks/useBaseColors";
interface HowItWorksDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HowItWorksDialog({ isOpen, onClose }: HowItWorksDialogProps) {
  const isBaseColors = useBaseColors();
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-background px-4 sm:px-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle className="text-2xl sm:text-3xl font-bold">
              How It Works
            </DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-6 mt-4 sm:mt-6 pb-2">
          <p className="text-base sm:text-lg">
            Bid for the QR to point to your website next!
          </p>

          <div className="flex gap-3 sm:gap-4 items-start">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-yellow-50 flex items-center justify-center flex-shrink-0">
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-1">
                What happens if you win?
              </h3>
              <p className={`text-sm sm:text-base ${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"}`}>
                The website submitted with the winning bid will be where the QR
                is pointed for 24 hours post-auction.
              </p>
            </div>
          </div>

          <div className="flex gap-3 sm:gap-4 items-start">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-1">
                What happens if you lose?
              </h3>
              <p className={`text-sm sm:text-base ${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"}`}>
                Losing bids will be fully refunded immediately once a higher bid
                is submitted for the given auction.
              </p>
            </div>
          </div>

          <div className="flex gap-3 sm:gap-4 items-start">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-1">
                What happens with the funds?
              </h3>
              <p className={`text-sm sm:text-base ${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"}`}>
                Funds from the winning bids will be sent to the project&apos;s treasury in $QR at the conclusion of each auction.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
