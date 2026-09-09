# Phase 3.2 Report

La API local añade `PUT /api/projects/:id` y `DELETE /api/projects/:id`. Los IDs son UUID; los payloads validan `title` y `status` y no permiten modificar `ownerId`. Duplicados por owner devuelven `409`, inexistentes `404`, payloads inválidos `400` y errores inesperados `500`, siempre con `ApiResult`.

`ProjectRepository` intenta API para listar y para todo el CRUD. Solo red/timeout usa localStorage como fallback; los errores HTTP se exponen y no simulan éxito remoto. Studio delega edición y borrado al repository y mantiene modal y confirmación.

La persistencia server-side escribe JSON temporal y renombra después, conservando el archivo previo si falla la escritura. `ownerId` es únicamente un placeholder validado: autenticación y autorización server-side quedan pendientes antes de exponer la API. Library, rutas, temas y mock data quedan sin migrar.
