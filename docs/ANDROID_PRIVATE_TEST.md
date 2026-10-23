# Android private test build

BeatVault can be wrapped with Capacitor for an internal Android test build. The first Tailscale build loads the web app from the developer PC, so it is a private remote shell, not a standalone or public-release APK.

## Requirements

- Android Studio with its Android SDK and a compatible JDK.
- Tailscale connected on the PC and Android device in the same tailnet.
- HTTPS enabled for the tailnet so Tailscale Serve can provide a private HTTPS URL.

## Private test flow

1. Start the local API on `127.0.0.1:4174` with `BEATVAULT_CORS_ORIGINS` containing the exact HTTPS origin that Tailscale Serve will provide. Keep `BEATVAULT_COOKIE_SECURE=true`.
2. Build the web app and serve its preview on port `5188`:

   ```powershell
   npm run build
   npm run preview -- --host 127.0.0.1 --port 5188 --strictPort
   ```

3. In another terminal, expose only that preview to the tailnet:

   ```powershell
   tailscale serve 5188
   ```

   Use the HTTPS URL printed by Tailscale. Serve is private to the tailnet; do not use Funnel for this test.

4. Set the URL when syncing the Android project:

   ```powershell
   $env:BEATVAULT_ANDROID_SERVER_URL = "https://your-pc.your-tailnet.ts.net"
   npm run android:sync
   npm run android:open
   ```

5. In Android Studio, build a debug APK and install it on the Android device. Keep Tailscale connected and the PC's API and preview servers running while testing.

The test APK does not contain a self-sufficient backend and will not work when the PC or tailnet is unavailable. Do not publish this remote-server configuration. A public release needs an internet-hosted API and a bundled web build; its API URL, session/CORS behavior, media picker, and release signing must be tested separately.
