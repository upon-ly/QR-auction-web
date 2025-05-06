'use client';

import { LiFiWidget, WidgetConfig, useWidgetEvents } from '@lifi/widget';
import { useBaseColors } from "@/hooks/useBaseColors";
import { useTheme } from "next-themes";
import { useEffect } from 'react';

interface LiFiWidgetProps {
  className?: string;
  inputCurrency?: string;
  outputCurrency?: string;
  onWidgetEvent?: (name: string, data: unknown) => void;
}

export function LiFiWidgetComponent({
  className = "",
  inputCurrency = "NATIVE",
  outputCurrency = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC token address on Base
  onWidgetEvent,
}: LiFiWidgetProps) {
  const isBaseColors = useBaseColors();
  const { theme, resolvedTheme } = useTheme();
  
  // Determine widget appearance based on theme
  const widgetAppearance = isBaseColors || theme === 'dark' || resolvedTheme === 'dark' ? 'dark' : 'light';
  const isDarkMode = widgetAppearance === 'dark';
  
  // Configure the Li.Fi widget
  const widgetConfig: Partial<WidgetConfig> = {
    appearance: widgetAppearance,
    fromChain: 8453, // Base chain ID
    toChain: 8453, // Keep on Base
    fromToken: inputCurrency === "NATIVE" ? "0x4200000000000000000000000000000000000006" : inputCurrency, // ETH on Base
    toToken: outputCurrency, // Default to USDC
    theme: {
      container: {
        boxShadow: 'none',
        borderRadius: '12px',
        border: isBaseColors 
          ? '1px solid rgba(var(--primary), 0.2)' 
          : isDarkMode 
            ? '1px solid rgba(55, 55, 55, 0.8)' // Darker border for dark mode
            : '1px solid rgb(234, 234, 234)', // Light mode border
        width: '100%',
        height: '100%',
        padding: '8px',
      },
      // Add more custom theme overrides as needed
      palette: isDarkMode ? {
        primary: { main: '#3671ee' },
        secondary: { main: '#1c1c1c' },
        background: { 
          default: '#111111', // Darker background
          paper: '#1a1a1a'    // Slightly lighter panels
        },
        text: {
          primary: 'rgba(255, 255, 255, 0.9)',
          secondary: 'rgba(255, 255, 255, 0.6)'
        },
        grey: {
          300: '#333333', // Adjust greys for better contrast in dark mode
          200: '#272727',
          100: '#1e1e1e'
        }
      } : undefined,
    },
  };
  
  // Setup widget events (simpler method without trying to access individual events)
  const widgetEvents = useWidgetEvents();
  
  useEffect(() => {
    if (!onWidgetEvent || !widgetEvents) return;
    
    // Properly handle onRouteExecutionCompleted event which we're most interested in
    const onRouteExecutionCompleted = widgetEvents.onRouteExecutionCompleted?.subscribe((data: unknown) => {
      onWidgetEvent('onRouteExecutionCompleted', data);
    });
    
    // And the onRouteExecutionFailed event
    const onRouteExecutionFailed = widgetEvents.onRouteExecutionFailed?.subscribe((data: unknown) => {
      onWidgetEvent('onRouteExecutionFailed', data);
    });
    
    // Return cleanup function
    return () => {
      onRouteExecutionCompleted?.();
      onRouteExecutionFailed?.();
    };
  }, [widgetEvents, onWidgetEvent]);
  
  // Apply a wrapper with background matching the theme to prevent any white edges
  const wrapperClass = `h-full w-full rounded-lg overflow-hidden ${isDarkMode ? 'bg-[#111111]' : 'bg-white'} ${className}`;

  return (
    <div className={wrapperClass}>
      <LiFiWidget
        integrator="qrcoin-auction"
        config={widgetConfig}
      />
    </div>
  );
} 