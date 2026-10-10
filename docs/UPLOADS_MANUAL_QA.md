# Uploads: QA manual segura

Realizar estas pruebas únicamente en un entorno local de QA con una base y directorio de uploads dedicados. No usar `data/server-local`, `data/uploads` ni una cuenta real.

1. Crear un archivo sintético pequeño `qa-tone.wav` (WAV PCM válido, sin datos personales) y dos cuentas creator: creator A y creator B.
2. Iniciar el backend con `BEATVAULT_DATA_DIR` y `BEATVAULT_UPLOAD_DIR` apuntando a directorios temporales de QA, y comprobar que no se usa `DATABASE_URL` real.
3. Iniciar sesión como creator A y subir `qa-tone.wav`; verificar respuesta, nombre, MIME, tamaño y metadata.
4. Reproducir el archivo y solicitar `Range: bytes=0-15`; comprobar `206`, `Accept-Ranges` y `Content-Range` correctos.
5. Reiniciar el backend y repetir playback para comprobar persistencia de metadata y archivo.
6. Descargar el archivo y comparar tamaño/hash con el archivo sintético.
7. Iniciar sesión como creator B; comprobar que no puede reproducir, descargar ni borrar el asset de A.
8. Volver a creator A, borrar el asset y comprobar que desaparecen la metadata y el archivo físico.
9. Confirmar al terminar que solo se eliminaron los directorios temporales creados para esta sesión de QA.

Los tests automatizados de PostgreSQL son unitarios con mocks del cliente SQL. No existe integración real de PostgreSQL en esta suite porque no se debe reutilizar `DATABASE_URL` habitual.
