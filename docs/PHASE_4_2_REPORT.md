# Phase 4.2: Configuración segura y portable

## Entregado

- Configuración tipada y validada en `server/config.ts`.
- Variables para host, puerto, CORS, cookies, sesión, rate limit, directorio runtime y demo.
- CORS usa una allowlist y rechaza origins no configurados.
- Auth, CSRF, cookies, rate limit y almacenamiento usan la configuración central.
- `.env.example` documenta solo valores no secretos; `.env` y runtime data están ignorados.

## Defaults locales

`127.0.0.1:4174`, `http://localhost:5173`, cookie `Lax` no Secure, sesión de 8 horas, límite de 5 solicitudes por 60 segundos y `data/server-local`.

## Checklist VPS

- Definir `NODE_ENV=production`.
- Usar `BEATVAULT_COOKIE_SECURE=true`, `SameSite=None` solo si la arquitectura lo exige, y origins HTTPS explícitos.
- Proporcionar la contraseña demo por secreto o desactivar la cuenta demo.
- Usar un directorio de datos con permisos mínimos y backups.
- Colocar TLS, proxy, observabilidad y gestión de secretos fuera de esta fase.

## Riesgos pendientes

Las sesiones, rate limits y auditoría siguen en memoria; los JSON no son almacenamiento multi-instancia. No hay base de datos, rotación de secretos, proxy TLS ni despliegue VPS en esta fase.
