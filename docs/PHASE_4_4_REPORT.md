# Informe Phase 4.4: Contrato de persistencia PostgreSQL

**Fecha:** 2026-09-06
**Estado:** Implementada de forma reversible; JSON continúa siendo el valor por defecto

## Entregado

- `ServerRepository` establece la superficie común para JSON y PostgreSQL.
- `PostgresRepository` contiene SQL parametrizado y recibe un `SqlClient` inyectado; el runtime crea un pool `pg` desde `DATABASE_URL` o `BEATVAULT_DATABASE_URL`.
- `BEATVAULT_STORAGE_BACKEND=json|postgres` deja explícita la selección. El valor predeterminado sigue siendo `json`.
- La migración `001_init.sql` se mantiene no destructiva y sin cambios de esquema en esta fase.

## Plan reversible

1. Añadir driver y pool solo después de aprobar secretos y límites de conexión.
2. Ejecutar migraciones en un entorno local aislado y verificar constraints, índices y conteos.
3. Cargar una copia del JSON validado y comparar conteos, IDs, propietarios y campos normalizados.
4. Activar PostgreSQL solo en una instancia de prueba, sin conectar el frontend automáticamente.
5. Volver a `BEATVAULT_STORAGE_BACKEND=json` para rollback lógico y conservar los JSON originales.
6. Considerar retirar JSON únicamente tras pruebas de backup/restore y consistencia.

## Uso local y rollback

`docker compose up -d postgres` inicia PostgreSQL y aplica `db/migrations/001_init.sql` en un volumen nuevo. Configurar `BEATVAULT_STORAGE_BACKEND=postgres`, `DATABASE_URL=postgresql://...` y los límites `BEATVAULT_DB_*`; consultar `GET /api/ready`. No se guardan File, Blob, object URLs ni audio binario. Volver a `BEATVAULT_STORAGE_BACKEND=json` revierte el backend lógico sin migrar ni borrar JSON.

## Bloqueos

La migración actual no cubre entitlements, planes, licencias, sesiones ni auditoría completa. `catalog_assets` tampoco representa todos los metadatos Phase 5.3. No hay migrator automático ni integración PostgreSQL obligatoria en la suite; el pool se cierra en SIGINT/SIGTERM. Deben probarse backup/restore y concurrencia antes de producción.
