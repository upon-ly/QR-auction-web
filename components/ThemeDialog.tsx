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
import { Sun, Moon, Palette, Wallet, Settings } from "lucide-react";
import { useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useBaseColors } from "@/hooks/useBaseColors";

interface ThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ThemeDialog({ open, onOpenChange }: ThemeDialogProps) {
  const { setTheme } = useTheme();
  const isBaseColors = useBaseColors();
  const { address, isConnected } = useAccount();
  const isTestnet = process.env.NEXT_PUBLIC_ENABLE_TESTNETS === "true";
  const basecolorsThemeSettingsContractAddress =
    "0x711817e9a6a0a5949aea944b009f20658c8c53d0";

  const basecolorsThemeSettingsContractAddressTestnet =
    "0xE1f532A8A2750e93b4271b01B76cdA4FAb4b0dF2";

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
    address: isTestnet
      ? basecolorsThemeSettingsContractAddressTestnet
      : basecolorsThemeSettingsContractAddress,
    abi: abiForGetColorFunction,
    functionName: "getColors",
    args: [address],
  }) as { data: [string, string, string] | undefined };

  useEffect(() => {
    const savedTheme = localStorage.getItem("selected-theme");
    if (savedTheme) {
      if (savedTheme === "baseColors" && colors) {
        handleBaseColorsMode();
      } else {
        clearCustomColors();
        setTheme(savedTheme);
      }
    }
  }, [colors]);

  const clearCustomColors = () => {
    document.documentElement.style.removeProperty("--primary");
    document.documentElement.style.removeProperty("--background");
    document.documentElement.style.removeProperty("--foreground");
  };

  const handleBaseColorsMode = () => {
    setTheme("baseColors");
    localStorage.setItem("selected-theme", "baseColors");
    if (colors) {
      document.documentElement.style.setProperty("--primary", colors[0]);
      document.documentElement.style.setProperty("--background", colors[1]);
      document.documentElement.style.setProperty("--foreground", colors[2]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[300px] bg-background border-none">
        <DialogHeader>
          <DialogTitle>Choose Theme</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Button
            variant="outline"
            className={`${isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground border-none" : ""}`}
            onClick={() => {
              clearCustomColors();
              setTheme("light");
              localStorage.setItem("selected-theme", "light");
            }}
          >
            <Sun className="mr-2 h-4 w-4" />
            Light Mode
          </Button>
          <Button
            variant="outline"
            className={`${isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground border-none" : ""}`}
            onClick={() => {
              clearCustomColors();
              setTheme("dark");
              localStorage.setItem("selected-theme", "dark");
            }}
          >
            <Moon className="mr-2 h-4 w-4" />
            Dark Mode
          </Button>
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <Button
                variant="outline"
                className={`${isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground border-none" : ""}`}
                onClick={() => {
                  if (isConnected) {
                    if (!colors) {
                      window.location.href = "/ui";
                      return;
                    }
                    if (
                      colors.every(
                        (c, i) => c === ["#000000", "#FFFFFF", "#000000"][i]
                      )
                    ) {
                      alert(
                        "Please configure your theme by clicking the settings icon in the bottom right corner of the \"Choose Theme\" popup"
                      );
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
                    className={`${isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground border-none" : ""} w-1/2`}
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
                className={`${isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground border-none" : ""} w-1/2`}
                onClick={() => (window.location.href = "/ui")}
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
