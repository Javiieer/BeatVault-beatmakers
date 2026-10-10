# Phase 3.9: verificación y recuperación local

Implementa tokens de 256 bits generados con `node:crypto`, almacenados únicamente como SHA-256, con expiración de 30 minutos y consumo de un solo uso. Incluye solicitudes públicas uniformes para evitar enumeración, confirmación de email local, reset de contraseña, cambio autenticado con CSRF e invalidación de sesiones al cambiar/resetear contraseña.

## Threat model

- Un atacante no obtiene el token desde los archivos JSON: solo se persiste su hash.
- Repetición, tokens desconocidos y tokens expirados fallan de forma uniforme.
- Los endpoints públicos no indican si el email existe.
- Roles y ownership siempre provienen de la cuenta/sesión, nunca del body.
- El rate limit local limita solicitudes de recuperación por IP.

## Modo development

`BEATVAULT_DEV_AUTH_TOKENS=true` permite devolver `devOnlyToken` en respuestas de request únicamente cuando `NODE_ENV` no es `production`. Está desactivado por defecto, no se debe activar en entornos públicos y el token no se registra en logs. En producción nunca se devuelve token ni se envía email.

## Limitaciones y siguiente proveedor

El delivery todavía no existe y los límites son en memoria, por lo que esta fase es local y no pública. El siguiente paso es un adaptador de email transaccional con colas, plantillas, observabilidad sin secretos, límites distribuidos y protección de rebotes. Google OAuth, WhatsApp, MFA y pagos quedan fuera.
