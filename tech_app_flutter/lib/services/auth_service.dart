import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart';

class AuthService extends ChangeNotifier {
  final SupabaseClient _supabase = Supabase.instance.client;

  User? get currentUser => _supabase.auth.currentUser;
  Session? get currentSession => _supabase.auth.currentSession;

  bool get isAuthenticated => currentSession != null;

  Future<void> signIn(String email, String password) async {
    try {
      final response = await _supabase.auth.signInWithPassword(
        email: email,
        password: password,
      );

      if (response.user == null) {
        throw 'Login failed: No user returned';
      }

      // Check Role
      final profile = await _supabase
          .from('profiles')
          .select('role')
          .eq('id', response.user!.id)
          .single();

      if (profile['role'] != 'tech' && profile['role'] != 'admin') {
        await signOut();
        throw 'Acceso denegado. Solo personal técnico autorizado.';
      }
      
      notifyListeners();
    } catch (e) {
      rethrow;
    }
  }

  Future<void> signOut() async {
    await _supabase.auth.signOut();
    notifyListeners();
  }

  // Restore session is handled automatically by SupabaseAuth, 
  // but we might want strict role checks on resume too.
  Future<void> checkRole() async {
    if (currentUser == null) return;
    
    try {
      final profile = await _supabase
          .from('profiles')
          .select('role')
          .eq('id', currentUser!.id)
          .single();

       if (profile['role'] != 'tech' && profile['role'] != 'admin') {
        await signOut();
      }
    } catch (_) {
      // If error (e.g. network), maybe don't sign out immediately but warn?
      // For now, let's look safe.
    }
  }
}
