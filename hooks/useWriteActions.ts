/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import QRAuction from "../abi/QRAuction.json";
import { Address } from "viem";
import { useWriteContract } from "wagmi";

export function useWriteActions({ tokenId }: { tokenId: bigint }) {
  // Setup contract writes
  const { writeContractAsync: bidAuction } = useWriteContract();
  const { writeContractAsync: settleAndCreate } = useWriteContract();

  const bidAmount = async ({
    value,
    urlString,
  }: {
    value: bigint;
    urlString: string;
  }) => {
    try {
      const tx = await bidAuction({
        address: process.env.NEXT_PUBLIC_QRAuction as Address,
        abi: QRAuction.abi,
        functionName: "createBid",
        args: [tokenId, urlString],
        value: value,
      });

      return tx;
    } catch (error: any) {
      throw error;
    }
  };

  const settleTxn = async () => {
    try {
      const tx = await settleAndCreate({
        address: process.env.NEXT_PUBLIC_QRAuction as Address,
        abi: QRAuction.abi,
        functionName: "settleCurrentAndCreateNewAuction",
        args: [],
        value: 0n,
      });

      return tx;
    } catch (error: any) {
      throw error;
    }
  };

  return { bidAmount, settleTxn };
}
