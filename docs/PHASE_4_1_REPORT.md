# Phase 4.1 Report: hardening de API local

## Entregado
- Rate limit en memoria para login y mutaciones autenticadas, configurable con `BEATVAULT_RATE_LIMIT` y `BEATVAULT_RATE_WINDOW_MS`; health no se limita.
- CSRF explícito mediante token aleatorio por sesión y `X-CSRF-Token` en mutaciones.
- Cookies HttpOnly para sesión, cookie CSRF separada, `SameSite` configurable, `Secure` configurable y expiración de 8 horas.
- Expiración e invalidación de sesiones, limpieza en shutdown, roles `creator`/`admin` y ownership server-side.
- Auditoría en memoria limitada a 500 eventos, sin passwords ni tokens.
- `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` y CORS fijo con credenciales.

## Threat model y limitaciones
Protege contra abuso accidental, CSRF de navegador, sesiones abandonadas, exposición de ownership y errores de autenticación reveladores. No protege contra acceso al proceso/filesystem, múltiples instancias, reinicio, robo del host, DoS distribuido, XSS, HTTPS ausente ni manipulación del JSON. Rate limit, sesiones y auditoría se pierden al reiniciar y no son adecuados para VPS.

## Checklist antes de VPS
- TLS y cookies `Secure` obligatorias.
- Sesiones, rate limit y revocación compartidos y persistentes.
- Base de datos con migraciones, backups y concurrencia controlada.
- Auditoría durable con retención y acceso restringido.
- CORS allowlist de producción, límites de body, CSP, logging estructurado y monitorización.
- Revisión multiusuario de permisos y secretos gestionados.
