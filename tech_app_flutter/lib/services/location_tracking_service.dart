import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LocationTrackingService {
  final SupabaseClient _supabase = Supabase.instance.client;
  StreamSubscription<Position>? _positionStream;
  bool _isTracking = false;

  bool get isTracking => _isTracking;

  /// Start tracking location and send updates to Supabase
  Future<void> startTracking() async {
    if (_isTracking) {
      debugPrint('⚠️ Location tracking already active');
      return;
    }

    // 1. Check permissions
    final permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      final requested = await Geolocator.requestPermission();
      if (requested == LocationPermission.denied ||
          requested == LocationPermission.deniedForever) {
        debugPrint('❌ Location permission denied');
        return;
      }
    }

    // 2. Check if location services are enabled
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      debugPrint('❌ Location services are disabled');
      return;
    }

    // 3. Start position stream
    const locationSettings = LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10, // Update every 10 meters
      timeLimit: Duration(seconds: 10), // Or every 10 seconds
    );

    _positionStream = Geolocator.getPositionStream(
      locationSettings: locationSettings,
    ).listen(
      (Position position) async {
        await _sendLocationUpdate(position);
      },
      onError: (error) {
        debugPrint('❌ Location stream error: $error');
      },
    );

    _isTracking = true;
    debugPrint('✅ Location tracking started');
  }

  /// Send location update to Supabase
  Future<void> _sendLocationUpdate(Position position) async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) {
        debugPrint('⚠️ No authenticated user, skipping location update');
        return;
      }

      await _supabase.from('technician_locations').upsert({
        'technician_id': userId,
        'latitude': position.latitude,
        'longitude': position.longitude,
        'heading': position.heading,
        'speed': position.speed,
        'updated_at': DateTime.now().toIso8601String(),
      });

      debugPrint(
          '📍 Location updated: ${position.latitude}, ${position.longitude} | Heading: ${position.heading}° | Speed: ${position.speed} m/s');
    } catch (e) {
      debugPrint('❌ Error sending location update: $e');
    }
  }

  /// Stop tracking location
  void stopTracking() {
    _positionStream?.cancel();
    _positionStream = null;
    _isTracking = false;
    debugPrint('🛑 Location tracking stopped');
  }

  /// Dispose resources
  void dispose() {
    stopTracking();
  }
}
