import React from "react";
import { cn } from "@/lib/utils";

interface XLogoProps {
  size?: "sm" | "md" | "lg";
  username?: string;
  className?: string;
  type?: "default" | "footer";
}

export function XLogo({
  size = "md",
  username,
  className,
  type = "default",
}: XLogoProps) {
  const sizeClasses = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (username) {
      window.open(`https://x.com/${username}`, "_blank", "noopener,noreferrer");
    }
  };

  return type === "footer" ? (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
        fill="currentColor"
      />
    </svg>
  ) : (
    <div
      className={cn(
        "relative inline-block cursor-pointer transition-opacity hover:opacity-80",
        className
      )}
      onClick={handleClick}
      title={username ? `@${username} on X` : "X (Twitter)"}
    >
      {/* Light mode X logo (black) */}
      <img
        src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/X_logo.jpg/1200px-X_logo.jpg"
        alt="X"
        className={cn(sizeClasses[size], "block dark:hidden")}
      />

      {/* Dark mode X logo (white) */}
      <img
        src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/X_logo.jpg/1200px-X_logo.jpg"
        alt="X"
        className={cn(sizeClasses[size], "hidden dark:block")}
      />
    </div>
  );
}
