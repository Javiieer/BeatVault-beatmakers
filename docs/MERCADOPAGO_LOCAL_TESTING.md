# Mercado Pago local y sandbox

BeatVault usa **Mercado Pago Checkout Pro Split 1:1** como único proveedor activo para nuevas compras del Marketplace. El entorno implementado es de prueba; el checkout se mantiene deshabilitado hasta que estén configurados todos los secretos, la URL HTTPS pública y una cotización explícita.

## Modelo de cobro

- Los precios de las ofertas siguen expresados en USD. Al crear la orden, el servidor congela el precio de origen, la tasa USD/MXN, el importe MXN, la comisión de BeatVault y el neto del vendedor antes de los cargos propios de Mercado Pago.
- `BEATVAULT_MP_USD_MXN_RATE` y `BEATVAULT_MP_MARKETPLACE_FEE_BPS` no tienen valores predeterminados. No se usa una tasa informativa para liquidar compras.
- Cada orden queda ligada a Mercado Pago y al modo `test`; una orden reintentada reutiliza su snapshot. No hay fallback a Stripe.
- La integración Split 1:1 requiere OAuth del vendedor. El flujo de preferencias usa `marketplace_fee`; las tarifas de procesamiento del proveedor y la disponibilidad de fondos para un reembolso pueden afectar el neto real del vendedor. Ver [requisitos Split 1:1](https://www.mercadopago.com.mx/developers/es/docs/split-payments/split-1-1/prerequisites) y [configuración de integración](https://www.mercadopago.com.mx/developers/es/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace).

## Preparar el entorno local

1. Crea una aplicación de prueba de Mercado Pago con Checkout Pro y permisos de marketplace. No uses credenciales de producción.
2. Copia `.env.example` a `.env.local` y configura juntos `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_WEBHOOK_SECRET` y `BEATVAULT_MP_TOKEN_ENCRYPTION_KEY`. Los comandos `npm run server` y `npm run server:dev` cargan ese archivo sin imprimir sus valores; las variables ya presentes en el proceso tienen prioridad. La clave de cifrado debe ser base64 de 32 bytes. Genérala localmente con Node: `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
3. Define `BEATVAULT_MP_USD_MXN_RATE` y `BEATVAULT_MP_MARKETPLACE_FEE_BPS` según la cotización aprobada para pruebas. No copies tarifas hipotéticas a `.env`.
4. Publica el servidor web local (por omisión `http://127.0.0.1:5188`) bajo una URL HTTPS temporal que reenvíe las solicitudes al Vite local; Vite ya enruta `/api` a `http://127.0.0.1:4174`. Configura el origen exacto, sin rutas ni barra final, tanto en `BEATVAULT_PUBLIC_URL` como en `BEATVAULT_CORS_ORIGINS` (conserva también los orígenes locales que uses). La API exige además `BEATVAULT_COOKIE_SECURE=true`, `BEATVAULT_DEMO_ENABLED=false` y `BEATVAULT_DEV_AUTH_TOKENS=false`; Vite admite solo el hostname exacto del túnel.
5. Abre e inicia sesión en BeatVault usando esa URL HTTPS del túnel antes de vincular al vendedor. La cookie de sesión es propia del host; iniciar en `localhost` y regresar al host del túnel pierde la sesión del callback OAuth.
6. Registra como URI de retorno exacta `${BEATVAULT_PUBLIC_URL}/api/payments/mercadopago/oauth/callback` y como webhook `${BEATVAULT_PUBLIC_URL}/api/webhooks/mercadopago`. Mercado Pago necesita URL accesible por HTTPS; localhost no recibe notificaciones externas.
7. Reinicia la API. Confirma `/api/ready`, vincula una cuenta de vendedor de prueba desde Studio y compra desde una cuenta compradora de prueba.

La API no devuelve secretos al navegador; evita `VITE_*` para estas variables. Los tokens OAuth se guardan cifrados con AES-GCM y asociados a cuenta, aplicación y modo. El estado OAuth es de un solo uso, con PKCE, expiración y vínculo a la sesión iniciadora.

## Reconciliación y reembolsos

El webhook comprueba `x-signature` con el manifiesto HMAC de Mercado Pago, el identificador de recurso y la antigüedad de la firma. Luego obtiene el pago desde la API usando el token cifrado del vendedor y verifica vendedor, aplicación, modo, orden, importe y MXN. El body del webhook por sí solo nunca concede descargas. Ver [Webhooks de Checkout Pro](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/additional-content/notifications/webhooks).

Los identificadores de webhook y pagos externos tienen deduplicación durable. Los estados sólo habilitan descarga para una orden `paid`; ante reembolso, reembolso parcial, contracargo o segunda captura, el estado bloquea el acceso. El endpoint de reembolso solicita una operación idempotente y deja la orden en `refund_pending` hasta que una notificación reconciliada confirme su estado.

## Alcance verificado y pendiente

Las pruebas locales usan respuestas sintéticas; no crean preferencias reales, no llaman a cuentas de Mercado Pago y no mueven dinero. Para completar la prueba extremo a extremo aún hacen falta credenciales de aplicación sandbox, una URL HTTPS pública temporal y usuarios vendedor/comprador de prueba. Ejecuta el recorrido con pagos aprobados y rechazados, duplicación de webhooks, renovación OAuth, reintentos, reembolso y contracargo antes de considerar el flujo validado con el proveedor.

No está habilitado modo producción, 1:N, suscripciones, impuesto, retiro de fondos ni licenciamiento legal final.
