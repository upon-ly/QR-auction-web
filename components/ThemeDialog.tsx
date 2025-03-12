import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { useAccount } from "wagmi";
import { useReadContract } from "wagmi";
import { base } from "viem/chains";
import { http, createConfig } from "wagmi";
import { Sun, Moon, Palette, Wallet, Settings } from "lucide-react";
interface ThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
import { ConnectButton } from "@rainbow-me/rainbowkit";

export function ThemeDialog({ open, onOpenChange }: ThemeDialogProps) {
  const { setTheme } = useTheme();
  const { address, isConnected } = useAccount();
  const basecolorsThemeSettingsContractAddress =
    "0x711817e9a6a0a5949aea944b009f20658c8c53d0";

  const abiForGetColorFunction = [
    {
      inputs: [
        {
          internalType: "address",
          name: "user",
          type: "address",
        },
      ],
      name: "getColors",
      outputs: [
        {
          internalType: "string",
          name: "primaryColor",
          type: "string",
        },
        {
          internalType: "string",
          name: "backgroundColor",
          type: "string",
        },
        {
          internalType: "string",
          name: "textColor",
          type: "string",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
  ];

  const { data: colors } = useReadContract({
    address: basecolorsThemeSettingsContractAddress,
    abi: abiForGetColorFunction,
    functionName: "getColors",
    args: [address],
    config: createConfig({
      chains: [base],
      transports: {
        [base.id]: http(),
      },
    }),
  }) as { data: [string, string, string] | undefined };

  const clearCustomColors = () => {
    document.documentElement.style.removeProperty("--primary");
    document.documentElement.style.removeProperty("--background");
    document.documentElement.style.removeProperty("--foreground");
  };

  const handleBaseColorsMode = () => {
    setTheme("baseColors");
    if (colors) {
      document.documentElement.style.setProperty("--primary", colors[0]);
      document.documentElement.style.setProperty("--background", colors[1]);
      document.documentElement.style.setProperty("--foreground", colors[2]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[300px]">
        <DialogHeader>
          <DialogTitle>Choose Theme</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Button
            variant="outline"
            onClick={() => {
              clearCustomColors();
              setTheme("light");
            }}
          >
            <Sun className="mr-2 h-4 w-4" />
            Light Mode
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              clearCustomColors();
              setTheme("dark");
            }}
          >
            <Moon className="mr-2 h-4 w-4" />
            Dark Mode
          </Button>
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <Button
                variant="outline"
                onClick={() => {
                  if (isConnected) {
                    if (!colors) {
                      window.open("https://basecolors.com/ui", "_blank");
                      return;
                    }
                    if (colors.every((c, i) => c === ["#000000", "#FFFFFF", "#000000"][i])) {
                      alert("Please configure your theme by clicking the settings icon");
                      return;
                    }
                    handleBaseColorsMode();
                  } else {
                    openConnectModal();
                  }
                }}
              >
                <Palette className="mr-2 h-4 w-4" />
                {isConnected ? "Base Colors" : "Connect Wallet"}
              </Button>
            )}
          </ConnectButton.Custom>

          {isConnected && (
            <div className="flex w-full gap-2 justify-center">
              <ConnectButton.Custom>
                {({ openAccountModal }) => (
                  <Button
                    variant="outline"
                    className="w-1/2"
                    onClick={() => {
                      openAccountModal();
                      onOpenChange(false);
                    }}
                  >
                    <Wallet className="mr-2 h-4 w-4" />
                  </Button>
                )}
              </ConnectButton.Custom>

              <Button
                variant="outline"
                className="w-1/2"
                onClick={() =>
                  window.open("https://basecolors.com/ui", "_blank")
                }
              >
                <Settings className="mr-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
