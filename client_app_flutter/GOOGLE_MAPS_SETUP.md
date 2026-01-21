# Google Maps Configuration for Client App

## Android Configuration

1. **Run Flutter to generate Android files** (if not already done):
   ```bash
   cd client_app_flutter
   flutter create .
   ```

2. **Edit `android/app/src/main/AndroidManifest.xml`**:
   
   Add this inside the `<application>` tag:
   ```xml
   <meta-data
       android:name="com.google.android.geo.API_KEY"
       android:value="AIzaSyAzaTWQlJ7B2xqHvUrhcNUNuN_pN_QKKKQ"/>
   ```

   Full example:
   ```xml
   <application
       android:label="client_app"
       android:name="${applicationName}"
       android:icon="@mipmap/ic_launcher">
       
       <!-- ADD THIS -->
       <meta-data
           android:name="com.google.android.geo.API_KEY"
           android:value="AIzaSyAzaTWQlJ7B2xqHvUrhcNUNuN_pN_QKKKQ"/>
       
       <activity
           android:name=".MainActivity"
           ...
   ```

## iOS Configuration

1. **Edit `ios/Runner/AppDelegate.swift`**:
   
   Add this import at the top:
   ```swift
   import GoogleMaps
   ```

   Add this inside `application(_:didFinishLaunchingWithOptions:)`:
   ```swift
   GMSServices.provideAPIKey("AIzaSyAzaTWQlJ7B2xqHvUrhcNUNuN_pN_QKKKQ")
   ```

   Full example:
   ```swift
   import UIKit
   import Flutter
   import GoogleMaps  // ADD THIS

   @UIApplicationMain
   @objc class AppDelegate: FlutterAppDelegate {
     override func application(
       _ application: UIApplication,
       didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
     ) -> Bool {
       GMSServices.provideAPIKey("AIzaSyAzaTWQlJ7B2xqHvUrhcNUNuN_pN_QKKKQ")  // ADD THIS
       GeneratedPluginRegistrant.register(with: self)
       return super.application(application, didFinishLaunchingWithOptions: launchOptions)
     }
   }
   ```

## Install Dependencies

Run this in both `client_app_flutter/` and `tech_app_flutter/`:
```bash
flutter pub get
```

## Test the Implementation

1. **Build and run the client app**:
   ```bash
   cd client_app_flutter
   flutter run
   ```

2. **Create a test ticket** with status `en_camino`

3. **Open the tracking screen** in the client app

4. **Verify**:
   - Map loads with Google Maps
   - Technician marker appears and moves smoothly
   - Blue route line appears
   - Toggle button switches between tech/client view
   - Call button works

## Troubleshooting

- **Map shows blank**: Check API key is correct in both AndroidManifest.xml and constants.dart
- **"API key not valid"**: Ensure Maps SDK for Android/iOS are enabled in Google Cloud Console
- **Marker doesn't move**: Check that technician app is sending GPS updates (look for "📍 Location updated" in logs)
- **No route line**: Ensure Directions API is enabled and billing is active
