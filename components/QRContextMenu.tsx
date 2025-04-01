/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Copy, Download } from "lucide-react";
import { useBaseColors } from "@/hooks/useBaseColors";
import clsx from "clsx";

interface QRContextMenuProps {
  children: React.ReactNode;
  className?: string;
  isHeaderLogo?: boolean;
}

export function QRContextMenu({ children, className, isHeaderLogo = false }: QRContextMenuProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const childRef = useRef<HTMLDivElement>(null);
  const isBaseColors = useBaseColors();

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    
    if (isHeaderLogo && childRef.current) {
      // For header logo, position below the element
      const rect = childRef.current.getBoundingClientRect();
      setPosition({ 
        x: rect.left, 
        y: rect.bottom + window.scrollY 
      });
    } else {
      // For other elements, position at cursor
      setPosition({ x: e.clientX, y: e.clientY });
    }
    
    setShowMenu(true);
  };

  const handleCopyQR = () => {
    // Create a new image to load the QR
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = "/qrLogo.png";
    
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob((blob) => {
        if (!blob) return;
        
        try {
          // For modern browsers
          const item = new ClipboardItem({ "image/png": blob });
          navigator.clipboard.write([item])
            .then(() => toast.success("QR copied to clipboard"))
            .catch(() => toast.error("Failed to copy QR"));
        } catch {
          toast.error("Your browser doesn't support copying images");
        }
      });
    };
    
    img.onerror = () => {
      toast.error("Failed to load QR image");
    };
    
    setShowMenu(false);
  };

  const handleDownloadQR = () => {
    const link = document.createElement("a");
    link.href = "/$QR.png";
    link.download = "$QR.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowMenu(false);
    // Removed toast notification for download
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <>
      <div 
        ref={childRef}
        className={className}
        onContextMenu={handleContextMenu}
      >
        {children}
      </div>
      
      {showMenu && (
        <div
          ref={menuRef}
          className={clsx(
            "fixed shadow-lg rounded-md py-1 z-50 min-w-[180px] border",
            isBaseColors 
              ? "bg-background border-primary/20" 
              : "bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
          )}
          style={{
            top: `${position.y}px`,
            left: `${position.x}px`,
          }}
        >
          <button
            className={clsx(
              "w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm",
              isBaseColors 
                ? "hover:bg-primary/10 text-foreground"
                : "hover:bg-gray-100 dark:hover:bg-zinc-700"
            )}
            onClick={handleCopyQR}
          >
            <Copy className="w-4 h-4" />
            Copy QR
          </button>
          <div className={clsx(
            "mx-1", 
            isBaseColors 
              ? "h-[2px] bg-primary/60"
              : "h-px bg-gray-200 dark:bg-zinc-700"
          )} />
          <button
            className={clsx(
              "w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm",
              isBaseColors 
                ? "hover:bg-primary/10 text-foreground"
                : "hover:bg-gray-100 dark:hover:bg-zinc-700"
            )}
            onClick={handleDownloadQR}
          >
            <Download className="w-4 h-4" />
            Download QR
          </button>
        </div>
      )}
    </>
  );
} 