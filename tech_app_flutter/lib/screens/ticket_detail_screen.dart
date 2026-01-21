import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/location_tracking_service.dart';

class TicketDetailScreen extends StatefulWidget {
  final Map<String, dynamic> ticket;

  const TicketDetailScreen({super.key, required this.ticket});

  @override
  State<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends State<TicketDetailScreen> {
  final SupabaseClient _supabase = Supabase.instance.client;
  final LocationTrackingService _locationService = LocationTrackingService();
  late String _status;
  bool _updating = false;

  @override
  void initState() {
    super.initState();
    _status = widget.ticket['status'] ?? 'unknown';
    _checkPermissions();
    
    // Start GPS tracking if status is 'en_camino'
    if (_status == 'en_camino') {
      _locationService.startTracking();
    }
  }

  @override
  void dispose() {
    _locationService.dispose();
    super.dispose();
  }

  Future<void> _refreshData() async {
     await _checkPermissions();
     setState(() {});
  }

  bool _canWork = true;
  bool _loadingPerms = true;
  bool _debugBypassStatus = false;

  Future<void> _checkPermissions() async {
    // 1. Get Bypass Status
    bool bypass = false;
    try {
      final user = _supabase.auth.currentUser;
      if (user != null) {
        final data = await _supabase
            .from('profiles')
            .select('bypass_time_restrictions')
            .eq('id', user.id)
            .single();
        bypass = data['bypass_time_restrictions'] ?? false;
      }
    } catch (e) {
      debugPrint('Error fetch bypass: $e');
    }

    bool canWork = true;
    final now = DateTime.now();

    // 2. Check Business Hours (08:00 - 20:00)
    if (now.hour < 8 || now.hour >= 20) {
      canWork = false;
    }

    // 3. Check Appointment Time (60 min rule)
    final scheduledStr = widget.ticket['scheduled_date'];
    if (scheduledStr != null) {
      try {
        final scheduled = DateTime.parse(scheduledStr); // Assumes ISO8601
        final diffMinutes = scheduled.difference(now).inMinutes;
        
        // If appointment is more than 60 mins away -> BLOCK
        if (diffMinutes > 60) {
           canWork = false;
        }
      } catch (e) {
        debugPrint('Error parsing date: $e');
      }
    }

    // 4. Apply Bypass Override
    if (bypass) canWork = true;

    if (mounted) {
      setState(() {
        _canWork = canWork;
        _loadingPerms = false;
        _debugBypassStatus = bypass;
      });
    }
  }

  Future<void> _updateStatus(String newStatus) async {
    setState(() => _updating = true);
    try {
      await _supabase
          .from('tickets')
          .update({'status': newStatus})
          .eq('id', widget.ticket['id']);

      if (mounted) {
        setState(() {
          _status = newStatus;
          _updating = false;
        });
        
        // Manage GPS tracking based on status
        if (newStatus == 'en_camino') {
          _locationService.startTracking();
        } else if (_status == 'en_camino' && newStatus != 'en_camino') {
          _locationService.stopTracking();
        }
        
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Estado actualizado'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _updating = false);
        ScaffoldMessenger.of(context).showSnackBar(
           SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _launchMaps(String address) async {
    // Open Google Maps or Apple Maps or OSM via intent
    final query = Uri.encodeComponent(address);
    final url = Uri.parse("https://www.google.com/maps/search/?api=1&query=$query");
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } else {
       ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se puede abrir el mapa')),
       );
    }
  }

  Future<void> _callClient(String phone) async {
    final url = Uri.parse("tel:$phone");
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.ticket;
    final client = t['profiles'] ?? {};
    final appliance = t['appliance_info'] ?? {};

    return Scaffold(
      appBar: AppBar(
        title: Text('Servicio #${t['ticket_number'] ?? '...'}'),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.refreshCw),
            onPressed: () {
               _refreshData();
               ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Actualizando permisos y datos...')));
            },
          )
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refreshData,
        child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(), // Ensure scroll works for refresh
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // DEBUG CONTROLS (REMOVE IN PROD)
            Container(
              margin: const EdgeInsets.only(bottom: 16),
              padding: const EdgeInsets.all(8),
              color: Colors.deepOrangeAccent, // Changed to Orange
              child: Row(
                children: [
                   const Expanded(child: Text('VERSIÓN V2 DETECTADA. SI VES ESTO, YA TIENES LA ACTUALIZACIÓN.', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white))),
                   TextButton.icon(
                     onPressed: _refreshData,
                     icon: const Icon(LucideIcons.refreshCw, size: 14, color: Colors.white),
                     label: const Text('RECARGAR', style: TextStyle(color: Colors.white)),
                     style: TextButton.styleFrom(backgroundColor: Colors.black),
                   )
                ],
              ),
            ),
            // Status Card
            Container(
              padding: const EdgeInsets.all(16),
              width: double.infinity,
              decoration: BoxDecoration(
                color: Colors.blue[50],
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.blue[200]!),
              ),
              child: Column(
                children: [
                  const Text('ESTADO ACTUAL', style: TextStyle(color: Colors.blueGrey, fontSize: 12, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Text(
                    _status.toUpperCase().replaceAll('_', ' '),
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Colors.blueAccent),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            
            // GPS Tracking Indicator
            if (_status == 'en_camino' && _locationService.isTracking)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.green[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.green[200]!),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: Colors.green,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Text(
                      '📡 Ubicación compartida con el cliente',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: Colors.green,
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 24),

            // Setup Workflow Buttons
            _buildStatusActions(),

            const SizedBox(height: 24),

            // Client Info
            const Text('CLIENTE', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.grey)),
            const SizedBox(height: 8),
            Card(
              elevation: 0,
              color: Colors.white,
              shape: RoundedRectangleBorder(
                  side: BorderSide(color: Colors.grey[200]!),
                  borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const CircleAvatar(child: Icon(LucideIcons.user)),
                      title: Text(client['full_name'] ?? 'N/A', style: const TextStyle(fontWeight: FontWeight.bold)),
                      subtitle: const Text('Cliente Particular'),
                    ),
                    const Divider(),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(LucideIcons.mapPin, color: Colors.redAccent),
                      title: Text(client['address'] ?? 'Sin dirección'),
                      trailing: IconButton(
                        icon: const Icon(LucideIcons.navigation, color: Colors.blue),
                        onPressed: () => _launchMaps(client['address'] ?? ''),
                      ),
                    ),
                    if (client['phone'] != null)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(LucideIcons.phone, color: Colors.green),
                        title: Text(client['phone']),
                        trailing: IconButton(
                          icon: const Icon(LucideIcons.phoneCall, color: Colors.green),
                          onPressed: () => _callClient(client['phone']),
                        ),
                      ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 24),

             // Appliance Info
            const Text('APARATO', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.grey)),
            const SizedBox(height: 8),
             Card(
              elevation: 0,
              color: Colors.white,
               shape: RoundedRectangleBorder(
                  side: BorderSide(color: Colors.grey[200]!),
                  borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                       children: [
                         const Icon(LucideIcons.washingMachine, size: 20, color: Colors.orange), // Generic icon
                         const SizedBox(width: 8),
                         Text(appliance['type'] ?? 'Electrodoméstico', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                       ],
                    ),
                    const SizedBox(height: 8),
                    Text('Marca: ${appliance['brand'] ?? 'N/A'}'),
                    Text('Modelo: ${appliance['model'] ?? 'N/A'}'),
                    Text('Serial: ${appliance['serial'] ?? 'N/A'}'),
                    const SizedBox(height: 12),
                    const Text('Síntoma / Avería:', style: TextStyle(fontWeight: FontWeight.bold)),
                     Text(t['description'] ?? 'Sin detalles', style: const TextStyle(color: Colors.black87)),
                  ],
                ),
              ),
             ),
             
             const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusActions() {
    if (_updating) return const Center(child: CircularProgressIndicator());

    // Simple Workflow State Machine
    List<Widget> buttons = [];

    switch (_status) {
      case 'asignado':
        // CHECK RESTRICTION ON START
        if (_loadingPerms) {
           buttons.add(const Center(child: CircularProgressIndicator()));
        } else if (!_canWork) {
           buttons.add(
             Container(
               padding: const EdgeInsets.all(12),
               decoration: BoxDecoration(color: Colors.grey[200], borderRadius: BorderRadius.circular(8)),
               child: Row(children: const [
                 Icon(LucideIcons.lock, color: Colors.grey),
                 SizedBox(width: 8),
                 Expanded(child: Text('Bloqueado: Cita lejana o fuera de horario. (Modo Test: ${_debugBypassStatus ? "ACTIVO" : "INACTIVO"}). Recarga si acabas de activarlo.', style: TextStyle(color: Colors.grey, fontSize: 12)))
               ]),
             )
           );
           buttons.add(const SizedBox(height: 8));
           buttons.add(_actionButton('Iniciar Viaje (Bloqueado)', 'en_camino', Colors.grey, enabled: false));
        } else {
           buttons.add(_actionButton('Iniciar Viaje (En Camino)', 'en_camino', Colors.indigo));
        }
        break;
      case 'en_camino':
        buttons.add(_actionButton('Llegada (Diagnóstico)', 'en_diagnostico', Colors.purple));
        break;
      case 'en_diagnostico':
        buttons.add(_actionButton('Iniciar Reparación', 'en_reparacion', Colors.orange));
        break;
      case 'en_reparacion':
        buttons.add(_actionButton('Finalizar Servicio', 'finalizado', Colors.green));
        // Add ASWO Search Button during repair
        buttons.add(const SizedBox(height: 12));
        buttons.add(_aswoButton());
        break;
      case 'finalizado':
        return const Center(child: Text('Servicio Finalizado ✅', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.green)));
    }

    if (buttons.isEmpty && !['finalizado', 'pagado', 'cancelado'].contains(_status)) {
       // Fallback for weird states
       buttons.add(_actionButton('Iniciar Viaje', 'en_camino', Colors.indigo));
    }

    return Column(children: buttons);
  }

  Widget _aswoButton() {
    final appliance = widget.ticket['appliance_info'] ?? {};
    final model = appliance['model'] ?? '';

    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        icon: const Icon(LucideIcons.search),
        label: const Text('Buscar Piezas (ASWO)'),
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 16),
          side: const BorderSide(color: Colors.blueGrey),
          foregroundColor: Colors.blueGrey,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))
        ),
        onPressed: () async {
          // Copy to clipboard
          if (model.isNotEmpty) {
            await Clipboard.setData(ClipboardData(text: model));
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Modelo "$model" copiado al portapapeles'), duration: const Duration(seconds: 2)),
              );
            }
          } else {
             if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('No hay modelo registrado para copiar')),
              );
            }
          }
          
          // Launch ASWO
          final url = Uri.parse("https://shop.aswo.com/");
          if (await canLaunchUrl(url)) {
            await launchUrl(url, mode: LaunchMode.externalApplication);
          }
        },
      ),
    );
  }

  Widget _actionButton(String label, String nextStatus, Color color, {bool enabled = true}) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        icon: Icon(enabled ? LucideIcons.arrowRightCircle : LucideIcons.lock),
        label: Text(label),
        style: ElevatedButton.styleFrom(
          backgroundColor: color, 
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))
        ),
        onPressed: enabled ? () => _updateStatus(nextStatus) : null,
      ),
    );
  }
}
