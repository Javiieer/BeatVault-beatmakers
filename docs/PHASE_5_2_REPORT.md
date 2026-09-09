# Informe Phase 5.2: Ownership and Entitlements

**Fecha:** 2026-09-06
**Estado:** Completa como modelo local tipado y testeable

## Modelo

`src/domains/entitlements/` separa `SubscriptionState`, `FeatureEntitlement`, `ProductOwnership`, `ProductEntitlement`, `LicenseRecord`, permisos de preview/download, `Quota`/`Usage` y `EntitlementDecision`. `demo` e `included` son valores explícitos y no se confunden con una compra.

## Reglas

1. El preview público solo se permite si el producto lo declara.
2. Una suscripción activa no concede automáticamente todos los productos.
3. Preview o descarga por entitlement requieren una concesión explícita y vigente.
4. Descargar requiere además licencia activa, no expirada y cuota disponible.
5. `trial`, `grace`, `cancelled`, `past_due`, `expired` y `suspended` no implican acceso ilimitado.
6. Sin entitlement explícito no hay descarga.

`decidePreviewAccess` y `decideDownloadAccess` son funciones puras y deterministas cuando reciben `now`.

## Ejemplos y riesgos

Un producto con `publicPreview: true` permite preview, pero no descarga sin entitlement. Un producto comprado con entitlement, licencia vigente y cuota restante permite descargar. Cuota agotada, licencia expirada o entitlement inactivo devuelven una razón de denegación específica.

Esto no es autorización de producción: no hay pagos, billing, autenticación nueva, URLs protegidas, cloud ni descargas reales. La decisión final debe calcularse y aplicarse en servidor; el cliente solo mostrará estado. No se usa `adminId` como autoridad.

## Siguiente fase

Definir catálogo de productos, versiones de licencia, re-descargas, refunds/takedowns, productos incluidos por plan y política de cuotas antes de ventas o pagos.
