import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../services/supabase_service.dart';

class CreateRequestScreen extends StatefulWidget {
  const CreateRequestScreen({super.key});

  @override
  State<CreateRequestScreen> createState() => _CreateRequestScreenState();
}

class _CreateRequestScreenState extends State<CreateRequestScreen> {
  int _step = 0;
  String? _selectedAppliance;
  final _descCtrl = TextEditingController();
  File? _image;
  bool _loading = false;

  final List<String> _appliances = ['Lavadora', 'Refrigerador', 'Aire Acondicionado', 'TV', 'Microondas'];

  Future<void> _pickImage() async {
    final xfile = await ImagePicker().pickImage(source: ImageSource.camera);
    if (xfile != null) setState(() => _image = File(xfile.path));
  }

  Future<void> _submit() async {
    setState(() => _loading = true);
    try {
      // Mock location for now:
      await Provider.of<ClientSupabaseService>(context, listen: false).createTicket(
        _selectedAppliance!,
        _descCtrl.text,
        _image,
        0.0, 0.0 // Lat, Lng
      );
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Solicitud Enviada!')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nueva Solicitud')),
      body: Stepper(
        currentStep: _step,
        onStepContinue: () {
          if (_step < 2) setState(() => _step++);
          else _submit();
        },
        onStepCancel: () {
           if (_step > 0) setState(() => _step--);
        },
        controlsBuilder: (context, details) {
           return Padding(
             padding: const EdgeInsets.only(top: 20),
             child: Row(children: [
               Expanded(child: ElevatedButton(onPressed: details.onStepContinue, child: Text(_step == 2 ? 'CONFIRMAR' : 'SIGUIENTE'))),
               if (_step > 0) const SizedBox(width: 10),
               if (_step > 0) Expanded(child: TextButton(onPressed: details.onStepCancel, child: const Text('ATRÁS'))),
             ]),
           );
        },
        steps: [
          Step(
            title: const Text('Tipo de Equipo'),
            content: DropdownButton<String>(
              value: _selectedAppliance,
              hint: const Text('Selecciona...'),
              isExpanded: true,
              items: _appliances.map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
              onChanged: (v) => setState(() => _selectedAppliance = v),
            ),
            isActive: _step >= 0,
          ),
          Step(
            title: const Text('Detalles de la Falla'),
            content: Column(
              children: [
                TextField(
                  controller: _descCtrl, 
                  maxLines: 3, 
                  decoration: const InputDecoration(labelText: 'Describe qué sucede', border: OutlineInputBorder())
                ),
                const SizedBox(height: 10),
                ListTile(
                  leading: const Icon(Icons.camera_alt),
                  title: const Text('Adjuntar Foto (Opcional)'),
                  subtitle: _image != null ? Text('Imagen seleccionada') : null,
                  onTap: _pickImage,
                )
              ],
            ),
            isActive: _step >= 1,
          ),
          Step(
            title: const Text('Ubicación'),
            content: const Column(
              children: [
                Icon(Icons.location_on, size: 50, color: Colors.red),
                Text('Usaremos tu ubicación GPS actual para enviar al técnico.'),
              ],
            ),
            isActive: _step >= 2,
          ),
        ],
      ),
    );
  }
}
