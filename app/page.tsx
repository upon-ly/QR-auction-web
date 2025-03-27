"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFetchAuctions } from "@/hooks/useFetchAuctions";

export default function HomePage() {
  const router = useRouter();
  const { auctions } = useFetchAuctions();

  useEffect(() => {
    if (auctions && auctions.length > 0) {
      const lastAuction = auctions[auctions.length - 1];
      const latestId = Number(lastAuction.tokenId);
      if (latestId > 0) {
        console.log(`Redirecting to latest auction: /auction/${latestId}`);
        router.replace(`/auction/${latestId}`);
      } else {
        console.log("No auctions found");
      }
    } else if (auctions) {
      console.log("No auctions found");
    }
  }, [auctions, router]);
}
