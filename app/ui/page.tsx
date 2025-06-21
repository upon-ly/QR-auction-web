"use client";
import { ThemeDialog } from "@/components/ThemeDialog";
import React, { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useAccount } from "wagmi";
import { useState, useEffect } from "react";
import { useReadContract, useWriteContract } from "wagmi";
import { base, baseSepolia } from "viem/chains";
import { toast } from "sonner";
import { parseEther } from "viem";
import { useBaseColors } from "@/hooks/useBaseColors";
import { frameSdk } from "@/lib/frame-sdk-singleton";

function UI() {
  const isBaseColors = useBaseColors();
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const { address } = useAccount();
  const [userNfts, setUserNfts] = useState([]);
  const [primaryColor, setPrimaryColor] = useState<string>("");
  const [backgroundColor, setBackgroundColor] = useState<string>("");
  const [textColor, setTextColor] = useState<string>("");
  const [activeTab, setActiveTab] = useState("primary");
  const { data: hash, writeContractAsync, error } = useWriteContract();
  const {
    writeContractAsync: mintBatchWriteContractAsync,
  } = useWriteContract();
  // Frame environment detection
  const [frameWalletAddress, setFrameWalletAddress] = useState<string | null>(null);

  const isTestnet = process.env.NEXT_PUBLIC_ENABLE_TESTNETS === "true";

  const [currentColors, setCurrentColors] = useState<
    [string, string, string] | undefined
  >();

  const [numberToMint, setNumberToMint] = useState<number>(5);

  // Check if we're in a Farcaster frame context
  useEffect(() => {
    const checkFrameContext = async () => {
      try {
        const context = await frameSdk.getContext();
        if (context && context.user) {
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
      }
    };

    checkFrameContext();
  }, []);
  
  // Determine if we have a connected wallet (either through wagmi or frame)
  const hasConnectedWallet = frameWalletAddress || address;

  const abiForSetColorFunction = [
    {
      inputs: [
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
      name: "setColors",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
  ];

  const basecolorsThemeSettingsContractAddress =
    "0x711817e9a6a0a5949aea944b009f20658c8c53d0";

  const basecolorsThemeSettingsContractAddressTestnet =
    "0xE1f532A8A2750e93b4271b01B76cdA4FAb4b0dF2";

  const baseColorsContractAddressTestnet =
    "0x70F19D04b867431A316D070fa58a22dF02a89c86";

  const baseColorsContractAddress =
    "0x7Bc1C072742D8391817EB4Eb2317F98dc72C61dB";
  const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

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
    args: [hasConnectedWallet],
  }) as { data: [string, string, string] | undefined };

  useEffect(() => {
    if (colors) {
      console.log(colors);
      setCurrentColors(colors as unknown as [string, string, string]);
    }
  }, [colors]);

  useEffect(() => {
    if (error) {
      console.error("Error fetching colors:", error);
      toast.error("Failed to fetch colors");
    }
  }, [error]);

  const mintBatchABI = [
    {
      inputs: [
        {
          internalType: "string[]",
          name: "colors",
          type: "string[]",
        },
        {
          internalType: "string[]",
          name: "names",
          type: "string[]",
        },
        {
          internalType: "uint256",
          name: "quantity",
          type: "uint256",
        },
        {
          internalType: "address",
          name: "recipient",
          type: "address",
        },
      ],
      name: "mintBatch",
      outputs: [],
      stateMutability: "payable",
      type: "function",
    },
  ];

  const mintBatchContractAddress = isTestnet
    ? baseColorsContractAddressTestnet
    : baseColorsContractAddress;

  const generateRandomHex = () => {
    const hex = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0').toUpperCase();
    return hex;
  };

  const mintBatchBasecolors = async () => {
    if (numberToMint < 1 || numberToMint > 50) {
      toast.error("Please enter a number between 1 and 50");
      return;
    }

    const walletToUse = frameWalletAddress || address;
    if (!walletToUse) {
      toast.error("No wallet connected");
      return;
    }

    const colors: string[] = [];
    const names: string[] = [];
    
    for (let i = 0; i < numberToMint; i++) {
      const hex = generateRandomHex();
      colors.push(hex);
      names.push(hex.substring(1)); // Remove # from the hex
    }

    try {
      await mintBatchWriteContractAsync({
        address: mintBatchContractAddress,
        abi: mintBatchABI,
        functionName: "mintBatch",
        args: [colors, names, numberToMint, walletToUse],
        chain: isTestnet ? baseSepolia : base,
        value: parseEther((0.001 * numberToMint).toString()),
      });
      toast.success(`Minted ${numberToMint} colors`);
      setTimeout(() => fetchUserNfts(), 2000);
    } catch (error) {
      toast.error("Failed to mint colors");
      console.error(error);
    }
  };

  const fetchUserNfts = useCallback(async () => {
    const walletToUse = frameWalletAddress || address;
    if (!walletToUse) return;
    
    const response = await fetch(
      `https://${
        isTestnet ? "base-sepolia" : "base-mainnet"
      }.g.alchemy.com/nft/v2/${alchemyApiKey}/getNFTs?owner=${walletToUse}&contractAddresses[]=${
        isTestnet ? baseColorsContractAddressTestnet : baseColorsContractAddress
      }&withMetadata=true&pageSize=100`
    );
    const data = await response.json();
    console.log(data);
    setUserNfts(data.ownedNfts);
  }, [address, frameWalletAddress, isTestnet, alchemyApiKey, baseColorsContractAddressTestnet, baseColorsContractAddress]);

  useEffect(() => {
    const walletToUse = frameWalletAddress || address;
    if (!walletToUse) return;
    fetchUserNfts();
  }, [address, frameWalletAddress, fetchUserNfts]);

  const handleColorSelect = (title: string, colorType: string) => {
    switch (colorType) {
      case "primary":
        setPrimaryColor(title);
        break;
      case "background":
        setBackgroundColor(title);
        break;
      case "text":
        setTextColor(title);
        break;
    }
  };

  const handleSubmitColors = async () => {
    try {
      const walletToUse = frameWalletAddress || address;
      if (!walletToUse) {
        toast.error("No wallet connected");
        return;
      }
      
      // Use current colors as fallback if not changed
      const finalPrimaryColor = primaryColor || currentColors?.[0] || "#000000";
      const finalBackgroundColor = backgroundColor || currentColors?.[1] || "#FFFFFF";
      const finalTextColor = textColor || currentColors?.[2] || "#000000";
      
      await writeContractAsync({
        address: isTestnet
          ? basecolorsThemeSettingsContractAddressTestnet
          : basecolorsThemeSettingsContractAddress,
        abi: abiForSetColorFunction,
        functionName: "setColors",
        args: [finalPrimaryColor, finalBackgroundColor, finalTextColor],
        chain: isTestnet ? baseSepolia : base,
      });
      
      // Set the colors locally instead of reloading - with type assertion
      setCurrentColors([finalPrimaryColor, finalBackgroundColor, finalTextColor] as [string, string, string]);
      
      // Update document colors for immediate visual change
      document.documentElement.style.setProperty("--primary", finalPrimaryColor);
      document.documentElement.style.setProperty("--background", finalBackgroundColor);
      document.documentElement.style.setProperty("--foreground", finalTextColor);
      
      // Reset the selected colors
      setPrimaryColor("");
      setBackgroundColor("");
      setTextColor("");
      
      toast.success("Colors Updated");
    } catch (error) {
      console.error("Error updating colors:", error);
      toast.error("Failed to update colors");
    }
  };

  useEffect(() => {
    if (primaryColor && backgroundColor && textColor) {
      console.log({
        primaryColor,
        backgroundColor,
        textColor,
      });
    }
  }, [primaryColor, backgroundColor, textColor]);

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {hasConnectedWallet ? (
          <>
            <div className="flex gap-4 items-center mb-4 justify-center">
              <input
                type="number"
                min="1"
                value={numberToMint}
                onChange={(e) => setNumberToMint(parseInt(e.target.value))}
                className="w-24 px-3 py-2 border rounded-md"
              />
              <Button className={`${isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground" : ""}`} onClick={mintBatchBasecolors}>Buy {numberToMint} colors for {(0.001 * numberToMint)} ETH</Button>
            </div>
            {currentColors && (
              <div className="mb-6 p-0 w-full max-w-3xl border border-black">
                <div
                  className="p-4 space-y-4"
                  style={{
                    backgroundColor: currentColors?.[1] || "#ffffff",
                    color: currentColors?.[2] || "#000000",
                  }}
                >
                  <div className="flex flex-row gap-2 items-center justify-between">
                    <h2 className="text-base md:text-xl font-semibold">
                      Your Current Color Scheme
                    </h2>
                    <button
                      className="transition-colors py-2 px-4 rounded-md hover:opacity-80 text-sm md:text-base"
                      style={{
                        backgroundColor: currentColors?.[0] || "#ffffff",
                        color: currentColors?.[2] || "#000000",
                      }}
                    >
                      Button
                    </button>
                  </div>
                  <p className="text-sm md:text-base">
                    This is your current color scheme. You can change it by
                    selecting new colors below.
                  </p>
                </div>
              </div>
            )}

            <div className="w-full max-w-3xl bg-white dark:bg-gray-800 rounded-lg shadow-sm p-3 sm:p-6">
              <div className="flex flex-row gap-2 mb-6 w-full">
                {["primary", "background", "text"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`
                        py-3 px-4 text-center rounded-md font-medium capitalize transition-all w-full
                        ${
                          activeTab === tab
                            ? "bg-blue-500 text-white"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                        }
                      `}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-2 sm:gap-4 mb-4">
                {userNfts.map(
                  (nft: {
                    title: string;
                    tokenId: string;
                    media: Array<{ raw: string }>;
                  }) => {
                    const isCurrentColor =
                      (activeTab === "primary" &&
                        nft.title === currentColors?.[0]) ||
                      (activeTab === "background" &&
                        nft.title === currentColors?.[1]) ||
                      (activeTab === "text" &&
                        nft.title === currentColors?.[2]);

                    return (
                      <button
                        key={nft.tokenId}
                        onClick={() => handleColorSelect(nft.title, activeTab)}
                        className={`
                          relative w-full aspect-square 
                          ${
                            activeTab === "primary" &&
                            primaryColor === nft.title
                              ? "ring-4 ring-blue-500"
                              : ""
                          }
                          ${
                            activeTab === "background" &&
                            backgroundColor === nft.title
                              ? "ring-4 ring-blue-500"
                              : ""
                          }
                          ${
                            activeTab === "text" && textColor === nft.title
                              ? "ring-4 ring-blue-500"
                              : ""
                          }
                          ${isCurrentColor ? "ring-4 ring-green-500" : ""}
                        `}
                      >
                        {isCurrentColor && (
                          <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-1 z-10">
                            Current
                          </div>
                        )}
                        <img
                          src={nft.media[0].raw}
                          alt={nft.title}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    );
                  }
                )}
              </div>

              <div className="flex flex-row gap-4 mb-6">
                <div className="flex-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Primary
                  </p>
                  <p className="font-medium dark:text-white">
                    {primaryColor || currentColors?.[0]}
                  </p>
                </div>
                <div className="flex-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Background
                  </p>
                  <p className="font-medium dark:text-white">
                    {backgroundColor || currentColors?.[1]}
                  </p>
                </div>
                <div className="flex-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Text
                  </p>
                  <p className="font-medium dark:text-white">
                    {textColor || currentColors?.[2]}
                  </p>
                </div>
              </div>

              <div
                className="mb-6 p-4"
                style={{
                  backgroundColor: backgroundColor || currentColors?.[1],
                }}
              >
                <div className="flex flex-row gap-2 items-center justify-between">
                  <h2
                    className="text-base md:text-xl font-semibold whitespace-nowrap"
                    style={{ color: textColor || currentColors?.[2] }}
                  >
                    Preview of New Color Scheme
                  </h2>
                  <button
                    className="transition-colors py-2 px-4 rounded-md hover:opacity-80 text-sm md:text-base"
                    style={{
                      backgroundColor: primaryColor || currentColors?.[0],
                      color: textColor || currentColors?.[2],
                    }}
                  >
                    Button
                  </button>
                </div>
                <p
                  className="mt-4 text-sm md:text-base"
                  style={{ color: textColor || currentColors?.[2] }}
                >
                  This is how your selected colors will look together.
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleSubmitColors}
                  className="w-full py-2 px-4 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                >
                  Update Colors
                </button>
              </div>
            </div>

            {hash && (
              <p className="text-sm text-gray-500 dark:text-gray-400 break-all px-4 text-center">
                Transaction hash:{" "}
                <a
                  href={`https://basescan.org/tx/${hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-600 dark:text-blue-400"
                >
                  {hash}
                </a>
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col justify-center items-center gap-10">
            <h1 className="text-2xl font-bold">Please connect your wallet</h1>
          </div>
        )}
      </div>

      <ThemeDialog open={themeDialogOpen} onOpenChange={setThemeDialogOpen} />
    </main>
  );
}

export default UI;
