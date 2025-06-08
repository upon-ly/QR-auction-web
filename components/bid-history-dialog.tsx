/* eslint-disable react-hooks/exhaustive-deps */
"use client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useFetchBidsSubgraph } from "@/hooks/useFetchBidsSubgraph";
import { useEffect, useState } from "react";
import { BidCellView } from "./BidCellView";

interface BidHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  auctionId: number;
  latestId: number;
  isComplete: boolean;
  openDialog: (url: string) => boolean;
}

type AuctionType = {
  tokenId: bigint;
  bidder: string;
  amount: bigint;
  extended: boolean;
  endTime: bigint;
  url: string;
  _id: string;
};

export function BidHistoryDialog({
  isOpen,
  onClose,
  auctionId,
  latestId,
  isComplete,
  openDialog,
}: BidHistoryDialogProps) {
  const [auctionBids, setAuctionBids] = useState<AuctionType[]>([]);
  const { fetchHistoricalAuctions } = useFetchBidsSubgraph(BigInt(auctionId));

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
      <DialogContent className="max-h-[400px] overflow-y-scroll">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle className="text-2xl font-bold">
              Bids for QR #{auctionId}
            </DialogTitle>
          </div>
        </DialogHeader>
        {auctionBids.length > 0 && (
          <div className="space-y-4 mt-4">
            {auctionBids.map((bid) => (
              <BidCellView key={bid._id} bid={bid} openDialog={openDialog} />
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
