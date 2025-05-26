import React, { createContext, useState, useContext, useEffect } from 'react';

// Define the popup types in order of priority
export type PopupType = 'airdrop' | 'likesRecasts' | 'linkVisit';

interface PopupCoordinatorContextType {
  currentPopup: PopupType | null;
  requestPopup: (type: PopupType) => boolean;
  releasePopup: (type: PopupType) => void;
  isPopupActive: (type: PopupType) => boolean;
}

const PopupCoordinatorContext = createContext<PopupCoordinatorContextType>({
  currentPopup: null,
  requestPopup: () => false,
  releasePopup: () => {},
  isPopupActive: () => false,
});

export const usePopupCoordinator = () => useContext(PopupCoordinatorContext);

// Define popup priority order (lower number = higher priority)
const POPUP_PRIORITY: Record<PopupType, number> = {
  airdrop: 1,
  likesRecasts: 2,
  linkVisit: 3,
};

export function PopupCoordinator({ children }: { children: React.ReactNode }) {
  const [currentPopup, setCurrentPopup] = useState<PopupType | null>(null);
  const [pendingRequests, setPendingRequests] = useState<Set<PopupType>>(new Set());

  // Request to show a popup - returns true if granted, false if denied
  const requestPopup = (type: PopupType): boolean => {
    console.log(`[PopupCoordinator] Request to show ${type} popup`);
    
    // If no popup is currently showing, grant immediately
    if (currentPopup === null) {
      console.log(`[PopupCoordinator] Granting ${type} popup (no current popup)`);
      setCurrentPopup(type);
      return true;
    }
    
    // If requesting popup has higher priority than current, grant it
    if (POPUP_PRIORITY[type] < POPUP_PRIORITY[currentPopup]) {
      console.log(`[PopupCoordinator] Granting ${type} popup (higher priority than ${currentPopup})`);
      setCurrentPopup(type);
      return true;
    }
    
    // Otherwise, add to pending requests
    console.log(`[PopupCoordinator] Denying ${type} popup (lower priority than ${currentPopup})`);
    setPendingRequests(prev => new Set([...prev, type]));
    return false;
  };

  // Release a popup and check for pending requests
  const releasePopup = (type: PopupType) => {
    console.log(`[PopupCoordinator] Releasing ${type} popup`);
    
    // Only release if this popup is currently active
    if (currentPopup === type) {
      setCurrentPopup(null);
      
      // Check for pending requests and grant the highest priority one
      if (pendingRequests.size > 0) {
        const sortedPending = Array.from(pendingRequests).sort(
          (a, b) => POPUP_PRIORITY[a] - POPUP_PRIORITY[b]
        );
        const nextPopup = sortedPending[0];
        
        console.log(`[PopupCoordinator] Granting pending ${nextPopup} popup`);
        setCurrentPopup(nextPopup);
        setPendingRequests(prev => {
          const newSet = new Set(prev);
          newSet.delete(nextPopup);
          return newSet;
        });
      }
    } else {
      // Remove from pending requests if it was there
      setPendingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(type);
        return newSet;
      });
    }
  };

  // Check if a specific popup is currently active
  const isPopupActive = (type: PopupType): boolean => {
    return currentPopup === type;
  };

  // Debug logging
  useEffect(() => {
    console.log(`[PopupCoordinator] Current popup: ${currentPopup}, Pending: [${Array.from(pendingRequests).join(', ')}]`);
  }, [currentPopup, pendingRequests]);

  return (
    <PopupCoordinatorContext.Provider
      value={{
        currentPopup,
        requestPopup,
        releasePopup,
        isPopupActive,
      }}
    >
      {children}
    </PopupCoordinatorContext.Provider>
  );
} 