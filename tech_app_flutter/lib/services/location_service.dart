import 'dart:async';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LocationService {
  Timer? _timer;
  final SupabaseClient _client = Supabase.instance.client;
  bool _isTracking = false;

  bool get isTracking => _isTracking;

  // Start tracking location every 30 seconds
  Future<void> startTracking() async {
    if (_isTracking) return;
    
    // Request permission logic should be here (omitted for brevity)
    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    _isTracking = true;
    
    // Send initial location immediately
    _sendLocationUpdate();

    // Schedule periodic updates
    _timer = Timer.periodic(const Duration(seconds: 30), (timer) {
      _sendLocationUpdate();
    });
  }

  Future<void> _sendLocationUpdate() async {
    try {
      Position position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high
      );
      
      final userId = _client.auth.currentUser?.id;
      if (userId != null) {
        // PostGIS format for POINT(lng lat) usually, or simple update if using lat/lng columns.
        // Schema defined 'current_location geography(POINT)'.
        // Supabase supports PostGIS, we might insert as a ST_SetSRID... or via edge function.
        // For simplicity via client SDK, assuming we have a stored procedure or can pass strict WKT.
        // OR common pattern: separate lat/lng columns for easier client handling, 
        // but let's try WKT string for 'geography' type if supported by client: 'POINT(lng lat)'
        
        await _client.from('profiles').update({
          'current_location': 'POINT(${position.longitude} ${position.latitude})'
        }).eq('id', userId);
        
        print("Location updated: ${position.latitude}, ${position.longitude}");
      }
    } catch (e) {
      print("Error sending location: $e");
    }
  }

  void stopTracking() {
    _timer?.cancel();
    _isTracking = false;
  }
}
