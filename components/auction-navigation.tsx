/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface AuctionNavigationProps {
  currentId: number;
  onPrevious: () => void;
  onNext: () => void;
  onLatest: () => void;
  date: string;
  isLatest: boolean;
}

export function AuctionNavigation({
  currentId,
  onPrevious,
  onNext,
  onLatest,
  date,
  isLatest,
}: AuctionNavigationProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Button
        variant="outline"
        size="icon"
        className={`rounded-full border-none ${
          isLatest
            ? "bg-blue-100 hover:bg-blue-200"
            : "bg-white hover:bg-gray-100"
        }`}
        onClick={onPrevious}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="rounded-full hover:bg-gray-100 border-none disabled:opacity-50 disabled:hover:bg-transparent"
        onClick={onNext}
        disabled={isLatest}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        className="rounded-full hover:bg-gray-100 border-none disabled:opacity-50 disabled:hover:bg-transparent px-4"
        onClick={onLatest}
        disabled={isLatest}
      >
        Latest
      </Button>
      <span className="text-gray-500 ml-2">{date}</span>
    </div>
  );
}
