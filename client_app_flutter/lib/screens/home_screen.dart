import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/supabase_service.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final service = Provider.of<ClientSupabaseService>(context, listen: false);

    return Scaffold(
      appBar: AppBar(title: const Text('Mis Servicios')),
      body: Column(
        children: [
          // Header / Call to Action
          InkWell(
            onTap: () => Navigator.pushNamed(context, '/create_request'),
            child: Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Colors.indigo, Colors.blue]),
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Row(
                children: [
                   Icon(Icons.add_circle_outline, color: Colors.white, size: 40),
                   SizedBox(width: 16),
                   Text('Solicitar Nueva Reparación', 
                     style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          ),
          
          Expanded(
            child: StreamBuilder<List<Map<String, dynamic>>>(
              stream: service.getMyTicketsStream(),
              builder: (context, snapshot) {
                if (snapshot.hasError) return Text('Error: ${snapshot.error}');
                if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                
                final tickets = snapshot.data!;
                if (tickets.isEmpty) return const Center(child: Text('No tienes servicios activos.'));

                return ListView.builder(
                  itemCount: tickets.length,
                  itemBuilder: (context, index) {
                    final ticket = tickets[index];
                    final status = ticket['status'];
                    final isTrackable = status == 'en_camino';

                    return Card(
                      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      child: ListTile(
                        title: Text('#${ticket['ticket_number']} ${ticket['appliance_info']?['type'] ?? 'Equipo'}'),
                        subtitle: Text('Estado: $status'),
                        trailing: isTrackable 
                           ? ElevatedButton.icon(
                               icon: const Icon(Icons.map, size: 16),
                               label: const Text('Rastrear'),
                               style: ElevatedButton.styleFrom(
                                 backgroundColor: Colors.green, 
                                 foregroundColor: Colors.white
                               ),
                               onPressed: () {
                                 Navigator.pushNamed(context, '/tracking', 
                                   arguments: {'ticketId': ticket['id']});
                               },
                             )
                           : const Icon(Icons.arrow_forward_ios, size: 16),
                        onTap: () {
                          // View details / invoice...
                        },
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
