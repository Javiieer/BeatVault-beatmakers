# Phase 4.7: Auditoría persistente local

## Entregado

- `AuditEvent` estable con id, timestamp, action, requestId, actor/target opcionales, success y metadata mínima redactada.
- Persistencia JSON atómica por defecto y adapter PostgreSQL con consultas parametrizadas y migración `002_audit_events.sql`.
- Cola serializada con errores absorbidos y retención por máximo de eventos y días.
- `GET /api/admin/audit` continúa siendo read-only, requiere admin y soporta `page`/`limit`.
- Se bloquean claves y valores asociados a passwords, tokens, cookies, CSRF, secretos, autorización, cuerpos y provider secrets.

## Configuración

`BEATVAULT_AUDIT_MAX_ENTRIES` usa 10.000 por defecto y `BEATVAULT_AUDIT_RETENTION_DAYS` usa 365. JSON se guarda en `BEATVAULT_DATA_DIR/audit.json`; ese directorio debe permanecer fuera de git.

## Limitaciones

La cola no proporciona una transacción conjunta entre una mutación de negocio y su evento. Un fallo de filesystem o PostgreSQL se registra internamente y el evento puede perderse. Sesiones y rate limits siguen siendo efímeros. No se implementan mutaciones admin, pagos, cloud ni proveedores externos.
