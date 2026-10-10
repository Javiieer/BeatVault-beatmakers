# Phase 4.5: Bootstrap seguro del administrador local

## Uso exacto

Solo en desarrollo, desde la raíz del repositorio:

```bash
$env:NODE_ENV='development'
$env:BEATVAULT_ADMIN_EMAIL='admin@ejemplo.local'
$env:BEATVAULT_ADMIN_PASSWORD='una contraseña local de 12+ caracteres'
$env:BEATVAULT_ADMIN_BOOTSTRAP_TOKEN='token local aleatorio de al menos 32 caracteres'
npm run admin:bootstrap
```

Los valores se suministran por el entorno y no se escriben en el repositorio ni en la salida. El token es obligatorio como confirmación explícita. El comando crea o promueve la cuenta, asigna `admin` y `verified`, y puede repetirse sin duplicar cuentas. La salida solo identifica la acción y el email.

El backend seleccionado por `BEATVAULT_STORAGE_BACKEND` se reutiliza: `json` escribe atómicamente en `BEATVAULT_DATA_DIR/accounts.json` y `postgres` usa `DATABASE_URL` mediante el repositorio PostgreSQL existente. PostgreSQL requiere que la migración de `accounts` ya esté aplicada.

## Threat model

- Un usuario del frontend no puede enviar `role` ni `adminId`; el registro siempre crea `creator` no verificado.
- Un comando accidental en producción se bloquea aunque existan las variables.
- La contraseña solo pasa a `hashPassword` scrypt y nunca se persiste en texto plano.
- La presencia del token evita activar el comando sin una intención explícita; el secreto debe ser generado y gestionado fuera de Git.
- El comando corre localmente y requiere acceso al proceso y al almacenamiento. No sustituye autenticación multifactor ni autorización de una API de producción.
- La auditoría usa el `AuditLog` actual, en memoria y limitada a 500 eventos; no es retención durable todavía.

## Pasos futuros

Persistir auditoría durable y transaccional, comparar el token con un secreto de despliegue gestionado por el host, añadir MFA/reautenticación, y definir permisos, alcance organizativo y retención antes del panel admin de producción.
