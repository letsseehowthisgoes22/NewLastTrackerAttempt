# Google Maps API Key - Production Domain Fix

## Problem
The Google Maps autocomplete and map display aren't working on the production site (`compass.interactiveyouthtransport.com`) because the API key isn't authorized for that domain.

**Error in console:**
```
Google Maps JavaScript API error: RefererNotAllowedMapError
Your site URL to be authorized: https://compass.interactiveyouthtransport.com
```

## Solution

### Step 1: Access Google Cloud Console
1. Go to: https://console.cloud.google.com/
2. Select the project that contains your Google Maps API key
3. Navigate to: **APIs & Services** → **Credentials**

### Step 2: Edit the API Key
1. Find the API key: `AIzaSyApqAzsIpHvp2ekouOOm8NzM2elKfrvJzw`
2. Click on the API key to edit it
3. Scroll to **"Application restrictions"**
4. Make sure **"HTTP referrers (websites)"** is selected

### Step 3: Add Production Domain
In the **"Website restrictions"** section, add the following referrers:

**Current (should already be there for local dev):**
- `http://localhost:5173/*`

**Add this for production:**
- `https://compass.interactiveyouthtransport.com/*`

**Note:** The `/*` wildcard at the end allows the API key to work on all pages under that domain.

### Step 4: Verify API Restrictions
Under **"API restrictions"**, ensure these APIs are enabled:
- ✅ Maps JavaScript API
- ✅ Places API
- ✅ Geocoding API

### Step 5: Save
Click **"Save"** at the bottom. Changes take effect immediately (may take 1-2 minutes to propagate).

## Testing
1. Refresh the production site: `https://compass.interactiveyouthtransport.com`
2. Open browser console (F12)
3. The `RefererNotAllowedMapError` should be gone
4. Test autocomplete in the trip edit form
5. Test map display on trip detail pages

## Alternative: Use Localhost for Testing
If you need to test immediately while fixing production:
1. Run locally: `cd frontend && npm run dev`
2. Access: `http://localhost:5173`
3. The API key should work on localhost if it's already configured

## Current API Key
- **Key:** `AIzaSyApqAzsIpHvp2ekouOOm8NzM2elKfrvJzw`
- **Status:** Needs production domain added
- **Localhost:** Should work (if `http://localhost:5173/*` is in restrictions)
- **Production:** Currently blocked (needs `https://compass.interactiveyouthtransport.com/*`)

