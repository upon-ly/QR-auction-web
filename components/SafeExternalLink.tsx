"use client";

import type React from "react";
import type { ReactNode } from "react";
import { frameSdk } from "@/lib/frame-sdk";
import { useEffect, useRef } from "react";
interface SafeExternalLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  onBeforeNavigate: (url: string) => boolean;
}

export function SafeExternalLink({
  href,
  children,
  className = "",
  onBeforeNavigate,
}: SafeExternalLinkProps) {
  const isFrame = useRef(false);
  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    const shouldShowWarning = onBeforeNavigate(href);
    if (!shouldShowWarning) {
      if (isFrame.current) {
        try {
          await frameSdk.redirectToUrl(href);
        } catch (error) {
          console.error("Error opening URL in frame:", error);
        }
      } else {
        window.open(href, "_blank", "noopener,noreferrer");
      }
    }
  };

  useEffect(() => {
    async function checkFrameContext() {
      try {
        const context = await frameSdk.getContext();
        isFrame.current = !!context?.user;
      } catch (error) {
        console.error("Error checking frame context:", error);
      }
    }
    checkFrameContext();
  }, []);

  // Process children to remove www. if it's a string
  const processedChildren =
    typeof children === "string" ? children.replace(/^www\./i, "") : children;

  return (
    <a href={href} onClick={handleClick} className={className}>
      {processedChildren}
    </a>
  );
}
