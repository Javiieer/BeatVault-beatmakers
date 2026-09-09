# Phase 3.6 Report: Catalog metadata CRUD

## Endpoints

- `GET /api/catalog`: public metadata list.
- `POST /api/catalog`: authenticated create. Owner comes from session.
- `PUT /api/catalog/:id`: authenticated update of owned metadata.
- `DELETE /api/catalog/:id`: authenticated delete of owned metadata.

Client `ownerId`/`creatorId` is rejected. Duplicate title+type per owner returns `409`.

## Frontend

`CatalogRepository` is API-first for create/update/delete. Network/timeout failures fall back to `localStorage`. Validation/`401`/`409` do not fake remote success. Session previews remain memory-only.

## Limits

Binary files, object URLs, MediaFire, cloud, and payments are not stored or uploaded. Auth remains the local demo session. Library still merges demo assets locally.
