"use client";

import { frameSdk } from "./frame-sdk-singleton";

// Haptic feedback types based on iOS patterns
export type HapticImpactStyle = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid';
export type HapticNotificationStyle = 'success' | 'warning' | 'error';
export type HapticSelectionStyle = 'selection';

// iOS Pattern types for complex haptic sequences
export type HapticPattern = 
  | 'success-pattern'
  | 'error-pattern'
  | 'warning-pattern'
  | 'double-tap'
  | 'long-press'
  | 'swipe'
  | 'toggle'
  | 'escalating-impact'
  | 'descending-impact';

interface HapticManager {
  impactFeedback: (style: HapticImpactStyle) => Promise<void>;
  notificationFeedback: (style: HapticNotificationStyle) => Promise<void>;
  selectionFeedback: () => Promise<void>;
  patternFeedback: (pattern: HapticPattern) => Promise<void>;
}

class HapticsManager implements HapticManager {
  private static instance: HapticsManager;
  private isEnabled = true;
  private isMiniApp = false;
  private initialized = false;

  private constructor() {}

  static getInstance(): HapticsManager {
    if (!HapticsManager.instance) {
      HapticsManager.instance = new HapticsManager();
    }
    return HapticsManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      this.isMiniApp = await frameSdk.isInMiniApp();
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize haptics:", error);
      this.isMiniApp = false;
      this.initialized = true;
    }
  }

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  private async triggerHaptic(type: string, style?: string): Promise<void> {
    if (!this.isEnabled) return;
    
    await this.initialize();
    
    if (!this.isMiniApp) {
      console.log(`[Haptics] ${type}${style ? `: ${style}` : ''} (not in mini app)`);
      return;
    }

    try {
      // Use the singleton's haptic methods
      const { frameSDKManager } = await import("./frame-sdk-singleton");
      
      switch (type) {
        case 'impact':
          await frameSDKManager.hapticImpact(style as ('light' | 'medium' | 'heavy' | 'soft' | 'rigid' | undefined));
          break;
        case 'notification':
          await frameSDKManager.hapticNotification(style as ('success' | 'warning' | 'error'));
          break;
        case 'selection':
          await frameSDKManager.hapticSelection();
          break;
        default:
          console.warn(`Unknown haptic type: ${type}`);
      }
    } catch (error) {
      console.error("Failed to trigger haptic feedback:", error);
    }
  }

  async impactFeedback(style: HapticImpactStyle): Promise<void> {
    await this.triggerHaptic('impact', style);
  }

  async notificationFeedback(style: HapticNotificationStyle): Promise<void> {
    await this.triggerHaptic('notification', style);
  }

  async selectionFeedback(): Promise<void> {
    await this.triggerHaptic('selection');
  }

  async patternFeedback(pattern: HapticPattern): Promise<void> {
    if (!this.isEnabled) return;
    
    // Implement pattern-based haptic sequences
    switch (pattern) {
      case 'success-pattern':
        await this.impactFeedback('light');
        await this.delay(50);
        await this.impactFeedback('medium');
        await this.delay(50);
        await this.notificationFeedback('success');
        break;
        
      case 'error-pattern':
        await this.impactFeedback('heavy');
        await this.delay(100);
        await this.impactFeedback('heavy');
        await this.delay(100);
        await this.notificationFeedback('error');
        break;
        
      case 'warning-pattern':
        await this.impactFeedback('medium');
        await this.delay(100);
        await this.impactFeedback('light');
        await this.notificationFeedback('warning');
        break;
        
      case 'double-tap':
        await this.impactFeedback('light');
        await this.delay(100);
        await this.impactFeedback('light');
        break;
        
      case 'long-press':
        await this.impactFeedback('light');
        await this.delay(300);
        await this.impactFeedback('medium');
        break;
        
      case 'swipe':
        await this.impactFeedback('light');
        await this.delay(50);
        await this.selectionFeedback();
        break;
        
      case 'toggle':
        await this.impactFeedback('light');
        await this.selectionFeedback();
        break;
        
      case 'escalating-impact':
        await this.impactFeedback('light');
        await this.delay(150);
        await this.impactFeedback('medium');
        await this.delay(150);
        await this.impactFeedback('heavy');
        break;
        
      case 'descending-impact':
        await this.impactFeedback('heavy');
        await this.delay(150);
        await this.impactFeedback('medium');
        await this.delay(150);
        await this.impactFeedback('light');
        break;
        
      default:
        console.warn(`Unknown haptic pattern: ${pattern}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance with convenient methods
export const haptics = {
  // Basic haptic feedback
  impact: {
    light: () => HapticsManager.getInstance().impactFeedback('light'),
    medium: () => HapticsManager.getInstance().impactFeedback('medium'),
    heavy: () => HapticsManager.getInstance().impactFeedback('heavy'),
    soft: () => HapticsManager.getInstance().impactFeedback('soft'),
    rigid: () => HapticsManager.getInstance().impactFeedback('rigid'),
  },
  
  notification: {
    success: () => HapticsManager.getInstance().notificationFeedback('success'),
    warning: () => HapticsManager.getInstance().notificationFeedback('warning'),
    error: () => HapticsManager.getInstance().notificationFeedback('error'),
  },
  
  selection: () => HapticsManager.getInstance().selectionFeedback(),
  
  // Pattern-based feedback
  pattern: {
    success: () => HapticsManager.getInstance().patternFeedback('success-pattern'),
    error: () => HapticsManager.getInstance().patternFeedback('error-pattern'),
    warning: () => HapticsManager.getInstance().patternFeedback('warning-pattern'),
    doubleTap: () => HapticsManager.getInstance().patternFeedback('double-tap'),
    longPress: () => HapticsManager.getInstance().patternFeedback('long-press'),
    swipe: () => HapticsManager.getInstance().patternFeedback('swipe'),
    toggle: () => HapticsManager.getInstance().patternFeedback('toggle'),
    escalating: () => HapticsManager.getInstance().patternFeedback('escalating-impact'),
    descending: () => HapticsManager.getInstance().patternFeedback('descending-impact'),
  },
  
  // Control methods
  setEnabled: (enabled: boolean) => HapticsManager.getInstance().setEnabled(enabled),
};

// Haptic feedback for common UI actions
export const hapticActions = {
  // Button presses
  buttonPress: () => haptics.impact.light(),
  primaryButtonPress: () => haptics.impact.medium(),
  destructiveButtonPress: () => haptics.impact.heavy(),
  
  // Form interactions
  inputFocus: () => haptics.selection(),
  inputBlur: () => haptics.impact.light(),
  formSubmit: () => haptics.impact.medium(),
  
  // Navigation
  navigate: () => haptics.impact.light(),
  tabSwitch: () => haptics.selection(),
  modalOpen: () => haptics.impact.medium(),
  modalClose: () => haptics.impact.light(),
  
  // Status feedback
  success: () => haptics.notification.success(),
  error: () => haptics.notification.error(),
  warning: () => haptics.notification.warning(),
  
  // Bidding specific
  bidPlaced: () => haptics.pattern.success(),
  bidUpdated: () => haptics.impact.medium(),
  bidFailed: () => haptics.pattern.error(),
  outbid: () => haptics.pattern.warning(),
  
  // Claims specific
  claimStarted: () => haptics.impact.medium(),
  claimSuccess: () => haptics.pattern.success(),
  claimFailed: () => haptics.pattern.error(),
  
  // Social sharing
  shareInitiated: () => haptics.impact.medium(),
  shareSuccess: () => haptics.notification.success(),
  shareFailed: () => haptics.notification.error(),
  
  // Copy/paste
  copyToClipboard: () => haptics.notification.success(),
  
  // Toggle states
  toggleOn: () => haptics.pattern.toggle(),
  toggleOff: () => haptics.pattern.toggle(),
};

// React hook for haptics
import { useCallback } from 'react';

export function useHaptics() {
  const triggerHaptic = useCallback(async (
    action: keyof typeof hapticActions | (() => Promise<void>)
  ) => {
    try {
      if (typeof action === 'function') {
        await action();
      } else if (action in hapticActions) {
        await hapticActions[action]();
      }
    } catch (error) {
      console.error('Failed to trigger haptic:', error);
    }
  }, []);

  return {
    haptics,
    hapticActions,
    triggerHaptic,
  };
}