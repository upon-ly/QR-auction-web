/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Shield, HelpCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface SafetyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetUrl: string;
  onContinue: () => void;
}

export function SafetyDialog({
  isOpen,
  onClose,
  targetUrl,
  onContinue,
}: SafetyDialogProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleContinue = () => {
    if (dontShowAgain) {
      localStorage.setItem("hideSafetyWarning", "true");
    }
    onContinue();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[400px] bg-white p-6 shadow-lg">
        {/* Header */}
        <DialogTitle></DialogTitle>
        <div className="mb-5">
          <span className="text-[#1877F2] text-2xl font-medium">Stay Safe</span>
        </div>

        {/* Content */}
        <div className="space-y-5">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <h3 className="text-lg font-medium mb-2">
                Beware of Phishing Scams
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Never enter your credentials to prove you are not a bot
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <h3 className="text-lg font-medium mb-2">Protect Your Wallet</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Never connect your wallet or confirm transactions unless
                you&apos;re 100% sure of the source&apos;s legitimacy
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
              <HelpCircle className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <h3 className="text-lg font-medium mb-2">When In Doubt, Stop!</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                If something feels off, don&apos;t interact and please reach out
                to us{" "}
                <a
                  href="https://x.com/QRcoindotfun"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  @qrcoindotfun
                </a>{" "}
                on X
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="space-y-3 pt-2">
            <Button
              className="w-full bg-[#1877F2] hover:bg-[#1877F2]/90 text-white h-auto py-3 text-base font-normal rounded-xl"
              onClick={handleContinue}
            >
              I understand <ExternalLink className="ml-1 h-4 w-4" />
            </Button>

            <div className="flex items-center gap-2">
              <Checkbox
                id="dontShow"
                checked={dontShowAgain}
                onCheckedChange={(checked) =>
                  setDontShowAgain(checked as boolean)
                }
                className="h-4 w-4 border-2 border-gray-300 rounded-[3px] data-[state=checked]:border-[#1877F2] data-[state=checked]:bg-[#1877F2]"
              />
              <label htmlFor="dontShow" className="text-gray-600 text-xs">
                {`Don't show this warning again`}
              </label>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
