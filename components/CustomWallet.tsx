import {
  usePrivy,
  useLogin,
  useLogout,
  useFundWallet,
  useWallets,
  useConnectWallet
} from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useState, useEffect, useMemo, useRef } from "react";
import { useAccount, useBalance, useReadContracts, useSwitchChain, useDisconnect } from "wagmi";
import { base } from "viem/chains";
import { formatEther, Address, erc20Abi, parseUnits, isAddress, encodeFunctionData } from "viem";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { LogOut, Wallet, Network, Send, ExternalLink, RefreshCcw, Copy, ChevronDown, PlusCircle, Loader2, Check, UserCircle, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getFarcasterUser } from "@/utils/farcaster";
import { getName } from "@coinbase/onchainkit/identity";
import { useBaseColors } from "@/hooks/useBaseColors";
import clsx from "clsx";
import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { broadcastConnection } from "@/lib/channelManager";
import { frameSdk } from "@/lib/frame-sdk";
import { motion, AnimatePresence, useDragControls, PanInfo } from "framer-motion";

// --- Constants ---
const BASE_MAINNET_ID = 8453;
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address; // Base Mainnet USDC
const QR_ADDRESS = process.env.NEXT_PUBLIC_QR_COIN as Address;

// Define Token type
type Token = "ETH" | "USDC" | "$QR";

// Define type for Privy linked accounts
interface PrivyLinkedAccount {
  type: string;
  address: string;
  chain?: string;
  // Other properties might exist but we don't need to specify them
}

// Define interface for frameUser to avoid TypeScript errors
interface FrameUser {
  fid?: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}

// --- Helper Function ---
function formatAddress(address?: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// --- Debug Mode ---
const DEBUG = false;

// --- Component ---
export function CustomWallet() {
  const [isClient, setIsClient] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [pfpUrl, setPfpUrl] = useState<string | null>(null);
  const [isFetchingName, setIsFetchingName] = useState(false);
  const [isWalletLoading, setIsWalletLoading] = useState(true); // Add loading state for wallet
  const [showSendForm, setShowSendForm] = useState(false);
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState<Token>("ETH");
  const [isSending, setIsSending] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false); // Track connection state
  const [isFrame, setIsFrame] = useState(false); // Track if we're in a Farcaster frame
  // We'll use frameUser object to store all frame context user data
  const [frameUser, setFrameUser] = useState<FrameUser | null>(null);
  const [copied, setCopied] = useState(false); // Track whether the address was just copied
  const [frameWalletAddress, setFrameWalletAddress] = useState<string | null>(null); // Track wallet address in frame context
  
  // Add state for funding
  const [showFundForm, setShowFundForm] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [fundAsset, setFundAsset] = useState<"native-currency" | "USDC">("USDC");
  const [isFunding, setIsFunding] = useState(false);
  
  const drawerRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { address: eoaAddress, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { data: ethBalance, isLoading: ethLoading, refetch: refetchEthBalance } = useBalance({ 
    address: isFrame && frameWalletAddress ? frameWalletAddress as Address : eoaAddress,
    chainId: BASE_MAINNET_ID // Explicitly use Base network
  });
  const { logout } = useLogout();
  const { login } = useLogin({
    onComplete: () => {
      if (DEBUG) {
      console.log("Login complete");
      }
      setIsConnecting(false); // Reset connecting state on completion
    },
    onError: (error: Error) => {
      console.error("Login error:", error);
      toast.error("Login failed. Please try again.");
      setIsConnecting(false); // Reset connecting state on error
    }
  });
  
  // Add connectWallet hook
  const { connectWallet } = useConnectWallet({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSuccess: ({ wallet }: { wallet: any }) => {
      if (DEBUG) {
      console.log("Wallet connected successfully:", wallet);
      }
      // Note: don't reset connecting state yet
    },
    onError: (error: Error) => {
      console.error("Wallet connection error:", error);
      toast.error("Failed to connect wallet. Please try again.");
      setIsConnecting(false);
    }
  });

  const { fundWallet } = useFundWallet();
  
  // Get smart wallet information - focus on the client since that's what has an address
  const { client: smartWalletClient } = useSmartWallets();
  const userEmail = user?.email?.address;

  const isBaseColors = useBaseColors();
  
  // Helper function to determine avatar fallback content
  const getAvatarFallback = () => {
    if (userEmail) {
      return userEmail.substring(0, 1).toUpperCase();
    } else if (displayName) {
      return displayName.substring(0, 2).toUpperCase();
    }
    return <Wallet className="h-4 w-4"/>;
  };

  // Check if we're in a Farcaster frame on component mount
  useEffect(() => {
    const checkFrameContext = async () => {
      try {
        const context = await frameSdk.getContext();
        if (context && context.user) {
          if (DEBUG) {
          console.log("Running in Farcaster frame context", context);
          }
          setIsFrame(true);
          
          // Store frame user data with correct typing
          setFrameUser({
            fid: context.user.fid,
            displayName: context.user.displayName || undefined,
            username: context.user.username || undefined,
            pfpUrl: context.user.pfpUrl || undefined
          });
          
          // Still set these for backward compatibility
          if (context.user.displayName) {
            setDisplayName(context.user.displayName);
          } else if (context.user.username) {
            setDisplayName(`@${context.user.username}`);
          }
          
          if (context.user.pfpUrl) {
            setPfpUrl(context.user.pfpUrl);
          }
          
          // Directly check if wallet is connected using the frame SDK
          const isWalletConnected = await frameSdk.isWalletConnected();
          if (isWalletConnected) {
            const accounts = await frameSdk.connectWallet();
            if (accounts.length > 0) {
              setFrameWalletAddress(accounts[0]);
              if (DEBUG) {
              console.log("Frame wallet already connected:", accounts[0]);
              }
            }
          }
          
        } else {
          setIsFrame(false);
        }
      } catch (error) {
        if (DEBUG) {
        console.log("Not in a Farcaster frame context:", error);
        }
        setIsFrame(false);
      }
    };

    checkFrameContext();
  }, [frameWalletAddress]);

  // Handle drag to dismiss
  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 100) {
      // If dragged down more than 100px, close the drawer
      setIsDrawerOpen(false);
    }
  };

  // Handle clicks outside the drawer
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
        setIsDrawerOpen(false);
      }
    };

    if (isDrawerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDrawerOpen]);

  // Extract smart wallet address directly from the client
  const smartWalletAddress = useMemo(() => {
    // The address is in the client's account property
    if (smartWalletClient?.account) {
      return smartWalletClient.account.address as Address;
    }
    return undefined;
  }, [smartWalletClient]);
  
  // Get smart wallet address directly from user object (more reliable according to Privy docs)
  // https://docs.privy.io/wallets/using-wallets/evm-smart-wallets/usage
  const smartWalletAddressFromUser = useMemo(() => {
    if (authenticated && user?.linkedAccounts) {
      const smartWallet = user.linkedAccounts.find((account: PrivyLinkedAccount) => account.type === 'smart_wallet');
      return smartWallet?.address as Address | undefined;
    }
    return undefined;
  }, [authenticated, user?.linkedAccounts]);

  // Use the address from linkedAccounts if available, fall back to client
  const finalSmartWalletAddress = smartWalletAddressFromUser || smartWalletAddress;
  
  // Use frameWalletAddress in frame context if available
  const displayAddress = isFrame && frameWalletAddress 
    ? frameWalletAddress as Address
    : finalSmartWalletAddress ?? eoaAddress;
  const headerAddress = eoaAddress;
  
  // Debug logging
  useEffect(() => {
    if (DEBUG) {
    console.log("Smart wallet client:", smartWalletClient?.account?.address);
    console.log("Smart wallet address:", smartWalletAddress);
    console.log("Smart wallet address from user:", smartWalletAddressFromUser);
    console.log("Final smart wallet address:", finalSmartWalletAddress);
    console.log("EOA address:", eoaAddress);
    console.log("Display address:", displayAddress);
    }
    if (smartWalletClient && !finalSmartWalletAddress) {
      console.warn("Smart wallet client exists but no address found - check initialization");
    }
    
    // Only mark loading as complete when both loading paths are checked
    const walletDataLoaded = authenticated && 
      ((user?.linkedAccounts !== undefined) || (smartWalletClient !== undefined));
    
    if (walletDataLoaded) {
      setIsWalletLoading(false);
    }
  }, [smartWalletClient, smartWalletAddress, smartWalletAddressFromUser, 
      finalSmartWalletAddress, eoaAddress, displayAddress, authenticated, user?.linkedAccounts]);

  // More reliable check for valid wallet connection - must have an actual address
  const hasConnectedWallet = useMemo(() => {
    // For Frame context, don't check authenticated state, just the wallet address
    if (isFrame) {
      // First check our direct frame wallet connection
      if (frameWalletAddress) {
        return true;
      }
      // Fall back to wagmi address detection
      return Boolean(eoaAddress || finalSmartWalletAddress);
    }
    // For regular context, check authenticated state as well
    return authenticated && Boolean(eoaAddress || finalSmartWalletAddress);
  }, [authenticated, eoaAddress, finalSmartWalletAddress, isFrame, frameWalletAddress]);

  const isOnBase = useMemo(() => {
    return chain?.id === BASE_MAINNET_ID;
  }, [chain]);

  // We'll handle different connection states for Frame vs regular context separately

  const { data: tokenBalances, isLoading: tokensLoading, refetch: refetchTokenBalances } = useReadContracts({
    contracts: [
      { address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [displayAddress!] },
      { address: QR_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [displayAddress!] },
      { address: USDC_ADDRESS, abi: erc20Abi, functionName: "decimals" },
      { address: QR_ADDRESS, abi: erc20Abi, functionName: "decimals" },
    ],
    query: {
      enabled: !!displayAddress,
    },
  });

  // Track authentication state changes to broadcast connections
  useEffect(() => {
    if (authenticated && eoaAddress) {
      // Generate a unique browser instance ID to help identify this connection
      const browserInstanceId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      
      // Broadcast the wallet connection event
      if (DEBUG) {
      console.log('Broadcasting wallet connection for address:', eoaAddress);
      }
      broadcastConnection(eoaAddress, browserInstanceId);
    }
  }, [authenticated, eoaAddress]);

  const [usdcBalance, qrBalance, usdcDecimals, qrDecimals] = useMemo(() => {
    if (!tokenBalances || tokenBalances.length < 4) return [0, 0, 6, 18];
    const usdcDecimals = tokenBalances[2]?.result ?? 6;
    const qrDecimals = tokenBalances[3]?.result ?? 18;

    const usdcRaw = tokenBalances[0]?.result ?? 0n;
    const qrRaw = tokenBalances[1]?.result ?? 0n;

    const formatBalance = (raw: bigint, decimals: number): number => {
        if (!raw || !decimals) return 0;
        const divisor = 10n ** BigInt(decimals);
        const integerPart = raw / divisor;
        const fractionalPart = raw % divisor;
        const fractionalString = fractionalPart.toString().padStart(decimals, '0');
        return parseFloat(`${integerPart}.${fractionalString}`);
    }

    return [
        formatBalance(usdcRaw as bigint, usdcDecimals as number),
        Math.floor(formatBalance(qrRaw as bigint, qrDecimals as number)),
        usdcDecimals as number,
        qrDecimals as number
    ];
  }, [tokenBalances]);

  const ethBalanceFormatted = useMemo(() => {
      return parseFloat(formatEther(ethBalance?.value ?? 0n));
  }, [ethBalance]);

  // Detect if we're on mobile
  const isMobile = useMemo(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    }
    return false;
  }, []);

  // Handle profile click for Farcaster frame context
  const handleProfileClick = async () => {
    if (isFrame) {
      // Always toggle drawer in frame context, regardless of auth status
      setIsDrawerOpen(prev => !prev);
    } else {
      // Regular wallet dialog opening behavior for non-frame environments
      setIsOpen(true);
    }
  };

  // Detect inconsistent state on mount and clean up
  useEffect(() => {
    if (!ready) return;
    
    // Only run this check after a delay to allow wagmi connections to initialize
    const timeoutId = setTimeout(() => {
      // Check for inconsistent state: authenticated but no wallet connected
      const isInconsistentState = authenticated && !eoaAddress && !finalSmartWalletAddress;
      
      if (isInconsistentState) {
        if (DEBUG) {
        console.log("Detected inconsistent authentication state on mount, cleaning up...");
        }
        // Auto-reset bad state
        logout().catch((e: Error) => console.error("Auto-logout failed:", e));
      }
    }, 1500); // Give wagmi time to initialize connections
    
    // Clean up timeout on unmount
    return () => clearTimeout(timeoutId);
  }, [ready, authenticated, eoaAddress, finalSmartWalletAddress, logout]);

  // Handle connect wallet properly in drawer for frames
  const handleConnectInDrawer = async () => {
    // Do not close the drawer yet
    if (DEBUG) {
      console.log("Starting wallet connection from drawer...", { authenticated, hasConnectedWallet });
    }
    
    try {
      if (isFrame) {
        if (DEBUG) {
          // In frame context, use Frame SDK's connect wallet function directly
          console.log("Using Frame SDK connect for frame context");
        }
        
        // Direct call to Frame SDK's connect wallet
        const accounts = await frameSdk.connectWallet();
        if (accounts.length > 0) {
          setFrameWalletAddress(accounts[0]);
          if (DEBUG) {
            console.log("Frame wallet connected via SDK:", accounts[0]);
          }
          
          // If connected but on wrong chain, try to switch to Base
          if (!isOnBase) {
            switchChain({ chainId: BASE_MAINNET_ID });
          }
        } else {
          if (DEBUG) {
            console.log("No accounts returned from frame wallet connect");
          }
        }
      } else {
        // Regular Privy flow for non-frame context
        // First check if we have a connected wallet
        if (hasConnectedWallet) {
          // If we have a wallet but are on the wrong network, switch network
          if (!isOnBase) {
            switchChain({ chainId: BASE_MAINNET_ID });
          }
        } else {
          // We don't have a connected wallet
          if (authenticated) {
            // If authenticated but no wallet, force logout then login in one step
            if (DEBUG) {
              console.log("Authenticated but no wallet detected, forcing reset");
            }
            await logout();
          }
          
          // Always call login after handling potential logout
          if (DEBUG) {
            console.log("Showing login modal");
          }
          login();
        }
      }
    } catch (error) {
      console.error("Error in connect flow:", error);
      // Fallback to direct login in case of errors in non-frame context
      if (!isFrame) {
        login();
      }
    }
  };

  // Navigate to user's profile using frameSdk
  const goToProfile = async () => {
    if (frameUser?.fid) {
      try {
        // Use the correct SDK method from Farcaster SDK to view a profile
        await frameSdk.redirectToUrl(`https://warpcast.com/${frameUser.username || `~/~/~/~/~/${frameUser.fid}`}`);
        setIsDrawerOpen(false);
      } catch (error) {
        console.error("Error navigating to profile:", error);
        toast.error("Could not open profile");
      }
    }
  };

  // Clear profile data when not authenticated or when address changes
  useEffect(() => {
    // If not authenticated, reset the profile data
    if (!authenticated && !isFrame) {
      setDisplayName(null);
      setPfpUrl(null);
      return;
    }
    
    // Only proceed with fetching if wallet is loaded, we have an address, and are authenticated
    if (!isWalletLoading && (finalSmartWalletAddress || eoaAddress) && authenticated && !isFrame && !isFetchingName) {
      setIsFetchingName(true);
      const fetchIdentity = async () => {
        try {
          // Always prioritize looking up by smart wallet if available
          const addressToLookup = finalSmartWalletAddress || eoaAddress;
          
          if (addressToLookup) {
            const fcUser = await getFarcasterUser(addressToLookup);
          if (fcUser) {
            setDisplayName(fcUser.displayName || `@${fcUser.username}`);
            setPfpUrl(fcUser.pfpUrl);
            return;
          }
            const ensName = await getName({ address: addressToLookup as `0x${string}`, chain: base });
          if (ensName) {
            setDisplayName(ensName);
            return;
          }
            
            // If no social identities found, use smart wallet address if available, otherwise EOA
            setDisplayName(formatAddress(addressToLookup));
          }
        } catch (error) {
          console.error("Error fetching identity:", error);
          const addressToShow = finalSmartWalletAddress || eoaAddress;
          if (addressToShow) {
            setDisplayName(formatAddress(addressToShow));
          }
        } finally {
          setIsFetchingName(false);
        }
      };
      fetchIdentity();
    }
  }, [eoaAddress, finalSmartWalletAddress, authenticated, isFetchingName, isFrame, isWalletLoading]);

  // Initialize client state but prevent auto-opening on mobile
  useEffect(() => {
    setIsClient(true);
    
    // Ensure the dialog is closed on initial mount, especially on mobile
    if (isMobile) {
      setIsOpen(false);
    }
  }, [isMobile]);

  const handleDisconnect = async () => {
    try {
      if (DEBUG) {
        console.log("Logging out from Privy and clearing session...");
      }
      
      // Close drawer first
      setIsDrawerOpen(false);
      
      // Clear local state first
      setDisplayName(null);
      setPfpUrl(null);
      setIsOpen(false);
      setShowSendForm(false);
      
      // For frame context, just reset the local state
      if (isFrame) {
        setFrameWalletAddress(null);
        return;
      }
      
      // Disconnect from wagmi first
      wagmiDisconnect();
      
      // Then log out from Privy 
      await logout();
      
    } catch (error) {
      console.error("Error during logout:", error);
      toast.error("Failed to disconnect wallet. Try again.");
    }
  };

  const handleSwitchNetwork = () => {
    switchChain({ chainId: BASE_MAINNET_ID });
  };

  const handleInitiateSend = () => {
    setShowSendForm(true);
  };

  const handleAddFunds = () => {
    const targetAddress = finalSmartWalletAddress ?? eoaAddress;
    if (!targetAddress) {
        toast.error("No wallet address found to fund.");
        return;
    }
    // Instead of directly calling fundWallet, show the funding form
    setShowFundForm(true);
  };

  const handleConfirmFunding = () => {
    const targetAddress = finalSmartWalletAddress ?? eoaAddress;
    if (!targetAddress) {
        toast.error("No wallet address found to fund.");
        return;
    }
    
    // Only validate that the amount is a valid number
    const amount = parseFloat(fundAmount);
    if (isNaN(amount)) {
        toast.error("Please enter a valid amount.");
        return;
    }
    
    setIsFunding(true);
    
    // Call fundWallet with the user-specified amount and asset
    fundWallet(targetAddress, {
      chain: base,
      amount: fundAmount,
      asset: fundAsset
    });
    
    // Close the form and reset state
    setShowFundForm(false);
    setIsFunding(false);
  };

  const handleConfirmSend = async () => {
    // Verify we have necessary data
    if (!displayAddress || !isOnBase) {
        toast.error("Wallet not ready or not on Base network.");
        return;
    }
    
    // Ensure recipient is a valid address and convert to proper format
    if (!isAddress(sendRecipient)) {
        toast.error("Invalid recipient address.");
        return;
    }
    const recipientAddress = sendRecipient as `0x${string}`;
    
    const amount = parseFloat(sendAmount);
    if (isNaN(amount) || amount <= 0) {
        toast.error("Invalid amount.");
        return;
    }
    
    // Check balances before proceeding
    if (selectedToken === "ETH" && ethBalanceFormatted < amount) {
        toast.error("Insufficient ETH balance.");
        return;
    } else if (selectedToken === "USDC" && usdcBalance < amount) {
        toast.error("Insufficient USDC balance.");
        return;
    } else if (selectedToken === "$QR" && qrBalance < amount) {
        toast.error("Insufficient $QR balance.");
        return;
    }

    setIsSending(true);
    const toastId = toast.loading(`Preparing ${selectedToken} transaction...`);

    try {
        // Update the toast to show sending status
        toast.loading(`Sending ${amount} ${selectedToken}...`, { id: toastId });
        
        // Properly format and send the transaction using smart wallet client
        if (!smartWalletClient) {
            throw new Error("Smart wallet client not available");
        }
        
        if (DEBUG) {
          console.log("Using smart wallet client for transaction:", smartWalletClient.account?.address);
        }
            
        // Setup UI options for better user experience
        const uiOptions = {
            title: `Send ${selectedToken}`,
            description: `Sending ${amount} ${selectedToken} to ${formatAddress(sendRecipient)}`,
            buttonText: "Confirm Send"
        };
        
        // Create the transaction parameters based on token type
        const txParams = selectedToken === "ETH" 
            ? {
                to: recipientAddress,
                value: parseUnits(sendAmount, 18),
                chain: base
              }
            : {
                to: selectedToken === "USDC" ? USDC_ADDRESS : QR_ADDRESS,
                data: encodeFunctionData({
                    abi: erc20Abi,
                    functionName: 'transfer',
                    args: [recipientAddress, parseUnits(sendAmount, selectedToken === "USDC" ? usdcDecimals : qrDecimals)]
                }),
                chain: base
              };
              
        // Fire and forget - immediately show success and let the transaction process
        // This works around the issue with Privy's promise resolution
        smartWalletClient.sendTransaction(txParams, { uiOptions })
            .then(txHash => {
                if (DEBUG) {
                  console.log("Transaction sent with hash:", txHash);
                }
                
                // Update the toast when we have the hash
                toast.success(`Sent ${amount} ${selectedToken}!`, {
                    id: toastId,
                    description: (
                        <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="underline">
                            View on Basescan
                        </a>
                    )
                });
            })
            .catch(error => {
                console.error("Transaction failed:", error);
                toast.error(`Transaction failed: ${error instanceof Error ? error.message : "Unknown error"}`, {
                    id: toastId
                });
            });
        
        // Immediately clear form and show success, allowing transaction to process in background
        toast.success(`Transaction submitted!`, { id: toastId });
        
        // Reset form and refresh balances
        setSendRecipient("");
        setSendAmount("");
        setShowSendForm(false);
        setTimeout(refreshBalances, 1000);

    } catch (error: unknown) {
        console.error("Send preparation failed:", error);
        let errorMessage = "Failed to prepare transaction.";
        if (error instanceof Error) {
            errorMessage = error.message || errorMessage;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }
        // Make sure to dismiss the loading toast by updating it to an error toast
        toast.error(errorMessage, { id: toastId });
    } finally {
        setIsSending(false);
    }
  };

  const refreshBalances = () => {
    toast.info("Refreshing balances...");
    refetchEthBalance();
    refetchTokenBalances();
  }

  // Function to handle wallet connect button click
  const handleConnectWallet = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // First close our dialog to avoid showing multiple modals
    setIsOpen(false);
    
    // Set connecting state
    setIsConnecting(true);
    
    // Check if we might be using Rainbow wallet
    const isRainbowWallet = typeof window !== 'undefined' && 
      (window.localStorage.getItem('LAST_ACTIVE_CONNECTOR') === 'rainbow' ||
       navigator.userAgent.toLowerCase().includes('rainbow'));
    
    if (DEBUG) {
      console.log("Starting wallet connection flow", { isRainbowWallet });
    }
    
    // For Rainbow wallet, use the two-step authentication process to fix issues
    if (isRainbowWallet) {
      if (DEBUG) {
        console.log("Using two-step authentication for Rainbow wallet");
      }
      
      // Step 1: Connect the wallet first
      connectWallet().then(() => {
        if (DEBUG) {
          console.log("Rainbow wallet connected, waiting to authenticate...");
        }
        
        // Wait a moment for the wallet to be properly connected
        setTimeout(() => {
          // Check if we have a wallet available
          if (wallets && wallets.length > 0) {
            if (DEBUG) {
              console.log("Wallet available, triggering authentication:", wallets[0]);
            }
            
            // Step 2: Authenticate the connected wallet
            wallets[0].loginOrLink().then(() => {
              if (DEBUG) {
                console.log("Rainbow wallet authenticated successfully");
              }
              setIsConnecting(false);
            }).catch((error: Error) => {
              if (DEBUG) {
                console.error("Rainbow wallet authentication error:", error);
              }
              toast.error("Authentication failed. Please try again.");
              setIsConnecting(false);
            });
          } else {
            if (DEBUG) {
              console.error("Wallet connected but not found in wallet list");
            }
            toast.error("Wallet connection issue. Please try again.");
            setIsConnecting(false);
          }
        }, 2000); // 1 second delay before trying to authenticate
      }).catch((error: Error) => {
        if (DEBUG) {
          console.error("Rainbow wallet connection error:", error);
        }
        toast.error("Failed to connect wallet. Please try again.");
        setIsConnecting(false);
      });
    } else {
      // For other wallets, use the standard login flow
      setTimeout(() => {
        login();
        
        // Set a timeout to clean up if login modal gets stuck
        setTimeout(() => {
          if (isConnecting) {
            setIsConnecting(false);
          }
        }, 5000); // 5 second safety timeout
      }, 100);
    }
    
    return false;
  };

  // Cleanup any modal-related issues when component unmounts
  useEffect(() => {
    return () => {
      // Reset states on unmount
      setIsConnecting(false);
      setIsOpen(false);
      setIsDrawerOpen(false);
    };
  }, []);

  // Close handler for the dialog
  const handleOpenChange = (open: boolean) => {
    // Only allow the dialog to open if we're not in the connecting state
    if (isConnecting && !open) {
      setIsConnecting(false); // Allow closing the modal when connecting
    } else if (isConnecting && open) {
      return; // Prevent opening the modal when connecting
    }
    setIsOpen(open);
  };

  // Auto-prompt for network switch when component mounts or chain changes
  useEffect(() => {
    if (authenticated && eoaAddress && chain && chain.id !== BASE_MAINNET_ID) {
      // Add small delay to avoid immediate prompt on initial load
      const timer = setTimeout(() => {
        toast.info("You're not on Base network. Switch to participate in auctions.", {
          action: {
            label: "Switch to Base",
            onClick: () => switchChain({ chainId: BASE_MAINNET_ID })
          },
          duration: 5000
        });
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [authenticated, eoaAddress, chain, switchChain]);

  // Improve debugging by logging state changes
  useEffect(() => {
    if (DEBUG) {
      console.log("Authentication state change:", { 
        authenticated, 
        ready, 
        hasEOA: Boolean(eoaAddress), 
        hasSmartWallet: Boolean(finalSmartWalletAddress),
        chain: chain?.id,
        isOnBase
      });
    }
  }, [authenticated, ready, eoaAddress, finalSmartWalletAddress, chain, isOnBase]);

  // If we're in a Farcaster frame, use the slide-up drawer
  if (isFrame) {
    return (
      <>
      <Button
        variant="outline"
        className={clsx(
            "flex items-center justify-center h-8 w-8 md:h-10 md:w-10",
          isBaseColors && "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none"
        )}
        onClick={handleProfileClick}
        aria-label="View profile"
      >
          <Avatar className="h-6 w-6 border rounded-full overflow-hidden md:h-8 md:w-8"> 
            <AvatarImage 
              src={frameUser?.pfpUrl ?? undefined} 
              alt={frameUser?.displayName ?? "Profile"} 
              className="object-cover"
            />
          <AvatarFallback className="text-xs bg-muted">
              {frameUser?.displayName?.substring(0, 2)?.toUpperCase() || 
               frameUser?.username?.substring(0, 2)?.toUpperCase() || 
               <Wallet className="h-3 w-3 md:h-4 md:w-4" />}
          </AvatarFallback>
        </Avatar>
        </Button>

        {/* Slide-up drawer */}
        <AnimatePresence>
          {isDrawerOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsDrawerOpen(false)}
              />
              
              {/* Drawer */}
              <motion.div
                ref={drawerRef}
                className="fixed bottom-0 left-0 right-0 bg-background rounded-t-[24px] shadow-xl z-50 overflow-hidden max-h-[420px]"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.1}
                dragControls={dragControls}
                onDragEnd={handleDragEnd}
                dragListener={false}
              >
                {/* Drawer handle for drag */}
                <div 
                  className="w-12 h-1 bg-muted/70 mx-auto my-2 rounded-full cursor-grab"
                  onPointerDown={(e) => {
                    dragControls.start(e);
                  }}
                />
                
                {/* Drawer content - show as not connected if no wallet or not on Base */}
                <div className="px-3 pt-0 pb-4 overflow-y-auto max-h-[calc(420px-24px)]">
                  {/* Profile section with improved layout */}
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar className="h-10 w-10 border border-border/30 rounded-full overflow-hidden shadow-sm">
                      <AvatarImage 
                        src={frameUser?.pfpUrl ?? undefined} 
                        alt={frameUser?.displayName ?? "Profile"} 
                        className="object-cover"
                      />
                      <AvatarFallback className="text-sm">
                        {frameUser?.displayName?.substring(0, 2)?.toUpperCase() || 
                         frameUser?.username?.substring(0, 2)?.toUpperCase() || 
                        <UserCircle className="h-5 w-5" />}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1">
                      <h3 className="text-sm font-medium -mb-0.5 line-clamp-1">
                        {(frameUser?.username ? `@${frameUser.username}` : "Anonymous")}
                      </h3>
                      
                      {displayAddress && (
                        <div className="flex items-center">
                          <span className="text-xs text-muted-foreground">{formatAddress(displayAddress)}</span>
                          {copied ? (
                            <Check className="h-3 w-3 text-green-500 ml-1" />
                          ) : (
                            <Copy 
                              className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-foreground ml-1" 
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(displayAddress || "");
                                setCopied(true);
                                setTimeout(() => setCopied(false), 1400);
                              }} 
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {hasConnectedWallet ? (
                    <div className="space-y-3">
                      {/* Token balances in a compact card layout */}
                      <div className="grid grid-cols-3 gap-2">
                        {/* USDC balance */}
                        <div className="rounded-lg bg-muted/30 p-2.5 flex flex-col items-center justify-center">
                          <Image 
                            src="https://www.cryptologos.cc/logos/usd-coin-usdc-logo.png?v=040" 
                            alt="USDC" 
                            width={18} 
                            height={18}
                            className="mb-1" 
                          />
                          <span className="text-xs font-mono">
                            {tokensLoading ? 
                              <Skeleton className="h-3 w-10" /> : 
                              usdcBalance.toFixed(2)
                            }
                          </span>
                          <span className="text-[10px] text-muted-foreground">USDC</span>
                        </div>
                        
                        {/* QR balance */}
                        <div className="rounded-lg bg-muted/30 p-2.5 flex flex-col items-center justify-center">
                          <Image 
                            src="/qrLogo.png" 
                            alt="$QR" 
                            width={18} 
                            height={18}
                            className="mb-1" 
                          />
                          <span className="text-xs font-mono">
                            {tokensLoading ? 
                              <Skeleton className="h-3 w-10" /> : 
                              new Intl.NumberFormat().format(qrBalance)
                            }
                          </span>
                          <span className="text-[10px] text-muted-foreground">$QR</span>
                        </div>
                        
                        {/* ETH balance */}
                        <div className="rounded-lg bg-muted/30 p-2.5 flex flex-col items-center justify-center">
                          <Image 
                            src="https://www.cryptologos.cc/logos/ethereum-eth-logo.png?v=040" 
                            alt="ETH" 
                            width={18} 
                            height={18} 
                            className="rounded-full mb-1"
                          />
                          <span className="text-xs font-mono">
                            {ethLoading ? 
                              <Skeleton className="h-3 w-10" /> : 
                              parseFloat(formatEther(ethBalance?.value ?? 0n)).toFixed(4)
                            }
                          </span>
                          <span className="text-[10px] text-muted-foreground">ETH</span>
                        </div>
                      </div>
                      
                      {/* View Profile button */}
                      <Button 
                        variant="outline"
                        onClick={goToProfile}
                        className="w-full justify-between px-4 py-1.5 h-9 text-xs bg-muted/20 hover:bg-primary/5 border-border/40"
                      >
                        <span className="flex items-center">
                          <UserCircle className="mr-2 h-3.5 w-3.5 text-primary" />
                          View Profile
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 opacity-70" />
                      </Button>
                      
                    </div>
                  ) : (
                    <div className="px-1 py-2 space-y-3">
                      <Button 
                        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-11 text-sm font-medium" 
                        onClick={handleConnectInDrawer}
                      >
                        <Wallet className="mr-2 h-4 w-4" /> 
                        Connect Wallet
                      </Button>
                      
                      <p className="text-xs text-center text-muted-foreground px-3">
                        Connect your wallet to see your balances and participate in auctions
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </>
    );
  }

  if (!isClient || !ready) {
    return (
      <Button variant="outline" size="icon" className="h-8 w-8">
        <Wallet className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {authenticated ? (
          <Button
            variant="outline"
            className={clsx(
              "flex items-center gap-2 h-8 w-8 md:h-10 md:w-10",
              "p-0",
              isBaseColors && "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none"
            )}
            aria-label="Open wallet dialog"
          >
            <Avatar className="h-6 w-6 border-none rounded-full"> 
              <AvatarImage src={pfpUrl ?? undefined} alt={displayName ?? headerAddress} />
              <AvatarFallback className="text-xs bg-muted">
                {isWalletLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : getAvatarFallback()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium hidden">
              {isWalletLoading ? 
                <Skeleton className="h-4 w-20 inline-block" /> : 
                (userEmail ? userEmail : displayName ? displayName : <Skeleton className="h-4 w-20 inline-block" />)
              }
            </span>
          </Button>
        ) : (
          <Button
            variant="outline"
            className={clsx(
              "h-8 text-sm font-medium md:h-10",
              "px-3 md:px-3",
              "w-auto",
              isBaseColors && "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none"
            )}
            onClick={handleConnectWallet}
          >
            <Wallet className="h-4 w-4 md:hidden" />
            <span className="hidden md:inline">Connect Wallet</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] max-h-[80vh] overflow-y-auto mt-8 md:mt-0 p-3 sm:p-6">
        {authenticated && (
            <> 
                <DialogHeader className="pb-2">
                  <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Avatar className="h-7 w-7 sm:h-8 sm:w-8">
                        <AvatarImage src={pfpUrl ?? undefined} alt={displayName ?? ""} />
                        <AvatarFallback className="text-sm bg-muted">
                            {isWalletLoading ? "..." : getAvatarFallback()}
                        </AvatarFallback>
                    </Avatar>
                    {isWalletLoading ? 
                      <Skeleton className="h-5 w-24" /> : 
                      <span className="truncate max-w-[180px] sm:max-w-[250px]">
                        {userEmail ? userEmail : displayName ? displayName : <Skeleton className="h-5 w-24" />}
                      </span>
                    }
                  </DialogTitle>
                  {displayAddress && (
                      <DialogDescription className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                          <Wallet className="h-3 w-3 flex-shrink-0"/> 
                          <span className="truncate">{formatAddress(displayAddress)}</span> 
                          {copied ? (
                            <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
                          ) : (
                            <Copy className="h-3 w-3 flex-shrink-0 cursor-pointer" onClick={() => {
                              if (smartWalletAddress) {
                                navigator.clipboard.writeText(smartWalletAddress);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 1400);
                              } else {
                                navigator.clipboard.writeText(displayAddress);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 1400);
                              }
                            }} />
                          )}
                      </DialogDescription>
                  )}
                </DialogHeader>
        
                <div className={clsx(
                    "flex items-center justify-between p-2 rounded-md text-xs sm:text-sm",
                    isOnBase ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                  )}>
                  <div className="flex items-center gap-1.5">
                    {isOnBase ? (
                       <Image src="/base-logo.png" alt="Base" width={14} height={14} className="sm:w-4 sm:h-4" /> 
                    ) : (
                       <Network className="h-3 w-3 sm:h-4 sm:w-4"/> 
                    )}
                    {isOnBase ? "Base Mainnet" : `Connected to ${chain?.name ?? 'Unknown Network'}`}
                  </div>
                  {!isOnBase && (
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={handleSwitchNetwork}>Switch to Base</Button>
                  )}
                </div>
        
                <Separator className="my-2" />
        
                <div className="space-y-2 py-1">
                    <DialogTitle className="text-sm sm:text-base flex justify-between items-center">
                        Balances
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={refreshBalances} title="Refresh balances">
                            <RefreshCcw className="h-3 w-3" />
                        </Button>
                    </DialogTitle>
                    {isOnBase ? (
                        <>
                            <div className="flex justify-between items-center text-xs sm:text-sm">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Image src="https://www.cryptologos.cc/logos/usd-coin-usdc-logo.png?v=040" alt="USDC" width={14} height={14} className="sm:w-4 sm:h-4" /> USDC
                                </span>
                                {tokensLoading ? <Skeleton className="h-4 w-16" /> :
                                <span className="font-mono">{usdcBalance.toFixed(2)}</span>
                                }
                            </div>
                            <div className="flex justify-between items-center text-xs sm:text-sm">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Image src="/qrLogo.png" alt="$QR" width={14} height={14} className="sm:w-4 sm:h-4" /> $QR
                                </span>
                                {tokensLoading ? <Skeleton className="h-4 w-16" /> :
                                <span className="font-mono">{new Intl.NumberFormat().format(qrBalance)}</span>
                                }
                            </div>
                            <div className="flex justify-between items-center text-xs sm:text-sm">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Image src="https://www.cryptologos.cc/logos/ethereum-eth-logo.png?v=040" alt="ETH" width={14} height={14} className="rounded-full sm:w-4 sm:h-4"/> ETH
                                </span>
                                {ethLoading ? <Skeleton className="h-4 w-16" /> :
                                <span className="font-mono">{parseFloat(formatEther(ethBalance?.value ?? 0n)).toFixed(5)}</span>
                                }
                            </div>
                        </>
                    ) : (
                        <p className="text-xs sm:text-sm text-center text-muted-foreground py-2">Switch to Base network to see balances.</p>
                    )}
                </div>
        
                <Separator className="my-2" />
        
                {showSendForm ? (
                    <div className="space-y-2 pt-1">
                        <DialogTitle className="text-sm sm:text-base">Send Funds</DialogTitle>
                        <div className="flex gap-2">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="w-[70px] sm:w-[80px] flex items-center justify-between text-xs sm:text-sm h-8 sm:h-10">
                                        <Image 
                                            src={selectedToken === 'ETH' ? 'https://www.cryptologos.cc/logos/ethereum-eth-logo.png?v=040' : selectedToken === 'USDC' ? 'https://www.cryptologos.cc/logos/usd-coin-usdc-logo.png?v=040' : '/qr-logo.svg'}
                                            alt={selectedToken}
                                            width={14} height={14}
                                            className={clsx('sm:w-4 sm:h-4', selectedToken === 'ETH' && 'rounded-full')}
                                        />
                                        <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 opacity-50"/>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuItem onClick={() => setSelectedToken('ETH')}>
                                        <Image src="https://www.cryptologos.cc/logos/ethereum-eth-logo.png?v=040" alt="ETH" width={14} height={14} className="mr-2 rounded-full sm:w-4 sm:h-4"/> ETH
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSelectedToken('USDC')}>
                                        <Image src="https://www.cryptologos.cc/logos/usd-coin-usdc-logo.png?v=040" alt="USDC" width={14} height={14} className="mr-2 sm:w-4 sm:h-4"/> USDC
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSelectedToken('$QR')}>
                                        <Image src="/qrLogo.png" alt="$QR" width={14} height={14} className="mr-2 sm:w-4 sm:h-4"/> $QR
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <Input 
                                type="number" 
                                placeholder="Amount" 
                                value={sendAmount}
                                onChange={(e) => setSendAmount(e.target.value)}
                                className="flex-1 h-8 sm:h-10 text-xs sm:text-sm"
                            />
                        </div>
                        <Input 
                            type="text" 
                            placeholder="Recipient Address (0x...)" 
                            value={sendRecipient}
                            onChange={(e) => setSendRecipient(e.target.value)}
                            className="h-8 sm:h-10 text-xs sm:text-sm"
                        />
                        <div className="flex gap-2 pt-1">
                            <Button 
                                onClick={handleConfirmSend} 
                                disabled={!isOnBase || isSending || !sendRecipient || !sendAmount}
                                className="flex-1 h-8 sm:h-10 text-xs sm:text-sm"
                            >
                                {isSending ? "Sending..." : `Send ${selectedToken}`}
                            </Button>
                            <Button variant="outline" onClick={() => setShowSendForm(false)} className="flex-1 h-8 sm:h-10 text-xs sm:text-sm">
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : showFundForm ? (
                    <div className="space-y-2 pt-1">
                        <DialogTitle className="text-sm sm:text-base">Add Funds</DialogTitle>
                        <div className="flex gap-2">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="w-[70px] sm:w-[80px] flex items-center justify-between text-xs sm:text-sm h-8 sm:h-10">
                                        <Image 
                                            src={fundAsset === 'native-currency' ? 'https://www.cryptologos.cc/logos/ethereum-eth-logo.png?v=040' : 'https://www.cryptologos.cc/logos/usd-coin-usdc-logo.png?v=040'}
                                            alt={fundAsset === 'native-currency' ? 'ETH' : 'USDC'}
                                            width={14} height={14}
                                            className={clsx('sm:w-4 sm:h-4', fundAsset === 'native-currency' && 'rounded-full')}
                                        />
                                        <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 opacity-50"/>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuItem onClick={() => setFundAsset('native-currency')}>
                                        <Image src="https://www.cryptologos.cc/logos/ethereum-eth-logo.png?v=040" alt="ETH" width={14} height={14} className="mr-2 rounded-full sm:w-4 sm:h-4"/> ETH
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setFundAsset('USDC')}>
                                        <Image src="https://www.cryptologos.cc/logos/usd-coin-usdc-logo.png?v=040" alt="USDC" width={14} height={14} className="mr-2 sm:w-4 sm:h-4"/> USDC
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <Input 
                                type="number" 
                                placeholder="Enter amount" 
                                value={fundAmount}
                                onChange={(e) => setFundAmount(e.target.value)}
                                className="flex-1 h-8 sm:h-10 text-xs sm:text-sm"
                            />
                        </div>
                        <div className="pt-2 text-xs text-center text-muted-foreground">
                            Funds will be added to your wallet on Base network.
                        </div>
                        <div className="flex gap-2 pt-1">
                            <Button 
                                onClick={handleConfirmFunding} 
                                disabled={isFunding || fundAmount === "" || isNaN(parseFloat(fundAmount))}
                                className="flex-1 h-8 sm:h-10 text-xs sm:text-sm"
                            >
                                {isFunding ? "Processing..." : "Confirm"}
                            </Button>
                            <Button variant="outline" onClick={() => setShowFundForm(false)} className="flex-1 h-8 sm:h-10 text-xs sm:text-sm">
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button variant="outline" onClick={handleInitiateSend} disabled={!isOnBase} className="h-8 sm:h-10 text-xs sm:text-sm">
                        <Send className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Send
                      </Button>
                      <Button variant="outline" onClick={handleAddFunds} disabled={!displayAddress} className="h-8 sm:h-10 text-xs sm:text-sm">
                         <PlusCircle className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Add Funds
                      </Button>

                      <a
                        href={`https://basescan.org/address/${displayAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="col-span-2"
                      >
                          <Button variant="outline" className="w-full h-8 sm:h-10 text-xs sm:text-sm">
                            <ExternalLink className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> View on Basescan
                          </Button>
                      </a>
                    </div>
                )}
        
                <Separator className="mt-3 mb-2"/> 

                <DialogFooter>
                  <Button variant="destructive" onClick={handleDisconnect} className="w-full h-8 sm:h-10 text-xs sm:text-sm">
                    <LogOut className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Disconnect
                  </Button>
                </DialogFooter>
            </> 
        )}
      </DialogContent>
    </Dialog>
  );
} 