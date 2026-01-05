import 'dart:io';
import 'dart:convert';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SupabaseService {
  final SupabaseClient _client = Supabase.instance.client;

  SupabaseClient get client => _client;

  // --- Auth ---

  // Sign In
  Future<void> signIn(String email, String password) async {
    await _client.auth.signInWithPassword(email: email, password: password);
  }

  // Sign Out
  Future<void> signOut() async {
    await _client.auth.signOut();
  }

  // Get Assigned Tickets
  // Status logic: 'solicitado' might be the initial state, but if assigned to tech, it implies it's theirs.
  // We filter by technician_id = current_user.id
  Stream<List<Map<String, dynamic>>> getAssignedTicketsStream() {
    final userId = _client.auth.currentUser!.id;
    return _client
        .from('tickets')
        .stream(primaryKey: ['id'])
        .eq('technician_id', userId)
        .order('created_at', ascending: false)
        .map((data) => data); // Supabase SDK returns List<Map<String, dynamic>>
  }

  // Get Ticket Details with Offline Support
  Future<Map<String, dynamic>> getTicketDetails(String ticketId) async {
    try {
      final response = await _client
          .from('tickets')
          .select('*, profiles:client_id(full_name, address, phone)') 
          .eq('id', ticketId)
          .single();
          
      // Cache it
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('cached_ticket_$ticketId', jsonEncode(response));
      
      return response;
    } catch (e) {
      // Try to load from cache
      final prefs = await SharedPreferences.getInstance();
      final String? cached = prefs.getString('cached_ticket_$ticketId');
      if (cached != null) {
        return jsonDecode(cached) as Map<String, dynamic>;
      }
      rethrow; // No cache, throw original error
    }
  }

  // Update Ticket Status
  Future<void> updateTicketStatus(String ticketId, String newStatus) async {
    await _client.from('tickets').update({'status': newStatus}).eq('id', ticketId);
  }

  // --- Inventory & Parts ---

  // Search Inventory
  Future<List<Map<String, dynamic>>> searchInventory(String query) async {
    return await _client
        .from('inventory')
        .select()
        .ilike('name', '%$query%')
        .gt('stock_quantity', 0) // Only available items
        .limit(20);
  }

  // Add Part to Ticket (Transaction-like)
  Future<void> addPartToTicket(String ticketId, Map<String, dynamic> part, int quantity) async {
    final double price = (part['sale_price'] as num).toDouble();
    final double totalPartPrice = price * quantity;

    // 1. Add to service_parts
    await _client.from('service_parts').insert({
      'ticket_id': ticketId,
      'inventory_id': part['id'],
      'quantity': quantity,
      'unit_price_at_time': price,
    });

    // 2. Decrement Stock (Optimistic/Simple update for MVP)
    // Ideally use an RPC for atomicity
    final currentStock = part['stock_quantity'] as int;
    await _client.from('inventory').update({
      'stock_quantity': currentStock - quantity
    }).eq('id', part['id']);

    // 3. Update Ticket Total
    // Fetch current totals first to be safe, or use Postgres increment if possible via RPC.
    // Doing a simple fetch-update here.
    final ticket = await _client.from('tickets').select('parts_total, total_price').eq('id', ticketId).single();
    final double currentParts = (ticket['parts_total'] as num).toDouble();
    final double currentTotal = (ticket['total_price'] as num).toDouble();

    await _client.from('tickets').update({
      'parts_total': currentParts + totalPartPrice,
      'total_price': currentTotal + totalPartPrice
    }).eq('id', ticketId);
  }

  // Get Ticket Parts
  Future<List<Map<String, dynamic>>> getTicketParts(String ticketId) async {
    return await _client
        .from('service_parts')
        .select('*, inventory(name, sku)')
        .eq('ticket_id', ticketId);
  }

  // --- Files & Closing ---

  // Upload Photo
  Future<String> uploadEvidence(String ticketId, File file, String type) async {
    // type: 'before' or 'after'
    final fileName = '${ticketId}_${type}_${DateTime.now().millisecondsSinceEpoch}.jpg';
    final path = 'evidence/$fileName';
    
    await _client.storage.from('service_bucket').upload(path, file);
    return _client.storage.from('service_bucket').getPublicUrl(path);
  }

  // Upload Signature
  Future<String> uploadSignature(String ticketId, List<int> bytes) async {
    final fileName = '${ticketId}_signature_${DateTime.now().millisecondsSinceEpoch}.png';
    final path = 'signatures/$fileName';
    
    await _client.storage.from('service_bucket').uploadBinary(path, bytes);
    return _client.storage.from('service_bucket').getPublicUrl(path);
  }

  // Close Ticket
  Future<void> closeTicket(String ticketId, double finalTotal, String signatureUrl) async {
    // Here we might trigger the Warranty creation via Database Trigger or Edge Function
    await _client.from('tickets').update({
      'status': 'finalizado',
      'total_price': finalTotal,
      'completed_at': DateTime.now().toIso8601String(),
      // 'signature_url': signatureUrl, // Assuming we add this column or store in metadata/notes
    }).eq('id', ticketId);
  }
}
