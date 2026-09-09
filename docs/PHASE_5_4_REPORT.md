# Informe Phase 5.4: Discovery comercial

**Fecha:** 2026-09-06
**Estado:** Completa como propuesta draft; requiere decisión del product owner

## Comparativa

| Modelo | Ventaja | Coste/riesgo | Propuesta de uso |
|---|---|---|---|
| Suscripción-only | Ingreso recurrente y acceso predecible | Complejidad de catálogo incluido, churn y riesgo de sobre-entitlement | No recomendar como modelo único inicialmente |
| Marketplace-only | Propiedad y licencia claras por producto; menor promesa de acceso | Ingresos menos previsibles, payouts y moderación por venta | Viable para validar demanda y licencias |
| Híbrido | Recurrente más ventas individuales; permite contenido incluido limitado | Mayor complejidad de entitlement, créditos, refunds y soporte | Propuesta draft preferida, con catálogo incluido explícito |

## Contrato comercial draft

- Una suscripción concede features y, solo si se declara, productos o colecciones incluidos. Nunca concede el catálogo completo.
- Un crédito representa una unidad de consumo definida por producto/oferta; debe registrar concesión, consumo, expiración y reversión auditables. No se proponen cantidades finales.
- Cada producto publicado referencia una versión de licencia, territorio, duración, atribución, modificación, distribución y exclusividad. Los términos actuales siguen siendo draft y requieren revisión legal.
- Las compras individuales crean un entitlement separado de la suscripción. La licencia adquirida conserva su versión y evidencia de aceptación.
- Cancelar detiene la renovación futura. La política propuesta es conservar acceso a lo comprado y permitir el uso conforme a la licencia, mientras el contenido incluido por suscripción termina al finalizar el periodo o la gracia aprobada.
- Refunds deben ser una decisión server-side, con ventana y excepciones definidas por producto, revocación o conservación explícita de derechos, ledger de créditos y registro de auditoría. No se implementan.
- Revenue split es una variable configurable por oferta, calculada sobre ingresos netos después de impuestos, fees, refunds y chargebacks según política aprobada. No se fija porcentaje.

## Productos incluidos y compras

La inclusión debe ser una lista versionada de product IDs o colecciones, con fecha de vigencia, límites de preview/download y licencia resultante. Un producto excluido requiere compra individual. Cambios futuros no deben mutar retroactivamente licencias aceptadas.

## Decisiones pendientes

- Elegir modelo inicial y proveedor de billing.
- Definir créditos, rollover, expiración y comportamiento ante refund/chargeback.
- Aprobar licencias, impuestos, jurisdicción, takedowns y evidencia de aceptación.
- Aprobar revenue split y quién absorbe fees, refunds y chargebacks.

## No implementado

No hay precios finales, checkout, billing, pagos, refunds reales, payouts, créditos consumibles, descargas protegidas ni cambios de UI. Esta fase no autoriza integrar un proveedor.
