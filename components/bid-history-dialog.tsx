/* eslint-disable react-hooks/exhaustive-deps */
"use client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useFetchBids } from "@/hooks/useFetchBids";
import { useEffect, useState } from "react";
import { BidCellView } from "./BidCellView";

interface BidHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  auctionId: number;
  latestId: number;
  isComplete: boolean;
}

type AuctionType = {
  tokenId: bigint;
  bidder: string;
  amount: bigint;
  extended: boolean;
  endTime: bigint;
  url: string;
};

export function BidHistoryDialog({
  isOpen,
  onClose,
  auctionId,
  latestId,
  isComplete,
}: BidHistoryDialogProps) {
  const [auctionBids, setAuctionBids] = useState<AuctionType[]>([]);
  const { fetchHistoricalAuctions } = useFetchBids();

  useEffect(() => {
    const fetchData = async () => {
      const data = await fetchHistoricalAuctions();
      if (data !== undefined) {
        const filtered = data.filter(
          (val) => Number(val.tokenId) === auctionId
        );
        filtered.sort((a, b) => {
          if (a.amount < b.amount) return 1;
          if (a.amount > b.amount) return -1;
          return 0;
        });
        setAuctionBids(filtered);
      }
    };

    fetchData();
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[400px] overflow-scroll">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle className="text-2xl font-bold">
              Bids for QR #{auctionId}
            </DialogTitle>
          </div>
        </DialogHeader>
        {auctionBids.length > 0 && (
          <div className="space-y-4 mt-4">
            {auctionBids.map((bid, index) => (
              <BidCellView key={index} bid={bid} />
            ))}
          </div>
        )}
        {auctionBids.length == 0 && (
          <div className="space-y-4 mt-4">
            <span className="font-normal">
              {auctionId === latestId && !isComplete
                ? "Be the first to bid and set the pace—place your bid now"
                : "No bids were placed"}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
