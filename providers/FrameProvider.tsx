"use client";
import sdk from "@farcaster/frame-sdk";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

/**
 * FarcasterFrameProvider - Initializes the Farcaster Frame SDK and handles frame events
 * 
 * This provider:
 * 1. Initializes the SDK
 * 2. Checks if the frame is already added with notifications
 * 3. Prompts to add the frame if needed
 * 4. Listens for frame events (frameAdded, notificationsEnabled, etc.)
 * 5. Sends welcome notifications when appropriate
 */
export function FarcasterFrameProvider({ children }: { children: ReactNode }) {
  // Track if SDK has been initialized
  const [initialized, setInitialized] = useState(false);
  
  useEffect(() => {
    // Only initialize once
    if (initialized) return;
    
    const initialize = async () => {
      try {
        console.log("Initializing Farcaster Frame SDK");
        
        // Tell the SDK we're ready to receive events
        await sdk.actions.ready();
        console.log("Frame SDK initialized and ready");
        
        // Set up event listeners
        setupEventListeners();
        
        // Check if the frame is already added
        await checkFrameStatus();
        
        setInitialized(true);
      } catch (error) {
        console.error("Error initializing Frame SDK:", error);
      }
    };
    
    // Set up listeners for all frame events
    const setupEventListeners = () => {
      // Frame added event - when a user adds the frame
      sdk.on("frameAdded", (event) => {
        console.log("Frame added event:", event);
        if (event.notificationDetails) {
          sendWelcomeNotification();
        }
      });
      
      // Frame add rejected event - when a user declines to add the frame
      sdk.on("frameAddRejected", (event) => {
        console.log("Frame add rejected:", event.reason);
      });
      
      // Frame removed event - when a user removes the frame
      sdk.on("frameRemoved", () => {
        console.log("Frame removed");
      });
      
      // Notifications enabled event - when a user enables notifications
      sdk.on("notificationsEnabled", (event) => {
        console.log("Notifications enabled event:", event);
        
        if (event.notificationDetails) {
          sendWelcomeNotification();
        }
      });
      
      // Notifications disabled event - when a user disables notifications
      sdk.on("notificationsDisabled", () => {
        console.log("Notifications disabled");
      });
      
      // Primary button clicked event - for frame button interactions
      sdk.on("primaryButtonClicked", () => {
        console.log("Primary button clicked");
      });
      
      console.log("All frame event listeners set up");
    };
    
    // Check if the frame is already added and add it if not
    const checkFrameStatus = async () => {
      try {
        // First check if the frame is already added by getting the context
        const context = await sdk.context;
        console.log("Frame context:", JSON.stringify(context));
        
        // Check if the user has already added this frame with notifications
        if (context?.client?.added && context?.client?.notificationDetails) {
          console.log("Frame already added with notifications - not prompting");
          return;
        }
        
        // If not already added or no notifications, prompt to add the frame
        console.log("Prompting to add frame");
        const result = await sdk.actions.addFrame();
        console.log("Add frame result:", result);
        
        // Check if we got notificationDetails directly in the result
        if (result && 'notificationDetails' in result) {
          console.log("Frame added with notifications:", result.notificationDetails);
          await sendWelcomeNotification();
        } else {
          console.log("Frame response without notification details:", result);
        }
      } catch (error) {
        console.error("Error checking frame status:", error);
      }
    };
    
    // Send a welcome notification to the user
    const sendWelcomeNotification = async () => {
      try {
        // Get user FID from context
        const context = await sdk.context;
        const userFid = context?.user?.fid;
        
        if (userFid) {
          // Send welcome notification directly
          console.log(`Sending welcome notification to FID: ${userFid}`);
          
          const response = await fetch(`/api/notifications/welcome?fid=${userFid}`, {
            method: 'GET',
          });
          
          if (response.ok) {
            console.log("Welcome notification sent successfully");
          } else {
            console.error("Failed to send welcome notification:", await response.text());
          }
        } else {
          console.warn("No FID found in context, can't send welcome notification");
        }
      } catch (error) {
        console.error("Error sending welcome notification:", error);
      }
    };
    
    initialize();
    
    // Clean up event listeners on unmount
    return () => {
      // Remove all event listeners
      sdk.off("frameAdded");
      sdk.off("frameAddRejected");
      sdk.off("frameRemoved");
      sdk.off("notificationsEnabled");
      sdk.off("notificationsDisabled");
      sdk.off("primaryButtonClicked");
    };
  }, [initialized]);

  return <>{children}</>;
}
