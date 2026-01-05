import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:provider/provider.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/create_request_screen.dart';
import 'screens/tracking_screen.dart';
import 'services/supabase_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: 'YOUR_SUPABASE_URL',
    anonKey: 'YOUR_SUPABASE_ANON_KEY',
  );

  runApp(const ClientApp());
}

class ClientApp extends StatelessWidget {
  const ClientApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<ClientSupabaseService>(create: (_) => ClientSupabaseService()),
      ],
      child: MaterialApp(
        title: 'Repair Service Client',
        theme: ThemeData(
          primarySwatch: Colors.indigo,
          useMaterial3: true,
          scaffoldBackgroundColor: const Color(0xFFF8F9FA),
        ),
        initialRoute: '/',
        routes: {
          '/': (context) => const AuthCheck(),
          '/login': (context) => const LoginScreen(),
          '/home': (context) => const HomeScreen(),
          '/create_request': (context) => const CreateRequestScreen(),
        },
        onGenerateRoute: (settings) {
          if (settings.name == '/tracking') {
             final args = settings.arguments as Map<String, dynamic>;
             return MaterialPageRoute(builder: (_) => TrackingScreen(ticketId: args['ticketId']));
          }
          return null;
        },
      ),
    );
  }
}

class AuthCheck extends StatefulWidget {
  const AuthCheck({super.key});

  @override
  State<AuthCheck> createState() => _AuthCheckState();
}

class _AuthCheckState extends State<AuthCheck> {
  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    final session = Supabase.instance.client.auth.currentSession;
    if (mounted) {
      if (session != null) Navigator.pushReplacementNamed(context, '/home');
      else Navigator.pushReplacementNamed(context, '/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
