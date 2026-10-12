# Changelog

# 2026-10-11 - Capacidad visible en Paquetes

- Paquetes convierte cada cuota en estimaciones de beats WAV y one-shots, muestra el uso real con barra de progreso y comparte las mismas constantes con el simulador.
- El bot reporta sensibilidad para duraciones de 2–5 minutos y one-shots de 1–8 MiB; mantiene una cohorte determinista de 1,000 cuentas.

# 2026-10-11 - Simulación de capacidad y badges de paquetes

- Cuotas locales iniciales de 5/50/250 GiB, ajustables con configuración por entorno; precios y cobros siguen apagados.
- `npm run test:plan-capacity` modela 1,000 usuarios virtuales con WAV sin compresión y tamaños supuestos de one-shot; no crea archivos ni sustituye telemetría real.
- Perfiles propios y públicos muestran las insignias Creator/Studio desde el historial de compras verificadas. Asignar planes en Admin para QA no genera insignias.
- Migración 014 persiste el historial de paquetes; su escritura interna queda preparada para conectarse a un webhook de pago autenticado, aún inexistente.

# 2026-10-11 - Asignación local de paquetes y cuotas

- Cuentas nuevas parten en Free; Admin puede asignar Free, Creator o Studio con CSRF y auditoría.
- El servidor aplica el límite efectivo en consultas de almacenamiento y subidas: override de prueba, cuota configurada del paquete y fallback técnico global.
- Las cuotas iniciales se derivan del modelo local de carga y se pueden ajustar por entorno; no se habilitan pagos.
- Paquetes muestra la asignación y el uso real de originales; precios siguen explícitamente pendientes.
- Migración 013 agrega el paquete a cuentas existentes con valor Free.

# 2026-10-11 - Desglose de almacenamiento por cuenta

- Admin separa bytes y cantidad de originales y previews, y muestra el total registrado.
- La cuota de usuario sigue contando solo originales disponibles; el total suma metadata
  de originales y previews registrados y no pretende medir espacio físico del servidor.
- JSON y PostgreSQL exponen el mismo desglose; las pruebas validan agregado y contrato.

# 2026-10-11 - Cuotas manuales por cuenta

- Administración puede asignar o quitar un límite individual de almacenamiento para pruebas; requiere sesión admin, CSRF y queda auditado.
- Las subidas respetan primero el límite individual y usan el global solo como fallback. La cuota no cambia al borrar archivos y no puede ampliar el uso ya existente.
- Mis subidas indica si el límite viene de cuenta, configuración global o no está asignado.
- Migración 012 y QA cubren persistencia JSON/PostgreSQL y prioridad de la cuota individual. No se crearon paquetes ni precios.

# 2026-10-11 - Consumo de almacenamiento en Admin

- El panel Admin muestra bytes originales usados por cada cuenta, ordenados de mayor a menor.
- `GET /api/admin/storage` requiere rol admin y registra la lectura en auditoría; no expone credenciales ni activa límites.
- JSON agrega uso por propietario y PostgreSQL consulta el ledger en una sola operación.
- No se asignan paquetes, precios ni cuotas comerciales; el registro servirá para decidirlos con datos reales.

# 2026-10-11 - Medición y control de almacenamiento

- Se añadió la migración PostgreSQL 011 para registrar bytes originales almacenados por cuenta; los activos existentes se incluyen al migrar.
- JSON local mide uso de manera aislada por propietario; PostgreSQL actualiza consumo y asset de forma atómica para impedir que subidas simultáneas excedan una cuota.
- `GET /api/account/storage` reporta uso, capacidad configurada y espacio disponible; borrar un audio libera el consumo.
- Mis subidas muestra el consumo del usuario y distingue claramente entre cuota pendiente y cuota activa.
- La cuota se configura solo para pruebas con `BEATVAULT_STORAGE_QUOTA_BYTES`; sin valor configurado no se activa un límite comercial.
- QA cubre dos subidas simultáneas cerca del límite, rechazo de exceso, aislamiento entre cuentas y recuperación de cuota tras borrar.

# 2026-10-11 - Temas RGB y QA de formatos

- Se reemplazaron los cuatro presets por Oscuro, Claro y RGB personalizado en Ajustes.
- La paleta permite combinar fondo, tarjetas, botones y enlaces; se valida y guarda
  por cuenta, y el color del texto se ajusta al brillo del fondo.
- El bot visual recorre las 21 URLs declaradas por la navegación en escritorio y móvil
  con los tres modos y guarda 126 capturas para inspección.
- La matriz genera, valida y convierte WAV, MP3, FLAC, AAC, M4A, OGG y WEBM; un WAV
  malformado no genera preview.
- La presencia del chat ahora viene de conexiones reales; los puntos online/offline se
  comparten solo con amistades aceptadas y consideran varias pestañas por cuenta.
- El QA del chat verifica mensajes, lecturas y presencia en línea/desconexión entre dos
  cuentas.
- Validación: 66 pruebas de servidor y 15 journeys Playwright pasaron.

# 2026-10-11 - Campana compacta en móvil

- Se quitó la etiqueta visible "Notificaciones" del botón móvil; el icono y el badge
  permanecen, junto con su nombre accesible para tecnologías de asistencia.
- La prueba móvil verifica que la etiqueta no se renderice visualmente y que el botón
  conserve su nombre accesible.

# 2026-10-11 - Private originals and processed previews

- Added migration 010 for optional, validated AAC/M4A preview metadata on owned assets.
- Uploads can create a separate bounded AAC/M4A artifact using an externally installed
  FFmpeg CLI; original files remain owner-only and unchanged.
- Published catalog audio exposes only the processed derivative; moderation fails
  closed when it is missing, and the public route supports byte ranges.
- Added an owner-only preview retry action in Mis subidas, protected with CSRF and a
  per-account rate limit; failed processing preserves the original and can be retried.
- Extended PostgreSQL QA for private-original isolation, derivative publication,
  fail-closed behavior and restart persistence. Real encoding requires external FFmpeg.
- Configured an external LGPL FFmpeg build on the local machine; real WAV-to-AAC
  conversion and catalog playback passed with disposable PostgreSQL and browser QA.

# 2026-10-11 - QA de PostgreSQL real

- Añadido `npm run test:postgres`, limitado a bases PostgreSQL locales `beatvault_test_*` o `beatvault_audit_*`; usa cuentas aisladas y limpia solo sus fixtures.
- La prueba verifica migraciones 001-011, permisos de chat/CSRF, reconexión SSE, WAV real con byte ranges y acceso privado, estado del preview procesado, publicación o bloqueo seguro sin FFmpeg, persistencia tras reinicio, revisión concurrente, cuotas atómicas y auditoría.
- Ejecutado correctamente sobre un contenedor temporal PostgreSQL 16; no se utilizó el volumen local existente.
- Documentado el procedimiento seguro en [POSTGRES_QA.md](POSTGRES_QA.md).

# 2026-10-11 - Auditoría integral y social de catálogo

- Comentarios y reacciones persistentes en Beats publicados, con actividad visible en notificaciones; añadida migración PostgreSQL 009.
- Preferencias de notificaciones para comentarios/reacciones; temas permanecen en Ajustes de perfil y la campana conserva su etiqueta en móvil.
- `npm run diagnose:full`: 88 pruebas de navegador, 135 pruebas unitarias, TypeScript, ESLint, seguridad y build pasaron; `npm audit` reportó cero advisories.
- Recorridos suplementarios usan cuentas efímeras de creador/admin contra el API desechable: validan imágenes de Home y el ciclo real de revisión en escritorio y móvil.
- Añadida [auditoría del sitio](SITE_AUDIT.md) con inventario de rutas, decisiones y bloqueos reales de salida.

# 2026-10-10 - Mensajes directos

- Añadida bandeja de chat estilo Facebook, con lista de conversaciones en escritorio y navegación de lista/hilo en móvil.
- Mensajes de texto persistentes entre amigos aceptados, estado leído/no leído, límites y autorización/CSRF en el servidor.
- Eventos en vivo por SSE; migración PostgreSQL 008 y almacenamiento JSON local.
- Verificación E2E de dos cuentas, entrega en vivo y recorrido móvil.

## 2026-10-09 - Moderación y catálogo publicado

- El panel Admin revisa pendientes con permisos server-side, CSRF y auditoría; el rechazo requiere un motivo visible solo para el creador.
- Beats lista únicamente beats publicados, no proyectos privados/demo. Los archivos originales siguen siendo privados; el preview entre cuentas queda pendiente.
- Añadida migración PostgreSQL 007 para notas de revisión; documentada la secuencia 001-007.
- Pasaron 78 pruebas de navegador y todas las fases de `diagnose:full`; `npm audit` reportó cero advisories.

## 2026-10-09 - Consolidación visual y límites sociales

- Alineada la navegación con Home, Amigos y el flujo principal de audio; se aclaró en la documentación que el marketplace, chat y social amplio siguen diferidos.
- Amigos muestra un estado de API desconectada con reintento, sin confundirlo con un directorio vacío.
- Añadida prueba API entre dos cuentas para el ciclo de solicitudes, privacidad de perfiles, CSRF/identidad y eliminación de conexión.
- Corregidas expectativas E2E obsoletas para Home, publicaciones de perfil, rutas de recuperación y cierre del menú de perfil.
- La pasada inicial encontró expectativas E2E antiguas; se actualizaron y la ejecución completa final pasó las 78 pruebas de navegador. Typecheck, lint, pruebas unitarias, seguridad y build también pasaron; `npm audit` reportó 0 advisories.

## 2026-10-09 - Limpieza focalizada y endurecimiento local

- Eliminados estilos huérfanos del antiguo puente de Shorts dentro de Library; se conservaron módulos de dominio que la arquitectura reserva para licencias y marketplace.
- Protegida la resolución de archivos para rechazar claves que escapen del directorio privado de subidas.
- Limitadas las altas por dirección de socket y añadida poda de entradas vencidas del rate limiter.
- La configuración de producción ahora falla de forma segura sin cookies Secure, CORS HTTPS explícito, PostgreSQL/DATABASE_URL o con modo demo activo.
- Typecheck, lint, build, comprobación manual de guardas y `npm audit` completo pasaron (0 advisories conocidos). Suites automatizadas no ejecutadas.

## 2026-10-09 - Biblioteca reorganizada

- Rehecha Library con resumen de colección, secciones, búsqueda, filtros, orden y vistas agrupadas en una jerarquía consistente.
- Alineadas las filas de audio y las tarjetas de cuadrícula; controles adaptados a móvil, con verificación visual sin desbordamiento.
- Biblioteca abre en Sonidos para mostrar los recursos locales disponibles; Packs y Beats quedan como colecciones independientes. El borrador de Shorts ya no interrumpe esta vista.
- Validaciones: typecheck, lint, build y navegación manual por colecciones y filtros.

## 2026-10-09 - Composer local del feed y auditoría de temas

- Añadido un cajón de publicación en Home para estados, fotos y videos, con vista previa, límites de archivo y persistencia en IndexedDB aislada por cuenta/navegador.
- Las publicaciones creadas se muestran al inicio del feed y sobreviven a recargas; se indica que no se comparten con otros usuarios porque todavía no hay backend social.
- Revisados Classic, Ember, Ivory Studio y Verdant. Corregida la herencia de texto del shell para que Ivory conserve contraste sobre sus superficies claras; las otras tres paletas se mantienen.
- Verificados typecheck, lint y build; no se ejecutaron suites de pruebas automatizadas.

## 2026-10-09 - Home feed replaces dashboard

- Replaced the promotional dashboard with a responsive mixed feed for statuses, photos, Beats and Shorts, plus a story row and discovery rail.
- Added local feed filters, likes, saves, follows, share links and story dialogs; these actions persist by account in browser storage.
- Marked seeded creator content as demo. Only the signed-in creator's published audio can appear from their uploads; private drafts stay out of Home.
- Kept `/dashboard` as a backward-compatible alias and moved primary navigation to `/home`.
- Removed the unused dashboard component and its announcement-slider styling. Typecheck, lint, build and desktop/mobile visual checks passed; automated test suites were not run.

## 2026-10-09 - Oracle VPS deployment scaffold

- Added a multi-stage Docker build, isolated production Compose profile, Caddy HTTPS/static frontend proxy, and persistent Postgres/audio volumes.
- Published only HTTP/HTTPS; API and database remain inside private Docker networks. Production cookies are Secure; demos and development reset tokens are off.
- Added guarded first-deploy and local backup scripts plus Oracle-specific setup and go-live blocker documentation.
- Restricted the existing development Postgres port to loopback and labeled that Compose file as local-only.
- This scaffold does not transfer local JSON users/audio or make the app launch-ready. Email, admin provisioning, real database restore checks, media hardening and review remain open.

## 2026-10-09 - Password recovery screens

- Added request and reset screens linked from sign-in, with matching-password and 12-128 character checks.
- Uses existing server-side one-time, expiring hashed reset tokens and invalidates sessions after a successful reset.
- Development can show a reset link only when BEATVAULT_DEV_AUTH_TOKENS is explicitly enabled; production returns no token.
- Generic request responses avoid revealing whether an email exists. Transactional email delivery still needs provider configuration.

## 2026-10-09 - Creator profiles and metadata editor

- Added creator profiles with panoramic cover presets, avatars, bio, genres, location and links.
- Added editable metadata at /settings, project grid/list, project details and optional public profile links at /profile?id=account-id.
- Public views show published projects only; account email, permissions and original audio remain private. Profiles default to private.
- Added authenticated profile reads/writes with strict field validation, CSRF, owner identity from the session, JSON persistence and PostgreSQL migration 005.
- Added API privacy/permission tests, a parameterized SQL adapter test and desktop/mobile browser coverage for persistence, failed-save recovery and visibility revocation.
- Custom photo uploads, public audio previews and production PostgreSQL integration remain pending.
- Validation: 120 unit/integration tests, 13 security probes, typecheck, lint, build and dependency audit passed (zero advisories). Full browser run passed 66/68; the two profile journeys hit timing limits. After increasing the profile journey budget and awaiting image decoding, both passed in an isolated one-worker rerun (31.1s). Desktop/mobile screenshots were inspected. The full diagnostic report remains failed from the original run; it was not rewritten as a clean full run.

## 2026-10-08 - Profile menu and local administrator

- Added a responsive profile dropdown with account identity, creator/admin role, upload links, admin-only panel access and explicit logout.
- Added keyboard navigation, Escape/focus return, outside-click dismissal and visible logout errors. Failed logout no longer pretends the session ended.
- Promoted the user-authorized existing local account through the server repository and recorded a durable audit event. Password hash and email-verification state were preserved; no public role-assignment endpoint was added.
- Focused checks: five profile component tests, thirteen HTTP security probes, lint and production build passed. Profile and persistent upload browser coverage includes desktop/mobile.

## 2026-10-08 - Persistent creator audio

- Persisted owned audio references and stable cover IDs in JSON/Postgres adapters; added migration 004.
- Restored preview/download and file metadata after reload without browser cache.
- Reused owned file/catalog records after lost responses and page reload; file reselection is still required for retry.
- Isolated catalog/project caches and upload drafts by account/demo scope; authenticated errors never simulate local success.
- Fixed the browser fetch receiver and added a same-origin development proxy for cookies/CSRF.
- Added owner-reference security checks and real desktop/mobile tests with two disposable accounts and a valid WAV.
- Postgres integration, concurrent JSON writes and stronger media validation remain pending.
- Validation: full diagnostic passed (2026-10-09T04:01:59.848Z UTC): 109 unit/integration tests, 13 security probes and 61 browser tests; types, lint, build and dependency audit passed with zero known advisories. Desktop/mobile authenticated screenshots and the live preview login were verified. No commit or push was made.

## 2026-10-08 - Creator uploads replace project management

- Replaced Studio with Mis subidas at the existing /studio route, with a /my-uploads alias.
- New uploads accept only Beats and One-shots; the API maps One-shot to sample and rejects new loops/packs. Existing records remain editable and are not deleted or relabeled.
- Added creator-owned upload cards, search/type/status filters, metadata editing, archive/restore and in-session audio previews.
- Simplified Upload to audio, name, two content types, tags and bundled cover choices. Drafts remain recoverable locally.
- Replaced Dashboard project actions and fake counters with upload actions and actual creator content counts.
- Awaited catalog confirmation, protected against double submission, uploaded all accepted files and retained partial retry progress within a session.
- Preserved cover/display metadata in the local catalog cache; stripped temporary blob URLs from persistent storage.
- Added unit and desktop/mobile browser tests for the creator workflow. Permanent audio references across reloads remain the next milestone.
- Validation: full diagnostic passed (103 unit/integration tests, 12 security probes and 59 browser tests), typecheck, ESLint, build and dependency audit. Verified cover loading and mobile controls with screenshots.

## 2026-10-08 - Diagnostics and focused first release

- Added a shared module inventory and reduced primary navigation to creator audio workflows.
- Preserved deferred prototypes; Admin navigation is restricted to authenticated admins.
- Added repeatable diagnostics with timestamped logs, JSON/Markdown results, dependency advisories and full browser route coverage.
- Added an on-push/PR GitHub workflow definition; no remote execution is implied until pushed.
- Added local HTTP security regression probes for access controls, input limits, catalog privacy, media responses and sessions.
- Fixed unbounded JSON bodies, private catalog exposure, publication-state bypass, rejected-origin CORS reflection, media range handling and Windows API entry detection.
- Updated vulnerable transitive dependencies: brace-expansion 5.0.12, source-map-js 1.2.2 and undici 8.11.2; npm audit then reported zero known advisories.
- Reconciled current handoff, roadmap, known issues and per-section release decisions.
- Next: authenticated upload/catalog/reload/playback lifecycle with account-scoped caches.
- Validation: full diagnostic passed with 95 existing tests, 12 HTTP security probes, 57 browser tests across 16 routes and three viewports, typecheck, ESLint and production build. Dependency audit: zero known advisories. Confirmed release blockers remain documented.

## 2026-08-29 - Phase 10 Backend readiness contracts

### Changes

- Added transport-independent TypeScript contracts for API results, errors, pagination, and request context.
- Added future authentication/session, catalog, project repository, and media-storage boundaries.
- Added `docs/BACKEND_CONTRACTS.md` and documented the adapter/migration rules in the architecture and technical decisions.
- Preserved browser-local storage, mock data, and all current alpha non-goals; no backend or provider was added.
- Validation: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

### Next

- Perform manual browser QA of local-storage and restored-file boundaries before selecting a backend implementation.

## 2026-08-29 - Phase 9 System states and resilience

### Changes

- Audited current loading, empty, error, unavailable-storage, reduced-motion, and action-feedback states across the existing surfaces.
- Added loading feedback and control protection to the global local audio player.
- Added visible session-only feedback when Library favorite persistence is unavailable and aligned the sidebar project-storage status with its actual write result.
- Stopped Dashboard announcement autoplay when `prefers-reduced-motion` is enabled, including live preference changes.
- Preserved synchronous browser-local behavior, mock data, visual scope, and all alpha non-goals.
- Validation: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

### Next

- Phase 10 — Backend readiness contracts. Do not begin it in this phase.

## 2026-08-29 - Phase 8 Project workspace refinement

### Changes

- Added Studio project search, status filters, result counts, and recovery empty states without changing project records.
- Clarified project ownership in cards: local browser projects are editable, while mock references are read-only.
- Added Dashboard feedback for an empty local workspace and a direct first-project action.
- Preserved mock projects, defensive localStorage persistence, and the browser-local/session-only limitation when storage is unavailable.
- Validation: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

### Next

- Phase 10 — Backend readiness contracts. Do not begin it in this phase.

## 2026-08-29 - Phase 7 Shorts lifecycle refinement

### Changes

- Kept the Shorts working editor isolated from incoming same-tab or cross-tab draft updates, while syncing the persisted status when the editor is closed.
- Required the currently selected session media reference, not only a restored filename, before saving a pending-review draft.
- Revoked replaced, rejected, cancelled, and unmounted video object URLs to avoid stale local media references.
- Shared local save feedback through the existing browser-local draft event without persisting media or expanding the storage boundary.
- Validation: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

### Next

- Phase 8 — Project workspace refinement. Do not begin it in this phase.

## 2026-08-29 - Phase 6 Upload validation refinement

### Changes

- Added safe local checks for empty and oversized selected files, with clear error feedback.
- Distinguished the current-session `File` from restored serializable metadata; restored metadata no longer satisfies file selection validation.
- Kept persisted metadata aligned with its filename and guarded asynchronous audio duration updates against stale selections.
- Added explicit feedback when local catalog persistence fails, without adding upload, backend, cloud, processing, or dependency behavior.
- Validation: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

### Next

- Phase 7 — Shorts lifecycle refinement.

## 2026-08-29 - Phase 5 Library discovery refinement

### Changes

- Added local sorting for the filtered Library result: curated order, name A-Z, asset type, and favorites first.
- Clarified publication-state controls and made the result count reflect the active filters and sort.
- Preserved browser-local favorites, collection/type filters, publication-state filters, the Shorts bridge, and the existing visual system.
- Validation: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

### Next

- Phase 6 — Upload validation refinement.

## 2026-08-29 - Phase 4 Beat detail refinement

### Changes

- Updated Beats and Beat Detail links to use stable local beat IDs instead of names.
- Added direct return navigation to Beats, clearer Beat Detail catalog context, and a useful not-found state with alternate Shorts navigation.
- Distinguished playable bundled local previews from beats without a local audio file, with accessible status and explanatory copy.
- Preserved mock/local-only behavior with no backend, dependency, media processing, auth, cloud, payments, or new architecture.
- Validation: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

### Next

- Phase 5 — Library discovery refinement.

## 2026-08-29 - Phase 3 local data boundary

### Changes

- Extracted defensive Upload draft, favorite, project, and catalog localStorage handling from `src/app/App.tsx` into small typed modules under `src/data`.
- Isolated local catalog validation, duplicate-name/type protection, and unique-ID preparation without changing the existing publication flow.
- Preserved all current storage fallbacks, error states, browser-local Shorts behavior, mock data, selected-file boundary, and UI.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

### Next

- Phase 4 — Beat detail refinement.

## 2026-08-29 - Phase 2 responsive layout hardening

### Changes

- Added deterministic width bounds and `min-width: 0` coverage to shell, topbar, filters, cards, panels, forms, and discovery surfaces.
- Prevented narrow mobile Library toolbar compression by moving filters to a full-width row at the smallest breakpoint.
- Added safe-area-aware fixed-player height and content clearance, plus scrollable modal backdrops and bounded modal panels.
- Preserved the existing desktop, tablet, and mobile announcement slider sizing and visual system.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Phase 1 shared accessibility hardening

### Changes

- Added explicit button types, accessible names, navigation `aria-current`, and pressed states for shared controls and filters.
- Added explicit labels for search, upload, metadata, and Shorts draft fields.
- Standardized Escape and backdrop-click behavior for the local project, Shorts upload, and Library draft dialogs.
- Extended `focus-visible` treatment to selects and textareas while preserving the existing visual system.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Stabilize slider across breakpoints

### Changes

- Added an explicit tablet breakpoint for the Dashboard announcement slider.
- Kept the fixed `220px` desktop/tablet height and `240px` mobile height.
- Tuned tablet columns, padding, artwork, text size, and controls to preserve the grid.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Responsive container hardening

### Changes

- Added defensive width constraints to shared layout containers, panels, cards, and toolbars.
- Preserved the mobile topbar and discovery controls without allowing long content to widen the page.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Stabilize Dashboard announcement layout

### Changes

- Fixed the announcement slider to `220px` on desktop and `240px` on mobile.
- Bounded announcement text and artwork heights to prevent grid shifts.
- Preserved the existing controls, autoplay, and responsive mobile composition.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Static discovery QA

### Changes

- Included browser-local catalog entries in global search results.
- Preserved global asset search when Library is already the active route.
- Corrected the search result container semantics from `listbox` to `list`.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Global local search

### Changes

- Activated the topbar search for local Beats and Library assets.
- Added result type, metadata, direct Beat Detail links, and filtered Library navigation.
- Added responsive result-panel styling and an explicit empty state.
- Kept search browser-local with mock data only.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Local Beats catalog

### Changes

- Replaced the `/beats` placeholder with a responsive local beat catalog.
- Added search by beat name, genre, and key, plus genre filters.
- Connected cards to Beat Detail and available local previews to the global player.
- Kept the catalog mock/local-only with no backend or publishing workflow.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Local status failure feedback

### Changes

- Archive and Restore for the local Shorts draft now keep the UI unchanged when localStorage is unavailable.
- Added visible error feedback in Library and Shorts instead of reporting a successful status transition.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build`.

## 2026-08-29 - Dashboard announcements

### Changes

- Added a local Dashboard announcement slider using bundled artwork and existing workspace routes.
- Added previous/next controls, slide indicators, six-second autoplay, pause on hover/focus, and responsive mobile layout.
- Kept announcements static and local; no remote campaign or content-management service was added.

## 2026-08-29 — Shared local Shorts draft editing

### Changes

- Added Library editing for local Shorts caption and tags.
- Added same-tab and cross-tab local draft notifications for Library, Upload, and Shorts.
- Shared pending-review validation across Shorts and Library; Upload now displays the Shorts draft publication state.
- Kept the selected video as a non-persisted filename reference and added no backend or remote synchronization.

## 2026-08-28 — Shorts contained vertical feed

### Changes

- Replaced the oversized Shorts presentation with a centered, contained 9:16 feed.
- Added one clip per scroll-snap slide, wheel navigation, tag search, quick filters, creator context, actions, and a dedicated upload draft modal.
- Kept the implementation mock/local-only; no video upload, processing, backend, or monetization was added.
- Changed the default view to a 3-column published Shorts grid with nine mock examples; the vertical viewer is now selection-only.
- Added `docs/PROJECT_OVERVIEW.md` covering product scope, planned systems, architecture evolution, versions, and desktop/mobile integration.
- Added local-first Shorts interaction behavior: swipe, keyboard navigation, persisted likes/saves, and a saved draft marker.
- Connected the Shorts upload form to the restored local draft metadata for caption, tags, file name, and save timestamp.
- Completed responsive/accessibility QA pass and added visible focus treatment for Shorts controls.
- Added upload validation and selected video metadata feedback without copying or processing the file.
- Added temporary local preview playback for the selected video and improved focused viewer keyboard semantics.
- Added local publication-state simulation with required video, caption, and tag validation.
- Fixed Storage visibility and sidebar clearance on narrow responsive layouts.
- Added a Shorts local draft panel with publication-state actions and tag metadata summary.
- Added a local Shorts-to-Library bridge showing draft metadata and publication status.
- Added the first shared local content action: archive a Shorts draft from Library.

## 2026-08-27 — Local projects

### Changes

- Added functional `New project` actions in Dashboard and Studio.
- Added a responsive modal for name, genre, BPM, key, and status with basic validation.
- Persisted user-created projects defensively in browser `localStorage` and restored them on load.
- Added local project edit and delete actions; mock projects remain read-only references.
- Added visible local saved/error states without backend, cloud, or synchronization.

## 2026-08-27 — Phase 2

### Changes

- Refined BeatVault as a platform for beatmakers and independent creators.
- Removed the personal music-library organizer concept from the product foundation.
- Defined Library as a curated BeatVault content catalog.
- Defined intentional uploads, explicit metadata, tags, and preview boundaries.
- Added Shorts, Streaming, Marketplace, Community, and related future domains conceptually.

### UI

- No visual changes.

## 2026-08-27 — Phase 3 foundation

### Changes

- Added initial TypeScript contracts for core identifiers, creators, content, catalog entries, tags, previews, publication validation, and Shorts references.
- Kept domain contracts independent and separate from the existing UI mock types.

### UI

- No visual changes.

## 2026-08-27 — Phase 4 upload UI

### Changes

- Added the intentional content submission interface at `/upload`.
- Added local validation for file selection, title, content type, and required tags.
- Added draft and review states without backend submission or media processing.
- Added a preview-output placeholder for future technical processing.

### UI

- Preserved the existing BeatVault visual system and responsive behavior.

## 2026-08-27 — Phase 4 closeout

- Closed the visual upload and validation scope.
- Defined the next phase for local automation, internal capture, and Termux handoff.
- Recorded the browser/Android filesystem boundary as an architectural constraint.

## 2026-08-27 — Phase 5 local upload drafts

### Changes

- Added localStorage persistence for the `/upload` draft fields: title, content type, selected file name, and tags.
- Restored valid draft data on load and contained corrupt JSON or unavailable storage without breaking the app.
- Added visible local save states without claiming cloud synchronization.
- Preserved the client-side publication validation and did not add backend, cloud, or Android filesystem access.

## 2026-08-27 — Phase 5 objective file metadata

### Changes

- Added selected-file name, formatted size, MIME type, and browser-readable audio duration to `/upload`.
- Persisted and restored serializable file metadata with the local draft, without storing the file Blob.
- Kept unavailable duration neutral and released temporary audio object URLs.

## 2026-08-27 — Phase 5 internal capture handoff

### Changes

- Added a visible topbar action that downloads `beatvault-capture-YYYYMMDD-HHmmss.json`.
- Capture includes format version, ISO timestamp, current path/hash, app title, limited visible main content, and best-effort draft storage state.
- Added accessible download status text describing the manual Termux handoff.
- Managed capture object URLs with `URL.createObjectURL` and `URL.revokeObjectURL`.
- Classified Capture JSON as an intentional alpha utility for reproducible local testing and handoff preparation.

### Limits

- The browser downloads locally only; no direct Android or Termux filesystem writing, transfer automation, capture history, or backend storage is implemented.

## 2026-08-27 — Phase 5 local capture history

## 2026-08-27 — Markdown handoff adopted

- Removed the in-app Capture JSON action and Capture History route.
- Added `ERRORS.md` and `IMPROVEMENTS.md` as durable project logs.
- Established Markdown files as the handoff workflow for OpenCode, Termux, and GPT mobile.

## 2026-08-27 — Phase 6 local catalog connection

- Connected the Upload flow to a browser-local BeatVault catalog.
- Published-for-review items now appear in Library with tags, metadata, preview placeholder, and status data.
- Kept mock demo assets separate from creator-created local catalog entries.
- Preserved the backend-free and intentional-upload boundary.

## 2026-08-27 — Catalog states

- Added local filters for draft, pending review, published, and archived records.
- New Upload entries are persisted as pending-review items and appear in Library.

## 2026-08-27 — Shorts discovery UI

- Added the `/shorts` route and navigation entry.
- Added a mobile-first visual surface for creator clips, tags, metrics, and linked beats.
- Kept clips as local mock content with no video processing, recommendation engine, comments, moderation, or monetization.
- Added a fullscreen viewer when selecting a Short, with close, play, creator, tags, metrics, and linked-beat affordances.

## 2026-08-27 — Shorts local interactions

- Added browser-local likes, saves, and creator follows.
- Added active visual states in the feed and fullscreen viewer.
- Kept interaction data local and separate from future server analytics.

## 2026-08-28 — Database deferred

- Confirmed that BeatVault remains local-first while the visual product is completed.
- Deferred database, backend, authentication, cloud storage, and synchronization work.

## 2026-08-28 — Shorts discovery direction

- Defined Shorts as a social-style vertical feed with its own upload flow.
- Made explicit tags the primary discovery mechanism for Shorts.
- Planned quick filters, tag search, and creator/beat context links.

## 2026-08-28 — Shorts social feed prototype

- Added a dedicated vertical feed component for Shorts.
- Added tag search, quick filters, wheel navigation, and a Shorts-specific upload draft modal.

### Changes

- Added `/captures` to the shell for consulting the 10 most recent Capture JSON references.
- Persisted only a bounded entry with id, timestamp, filename, route path, and handoff status in localStorage.
- Added a clear-history action and defensive handling for corrupt, unavailable, or quota-limited localStorage.
- Explicitly communicate that history does not retain blobs or full JSON content, so an old artifact cannot be safely downloaded again.

### Limits

- Capture remains a manual browser download and does not write to Termux or Android directly.

## 2026-08-27 — Library UI

### UI

- Added accessible sample cover thumbnails to `/library` with color fallbacks.
- Added library search by name, type, and tags, type/favorites filters, accessible empty results state, and list/grid view switching.
- Favorites are stored defensively in browser localStorage, independently from upload draft persistence.

## 2026-08-27 — Local audio previews

### Changes

- Connected the library preview buttons to a functional global audio player.
- Added static previews for the local 808 kick and basic snare WAV files.
- Added play/pause, duration and progress updates, accessible range seeking, active asset details, clear, and defensive media error states.
- Stops and resets the previous audio source when selecting another asset; static URLs require no object URL lifecycle.

### Limits

- Only the two bundled demo assets have previews; the remaining mock assets report that no preview is available.
- Playback remains browser-local and does not add uploads, backend storage, or localStorage audio persistence.

## 2026-08-27 — FL Studio demo pack

### Changes

- Added four local WAV demo assets to `/library` as the `FL Studio Demo Pack` / `Free Sample Pack` collection.
- Added optional `collection` and `licenseLabel` metadata to `AudioAsset` and displayed `Demo / local test` in each matching row.
- Added a collection filter for the pack while preserving search, favorites, type filters, list/grid views, and previews.

### Limits

- The WAVs are static local test references only. They are not uploaded, synchronized, persisted in localStorage, or presented as commercially licensed content.

## 2026-08-27 — Local demo downloads

### Changes

- Added direct browser downloads for the four `FL Studio Demo Pack` samples marked `Free Sample Pack`, reusing each local preview URL and a safe filename.
- Limited download controls to assets with the exact `Demo / local test` label or an explicit `downloadUrl`.
- Clarified in Library that local demos can be downloaded for testing only, without making a commercial licensing claim.

## 2026-08-27 — Alpha audit

### Documentation and validation

- Consolidated created/modified files, implemented functionality, routes, persistence boundaries, Capture JSON, Capture History, limitations, known gaps, roadmap status, and the recommended next step in `docs/PROGRESS.md`.
- Synchronized `README.md`, `BUGS.md`, `DECISIONS.md`, `ROADMAP.md`, and `NEXT_STEP.md` with the implemented alpha without adding product functionality.
- Validation commands: `npm run typecheck`, `npm run lint`, and `npm run build`.
