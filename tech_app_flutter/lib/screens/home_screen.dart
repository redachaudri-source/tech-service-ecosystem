import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:tech_app/services/auth_service.dart';
import 'package:tech_app/screens/ticket_detail_screen.dart';
import 'package:intl/intl.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with SingleTickerProviderStateMixin {
  final SupabaseClient _supabase = Supabase.instance.client;
  List<Map<String, dynamic>> _tickets = [];
  bool _loading = true;
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _fetchTickets();
  }

  Future<void> _fetchTickets() async {
    if (!mounted) return;
    setState(() => _loading = true);

    try {
      final userId = _supabase.auth.currentUser!.id;
      
      // Fetch tickets with Client Profile info
      final data = await _supabase
          .from('tickets')
          .select('*, profiles:client_id(full_name, address, phone)')
          .eq('technician_id', userId)
          .order('created_at', { 'ascending': false });

      if (mounted) {
        setState(() {
          _tickets = List<Map<String, dynamic>>.from(data);
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(
           SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  List<Map<String, dynamic>> get _activeTickets {
    return _tickets.where((t) => !['finalizado', 'pagado', 'cancelado'].contains(t['status'])).toList();
  }

  List<Map<String, dynamic>> get _historyTickets {
    return _tickets.where((t) => ['finalizado', 'pagado', 'cancelado'].contains(t['status'])).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[100],
      appBar: AppBar(
        title: const Text('Mis Servicios', style: TextStyle(fontWeight: FontWeight.bold)),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Activos', icon: Icon(LucideIcons.activity)),
            Tab(text: 'Historial', icon: Icon(LucideIcons.history)),
          ],
          labelColor: Colors.blueAccent,
          unselectedLabelColor: Colors.grey,
          indicatorColor: Colors.blueAccent,
        ),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.logOut),
            onPressed: () => Provider.of<AuthService>(context, listen: false).signOut(),
          ),
        ],
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildTicketList(_activeTickets, true),
          _buildTicketList(_historyTickets, false),
        ],
      ),
    );
  }

  Widget _buildTicketList(List<Map<String, dynamic>> tickets, bool isActive) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    
    if (tickets.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(isActive ? LucideIcons.checkSquare : LucideIcons.archive, size: 48, color: Colors.grey[300]),
            const SizedBox(height: 16),
            Text(
              isActive ? 'No tienes servicios pendientes' : 'No hay historial reciente',
              style: TextStyle(color: Colors.grey[500]),
            ),
            if (isActive)
              TextButton(onPressed: _fetchTickets, child: const Text('Actualizar'))
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _fetchTickets,
      child: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: tickets.length,
        itemBuilder: (context, index) {
          final ticket = tickets[index];
          final client = ticket['profiles'] ?? {};
          final status = ticket['status'] ?? 'unknown';
          
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            elevation: 2,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: InkWell(
              onTap: () {
                // Navigate to Detail
                Navigator.push(context, MaterialPageRoute(builder: (_) => TicketDetailScreen(ticket: ticket)));
              },
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: _getStatusColor(status).withOpacity(0.1),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: _getStatusColor(status).withOpacity(0.2)),
                          ),
                          child: Text(
                            status.toUpperCase().replaceAll('_', ' '),
                            style: TextStyle(
                              color: _getStatusColor(status),
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                            ),
                          ),
                        ),
                        Text(
                          DateFormat('dd/MM HH:mm').format(DateTime.parse(ticket['created_at'])),
                          style: TextStyle(color: Colors.grey[500], fontSize: 12),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      client['full_name'] ?? 'Cliente Desconocido',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(LucideIcons.mapPin, size: 14, color: Colors.grey),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            client['address'] ?? 'Sin dirección',
                            style: TextStyle(color: Colors.grey[600], fontSize: 14),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.grey[50],
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          const Icon(LucideIcons.wrench, size: 14, color: Colors.blueGrey),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              "${ticket['appliance_info']?['type'] ?? 'Aparato'} - ${ticket['description'] ?? 'Sin descripción'}",
                              style: const TextStyle(fontSize: 13, color: Colors.black87),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'solicitado': return Colors.orange;
      case 'asignado': return Colors.blue;
      case 'en_camino': return Colors.indigo;
      case 'en_diagnostico': return Colors.purple;
      case 'en_reparacion': return Colors.pink;
      case 'finalizado': return Colors.green;
      case 'pagado': return Colors.teal;
      default: return Colors.grey;
    }
  }
}
