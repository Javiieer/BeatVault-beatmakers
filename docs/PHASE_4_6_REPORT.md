# Phase 4.6: Admin Control Center local

## Entregado

- Lecturas `GET /api/admin/overview`, `/accounts`, `/audit` y `/catalog-review` protegidas por cookie de sesión HttpOnly y `role === admin`.
- Cuentas redactadas antes de responder: no salen hashes, tokens, contraseñas ni secretos.
- Creadores reciben `403 FORBIDDEN` uniforme; una sesión ausente recibe `401`.
- Adaptadores JSON y PostgreSQL reutilizan datos de cuentas, proyectos y catálogo.
- Admin UI usa API local primero y fallback mock explícito cuando la API no está disponible o responde inválidamente.
- No existen mutaciones administrativas ni autorización basada en `adminId` o rol enviado por el navegador.

## Límites conocidos

La auditoría sigue en memoria y limitada a 500 eventos, por lo que se pierde al reiniciar. El selector JSON/PostgreSQL no ofrece todavía retención transaccional de auditoría. El catálogo expone únicamente metadata/status; no hay moderación, suspensión, billing, promociones ni operaciones destructivas. El fallback mock es visual y no representa autorización.

## Validación

`npm run typecheck`, `npm run server:test`, `npm run test`, `npm run lint`, `npm run build`, `npm run test:e2e` y `git diff --check` deben ejecutarse en el entorno local.
