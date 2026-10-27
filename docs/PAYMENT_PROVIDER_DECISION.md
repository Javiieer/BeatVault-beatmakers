# Decisión de proveedor de pagos

**Decisión vigente (2026-10-27): Mercado Pago es el único proveedor activo para nuevas compras del Marketplace.** Se implementa Checkout Pro Split 1:1 en México, en modo de prueba local. No se conserva Stripe como opción de checkout ni hay cambio automático de proveedor durante un reintento.

## Decisiones de producto y dinero

- Los precios base de ofertas permanecen en USD; cada orden de Mercado Pago congela una conversión explícita a MXN y la comisión configurada en el servidor.
- No hay tipo de cambio ni comisión por defecto. El checkout sólo abre cuando existe configuración válida, credenciales completas y una URL pública HTTPS para callbacks y webhooks.
- El neto persistido se calcula después de la comisión de BeatVault y antes de tarifas de procesamiento del proveedor; no promete un monto de liquidación final.
- El alcance actual es Split 1:1 con OAuth del vendedor. No intenta dividir entre varios vendedores ni define impuestos, tiempos de retiro o términos legales.

## Implementación activa

- OAuth de vendedor con `state` de un uso, PKCE y sesión iniciadora; tokens cifrados AES-GCM con AAD por cuenta, aplicación y modo.
- Preferencias Checkout Pro persistidas mediante reserva idempotente. Si no se sabe si Mercado Pago creó la preferencia, el sistema bloquea la recreación automática.
- Órdenes fijan proveedor, modo y cotización; varios identificadores de pago externos se guardan para reconciliar reintentos y capturas duplicadas.
- Webhook HMAC idempotente seguido de consulta autenticada al recurso de pago y validación contra la orden. Sólo el estado reconciliado habilita entrega.
- Solicitudes de reembolso quedan pendientes hasta confirmación reconciliada; el estado también mantiene los archivos bloqueados.
- Los registros históricos Stripe se mantienen legibles como datos migrados, pero no hay rutas, configuración ni UI de Stripe para nuevas operaciones.

Detalles de configuración local y límites en [Mercado Pago local y sandbox](MERCADOPAGO_LOCAL_TESTING.md). Para las reglas del proveedor consulta [Split Payments 1:1](https://www.mercadopago.com.mx/developers/es/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace) y [Webhooks](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/additional-content/notifications/webhooks).

## Criterio de salida

El código local puede considerarse preparado cuando typecheck, pruebas, lint y migración local pasen. La integración sólo estará verificada con el proveedor después de vincular un vendedor sandbox, pagar como comprador sandbox y reconciliar webhook, descarga, reembolso y contracargo. No se habilitarán credenciales live en esta etapa.
