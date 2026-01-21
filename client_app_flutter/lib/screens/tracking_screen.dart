import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/supabase_service.dart';
import '../constants.dart';

class TrackingScreen extends StatefulWidget {
  final String ticketId;

  const TrackingScreen({super.key, required this.ticketId});

  @override
  State<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends State<TrackingScreen>
    with SingleTickerProviderStateMixin {
  GoogleMapController? _mapController;
  late AnimationController _animController;

  // Position tracking
  LatLng? _currentTechPos;
  LatLng? _targetTechPos;
  double _currentHeading = 0;
  double _targetHeading = 0;

  // Ticket & Client data
  Map<String, dynamic>? _ticket;
  LatLng? _clientPos;
  String? _technicianName;
  String? _technicianPhone;

  // Route polyline
  List<LatLng> _routePoints = [];
  bool _loadingRoute = false;

  // View mode toggle
  bool _centerOnTech = true; // true = center on tech, false = center on client

  // Custom marker icons
  BitmapDescriptor? _vanIcon;
  BitmapDescriptor? _homeIcon;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    );
    _loadTicket();
    _loadCustomMarkers();
  }

  Future<void> _loadCustomMarkers() async {
    // For now, use default markers with custom colors
    // You can replace with custom assets later
    _vanIcon = await BitmapDescriptor.fromAssetImage(
      const ImageConfiguration(size: Size(48, 48)),
      'assets/van_icon.png', // Add this asset or use default
    ).catchError((_) => BitmapDescriptor.defaultMarkerWithHue(
          BitmapDescriptor.hueBlue,
        ));

    _homeIcon = BitmapDescriptor.defaultMarkerWithHue(
      BitmapDescriptor.hueGreen,
    );

    if (mounted) setState(() {});
  }

  Future<void> _loadTicket() async {
    final service = Provider.of<ClientSupabaseService>(context, listen: false);
    _ticket = await service.getTicketDetails(widget.ticketId);

    if (_ticket != null) {
      // Get client position from ticket
      // Assuming ticket has client_lat/client_lng or we can geocode the address
      final client = _ticket!['profiles'];
      _clientPos = LatLng(
        client?['latitude'] ?? 36.7213, // Default to Malaga if not available
        client?['longitude'] ?? -4.4214,
      );

      // Get technician info
      final techId = _ticket!['technician_id'];
      if (techId != null) {
        final techProfile = await service.getTechnicianProfile(techId);
        _technicianName = techProfile?['full_name'];
        _technicianPhone = techProfile?['phone'];
      }

      if (mounted) setState(() {});
    }
  }

  void _animateMarker(LatLng newPos, double newHeading) {
    if (_currentTechPos == null) {
      setState(() {
        _currentTechPos = newPos;
        _currentHeading = newHeading;
      });
      return;
    }

    _targetTechPos = newPos;
    _targetHeading = newHeading;

    final animation = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _animController, curve: Curves.easeInOut),
    );

    animation.addListener(() {
      if (!mounted) return;
      setState(() {
        _currentTechPos = LatLng(
          _currentTechPos!.latitude +
              (_targetTechPos!.latitude - _currentTechPos!.latitude) *
                  animation.value,
          _currentTechPos!.longitude +
              (_targetTechPos!.longitude - _currentTechPos!.longitude) *
                  animation.value,
        );
        // Smooth heading rotation
        _currentHeading = _currentHeading +
            (_targetHeading - _currentHeading) * animation.value;
      });

      // Auto-center map if in tech-centered mode
      if (_centerOnTech && _currentTechPos != null) {
        _mapController?.animateCamera(
          CameraUpdate.newLatLng(_currentTechPos!),
        );
      }
    });

    _animController.forward(from: 0);
  }

  Future<void> _fetchRoute() async {
    if (_currentTechPos == null || _clientPos == null || _loadingRoute) return;

    setState(() => _loadingRoute = true);

    try {
      final origin =
          '${_currentTechPos!.latitude},${_currentTechPos!.longitude}';
      final destination = '${_clientPos!.latitude},${_clientPos!.longitude}';

      final url = Uri.parse(
        'https://maps.googleapis.com/maps/api/directions/json?origin=$origin&destination=$destination&key=${AppConstants.googleMapsApiKey}',
      );

      final response = await http.get(url);
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['routes'].isNotEmpty) {
          final polylinePoints =
              data['routes'][0]['overview_polyline']['points'];
          _routePoints = _decodePolyline(polylinePoints);
        }
      }
    } catch (e) {
      debugPrint('Error fetching route: $e');
    } finally {
      if (mounted) setState(() => _loadingRoute = false);
    }
  }

  List<LatLng> _decodePolyline(String encoded) {
    List<LatLng> points = [];
    int index = 0, len = encoded.length;
    int lat = 0, lng = 0;

    while (index < len) {
      int b, shift = 0, result = 0;
      do {
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      int dlat = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      int dlng = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      points.add(LatLng(lat / 1E5, lng / 1E5));
    }
    return points;
  }

  void _toggleViewMode() {
    setState(() {
      _centerOnTech = !_centerOnTech;
    });

    // Animate to new center
    if (_centerOnTech && _currentTechPos != null) {
      _mapController?.animateCamera(
        CameraUpdate.newLatLngZoom(_currentTechPos!, 15),
      );
    } else if (!_centerOnTech && _clientPos != null) {
      _mapController?.animateCamera(
        CameraUpdate.newLatLngZoom(_clientPos!, 15),
      );
    }
  }

  Future<void> _callTechnician() async {
    if (_technicianPhone == null) return;
    final url = Uri.parse('tel:$_technicianPhone');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_ticket == null || _clientPos == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final techId = _ticket!['technician_id'];
    if (techId == null) {
      return const Scaffold(
        body: Center(child: Text('Técnico no asignado aún.')),
      );
    }

    final service = Provider.of<ClientSupabaseService>(context);

    return Scaffold(
      body: Stack(
        children: [
          // Google Map
          StreamBuilder<Map<String, dynamic>?>(
            stream: service.getTechnicianLocationStream(techId),
            builder: (context, snapshot) {
              if (snapshot.hasData && snapshot.data != null) {
                final loc = snapshot.data!;
                final newPos = LatLng(loc['latitude'], loc['longitude']);
                final heading = (loc['heading'] ?? 0.0).toDouble();

                _animateMarker(newPos, heading);

                // Fetch route on first position or every 30 seconds
                if (_routePoints.isEmpty) {
                  _fetchRoute();
                }
              }

              return GoogleMap(
                initialCameraPosition: CameraPosition(
                  target: _clientPos!,
                  zoom: 14,
                ),
                onMapCreated: (controller) {
                  _mapController = controller;
                },
                myLocationButtonEnabled: false,
                zoomControlsEnabled: false,
                markers: {
                  // Client marker (home)
                  Marker(
                    markerId: const MarkerId('client'),
                    position: _clientPos!,
                    icon: _homeIcon ?? BitmapDescriptor.defaultMarker,
                    infoWindow: const InfoWindow(title: 'Tu ubicación'),
                  ),
                  // Technician marker (van)
                  if (_currentTechPos != null)
                    Marker(
                      markerId: const MarkerId('tech'),
                      position: _currentTechPos!,
                      icon: _vanIcon ?? BitmapDescriptor.defaultMarker,
                      rotation: _currentHeading,
                      anchor: const Offset(0.5, 0.5),
                      infoWindow: InfoWindow(
                        title: _technicianName ?? 'Técnico',
                      ),
                    ),
                },
                polylines: {
                  if (_routePoints.isNotEmpty)
                    Polyline(
                      polylineId: const PolylineId('route'),
                      points: _routePoints,
                      color: Colors.blue,
                      width: 4,
                    ),
                },
              );
            },
          ),

          // Top Info Card
          Positioned(
            top: 50,
            left: 16,
            right: 16,
            child: _buildInfoCard(),
          ),

          // View Toggle Button
          Positioned(
            bottom: 100,
            right: 16,
            child: FloatingActionButton(
              heroTag: 'toggle_view',
              onPressed: _toggleViewMode,
              backgroundColor: Colors.white,
              child: Icon(
                _centerOnTech ? Icons.home : Icons.local_shipping,
                color: Colors.blue,
              ),
            ),
          ),

          // Call Button
          if (_technicianPhone != null)
            Positioned(
              bottom: 30,
              right: 16,
              child: FloatingActionButton.extended(
                heroTag: 'call_tech',
                onPressed: _callTechnician,
                backgroundColor: Colors.green,
                icon: const Icon(Icons.phone),
                label: const Text('Llamar'),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildInfoCard() {
    return Card(
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const CircleAvatar(
                  backgroundColor: Colors.blue,
                  child: Icon(Icons.person, color: Colors.white),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _technicianName ?? 'Técnico',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const Text(
                        'Tu técnico viene en camino',
                        style: TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.blue[50],
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.access_time, size: 16, color: Colors.blue),
                  const SizedBox(width: 8),
                  Text(
                    'Llegará pronto',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: Colors.blue[700],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _animController.dispose();
    _mapController?.dispose();
    super.dispose();
  }
}
