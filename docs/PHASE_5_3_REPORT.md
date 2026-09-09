# Informe Phase 5.3: Product and License Catalog

**Fecha:** 2026-09-06
**Estado:** Completa como modelo local tipado y testeable

## Modelo

`src/domains/products/` define `ProductKind` para beats, sound packs, sounds, presets, MIDI, stems, templates y educación. Un `Product` tiene estado, visibilidad, metadata mínima, versiones, contenidos, política de preview, política de descarga y ofertas. Los Sound Packs pueden declarar formato y contenidos del archivo sin afirmar que exista un archivo real.

Las ofertas contienen moneda y cantidad opcionales como metadata propuesta, no precios reales ni procesamiento de pagos. `PurchaseReference` y `LicenseRecordReference` solo referencian registros; no contienen datos sensibles ni autorizan descargas.

## Licencias

Se modelan licencias `personal`, `commercial`, `premium`, `exclusive` y `custom` con versión y términos de uso, atribución, modificación, distribución, duración y territorio. Son términos `draft/proposed`, no licencias legales definitivas. Las ofertas comerciales y exclusivas requieren `explicit: true`.

## Reglas puras

1. Publicar exige título, creador, tags, versión actual y preview policy válida.
2. Un Sound Pack exige declaración de `archiveFormat` y `bundleContents`; esto es metadata descriptiva.
3. Preview público no equivale a compra, entitlement ni descarga.
4. Disponibilidad de descarga exige producto publicado, visible y política que la permita; la autorización real queda fuera de esta fase.
5. La decisión de catálogo no sustituye las decisiones de entitlements de Phase 5.2.

## Riesgos legales y operativos

Los términos todavía requieren revisión legal, especialmente distribución, sublicencia, samples de terceros, exclusividad, territorios, duración, reembolsos, takedowns y transferencia de propiedad. También falta definir impuestos, evidencia de aceptación, jurisdicción, versionado inmutable y auditoría servidor.

## No implementado

No se añadieron pagos, checkout, billing, refunds, payouts, autorización de descargas reales, cloud, autenticación nueva ni acciones administrativas. El catálogo no afirma que existan archivos RAR/ZIP reales.

## Siguiente fase

Phase 5.4 debe comparar modelos de ventas, definir precios y revenue split como decisiones de producto, resolver inclusión por plan, promociones, reembolsos y aceptación legal antes de cualquier implementación de pagos.
