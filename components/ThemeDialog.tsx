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
import { Sun, Moon, Palette, Settings, Wallet } from "lucide-react";
import { useEffect, useRef } from "react";
import { useBaseColors } from "@/hooks/useBaseColors";
import { usePrivy } from "@privy-io/react-auth";
import { cn } from "@/lib/utils";

interface ThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ThemeDialog({ open, onOpenChange }: ThemeDialogProps) {
  const { theme, setTheme } = useTheme();
  const isBaseColors = useBaseColors();
  const { address, isConnected } = useAccount();
  const { login, authenticated, logout } = usePrivy();
  const initialMount = useRef(true);
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
    
    // Skip theme changes during initial mount to prevent flashing
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    
    if (savedTheme) {
      if (savedTheme === "baseColors" && colors && isConnected) {
        handleBaseColorsMode();
      } else if (savedTheme === "baseColors" && !isConnected) {
        // If wallet is disconnected but baseColors theme is saved, switch to light
        clearCustomColors();
        setTheme("light");
        localStorage.setItem("selected-theme", "light");
      } else {
        clearCustomColors();
        setTheme(savedTheme);
      }
    }
  }, [colors, isConnected]);

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

  // Check if the wallet is truly connected - using both wagmi and privy states
  const walletIsConnected = isConnected && authenticated;

  // Create theme-aware button classes for consistent styling
  const getButtonClass = (isActive: boolean) => {
    return cn(
      "w-full",
      isBaseColors 
        ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground border-none hover:border-none" 
        : "",
      isActive && !isBaseColors && "bg-secondary"
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[300px] bg-background">
        <DialogHeader>
          <DialogTitle>Choose Theme</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Button
            variant="outline"
            className={getButtonClass(theme === "light")}
            onClick={() => {
              clearCustomColors();
              setTheme("light");
              localStorage.setItem("selected-theme", "light");
            }}
          >
            <div className="w-4 flex justify-center">
              <Sun className="h-4 w-4" />
            </div>
            <span className="ml-2">Light Mode</span>
          </Button>
          <Button
            variant="outline"
            className={getButtonClass(theme === "dark")}
            onClick={() => {
              clearCustomColors();
              setTheme("dark");
              localStorage.setItem("selected-theme", "dark");
            }}
          >
            <div className="w-4 flex justify-center">
              <Moon className="h-4 w-4" />
            </div>
            <span className="ml-2">Dark Mode</span>
          </Button>
          <Button
            variant="outline"
            className={getButtonClass(isBaseColors)}
            onClick={() => {
              if (walletIsConnected) {
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
                login();
              }
            }}
          >
            <Palette className="mr-2 h-4 w-4" />
            {walletIsConnected ? "Base Colors" : "Connect Wallet"}
          </Button>

          {walletIsConnected && (
            <div className="flex w-full gap-2 justify-center">
              <Button
                variant="outline"
                className={cn(
                  isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground border-none" : "",
                  "w-1/2"
                )}
                onClick={() => {
                  logout();
                  onOpenChange(false);
                }}
              >
                <div className="w-4 flex justify-center">
                  <img 
                    src="/basecolors3.jpeg" 
                    alt="Base Colors"
                    className="h-4 w-4 md:ml-3 ml-4"
                  />
                </div>
                <span className="md:ml-3 ml-4">Base Colors</span>
              </Button>
              
              <Button
                variant="outline"
                className={cn(
                  isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground border-none" : "",
                  "w-1/2"
                )}
                onClick={() => (window.location.href = "/ui")}
              >
                <div className="w-4 flex justify-center">
                  <Settings className="h-4 w-4" />
                </div>
              </Button>
            </div>
          )}
          
          {isConnected && (
            <div className="flex w-full gap-2 justify-center">
              <Button
                variant="outline"
                className={cn(
                  isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground border-none" : "",
                  "w-1/2"
                )}
                onClick={() => {
                  // If using wagmi's useConnectModal, you might call openAccountModal() here
                  onOpenChange(false);
                }}
              >
                <div className="w-4 flex justify-center">
                  <Wallet className="h-4 w-4" />
                </div>
              </Button>
              
              <Button
                variant="outline"
                className={cn(
                  isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground border-none" : "",
                  "w-1/2"
                )}
                onClick={() => (window.location.href = "/ui")}
              >
                <div className="w-4 flex justify-center">
                  <Settings className="h-4 w-4" />
                </div>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
