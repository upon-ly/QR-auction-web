import { RealtimeChannel, createClient } from '@supabase/supabase-js';

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Type definitions
export type TypingAction = 'started-typing' | 'stopped-typing';
export type ConnectionAction = 'wallet-connected';

export interface TypingEvent {
  user: string;
  action: TypingAction;
  source: string;
}

export interface ConnectionEvent {
  user: string;
  action: ConnectionAction;
  source: string;
}

export interface PresenceEvent {
  user: string;
  source: string;
  online_at: string;
}

export type TypingCallback = (user: string, action: TypingAction, source: string) => void;
export type ConnectionCallback = (user: string, action: ConnectionAction, source: string) => void;
export type PresenceCallback = (user: string, source: string, online?: boolean) => void;

// Channels
let auctionChannel: RealtimeChannel | null = null;
let presenceChannel: RealtimeChannel | null = null;

// Typing listeners
const typingListeners: TypingCallback[] = [];

// Connection listeners
const connectionListeners: ConnectionCallback[] = [];

// User join listeners
const presenceListeners: PresenceCallback[] = [];

// Track seen wallet connections to avoid duplicates
const seenConnections = new Set<string>();

// Store the last known user info for reconnection
let lastUserInfo: { user: string; browserInstanceId: string } | null = null;

// Heartbeat interval to keep connection alive
let heartbeatInterval: NodeJS.Timeout | null = null;

// Reconnection timer
let reconnectionTimeout: NodeJS.Timeout | null = null;

// Track connection state
let isReconnecting = false;
let lastNetworkStatus: boolean = true;

// Add this type definition at the top of the file, after the other interface definitions
export interface NetworkInformation extends EventTarget {
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
  onchange: (event: Event) => void;
}

// Add debounce utility at the top
let reconnectDebounceTimer: NodeJS.Timeout | null = null;
const DEBOUNCE_RECONNECT_MS = 5000; // 5 second debounce for reconnections
const MAX_RECONNECT_ATTEMPTS = 3;
let reconnectAttempts = 0;

/**
 * Check if Supabase channels are healthy and reconnect if needed
 */
const checkChannelHealth = () => {
  if (!lastUserInfo) return;
  
  const { user, browserInstanceId } = lastUserInfo;
  
  // Check if channels are still connected
  const auctionChannelState = auctionChannel?.state;
  const presenceChannelState = presenceChannel?.state;
  
  console.log('Channel health check - Auction:', auctionChannelState, 'Presence:', presenceChannelState);
  
  // If either channel is closed or errored, reinitialize
  if (
    !auctionChannel || 
    !presenceChannel || 
    auctionChannelState === 'closed' || 
    presenceChannelState === 'closed' ||
    auctionChannelState === 'errored' || 
    presenceChannelState === 'errored'
  ) {
    console.log('Channels need reconnection, reinitializing...');
    if (!isReconnecting) {
      isReconnecting = true;
      safeReconnect(user, browserInstanceId);
    }
  } else {
    isReconnecting = false;
  }
};

/**
 * Safe reconnection with backoff strategy and debouncing
 */
const safeReconnect = (user: string, browserInstanceId: string) => {
  // Clear any existing reconnection attempts
  if (reconnectionTimeout) {
    clearTimeout(reconnectionTimeout);
  }
  
  // If we're already reconnecting, don't start another reconnection
  if (isReconnecting) {
    console.log('Already reconnecting, skipping duplicate request');
    return;
  }
  
  // Debounce reconnection attempts to prevent network storm
  if (reconnectDebounceTimer) {
    clearTimeout(reconnectDebounceTimer);
  }
  
  reconnectDebounceTimer = setTimeout(() => {
    // Only try reconnection if we haven't exceeded max attempts
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log(`Reached max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}), waiting for manual action`);
      isReconnecting = false;
      reconnectAttempts = 0;
      return;
    }
    
    console.log(`Attempting to reconnect channels (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
    isReconnecting = true;
    
    // Exponential backoff
    const backoffTime = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
    
    reconnectionTimeout = setTimeout(() => {
      initializeChannels(user, browserInstanceId);
      isReconnecting = false;
      reconnectAttempts = 0;
    }, backoffTime);
    
    reconnectAttempts++;
  }, DEBOUNCE_RECONNECT_MS);
};

/**
 * Start heartbeat to ensure channels stay connected
 */
const startHeartbeat = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  
  // Increase intervals to reduce API load
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator?.userAgent || '');
  const isSafari = /Safari/i.test(navigator?.userAgent || '') && !/Chrome/i.test(navigator?.userAgent || '');
  
  // Use longer intervals to reduce API traffic
  const interval = (isMobile || isSafari) ? 60000 : 120000; // 1 or 2 minutes
  
  console.log(`Starting heartbeat with interval: ${interval}ms (${isMobile ? 'mobile' : 'desktop'}, ${isSafari ? 'Safari' : 'not Safari'})`);
  
  // Check channel health regularly
  heartbeatInterval = setInterval(checkChannelHealth, interval);
};

/**
 * Initialize Supabase Realtime channels
 */
export const initializeChannels = (user: string, browserInstanceId: string = 'unknown') => {
  // Store user info for reconnection
  lastUserInfo = { user, browserInstanceId };
  
  // Close existing channels if they exist
  if (auctionChannel) auctionChannel.unsubscribe();
  if (presenceChannel) presenceChannel.unsubscribe();

  console.log('Initializing Supabase Realtime channels for user:', user, 'instance:', browserInstanceId);

  // Create auction channel for broadcasting typing events
  auctionChannel = supabase.channel('auction');
  auctionChannel
    .on('broadcast', { event: 'typing' }, (payload) => {
      const typingEvent = payload.payload as TypingEvent;
      console.log('Received typing event:', typingEvent);
      
      // Notify all listeners
      typingListeners.forEach(listener => {
        listener(typingEvent.user, typingEvent.action, typingEvent.source);
      });
    })
    .on('broadcast', { event: 'connection' }, (payload) => {
      const connectionEvent = payload.payload as ConnectionEvent;
      console.log('Received connection event:', connectionEvent);
      
      // Notify all connection listeners
      connectionListeners.forEach(listener => {
        listener(connectionEvent.user, connectionEvent.action, connectionEvent.source);
      });
    })
    .subscribe((status) => {
      console.log('Auction channel status:', status);
      
      // Add extra monitoring for connection state using subscription callback
      if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        console.log('Auction channel closed or errored, will check health soon');
        if (!isReconnecting && lastUserInfo) {
          isReconnecting = true;
          safeReconnect(lastUserInfo.user, lastUserInfo.browserInstanceId);
        }
      }
    });

  // Create presence channel for user tracking
  presenceChannel = supabase.channel('presence');
  presenceChannel
    .on('presence', { event: 'join' }, ({ newPresences }) => {
      console.log(`${newPresences.length} user(s) joined presence channel`);
      
      // Notify all listeners for each new presence
      newPresences.forEach((presence) => {
        if (!presence) {
          console.warn('Received empty presence object');
          return;
        }
        
        // Get presence data directly
        const presenceData = {
          user: presence.user,
          source: presence.source,
          online_at: presence.online_at
        };
        
        // Only proceed if we have valid data
        if (presenceData && presenceData.user && presenceData.source) {
          presenceListeners.forEach((listener) => {
            listener(presenceData.user, presenceData.source);
          });
        } else {
          console.warn('Incomplete presence data', presenceData);
        }
      });
    })
    .on('presence', { event: 'leave' }, ({ leftPresences }) => {
      console.log(`${leftPresences.length} user(s) left presence channel`);
      
      // Notify all listeners for each left presence
      leftPresences.forEach((presence) => {
        if (!presence) {
          console.warn('Received empty presence object');
          return;
        }
        
        // Get presence data directly
        const presenceData = {
          user: presence.user,
          source: presence.source,
          online_at: presence.online_at
        };
        
        // Only proceed if we have valid data
        if (presenceData && presenceData.user && presenceData.source) {
          presenceListeners.forEach((listener) => {
            listener(presenceData.user, presenceData.source, false);
          });
        } else {
          console.warn('Incomplete presence data', presenceData);
        }
      });
    })
    .subscribe(async (status) => {
      console.log('Presence channel status:', status);
      
      if (status === 'SUBSCRIBED') {
        console.log('Presence channel subscribed, tracking presence for:', user);
        
        // Track user presence with the browser instance ID to distinguish between sessions
        await presenceChannel?.track({
          user,
          source: browserInstanceId,
          online_at: new Date().toISOString(),
        });
        
        // Broadcast a join event to the auction channel to ensure it's seen
        broadcastJoin(user, browserInstanceId);
        
        // Reset reconnecting flag
        isReconnecting = false;
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        console.log('Presence channel closed or errored, will check health soon');
        if (!isReconnecting && lastUserInfo) {
          isReconnecting = true;
          safeReconnect(lastUserInfo.user, lastUserInfo.browserInstanceId);
        }
      }
    });

  // Start heartbeat to ensure channels stay connected
  startHeartbeat();
  
  // Set up network and page lifecycle event listeners (outside of React)
  setupEventListeners();
};

/**
 * Set up global event listeners for better mobile support
 */
const setupEventListeners = () => {
  // Define window with custom property type
  type WindowWithSetup = Window & typeof globalThis & {
    __channelListenersSetup?: boolean;
  };
  
  // Only set up once
  if (typeof window === 'undefined' || (window as WindowWithSetup).__channelListenersSetup) {
    return;
  }
  
  // Mark as set up
  (window as WindowWithSetup).__channelListenersSetup = true;
  
  // Handle page lifecycle events
  window.addEventListener('pageshow', handlePageVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('beforeunload', handlePageHide);
  window.addEventListener('focus', handlePageVisibilityChange);
  window.addEventListener('blur', () => {
    console.log('Window blurred, marking for potential reconnection on focus');
  });
  
  // Handle network changes
  if ('connection' in navigator) {
    const connection = navigator.connection as NetworkInformation || undefined;
    if (connection) {
      connection.addEventListener('change', () => handleNetworkChange());
    }
  }
  
  window.addEventListener('online', () => handleNetworkChange(true));
  window.addEventListener('offline', () => handleNetworkChange(false));
  
  console.log('Global event listeners set up for channel manager');
};

/**
 * Handle page visibility changes
 */
const handlePageVisibilityChange = () => {
  console.log('Page became visible or active');
  
  // Only reconnect if we know we're online
  if (navigator.onLine && lastUserInfo && (!auctionChannel || !presenceChannel || document.visibilityState === 'visible')) {
    console.log('Considering channel reconnection due to page visibility change');
    // Let the debounce mechanism handle the actual reconnection
    if (lastUserInfo) {
      safeReconnect(lastUserInfo.user, lastUserInfo.browserInstanceId);
    }
  }
};

/**
 * Handle page hiding (user navigating away or closing tab)
 */
const handlePageHide = () => {
  console.log('Page hidden or being unloaded');
  
  // Clean up gracefully
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  
  if (reconnectionTimeout) {
    clearTimeout(reconnectionTimeout);
    reconnectionTimeout = null;
  }
};

/**
 * Handle network state changes
 */
const handleNetworkChange = (isOnline?: boolean) => {
  const networkStatus = isOnline !== undefined ? isOnline : navigator.onLine;
  console.log('Network status changed:', networkStatus);
  
  // Only handle transitions to online from offline
  if (networkStatus && !lastNetworkStatus && lastUserInfo) {
    console.log('Network restored, will consider reconnecting channels');
    // Let the debounce mechanism handle the actual reconnection
    safeReconnect(lastUserInfo.user, lastUserInfo.browserInstanceId);
  }
  
  lastNetworkStatus = networkStatus;
};

/**
 * Broadcast a join event to the auction channel
 */
export const broadcastJoin = (user: string, browserInstanceId: string = 'unknown') => {
  if (!auctionChannel) {
    console.warn('Auction channel not initialized for join broadcast');
    return;
  }

  console.log('Broadcasting join event for user:', user);
  
  auctionChannel.send({
    type: 'broadcast',
    event: 'join',
    payload: { user, source: browserInstanceId },
  });
};

/**
 * Broadcast typing event to the channel
 */
export const broadcastTyping = (user: string, action: TypingAction, browserInstanceId: string = 'unknown') => {
  if (!auctionChannel) {
    console.warn('Auction channel not initialized');
    return;
  }

  console.log('Broadcasting typing event:', { user, action, source: browserInstanceId });
  
  // Include browser instance ID to identify the source
  auctionChannel.send({
    type: 'broadcast',
    event: 'typing',
    payload: { user, action, source: browserInstanceId },
  })
  .then(() => {
    console.log('Typing event broadcast successfully');
  })
  .catch((error) => {
    console.error('Error broadcasting typing event:', error);
  });
};

/**
 * Listen for typing events
 */
export const onTyping = (callback: TypingCallback): (() => void) => {
  typingListeners.push(callback);
  return () => {
    const index = typingListeners.indexOf(callback);
    if (index !== -1) {
      typingListeners.splice(index, 1);
    }
  };
};

/**
 * Listen for user join events
 */
export const onUserJoin = (callback: PresenceCallback): (() => void) => {
  presenceListeners.push(callback);
  return () => {
    const index = presenceListeners.indexOf(callback);
    if (index !== -1) {
      presenceListeners.splice(index, 1);
    }
  };
};

/**
 * Broadcast wallet connection event to the channel
 */
export const broadcastConnection = (user: string, browserInstanceId: string = 'unknown') => {
  // Make sure not to initialize channels unnecessarily
  if (!auctionChannel && navigator.onLine) {
    console.warn('Auction channel not initialized');
    initializeChannels(user, browserInstanceId);
    
    // Add a delay to allow channel to establish before broadcasting
    setTimeout(() => {
      sendConnectionBroadcast(user, browserInstanceId);
    }, 1000);
    return;
  }
  
  sendConnectionBroadcast(user, browserInstanceId);
};

/**
 * Helper to send the actual connection broadcast with limited retries
 */
const sendConnectionBroadcast = (user: string, browserInstanceId: string, retries = 1) => {
  if (!auctionChannel) {
    console.warn('Cannot broadcast connection: channel not available');
    return;
  }
  
  console.log('Broadcasting connection event:', { user, action: 'wallet-connected', source: browserInstanceId });
  
  auctionChannel.send({
    type: 'broadcast',
    event: 'connection',
    payload: { user, action: 'wallet-connected', source: browserInstanceId }
  })
  .then(() => {
    console.log('Connection event broadcast successfully');
  })
  .catch((error) => {
    console.error('Error broadcasting connection event:', error);
    
    // Significantly reduced retry count
    if (retries > 0) {
      console.log(`Broadcast failed, retrying once more`);
      setTimeout(() => sendConnectionBroadcast(user, browserInstanceId, retries - 1), 2000);
    }
  });
};

/**
 * Listen for wallet connection events
 */
export const onConnection = (callback: ConnectionCallback): (() => void) => {
  connectionListeners.push(callback);
  return () => {
    const index = connectionListeners.indexOf(callback);
    if (index !== -1) {
      connectionListeners.splice(index, 1);
    }
  };
};

export const cleanupChannels = () => {
  if (auctionChannel) {
    auctionChannel.unsubscribe();
    auctionChannel = null;
  }
  
  if (presenceChannel) {
    presenceChannel.unsubscribe();
    presenceChannel = null;
  }
  
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  
  if (reconnectionTimeout) {
    clearTimeout(reconnectionTimeout);
    reconnectionTimeout = null;
  }
  
  typingListeners.length = 0;
  connectionListeners.length = 0;
  presenceListeners.length = 0;
  
  // Clear the seen connections set
  seenConnections.clear();
  
  // Reset state
  isReconnecting = false;
};

/**
 * Force reconnection - useful for mobile scenarios, but with rate limiting
 */
let lastForceReconnectTime = 0;
export const forceReconnect = () => {
  const now = Date.now();
  // Only allow force reconnect once per minute
  if (now - lastForceReconnectTime < 60000) {
    console.log('Ignoring force reconnect request, too soon since last attempt');
    return;
  }
  
  lastForceReconnectTime = now;
  
  if (lastUserInfo) {
    console.log('Forcing reconnection of channels');
    safeReconnect(lastUserInfo.user, lastUserInfo.browserInstanceId);
  }
};

/**
 * Debug method to simulate a connection event (for testing only)
 */
export const simulateConnection = (address: string) => {
  connectionListeners.forEach(listener => {
    listener(address, 'wallet-connected', 'debug');
  });
}; 