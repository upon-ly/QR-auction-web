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
export type PresenceCallback = (user: string, source: string) => void;

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
    initializeChannels(user, browserInstanceId);
  }
};

/**
 * Start heartbeat to ensure channels stay connected
 */
const startHeartbeat = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  
  // Check channel health every 30 seconds
  heartbeatInterval = setInterval(checkChannelHealth, 30000);
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
      }
    });

  // Create presence channel for user tracking
  presenceChannel = supabase.channel('presence');
  presenceChannel
    .on('presence', { event: 'join' }, ({ newPresences }) => {
      console.log('User joined (raw):', JSON.stringify(newPresences));
      
      // Notify all listeners for each new presence
      newPresences.forEach((presence) => {
        console.log('Processing presence:', presence);
        
        // Extract the data from the presence object
        const presenceData = presence.payload as { user: string; source: string; online_at: string };
        console.log('Extracted presence data:', presenceData);
        
        if (presenceData && presenceData.user && presenceData.source) {
          // Create a unique key to avoid duplicate notifications
          const connectionKey = `${presenceData.user}-${presenceData.source}`;
          
          // Only notify if we haven't seen this connection before
          if (!seenConnections.has(connectionKey)) {
            console.log('New connection detected:', connectionKey);
            seenConnections.add(connectionKey);
            
            presenceListeners.forEach(listener => {
              listener(presenceData.user, presenceData.source);
            });
          } else {
            console.log('Skipping duplicate connection:', connectionKey);
          }
        } else {
          console.warn('Incomplete presence data:', presenceData);
        }
      });
    })
    .on('presence', { event: 'leave' }, ({ leftPresences }) => {
      console.log('User left:', leftPresences);
      
      // Clean up seen connections when users leave
      leftPresences.forEach((presence) => {
        const presenceData = presence.payload as { user: string; source: string; online_at: string };
        if (presenceData && presenceData.user && presenceData.source) {
          const connectionKey = `${presenceData.user}-${presenceData.source}`;
          seenConnections.delete(connectionKey);
          console.log('Removed connection from tracking:', connectionKey);
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
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        console.log('Presence channel closed or errored, will check health soon');
      }
    });

  // Start heartbeat to ensure channels stay connected
  startHeartbeat();
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
  if (!auctionChannel) {
    console.warn('Auction channel not initialized');
    return;
  }

  console.log('Broadcasting connection event:', { user, action: 'wallet-connected', source: browserInstanceId });
  
  // Include browser instance ID to identify the source
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
  
  typingListeners.length = 0;
  connectionListeners.length = 0;
  presenceListeners.length = 0;
  
  // Clear the seen connections set
  seenConnections.clear();
};

/**
 * Debug method to simulate a connection event (for testing only)
 */
export const simulateConnection = (address: string) => {
  connectionListeners.forEach(listener => {
    listener(address, 'wallet-connected', 'debug');
  });
}; 