/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { z } from "zod";
import { formatEther } from "viem";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { waitForTransactionReceipt } from "@wagmi/core";
import { toast } from "sonner";
import { useWriteActions } from "@/hooks/useWriteActions";
import { parseUnits } from "viem";
import { config } from "@/config/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccount } from "wagmi";
import { SafeExternalLink } from "./SafeExternalLink";
import { ExternalLink } from "lucide-react";
import { formatURL } from "@/utils/helperFunctions";
import { registerTransaction } from "@/hooks/useAuctionEvents";
import { useBaseColors } from "@/hooks/useBaseColors";
import { useTypingStatus } from "@/hooks/useTypingStatus";

export function BidForm({
  auctionDetail,
  settingDetail,
  onSuccess,
  openDialog,
}: {
  auctionDetail: any;
  settingDetail: any;
  onSuccess: () => void;
  openDialog: (url: string) => boolean;
}) {
  const isBaseColors = useBaseColors();
  const { isConnected } = useAccount();
  const { handleTypingStart } = useTypingStatus();
  const { bidAmount } = useWriteActions({
    tokenId: auctionDetail?.tokenId ? auctionDetail.tokenId : 0n,
  });

  // Calculate the minimum bid value from the contract data
  const lastHighestBid = auctionDetail?.highestBid
    ? auctionDetail.highestBid
    : 0n;
  const minBidIncrement = BigInt("10"); // 10%
  const hundred = BigInt("100");

  // Compute the increment and the minBid
  const increment = (lastHighestBid * minBidIncrement) / hundred;
  const minimumBid = Number(formatEther(lastHighestBid + increment));

  const targetUrl = auctionDetail?.qrMetadata?.urlString || "";

  const displayUrl = targetUrl ? (targetUrl === "0x" ? "" : targetUrl) : "";

  // Define the schema using the computed minimum
  const formSchema = z.object({
    bid: z.coerce
      .number({
        invalid_type_error: "Bid must be a number",
      })
      .min(Number(minimumBid), `Bid must be at least ${minimumBid}`),
    url: z.string().url("Invalid URL"),
  });

  type FormSchemaType = z.infer<typeof formSchema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<FormSchemaType>({
    resolver: zodResolver(formSchema),
    mode: "onChange", // Validate as the user types
    defaultValues: {
      bid: minimumBid,
      url: "https://",
    }
  });

  // Handle typing event separately from form validation
  const handleKeyDown = () => {
    // Always trigger typing events, even from anonymous users
    console.log('Triggering typing event from keyboard input');
    handleTypingStart();
  };

  // Also trigger typing on input change to catch paste events
  const handleInputChange = () => {
    // Always trigger typing events, even from anonymous users
    console.log('Triggering typing event from input change');
    handleTypingStart();
  };

  const onSubmit = async (data: FormSchemaType) => {
    console.log("Form data:", data);

    if (!isConnected) {
      toast.error("Connect a wallet");
      return;
    }

    try {
      const hash = await bidAmount({
        value: parseUnits(`${data.bid}`, 18),
        urlString: data.url,
      });
      
      // Register the transaction hash to prevent duplicate toasts
      registerTransaction(hash);

      const transactionReceiptPr = waitForTransactionReceipt(config, {
        hash: hash,
      });

      toast.promise(transactionReceiptPr, {
        loading: "Executing Transaction...",
        success: (data: any) => {
          reset();
          onSuccess();
          return "Bid Successful!";
        },
        error: (data: any) => {
          return "Failed to create bid";
        },
      });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-2">
        <div className="relative flex-1">
          <Input
            type="number"
            min={minimumBid === 0 ? "0.001" : minimumBid}
            step="any"
            placeholder={`${minimumBid === 0 ? "0.001" : minimumBid} or more`}
            className="pr-16 border p-2 w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            {...register("bid")}
            onFocus={(e: any) => {
              if (!e.target.value) {
                e.target.value = minimumBid === 0 ? 0.001 : minimumBid;
              }
            }}
            onKeyDown={handleKeyDown}
            onInput={handleInputChange}
          />
          <div className={`${isBaseColors ? "text-foreground" : "text-gray-500"} absolute inset-y-0 right-7 flex items-center pointer-events-none h-[36px]`}>
            ETH
          </div>
          {errors.bid && (
            <p className="text-red-500 text-sm mt-1">{errors.bid.message}</p>
          )}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type="text"
              placeholder="https://"
              className="pr-16 border p-2 w-full"
              {...register("url")}
              onFocus={(e: any) => {
                if (!e.target.value) {
                  e.target.value = "https://";
                }
              }}
              onKeyDown={handleKeyDown}
              onInput={handleInputChange}
            />
            <div className={`${isBaseColors ? "text-foreground" : "text-gray-500"} absolute inset-y-0 right-7 flex items-center pointer-events-none h-[36px]`}>
              URL
            </div>
            {errors.url && (
              <p className="text-red-500 text-sm mt-1">{errors.url.message}</p>
            )}
          </div>
        </div>

        <Button
          type="submit"
          className={`px-8 py-2 text-white ${
            isValid ? "bg-gray-900 hover:bg-gray-800" : "bg-gray-500"
          } ${isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground border-none" : ""}`}
          disabled={!isValid}
        >
          Place Bid
        </Button>

        {displayUrl !== "" && (
          <div className={`mt-0.5 p-3 bg-orange-50/30 border border-orange-100/50 rounded-md ${isBaseColors ? "bg-background" : "bg-gray-900 dark:bg-gray-800"}`}>
            <div className="text-sm">
              <span className={`${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-gray-300"}`}>Current bid website: </span>
              <SafeExternalLink
                href={targetUrl || ""}
                className={`font-medium hover:text-gray-900 transition-colors inline-flex items-center ${isBaseColors ? "text-foreground" : "text-gray-700 dark:text-gray-400"}`}
                onBeforeNavigate={openDialog}
              >
                {formatURL(displayUrl)}
                <ExternalLink className="ml-1 h-3 w-3" />
              </SafeExternalLink>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
