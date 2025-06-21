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
import { Sun, Moon, Settings, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useBaseColors } from "@/hooks/useBaseColors";
import { usePrivy } from "@privy-io/react-auth";
import { cn } from "@/lib/utils";
import { frameSdk } from "@/lib/frame-sdk-singleton";
import { useIsMiniApp } from "@/hooks/useIsMiniApp";
import { useRouter } from "next/navigation";

interface ThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ThemeDialog({ open, onOpenChange }: ThemeDialogProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const isBaseColors = useBaseColors();
  const { address, isConnected } = useAccount();
  const { login, authenticated } = usePrivy();
  const initialMount = useRef(true);
  const isTestnet = process.env.NEXT_PUBLIC_ENABLE_TESTNETS === "true";
  const [frameWalletAddress, setFrameWalletAddress] = useState<string | null>(null);
  const [isWalletCheckComplete, setIsWalletCheckComplete] = useState(false);
  const { isMiniApp } = useIsMiniApp();
  
  // Check if we're in a Farcaster frame context
  useEffect(() => {
    const checkFrameContext = async () => {
      try {
        if (isMiniApp) {
          // Check if wallet is connected in frame
          const isWalletConnected = await frameSdk.isWalletConnected();
          if (isWalletConnected) {
            const accounts = await frameSdk.connectWallet();
            if (accounts.length > 0) {
              setFrameWalletAddress(accounts[0]);
            }
          }
        }
      } catch (error) {
        console.log("Not in a Farcaster frame context", error);
      } finally {
        // Mark wallet check as complete regardless of outcome
        setIsWalletCheckComplete(true);
      }
    };

    // Always run the check when the dialog opens
    if (open) {
      checkFrameContext();
    }
  }, [open, isMiniApp]);
  
  // For regular (non-frame) environments, mark check complete when wagmi is ready
  useEffect(() => {
    if (address || address === null) {
      setIsWalletCheckComplete(true);
    }
  }, [address]);
  
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
  
  // Determine if we have a connected wallet (either through wagmi or frame)
  const hasConnectedWallet = frameWalletAddress || address;

  const { data: colors } = useReadContract({
    address: isTestnet
      ? basecolorsThemeSettingsContractAddressTestnet
      : basecolorsThemeSettingsContractAddress,
    abi: abiForGetColorFunction,
    functionName: "getColors",
    args: [hasConnectedWallet],
  }) as { data: [string, string, string] | undefined };

  useEffect(() => {
    const savedTheme = localStorage.getItem("selected-theme");
    
    // Skip theme changes during initial mount to prevent flashing
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    
    const walletConnected = isConnected || Boolean(frameWalletAddress);
    
    if (savedTheme) {
      if (savedTheme === "baseColors" && colors && walletConnected) {
        handleBaseColorsMode();
      } else if (savedTheme === "baseColors" && !walletConnected) {
        // If wallet is disconnected but baseColors theme is saved, switch to light
        clearCustomColors();
        setTheme("light");
        localStorage.setItem("selected-theme", "light");
      } else {
        clearCustomColors();
        setTheme(savedTheme);
      }
    }
  }, [colors, isConnected, frameWalletAddress]);

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

  // Check if the wallet is truly connected - using both wagmi and privy states or frame wallet
  const walletIsConnected = (isConnected && authenticated) || Boolean(frameWalletAddress);

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

  // Handle navigation to settings page
  const handleNavigateToSettings = () => {
    // Close the dialog first
    onOpenChange(false);
    // Then navigate to settings using Next.js router
    router.push("/ui");
  };

  // Handle base colors button click based on wallet connection status
  const handleBaseColorsClick = async () => {
    // If we're in a frame and wallet check isn't complete, check again
    if (!isWalletCheckComplete && open) {
      try {
        const context = await frameSdk.getContext();
        if (context && context.user) {
          const isWalletConnected = await frameSdk.isWalletConnected();
          if (isWalletConnected) {
            const accounts = await frameSdk.connectWallet();
            if (accounts.length > 0) {
              setFrameWalletAddress(accounts[0]);
              // Now that we have wallet address, activate base colors
              if (!colors) {
                onOpenChange(false);
                router.push("/ui");
                return;
              }
              handleBaseColorsMode();
              return;
            }
          }
        }
      } catch (error) {
        console.log("Error checking frame wallet:", error);
      }
    }
    
    // Standard flow
    if (walletIsConnected) {
      if (!colors) {
        onOpenChange(false);
        router.push("/ui");
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
            onClick={handleBaseColorsClick}
          >
            <div className="w-4 flex justify-center">
              {!isWalletCheckComplete ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <img 
                  src="/basecolors3.jpeg" 
                  alt="Base Colors"
                  className="h-4 w-4"
                />
              )}
            </div>
            <span className="ml-2">Base Colors</span>
          </Button>

          {walletIsConnected && (
            <Button
              variant="outline"
              className={cn(
                isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground border-none" : "",
                "w-full"
              )}
              onClick={handleNavigateToSettings}
            >
              <div className="w-4 flex justify-center">
                <Settings className="h-4 w-4" />
              </div>
              <span className="ml-2">Settings</span>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
