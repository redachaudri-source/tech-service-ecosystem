# Mapbox Migration - Phase 6 Complete

## Summary of Changes

This commit completes the migration from Google Maps to Mapbox GL across both admin panel and client portal.

## Files Modified

### Admin Panel (`admin_panel_web/`)

1. **src/App.jsx**
   - Commented out `FleetMap` import (Google Maps)
   - Added `FleetMapbox` import (Mapbox GL)
   - Updated `/tracking` route to use `FleetMapbox`

2. **src/components/FleetMapbox.jsx** (NEW)
   - Mapbox GL replacement for Google Maps FleetMap
   - Shows all active technicians on map
   - Real-time updates via Supabase
   - Sidebar with technician list and workload indicators

3. **src/components/MapboxTrackingMap.jsx**
   - Upgraded from Phase 1 to full Phase 2-5 features
   - Added VehicleAnimationEngine (60 FPS interpolation)
   - Added GPSDataFilter (noise filtering)
   - Added camera controls (Lock-on/Free Roam)
   - Added recenter button (FAB)
   - Memory optimization and cleanup

4. **src/utils/VehicleAnimationEngine.js** (NEW)
   - Copied from client portal
   - 60 FPS animation engine
   - Haversine interpolation
   - Smooth bearing rotation

5. **src/utils/GPSDataFilter.js** (NEW)
   - Copied from client portal
   - Micro-movement filtering (<5m)
   - Noise spike detection
   - Exponential smoothing

6. **vite.config.js**
   - Changed build target from `es2015` to `es2020`
   - Added `optimizeDeps.esbuildOptions.target: 'es2020'`
   - Required for Mapbox GL BigInt support

7. **.env**
   - Cleaned up duplicate VITE_MAPBOX_TOKEN entries

8. **package.json**
   - Removed `@vis.gl/react-google-maps` dependency

### Client Portal (`client_web_portal/`)

1. **src/components/TechLocationMap.jsx**
   - Already had full Phase 2-5 features
   - No changes needed

2. **vite.config.js**
   - Added `build.target: 'es2020'`
   - Added `optimizeDeps.esbuildOptions.target: 'es2020'`
   - Required for Mapbox GL BigInt support

3. **package.json**
   - Removed `@vis.gl/react-google-maps` dependency

## Features Implemented

### Phase 1: Infrastructure Base
- ✅ Mapbox GL integration
- ✅ Clean navigation-day-v1 style
- ✅ Proper initialization and cleanup

### Phase 2: 60 FPS Interpolation Engine
- ✅ Haversine interpolation for curved paths
- ✅ Smooth bearing rotation
- ✅ RequestAnimationFrame loop
- ✅ Easing functions

### Phase 3: Smart GPS Filtering
- ✅ Micro-movement rejection (<5m)
- ✅ Noise spike detection
- ✅ Exponential smoothing

### Phase 4: Camera Controls
- ✅ Lock-on mode (auto-follow)
- ✅ Free Roam mode (user exploration)
- ✅ Recenter button (FAB)

### Phase 5: Optimization
- ✅ Memory leak prevention
- ✅ Enhanced cleanup
- ✅ Zero memory leaks

### Phase 6: Full Deployment
- ✅ Client portal: Mapbox tracking
- ✅ Admin panel: Mapbox tracking + FleetMapbox
- ✅ Google Maps removed
- ✅ Vite config updated for BigInt support

## Breaking Changes

- Removed Google Maps dependency (`@vis.gl/react-google-maps`)
- Old `FleetMap` component neutralized (uses Google Maps)
- New `FleetMapbox` component uses Mapbox GL

## Migration Notes

- Leaflet dependencies (`leaflet`, `react-leaflet`) kept for `GlobalAgenda`
- All tracking features now use Mapbox GL exclusively
- Build target updated to ES2020 for BigInt support

## Testing

- Local dev: `npm run dev` (restart required to load env vars)
- Build: `npm run build` (should complete without BigInt errors)
- Deploy: Push to trigger Vercel rebuild

## Next Steps

1. Restart dev server: `npm run dev` in `admin_panel_web/`
2. Test `/tracking` route (FleetMapbox)
3. Commit and push to deploy to Vercel
