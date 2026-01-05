
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../services/supabase_service.dart';

class TrackingScreen extends StatefulWidget {
  final String ticketId;

  const TrackingScreen({super.key, required this.ticketId});

  @override
  State<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends State<TrackingScreen> {
  MapController _mapController = MapController();
  Map<String, dynamic>? _ticket;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _init();
  }

  void _init() async {
    final service = Provider.of<ClientSupabaseService>(context, listen: false);
    _ticket = await service.getTicketDetails(widget.ticketId);
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    
    final techId = _ticket?['technician_id'];
    if (techId == null) return const Scaffold(body: Center(child: Text('Técnico no asignado aún.')));

    final service = Provider.of<ClientSupabaseService>(context, listen: false);

    return Scaffold(
      appBar: AppBar(title: const Text('Tu Técnico viene en camino')),
      body: StreamBuilder<Map<String, dynamic>>(
        stream: service.getTechnicianLocationStream(techId),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return const Center(child: Text('Buscando señal del técnico...'));
          
          final techProfile = snapshot.data!;
          // Parse PostGIS or Lat/Lng columns
          final locString = techProfile['current_location'] as String?; // "POINT(-74.00 40.71)"
          LatLng? techPos;
          
          if (locString != null && locString.startsWith('POINT')) {
            final coords = locString.replaceAll('POINT(', '').replaceAll(')', '').split(' ');
            if (coords.length == 2) {
              final lng = double.parse(coords[0]);
              final lat = double.parse(coords[1]);
              techPos = LatLng(lat, lng);
            }
          }

          if (techPos == null) return const Center(child: Text('Ubicación del técnico desconocida.'));

          // Move map if needed (optional: only if far away or first load)
          // _mapController.move(techPos, 15);

          return FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: techPos,
              initialZoom: 15.0,
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.example.client_app',
              ),
              MarkerLayer(
                markers: [
                  Marker(
                    point: techPos,
                    width: 40,
                    height: 40,
                    child: const Icon(Icons.location_on, color: Colors.blue, size: 40),
                  ),
                  // Client marker (Self) - Hardcoded for demo
                  const Marker(
                    point: LatLng(40.7128, -74.0060),
                    width: 40,
                    height: 40,
                    child: Icon(Icons.person_pin_circle, color: Colors.green, size: 40),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}
