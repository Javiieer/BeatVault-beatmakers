# Arquitectura técnica vigente de BeatVault

**Revisión:** 2026-10-27
**Propósito:** describir el sistema que existe hoy, sus límites comprobados y el orden de mejoras técnicas.
**Fuente histórica:** [BEATVAULT_DISCOVERY_REPORT.md](../BEATVAULT_DISCOVERY_REPORT.md), diagnóstico inicial del 2026-08-26; conservarlo como registro histórico, no como estado actual.

## Dictamen

BeatVault evolucionó de una propuesta de organización local de proyectos y assets a
una aplicación web para creadores de Beats y One-shots, con perfiles, comunidad,
moderación y Marketplace. El recorrido actual es: cuenta → carga privada → procesamiento
de preview → revisión → publicación → descubrimiento. Las ofertas comerciales y las
compras siguen sujetas a decisiones y operación de sandbox; no es un servicio comercial
listo para público.

La implementación es un monolito modular local, no una colección de microservicios ni
una arquitectura offline-first. La prioridad técnica es cerrar privacidad de medios,
recuperación y consistencia operativa antes de escalar módulos.

## Componentes y límites

| Capa | Implementación | Límite principal |
| --- | --- | --- |
| Interfaz | React, TypeScript, Vite; rutas/hash, componentes en `src/components`, clientes/repositorios en `src/data`, modelos compartidos en `src/domains` | La persistencia de preferencias y algunos borradores sigue en el navegador. No hay sincronización offline/conflict resolution entre dispositivos. |
| API | Node.js/TypeScript sobre `node:http`; rutas, sesión y autorización centralizadas en `server/index.ts`; servicios de dominio en módulos de `server/` | `server/index.ts` es un controlador monolítico extenso; conviene separar rutas por dominio con contratos y límites de autorización. |
| Persistencia | `ServerRepository` con adaptadores JSON (`server/store.ts`) y PostgreSQL (`server/postgres.ts`), seleccionados por configuración | JSON sirve para desarrollo local de un proceso. Su serialización no coordina varias instancias. PostgreSQL es el backend local activo por el arranque Windows documentado. |
| Base de datos | PostgreSQL 16.15 local, sólo loopback `127.0.0.1:55432`; migraciones versionadas 001–030 | El ensayo local no valida todavía restauración externa ni una actualización en el host privado. |
| Binarios | Filesystem local: audio, imágenes, previews y evidencia; PostgreSQL guarda referencias y metadatos. El launcher Windows está configurado para `D:\BeatVault\storage\uploads`; la API abierta debe reiniciarse para usarlo. | No hay S3/object storage. El dump de base no incluye archivos; respaldo completo debe coordinar DB, uploads y configuración privada. D: será el volumen primario de medios; una copia completa requiere un tercer disco físico u otro destino independiente. |
| Medios | FFmpeg/FFprobe para lectura/procesamiento de audio/video; Sharp para normalización de imágenes; originales de audio permanecen privados | El video social se recodifica y valida antes de almacenarlo; 31 pruebas focalizadas, typecheck, lint y auditoría independiente pasaron. |
| Pagos | Mercado Pago Checkout Pro Split 1:1 en modo de prueba local; OAuth/PKCE, tokens cifrados, snapshots MXN, reserva durable de preferencias y webhook reconciliado. | El checkout queda cerrado sin credenciales, HTTPS público y tasa/comisión configuradas. El recorrido real de sandbox aún requiere una app y cuentas de prueba. No se habilitan pagos live. Ver [decisión de proveedores](PAYMENT_PROVIDER_DECISION.md). |
| Despliegue | Docker multi-stage, API Node y web Caddy; PostgreSQL Compose; API en contenedor sin root, filesystem raíz de sólo lectura y capacidades reducidas | Compose Oracle es un scaffold de piloto privado. Email, recuperación externa, monitoreo y restauración fuera del equipo siguen abiertos. |

## Flujos de datos

### Identidad y autorización

Las contraseñas usan scrypt y comparación de tiempo constante. Las sesiones persistentes
se almacenan mediante los repositorios; las escrituras autenticadas pasan por CSRF,
permisos de rol y controles de propiedad/audiencia por recurso. Admin y Community
Manager pueden moderar publicaciones de catálogo; la revisión comercial exige decisiones
independientes. Los orígenes CORS son explícitos y producción requiere HTTPS, cookies
seguras, PostgreSQL y cuentas demo desactivadas. Estos controles no equivalen a una
certificación de seguridad o prueba de penetración.

### Audio e imágenes

Los uploads de audio aceptan WAV, MP3, FLAC, OGG, AAC, M4A y WEBM; validan contenido y
estructura y generan previews separados con FFmpeg. El audio fuente conserva sus bytes
y se sirve al propietario; el preview tiene sus propias reglas de visibilidad.
Las portadas y perfiles aceptan JPEG, PNG, WebP y AVIF estáticos. Se decodifican,
normalizan, eliminan metadatos de imagen y aplican límites de tamaño/dimensiones; el
formato original de imagen no se conserva necesariamente.

El video social se decodifica y recodifica como MP4/H.264, sin copiar metadatos globales,
capítulos, subtítulos ni streams auxiliares; la salida vuelve a inspeccionarse y no se
publica si falla el saneamiento. La prueba API obtiene la Story desde otra cuenta
autorizada y comprueba los bytes servidos. La auditoría externa de CPU, timeout y tags
de salida pasaron auditoría independiente. Las opciones MOV de FFmpeg desactivan
explícitamente las referencias a otros archivos y rutas absolutas; ver
[documentación de formatos FFmpeg](https://www.ffmpeg.org/ffmpeg-formats.html).

Los archivos se guardan en filesystem, por lo que una copia recuperable debe incluir
uploads además del dump PostgreSQL. Las claves de almacenamiento no deben exponerse en
respuestas públicas.

### Publicaciones y moderación

Posts y Stories son modelos independientes con persistencia JSON/PostgreSQL y control
de audiencias. El acceso al binario vuelve a comprobar permisos. Las Stories expiran
a las 24 horas y tienen límites de cantidad/cuota. El bloqueo de cuentas es persistente
y se aplica a perfiles, posts, Stories, medios, interacciones, amistades y mensajes.
Stories pueden reportarse y su evidencia privada tiene vencimiento absoluto; las
decisiones y sus eventos de auditoría se guardan de forma coordinada y recuperable.
La cobertura aún no ensaya una aceptación de amistad concurrente con bloqueo ni la
ejecución del worker PostgreSQL después del vencimiento. Los reportes no revelan la
clave interna de evidencia a reportero o autor.
Las señales SSE son ligeras y locales a una instancia; no reemplazan la lectura
autorizada desde la API.

### Marketplace y compras

Marketplace proyecta catálogo publicado, favoritos por cuenta y compras. Las ofertas
vendibles están limitadas a MP3/WAV y guardan un snapshot de términos/entregables.
La revisión comercial independiente de la retención de auditoría se persiste mediante
migración 030. Mercado Pago valida la firma del webhook y luego consulta el pago con el
token del vendedor; compara entorno, cuenta, orden, importe y MXN antes de conceder
acceso. El precio convertido y la comisión se congelan en la orden. Reembolsos y
disputas bloquean descargas según estado. No hay checkout Stripe activo ni se habilitan
pagos reales, impuestos definidos o licencias aprobadas legalmente.

## Evolución respecto al descubrimiento inicial

| Decisión de agosto | Estado actual |
| --- | --- |
| React/TypeScript/Vite | Sigue siendo la base de frontend. |
| Backend Node y persistencia todavía no definidos | Implementados: API Node y repositorios JSON/PostgreSQL. |
| PostgreSQL como opción probable | PostgreSQL 16.15 está activo en local; migraciones 001–034 aplicadas y QA de integración/restauración ejecutada. |
| Organización de proyectos y biblioteca como MVP | Dirección reemplazada por uploads de creadores, catálogo moderado, comunidad y Marketplace. Los registros heredados de proyecto se conservan. |
| S3 compatible para medios | No implementado; almacenamiento local en filesystem. |
| Tauri/desktop, IA, analítica, distribución, sincronización cloud | Aplazados; no se necesitan para la etapa local actual. |
| Riesgos de privacidad/moderación/licencias | Siguen vigentes; se desglosan en las prioridades siguientes. |

## Riesgos y prioridades abiertas

La lista de trabajo mantenida está en [PRIORITIES.md](PRIORITIES.md). Los principales
riesgos técnicos observados son:

1. Respaldar y restaurar coordinadamente base, medios y configuración privada; la
   copia actual vive en el mismo equipo.
2. Ensayar restauración coordinada de PostgreSQL y medios en un tercer destino independiente.
3. Completar la operación de sandbox de compras; mantener live mode deshabilitado.
4. Antes de un piloto: correo, bootstrap del primer administrador, monitoreo y pruebas
   de despliegue/recuperación. Los límites de rate/concurrencia son de proceso y no
   se comparten entre instancias.

Además, `server/index.ts` concentra muchas rutas; una extracción gradual de controladores
por dominio reducirá el coste de revisión, sin hacer una refactorización amplia antes
de cerrar los riesgos funcionales prioritarios.

## Evidencia local reciente

- PostgreSQL local: migraciones 001–034; conservación de las 9 cuentas y hashes, 88
  proyectos y 8 registros de catálogo; aprobación comercial sobrevive retención de
  auditoría y reinicio; respaldo/restauración incluye tablas nuevas.
- Calidad de código: build, typecheck, lint y 431 pruebas unitarias en 80 archivos pasaron.
- Endurecimiento de video posterior: 31 pruebas focalizadas (API y procesamiento),
  ESLint, typecheck y auditoría independiente pasaron.
- Navegador: suite completa de 112 pruebas en 21 specs aprobada en Chromium, con un
  worker y PostgreSQL temporal aislado (código de salida 0, 7.7 min). Evidencia:
  `artifacts/priority1-playwright-social-safety-verified.log`.
- Servicio local responde en API 4174 y web 5188. `/api/ready` confirma PostgreSQL;
  se reinició la API con uploads en `D:\BeatVault\storage\uploads`.
- El volumen D: es el almacenamiento primario de medios. La copia íntegra fuera del
  equipo requiere un tercer destino independiente; la copia de migración en C: sólo
  sirve como punto de reversión de la base.

Evidencia detallada: [CONSOLIDATION_STAGES.md](CONSOLIDATION_STAGES.md),
[POSTGRES_LOCAL.md](POSTGRES_LOCAL.md) y [PRODUCT_AUDIT_2026-10-26.md](PRODUCT_AUDIT_2026-10-26.md).
