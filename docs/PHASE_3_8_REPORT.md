# Phase 3.8: registro local

Se añadió `POST /api/auth/register` para cuentas creator. El email se normaliza y valida; la contraseña exige 12-128 caracteres y se almacena únicamente como hash scrypt. Registro público no acepta `role` ni `ownerId` y crea estado `unverified`. No se envía correo: el login local funciona mientras la verificación real está pendiente.

`GET /api/auth/me` y login exponen solamente id, email, role y `verificationState`; nunca el hash. El formulario Login incluye alta local, estados de carga/error y conserva el fallback local cuando la API no está disponible. Sesiones continúan en cookies HttpOnly, no localStorage.

Google, WhatsApp y administración real siguen fuera de alcance. Existe una interfaz de provider como límite futuro, sin SDK, credenciales ni secretos. El bootstrap admin deberá ser una operación segura mediante entorno o migración controlada, nunca una contraseña compartida en el código o conversación.
