# Phase 3.4 Report: integración de autenticación frontend

Al arrancar se consulta `GET /api/auth/me` con `credentials: include`. Una sesión válida muestra el usuario; un `401` muestra Login; timeout o red caída mantienen el modo demo local. Login y logout usan los endpoints locales correspondientes.

Las credenciales no se persisten. La sesión queda en cookie HttpOnly. Las mutaciones de proyectos ya no envían `ownerId`: el servidor deriva ownership. Un `401` no se presenta como datos remotos. Library sigue siendo local-only.

Esto sigue siendo un prototipo: no hay OAuth, CSRF de producción, rate limiting, recuperación, MFA, cloud ni proveedores externos. Antes de VPS hacen falta TLS, secretos gestionados, sesiones persistentes, revocación, auditoría y pruebas multiusuario.
