# Uploads persistentes locales

Primera versión implementada en `server/uploads.ts`, `server/index.ts`, `server/store.ts` y `server/postgres.ts`.

## API

- `POST /api/assets/upload`: multipart, un archivo por request (`file`), sesión y CSRF obligatorios.
- `GET|HEAD /api/assets/:id/preview`: ownership obligatorio, `Range` 206/416 y `Accept-Ranges`.
- `GET /api/assets/:id/download`: descarga protegida por ownership.
- `DELETE /api/assets/:id`: elimina metadata y archivo sin aceptar IDs de otro owner.

## Configuración y seguridad

`BEATVAULT_UPLOAD_DIR` usa `data/uploads` por defecto. Los límites son 500 MiB por archivo, 510 MiB por request, 1 archivo y 8 campos. Los temporales y definitivos nunca están bajo `public`; la ruta usa owner validado internamente e ID UUID generado en servidor. Se validan firmas RIFF/WAV, FLAC, OGG, MP3/ID3 y AAC/ADTS con `Buffer`.

La persistencia JSON está en `assets.json`; Postgres usa `003_assets.sql`. El backend no cambia silenciosamente ante errores de Postgres. La deduplicación compara SHA-256 calculado mientras se lee el temporal y solo dentro del mismo owner.

## Verificación y limitaciones

`server/uploads.test.ts` cubre firma, hash y duplicado aislado; las pruebas existentes cubren autenticación y adaptador SQL mock. El componente `Upload` usa `ApiClient/FormData`, muestra loading/error/ID remoto y no publica localmente si falla el servidor; el borrador local permanece separado como fallback explícito.

Verificaciones ejecutadas en esta continuación: `npm run server:test -- --run server/uploads.test.ts` pasa (25 tests server acumulados). Pendientes no simulados: todavía no existe una suite integral que cubra todas las combinaciones de ownership, Range, abort, límites y reinicio; tampoco se ejecutó integración PostgreSQL real porque no se verificó Docker disponible. Existe una ventana de crash entre `rename` y commit de metadata que requiere reconciliación al arrancar para garantía absoluta contra huérfanos.
