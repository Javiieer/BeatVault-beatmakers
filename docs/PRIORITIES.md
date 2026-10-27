# Prioridades de BeatVault

Actualizado: 2026-10-27. Objetivo inmediato: consolidar una app local fiable y
preparar un piloto privado sólo después de cerrar los riesgos de privacidad,
recuperación y operación. El cierre de la etapa local anterior está verificado;
esta tabla ordena el trabajo que sigue.

| Orden | Prioridad | Trabajo y motivo | Criterio para cerrarla | Estado |
| --- | --- | --- | --- | --- |
| 0 | Privacidad de video | Las cargas sociales recibían validación/decodificación pero conservaban el MP4 original y sus metadatos identificables. | MP4/H.264 se recodifica, valida y prueba desde la ruta HTTP con otra cuenta; el request falla cerrado si la salida no es segura. | Cerrada; 31 pruebas focalizadas, typecheck, lint y auditoría independiente aprobados |
| 1 | Regresión de recorridos | Suite Playwright completa: 112 casos en 21 specs, Chromium, un worker y PostgreSQL temporal aislado. Revisada de nuevo tras migraciones 031–034. | Ejecutar los 112 casos sin fallos y verificar carga, revisión, Marketplace, privacidad entre cuentas y vistas móvil/escritorio. | Cerrada; 112/112 aprobadas, exit code 0, en 7.7 min. Evidencia actual: `artifacts/priority1-playwright-social-safety-verified.log`. Runtime Chromium reinstalado por faltar localmente. |
| 2 | Recuperación de datos | La base y el workspace están en C: y los medios primarios en D:. Un bundle completo en C: o D: comparte medio físico con una fuente. | Usar bundles append-only en un tercer disco físico o destino independiente; ensayar restauración aislada de la base y extracción de medios. | QA PostgreSQL real de `beatvault_test_native` respaldado en `D:\BeatVault\backups\emulated-disk\run-*`, restaurado desde ahí en una base y carpeta temporal; compara filas, audio y artwork y deja hashes SHA-256. El paquete contiene sólo datos sintéticos de QA. Es una carpeta emulando un tercer destino, no independencia física: D: también contiene medios primarios y no hay otra unidad o red montada |
| 3 | Seguridad y moderación social | La revisión detectó rutas legacy sin filtros de bloqueo/privacidad, pérdida de reportes al borrar posts, evidencia de Stories sin presupuesto global y fallos de auditoría que podían dejar reportes incompletos. | Bloqueos y privacidad transversales; reportes y evidencia retenidos hasta su resolución, cap de almacenamiento, auditoría recuperable, retención probada y permisos de staff. | **Cerrada en local**: filtros legacy y privacidad; snapshots y retención de reportes; cap compartido de 1 GiB para evidencia Story; creación de reporte y auditoría en una transacción PostgreSQL o journal recuperable JSON; streams tolerantes a errores. QA PostgreSQL aislado hasta migración 036, 22 pruebas PostgreSQL, 14 probes de seguridad, 8 pruebas sociales, 2 recorridos API, typecheck y lint aprobados. No habilita piloto |
| 4 | Comercio local con Mercado Pago | Las ofertas base están en USD y Checkout Pro Split 1:1 liquida en MXN; las cuentas de vendedor usan OAuth y los webhooks exigen HTTPS público. | Conectar vendedor sandbox, generar preferencia estable, reconciliar pago firmado, probar descarga, reembolso y contracargo; sin habilitar live. | Código local implementado: OAuth/PKCE y cifrado de tokens, snapshot USD/MXN, preferencias reservadas, pagos múltiples por orden, HMAC y rutas de reembolso. Perfil de túnel HTTPS endurecido. Verificación local actual: 58 pruebas de proveedor/configuración, 24 de interfaz y flujo HTTP sintético aprobado con el tráfico externo bloqueado. Falta el recorrido con credenciales sandbox y HTTPS público; no hay tasa ni comisión por defecto. Stripe queda sólo como histórico, sin rutas activas. |
| 5 | Preparación de piloto privado | La imagen Docker instala FFmpeg, pero falta verificar el ciclo de vida real del contenedor y cerrar operaciones de cuentas y despliegue. | Verificar FFmpeg en la imagen y procesamiento/persistencia de previews; configurar correo transaccional, alta segura del primer admin, límites compartidos si hay varias instancias, secretos protegidos, monitoreo y restauración ensayada. Revisar términos, licencias e impuestos antes de habilitar comercio. | FFmpeg LGPL instalado por usuario y validado en Windows; 24 pruebas de medios, API 26/26 y QA PostgreSQL con audio/previews/restauración pasaron. Docker Engine no está instalado, así que la prueba dentro del contenedor sigue pendiente; también quedan correo, operación multiinstancia y monitoreo. |

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
