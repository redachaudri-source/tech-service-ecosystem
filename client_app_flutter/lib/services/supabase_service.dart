import 'dart:io';
import 'package:supabase_flutter/supabase_flutter.dart';

class ClientSupabaseService {
  final SupabaseClient _client = Supabase.instance.client;

  // Sign In
  Future<void> signIn(String email, String password) async {
    await _client.auth.signInWithPassword(email: email, password: password);
  }
  
  Future<void> signOut() async {
    await _client.auth.signOut();
  }

  // Create Ticket
  Future<void> createTicket(String applianceType, String description, File? photo, double lat, double lng) async {
    final userId = _client.auth.currentUser!.id;
    
    // 1. Upload photo if exists
    // String? photoUrl;
    // if (photo != null) ... logic to upload ... (omitted for brevity)

    // 2. Insert Ticket
    await _client.from('tickets').insert({
      'client_id': userId,
      'appliance_info': {'type': applianceType},
      'description_failure': description,
      // 'photo_url': photoUrl,
      'status': 'solicitado',
      // Store location in profile or ticket? Usually client location is profile address, 
      // but for this specific request we might want a 'service_location' column in tickets.
      // For now, let's assume we update the profile address or location.
      // 'location': ...
    });
  }

  // Get My Active Tickets
  Stream<List<Map<String, dynamic>>> getMyTicketsStream() {
    final userId = _client.auth.currentUser!.id;
    return _client
        .from('tickets')
        .stream(primaryKey: ['id'])
        .eq('client_id', userId)
        .order('created_at', ascending: false);
  }

  // Get Ticket Context for Tracking (Tech location)
  // We need to listen to the Technician's Profile to get their location updates.
  Stream<Map<String, dynamic>> getTechnicianLocationStream(String technicianId) {
    return _client
        .from('profiles')
        .stream(primaryKey: ['id'])
        .eq('id', technicianId)
        .map((event) => event.first); // Return the single technician profile
  }
  
  Future<Map<String, dynamic>> getTicketDetails(String ticketId) async {
      return await _client.from('tickets').select().eq('id', ticketId).single();
  }

  // --- Payments & Documents ---

  // Mock Payment Process
  Future<void> payTicket(String ticketId) async {
    // 1. Simulate Payment Gateway (Stripe/MercadoPago)
    await Future.delayed(const Duration(seconds: 2));

    // 2. Update Status to 'pagado'
    await _client.from('tickets').update({
      'status': 'pagado',
    }).eq('id', ticketId);

    // 3. Trigger Invoice Generation (Call Edge Function)
    // await _client.functions.invoke('generate-invoice', body: {'ticketId': ticketId});
  }

  String getInvoiceUrl(String ticketId) {
    // Assuming the Edge Function saves it to specific path
    return _client.storage.from('invoices').getPublicUrl('$ticketId.pdf');
  }
}
