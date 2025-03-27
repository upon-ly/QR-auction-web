/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import QRAuctionV2 from "../abi/QRAuctionV2.json";
import { Address } from "viem";
import { useWriteContract } from "wagmi";
import { QR_TOKEN_ADDRESS } from "@/config/tokens";

// ERC20 ABI for token approval
const erc20ABI = [
  {
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

export function useWriteActions({ tokenId }: { tokenId: bigint }) {
  // Setup contract writes
  const { writeContractAsync: bidAuction } = useWriteContract();
  const { writeContractAsync: settleAndCreate } = useWriteContract();
  const { writeContractAsync: approveToken } = useWriteContract();

  const bidAmount = async ({
    value,
    urlString,
  }: {
    value: bigint;
    urlString: string;
  }) => {
    try {
      // First approve QR tokens to be spent by the auction contract
      console.log("Approving QR tokens:", value.toString());
      const approveTx = await approveToken({
        address: QR_TOKEN_ADDRESS as Address,
        abi: erc20ABI,
        functionName: "approve",
        args: [process.env.NEXT_PUBLIC_QRAuction as Address, value],
      });
      
      console.log("Approval tx:", approveTx);

      // Wait for approval to complete
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Then call createBid on V2 contract - contract will automatically use the approved amount
      console.log("Placing bid with URL:", urlString);
      const tx = await bidAuction({
        address: process.env.NEXT_PUBLIC_QRAuctionV2 as Address,
        abi: QRAuctionV2.abi,
        functionName: "createBid",
        args: [tokenId, urlString],
      });

      return tx;
    } catch (error: any) {
      console.error("Bid error:", error);
      throw error;
    }
  };

  const settleTxn = async () => {
    try {
      const tx = await settleAndCreate({
        address: process.env.NEXT_PUBLIC_QRAuctionV2 as Address,
        abi: QRAuctionV2.abi,
        functionName: "settleCurrentAndCreateNewAuction",
        args: [],
      });

      return tx;
    } catch (error: any) {
      throw error;
    }
  };

  return { bidAmount, settleTxn };
}
