"use client";

import { useEffect, useState, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useLoginToFrame } from "@privy-io/react-auth/farcaster";
import sdk from "@farcaster/frame-sdk";
import { frameSdk } from "@/lib/frame-sdk-singleton";

export function FarcasterLogin() {
  // Get authentication state from Privy
  const { ready, authenticated, user } = usePrivy();
  // Track if we've already attempted login
  const [loginAttempted, setLoginAttempted] = useState(false);
  // Ref to track if component is mounted
  const isMounted = useRef(true);
  
  // Get login hooks for Farcaster
  const { initLoginToFrame, loginToFrame } = useLoginToFrame();

  // Clean up on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Handle automatic login with Farcaster in frame context - but only once
  useEffect(() => {
    // Short delay to allow Privy to restore session if one exists
    const delayedCheck = setTimeout(async () => {
      // Safety checks:
      // 1. Make sure Privy is ready
      // 2. Double-check we're not authenticated
      // 3. Make sure we haven't attempted login already
      // 4. Make sure component is still mounted
      if (ready && !authenticated && !loginAttempted && isMounted.current) {
        // Do a more thorough check for existing user data
        if (user) {
          console.log("User data found, no need to login with Farcaster");
          setLoginAttempted(true);
          return;
        }
        
        const autoLogin = async () => {
          try {
            // First check if we're in a frame environment
            let isFrame = false;
            try {
              const context = await frameSdk.getContext();
              isFrame = !!(context && context.user);
              
              if (!isFrame) {
                console.log("Not in a frame environment, skipping automatic login");
                setLoginAttempted(true);
                return;
              }
            } catch (error) {
              console.log("Error checking frame context, skipping login:", error);
              setLoginAttempted(true);
              return;
            }
            
            // Mark that we've attempted login to prevent repeated attempts
            setLoginAttempted(true);
            console.log("Attempting automatic Farcaster login");
            
            // Get nonce for login
            const { nonce } = await initLoginToFrame();
            console.log("Got nonce for Farcaster login:", nonce);
            
            // Request signature from Farcaster with auth address support
            const result = await sdk.actions.signIn({ 
              nonce,
              acceptAuthAddress: true 
            });
            console.log("Got signature from Farcaster");
            
            // Complete authentication with Privy
            await loginToFrame({
              message: result.message,
              signature: result.signature,
            });
            
            console.log("Successfully logged in with Farcaster");
            
            // Try to connect wallet after successful login
            try {
              console.log("Attempting to connect wallet automatically");
              const accounts = await frameSdk.connectWallet();
              if (accounts.length > 0) {
                console.log("Wallet auto-connected:", accounts[0]);
              }
            } catch (walletError) {
              console.error("Auto wallet connection failed:", walletError);
            }
          } catch (error) {
            // Don't show errors to users as this is an automatic process
            console.error("Auto Farcaster login failed:", error);
          }
        };
        
        autoLogin();
      }
    }, 1000); // 1 second delay to allow session restoration
    
    return () => clearTimeout(delayedCheck);
  }, [ready, authenticated, user, loginAttempted, initLoginToFrame, loginToFrame]);
  
  // Return null as this is a utility component with no UI
  return null;
} 