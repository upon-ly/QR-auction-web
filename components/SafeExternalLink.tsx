"use client";

import type React from "react";
import type { ReactNode } from "react";

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
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const shouldShowWarning = onBeforeNavigate(href);
    if (!shouldShowWarning) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  };

  // Process children to remove www. if it's a string
  const processedChildren =
    typeof children === "string" ? children.replace(/^www\./i, "") : children;

  return (
    <a href={href} onClick={handleClick} className={className}>
      {processedChildren}
    </a>
  );
}
