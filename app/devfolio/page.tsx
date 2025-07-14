'use client';

import { useEffect, useState } from 'react';
import { frameSdk } from '@/lib/frame-sdk-singleton';
import { useIsMiniApp } from '@/hooks/useIsMiniApp';
import { useRouter } from 'next/navigation';

export default function DevfolioRedirect() {
  const { isMiniApp, isLoading } = useIsMiniApp();
  const router = useRouter();
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    // Check if already redirected
    const redirected = sessionStorage.getItem('devfolio-redirected');
    if (redirected === 'true') {
      setHasRedirected(true);
      return;
    }

    const redirect = async () => {
      if (isLoading) return;

      // Mark as redirected before actually redirecting
      sessionStorage.setItem('devfolio-redirected', 'true');

      if (isMiniApp) {
        // In mini app, use openUrl to redirect
        try {
          await frameSdk.redirectToUrl('https://devfolio.co/projects/dollarqr-cf6b');
          // After redirect, user might come back
          setHasRedirected(true);
        } catch (error) {
          console.error('Failed to redirect:', error);
          sessionStorage.removeItem('devfolio-redirected');
        }
      } else {
        // In regular browser, use window redirect with slight delay to ensure tracking
        setTimeout(() => {
          window.location.href = 'https://devfolio.co/projects/dollarqr-cf6b';
        }, 100);
      }
    };

    redirect();
  }, [isMiniApp, isLoading]);

  // If user has been redirected and comes back, auto-navigate to home
  useEffect(() => {
    if (hasRedirected) {
      sessionStorage.removeItem('devfolio-redirected');
      router.push('/');
    }
  }, [hasRedirected, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Redirecting to Devfolio...</h1>
        <p className="text-gray-600">Taking you to the $QR project page</p>
        <div className="mt-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    </div>
  );
}