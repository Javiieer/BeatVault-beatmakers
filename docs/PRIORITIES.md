# Prioridades de BeatVault

Actualizado: 2026-10-27. Objetivo inmediato: consolidar una app local fiable y
preparar un piloto privado sólo después de cerrar los riesgos de privacidad,
recuperación y operación. El cierre de la etapa local anterior está verificado;
esta tabla ordena el trabajo que sigue.

| Orden | Prioridad | Trabajo y motivo | Criterio para cerrarla | Estado |
| --- | --- | --- | --- | --- |
| 0 | Privacidad de video | Las cargas sociales recibían validación/decodificación pero conservaban el MP4 original y sus metadatos identificables. | MP4/H.264 se recodifica, valida y prueba desde la ruta HTTP con otra cuenta; el request falla cerrado si la salida no es segura. | Cerrada; 31 pruebas focalizadas, typecheck, lint y auditoría independiente aprobados |
| 1 | Regresión de recorridos | Suite Playwright completa: 112 casos en 21 specs, Chromium, un worker y PostgreSQL temporal aislado. Revisada de nuevo tras migraciones 031–034. | Ejecutar los 112 casos sin fallos y verificar carga, revisión, Marketplace, privacidad entre cuentas y vistas móvil/escritorio. | Cerrada; 112/112 aprobadas, exit code 0, en 7.7 min. Evidencia actual: `artifacts/priority1-playwright-social-safety-verified.log`. Runtime Chromium reinstalado por faltar localmente. |
| 2 | Recuperación de datos | La base y el workspace están en C: y los medios primarios están en D:. Un bundle completo en C: o D: compartiría medio físico con una fuente. | Usar bundles append-only en un tercer disco físico o destino independiente; ensayar restauración aislada de la base y extracción de medios. | Ruta D: activa, archivos existentes verificados; script rechaza ambos discos fuente. Ensayo completo pendiente de un tercer destino independiente |
| 3 | Seguridad y moderación social | Las publicaciones tenían denuncias básicas, pero Stories no; no había bloqueo persistente ni registro atómico en todos los flujos. | Bloqueos durables aplicados transversalmente; reportes de Stories con evidencia privada y retención limitada; auditoría atómica/journal recuperable, límites y permisos. | Implementación, auditoría independiente y QA local aprobados; migraciones 031–034 activas. 10 pruebas focalizadas + 2 Admin; typecheck/lint pasan; Playwright 112/112 aprobada. Quedan huecos menores de cobertura: aceptación de amistad simultánea y limpieza PG vencida |
| 4 | Comercio local con Mercado Pago | Las ofertas base están en USD y Checkout Pro Split 1:1 liquida en MXN; las cuentas de vendedor usan OAuth y los webhooks exigen HTTPS público. | Conectar vendedor sandbox, generar preferencia estable, reconciliar pago firmado, probar descarga, reembolso y contracargo; sin habilitar live. | Código local implementado: OAuth/PKCE y cifrado de tokens, snapshot USD/MXN, preferencias reservadas, pagos múltiples por orden, HMAC y rutas de reembolso. Typecheck pasa. Falta ejecutar pruebas del proveedor con credenciales sandbox/HTTPS público; no hay valores de tasa o comisión por defecto. Stripe queda sólo como histórico, sin rutas activas. |
| 5 | Preparación de piloto privado | La base de Docker ya instala FFmpeg; hay que comprobar que el procesamiento y persistencia de previews sobrevivan el ciclo de vida del contenedor y cerrar operaciones de cuentas y despliegue. | Verificar FFmpeg en la imagen y procesamiento de previews; configurar correo transaccional, alta segura del primer admin, límites compartidos si hay varias instancias, secretos protegidos, monitoreo y restauración ensayada. Revisar términos, licencias e impuestos antes de habilitar comercio. | Pendiente |

## Cómo avanzar

Para cada prioridad: inspeccionar el flujo actual, acotar el cambio, añadir cobertura
del comportamiento y permisos, ejecutar las comprobaciones pertinentes y actualizar
aquí el estado con evidencia. La prioridad 2 requiere un tercer destino independiente.
No marcar una prioridad como terminada por la sola existencia
de código. Los cambios locales siguen separados de la puesta en marcha de servicios
externos o pagos reales.

## Fuera de la siguiente etapa

Stems, suscripciones, distribución musical, catálogo de IA y nuevos módulos de
navegación permanecen aplazados hasta que las prioridades de fiabilidad estén cerradas.

La verificación local ya completada está en [CONSOLIDATION_STAGES.md](CONSOLIDATION_STAGES.md).
