import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/supabase_service.dart';

class PaymentScreen extends StatefulWidget {
  final String ticketId;
  const PaymentScreen({super.key, required this.ticketId});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  bool _loading = false;
  Map<String, dynamic>? _ticket;
  
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final service = Provider.of<ClientSupabaseService>(context, listen: false);
    final data = await service.getTicketDetails(widget.ticketId);
    if(mounted) setState(() => _ticket = data);
  }

  Future<void> _processPayment() async {
    setState(() => _loading = true);
    try {
       final service = Provider.of<ClientSupabaseService>(context, listen: false);
       await service.payTicket(widget.ticketId);
       await _load(); // Refresh status
       if(mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pago Exitoso!')));
    } catch(e) {
       if(mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally {
       if(mounted) setState(() => _loading = false);
    }
  }

  Future<void> _downloadInvoice() async {
     final service = Provider.of<ClientSupabaseService>(context, listen: false);
     final url = service.getInvoiceUrl(widget.ticketId);
     if (await canLaunchUrl(Uri.parse(url))) {
       await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
     } else {
       if(mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No se pudo abrir la factura')));
     }
  }

  @override
  Widget build(BuildContext context) {
    if (_ticket == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    
    final status = _ticket!['status'];
    final total = _ticket!['total_price'] ?? 0.0;

    return Scaffold(
      appBar: AppBar(title: const Text('Pagos y Facturación')),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.receipt_long, size: 60, color: Colors.blue),
            const SizedBox(height: 16),
            Text('Servicio #${_ticket!['ticket_number']}', 
              textAlign: TextAlign.center, style: const TextStyle(fontSize: 20)),
            const SizedBox(height: 32),
            
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  children: [
                    const Text('Total a Pagar', style: TextStyle(color: Colors.grey)),
                    Text('\$${total.toStringAsFixed(2)}', 
                      style: const TextStyle(fontSize: 40, fontWeight: FontWeight.bold, color: Colors.indigo)),
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 48),
            
            if (status == 'finalizado')
              ElevatedButton.icon(
                icon: const Icon(Icons.credit_card),
                label: _loading 
                   ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                   : const Text('PAGAR AHORA (Stripe)'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.indigo,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.all(20),
                ),
                onPressed: _loading ? null : _processPayment,
              )
            else if (status == 'pagado')
               Column(
                 children: [
                   const Text('¡Gracias por tu pago!', style: TextStyle(color: Colors.green, fontSize: 18, fontWeight: FontWeight.bold)),
                   const SizedBox(height: 24),
                   OutlinedButton.icon(
                     icon: const Icon(Icons.picture_as_pdf),
                     label: const Text('Descargar Factura & Garantía'),
                     onPressed: _downloadInvoice,
                     style: OutlinedButton.styleFrom(padding: const EdgeInsets.all(16)),
                   )
                 ],
               )
            else 
               const Text('El servicio aún no está listo para pago.', textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
