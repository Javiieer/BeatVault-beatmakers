# Consolidación local de BeatVault

Alcance: cerrar los recorridos de la auditoría del 26 de octubre de 2026 y mejorar
la carga de medios en Windows 11 con PostgreSQL local. Stems aplazados. No se habilitan
pagos reales, suscripciones ni servicios externos.

## Etapas y criterios de cierre

| Etapa | Entrega | Comprobación necesaria |
| --- | --- | --- |
| 1. Continuidad | Retorno interno seguro tras login, perfil público hacia detalle de audio, borrador recuperable y enlace directo a publicaciones | Login desde detalle conserva destino; otra cuenta no recibe respuestas antiguas; perfil vuelve a mostrar cambios sin guardar; publicación fuera de página se resuelve con permisos |
| 2. Carga de medios | JPEG/PNG/WebP/AVIF; recorte centrado explicado para portadas; selección y arrastre de lotes de audio con nombres independientes | Imagen realmente decodificable, sin metadata; límite de bytes/píxeles/tiempo; WAV descargado idéntico; agregar archivos no elimina el lote anterior ni repite una carga confirmada |
| 3. Datos persistidos | Favoritos por cuenta y estado de revisión comercial independiente del historial de auditoría | Otro navegador recupera favoritos; importación conserva fuente local y no reclama claves sin dueño; aprobación sobrevive retención/reinicio y se invalida al cambiar ficha/evidencia |
| 4. Catálogo coherente | Preview privado de One-shots para CM/admin y publicación independiente de habilitación comercial | Rechazo con motivo, corrección y publicación; invitado no accede al original; reviewer no aprueba su propio audio |
| 5. Integración | Migraciones 030–036, pruebas, documentación y arranque local actualizado | Esquema limpio/actualización, QA PostgreSQL con restore y navegador; cuentas originales intactas; API local lista |
| 6. Seguridad social | Bloqueos durables, reportes de Stories, evidencia privada con vencimiento y auditoría | QA PostgreSQL aislado hasta migración 036, permisos y carreras principales comprobados; pruebas focalizadas y análisis estático aprobados |
| 7. Volumen de medios | Mover uploads locales a D: con ACL limitada y ruta configurable | Copia íntegra con SHA-256, originales preservados, API reiniciada y `/api/ready` confirma PostgreSQL |

## Contratos implementados

- `GET /api/account/favorites` devuelve la identidad y los IDs guardados. `PUT`/`DELETE`
  sobre un UUID son idempotentes y requieren sesión, CSRF y la identidad de la cuenta
  esperada. Se limita a 1000 favoritos; el alta exige un catálogo publicado.
- La colección se importa desde la antigua clave local de esa cuenta, sin sobrescribir
  favoritos de otra sesión. La fuente del navegador se conserva; no es la autoridad
  de nuevas escrituras. Una respuesta fallida no se presenta como guardado correcto.
- La migración 030 incorpora `account_catalog_favorites` y
  `marketplace_listing_review_state`. Las decisiones se vinculan a una huella de la ficha
  y evidencia; un nonce cambia al añadir o borrar evidencia. No se reutiliza aprobación
  al volver a la misma selección de documentos.
- PostgreSQL guarda revisión y auditoría en una transacción. JSON dispone de un journal
  recuperable; sigue limitado al uso local en un proceso. El import de decisiones antiguas
  comprueba roles, independencia y revisión vigente; la falta de evidencia no crea aprobación.
- `GET /api/posts/:id` resuelve el destino de notificaciones con los mismos controles
  de audiencia que el feed; no convierte un enlace antiguo en acceso a un post privado.
- Perfil y Marketplace comparten la operación de compra de Beat: vendedor Mercado Pago
  vinculado, moneda de la orden, idempotencia y descarte de respuestas tras navegar,
  cambiar cuenta o salir. Las rutas activas usan Checkout Pro Split 1:1 de Mercado Pago;
  Stripe queda en los datos históricos y no procesa nuevas compras.
- Planes consulta la configuración comercial efectiva del servidor. Las comisiones
  de membresías son propuestas y no se aplican al checkout; no se simulan suscripciones
  ni promociones aplicadas.

## Medios admitidos y conservación

Imágenes de perfil y portada: JPEG, PNG, WebP y AVIF estáticos. El servidor comprueba
firma, MIME y decodificación; rechaza SVG, animaciones y formatos no admitidos.
La normalización elimina EXIF/XMP y aplica orientación. Guarda JPEG o PNG canónico
y derivados de interfaz; no promete conservar los bytes originales de la imagen.
Los registros antiguos no se reescriben por esta actualización.

Portadas: hasta 10 MB, 16 megapíxeles y 64 MiB decodificados, lados mínimos de 640 px;
el servidor recorta al centro y limita el cuadrado a 4000 px. Se informa el recorte
antes de enviar. La creación de miniatura conserva sus límites de tamaño y permisos.
Las imágenes de perfil conservan su proporción y el encuadre seleccionado.

Audio: WAV, MP3, FLAC, OGG, AAC, M4A y WEBM. Hasta 50 selecciones por lote y 500 MB
por archivo, respetando además cuotas y límites efectivos del servidor. Se puede
añadir otro lote o arrastrarlo sin perder lo ya seleccionado, con nombre por archivo
y estados de subida/procesamiento/guardado. MIME vacío u octet-stream puede inferirse
en el cliente por extensión; el servidor valida la estructura real y procesa el preview.
Los originales de audio conservan sus bytes y permanecen privados.

Los borradores de perfil guardan metadata por cuenta durante 24 horas en sessionStorage.
No guardan binarios ni sustituyen un respaldo: para imágenes pendientes se pide
volver a seleccionar el archivo. Las preferencias de apariencia siguen siendo locales.

## Verificación y situación actual

Migraciones 030–035 aplicadas en la base principal local al cierre de la etapa anterior.
La migración 036 conserva snapshots de posts denunciados al borrarlos y pasó QA
PostgreSQL aislado en `beatvault_test_native`, incluyendo revisión de reportes tras
borrar el post. Comprobación de preservación: las 9 cuentas
originales mantienen sus identidades, hashes y roles; siguen 88 proyectos y 8 registros
de catálogo. PostgreSQL real pasó integración, concurrencia, conservación de fuentes,
aprobación comercial tras retención/reinicio y respaldo/restauración con tablas nuevas.
Evidencia: `artifacts/consolidation-postgres.log` y
`artifacts/product-audit-owner-check.json`.

Navegador: 16 de 18 casos seleccionados pasaron inicialmente. Los otros dos se
detuvieron por un selector de prueba incorrecto; corregido el selector, ambos pasaron
en una repetición aislada (WebP en escritorio y AVIF en móvil, lotes y bytes de audio).
Evidencia: `artifacts/consolidation-browser.log` y
`artifacts/consolidation-media-browser-recheck.log`. No equivale a repetir toda la
suite histórica del navegador.

Verificación de código aprobada: build (TypeScript y Vite), lint y 431 pruebas unitarias
en 80 archivos. Evidencia previa a las últimas migraciones: `artifacts/consolidation-final-build.log`,
`artifacts/consolidation-final-lint.log` y `artifacts/consolidation-final-unit.log`.
API local y web disponibles en 4174/5188; `/api/health` y `/api/ready` responden,
con PostgreSQL activo. Los uploads existentes (2 archivos, 62,725 bytes) se copiaron
a `D:\BeatVault\storage\uploads`, coinciden por SHA-256 y conservan sus originales
en C:. El ACL de `D:\BeatVault` limita acceso al usuario local, SYSTEM y Administrators.
Respaldo posterior a la migración creado y registrado en
`artifacts/consolidation-post-migration-backup.log`.

La suite Playwright completa volvió a pasar 112/112 casos tras las migraciones sociales
en PostgreSQL temporal. QA PostgreSQL local también pasó incluyendo respaldo/restauración,
bloqueo/desbloqueo y privacidad social. El QA posterior de seguridad aplicó y validó
migración 036 en `beatvault_test_native`, comprobó snapshots tras borrado, privacidad,
bloqueos, reportes, cuota de evidencia y auditoría transaccional. La restauración completa de datos y medios a un
tercer destino físico sigue pendiente.

Hardening posterior de historias de video: FFmpeg vuelve a codificar el archivo,
descarta tags/chapters/streams extra y deniega referencias externas MOV de forma
explícita. API sirve sólo la salida recodificada tras comprobar autenticación y
audiencia. 31 pruebas focalizadas, typecheck, ESLint y auditoría independiente pasaron.
Después, la suite Playwright completa (112 casos, 21 specs) terminó con 112/112
aprobadas, en Chromium con PostgreSQL temporal aislado; véase
`artifacts/priority1-playwright-full-30m.log` y el estado por prioridad en
[PRIORITIES.md](PRIORITIES.md).

## Trabajo posterior separado

Validación con el proveedor Mercado Pago sandbox requiere credenciales, cuentas de
prueba y una URL HTTPS temporal; pagos live siguen deshabilitados. También quedan
pendientes políticas definitivas de precios/licencias/impuestos, correo transaccional,
respaldo fuera del disco y cierre de operación social. No se presentan como completados
por la verificación local.
