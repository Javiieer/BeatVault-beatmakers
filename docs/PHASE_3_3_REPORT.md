# Phase 3.3 Report: autenticacion local y ownership

La API tiene una cuenta demo local configurable con `BEATVAULT_DEMO_EMAIL` y `BEATVAULT_DEMO_PASSWORD` (solo entorno local; la contrasena debe tener 12 caracteres). Se persiste unicamente el hash `scrypt` en `data/server-local/accounts.json`, ignorado por Git. Login crea un token aleatorio en cookie `HttpOnly`, `SameSite=Lax`, con `Secure` opcional mediante `BEATVAULT_SECURE_COOKIE=true`; las sesiones viven en memoria y se limpian al apagar el proceso.

## Threat model y limites

- El cliente no puede elegir el propietario: se deriva de la sesion y las lecturas/escrituras de proyectos se filtran server-side.
- La cookie opaca reduce exposicion frente a JavaScript, pero no hay CSRF token; `SameSite=Lax` y CORS restringido a Vite localhost limitan el prototipo.
- No hay rate limiting, bloqueo, auditoria, TLS, rotacion persistida, recuperacion, MFA ni almacenamiento multi-proceso.
- Las cuentas y proyectos son archivos locales; no deben exponerse por red ni usarse en produccion.

Antes de VPS: PostgreSQL/migraciones, TLS y proxy, secretos gestionados, rate limiting, CSRF reforzado, expiracion/rotacion y revocacion persistentes, auditoria, backups/restauracion y pruebas de autorizacion.
