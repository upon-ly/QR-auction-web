import { useState, useEffect } from 'react';
import { frameSdk } from '@/lib/frame-sdk-singleton';

/**
 * Hook to detect if the app is running in a mini app context
 * Returns { isMiniApp: boolean, isLoading: boolean }
 */
export function useIsMiniApp() {
  const [isMiniApp, setIsMiniApp] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkMiniApp() {
      try {
        const result = await frameSdk.isInMiniApp();
        setIsMiniApp(result);
      } catch (error) {
        console.error('Error checking mini app status:', error);
        setIsMiniApp(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkMiniApp();
  }, []);

  return { isMiniApp, isLoading };
}