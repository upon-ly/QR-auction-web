# Popup Control Documentation

## Overview

All popups in the QR-auction-web application can be controlled through a central configuration file located at `/lib/popup-config.ts`.

## Configuration

The popup configuration file (`/lib/popup-config.ts`) contains the following settings:

```typescript
export const POPUP_CONFIG = {
  // Master switch to disable all popups
  DISABLE_ALL_POPUPS: true,
  
  // Individual popup controls (only effective if DISABLE_ALL_POPUPS is false)
  DISABLE_LINK_VISIT_POPUP: false,
  DISABLE_AIRDROP_POPUP: false,
  DISABLE_LIKES_RECASTS_POPUP: false,
};
```

## How to Control Popups

### Disable All Popups
To disable all popups at once, set `DISABLE_ALL_POPUPS` to `true`:
```typescript
DISABLE_ALL_POPUPS: true,
```

### Enable All Popups
To enable all popups, set `DISABLE_ALL_POPUPS` to `false`:
```typescript
DISABLE_ALL_POPUPS: false,
```

### Control Individual Popups
When `DISABLE_ALL_POPUPS` is set to `false`, you can control individual popups:

- **Link Visit Popup**: Controls the token claim popup for visiting winning URLs
  ```typescript
  DISABLE_LINK_VISIT_POPUP: true, // to disable
  ```

- **Airdrop Popup**: Controls the airdrop claim popup
  ```typescript
  DISABLE_AIRDROP_POPUP: true, // to disable
  ```

- **Likes/Recasts Popup**: Controls the social engagement rewards popup
  ```typescript
  DISABLE_LIKES_RECASTS_POPUP: true, // to disable
  ```

## Implementation Details

The popup system uses:
1. A central `PopupCoordinator` that manages popup priority and display order
2. Individual providers (`LinkVisitProvider`, `AirdropProvider`, `LikesRecastsProvider`) that check the configuration before rendering popups
3. The configuration is imported and checked before any popup is displayed

## Affected Components

The following components are affected by the popup configuration:
- `LinkVisitClaimPopup` - Token claim popup for visiting winning URLs
- `AirdropClaimPopup` - Airdrop claim popup
- `LikesRecastsClaimPopup` - Social engagement rewards popup

Note: Dialog components like `ThemeDialog`, `SafetyDialog`, and `HowItWorksDialog` are not affected by this configuration as they are user-triggered UI elements, not automatic popups.