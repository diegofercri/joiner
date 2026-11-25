# joiner

Web sencilla para cuadrar la cena de Navidad: cada persona entra con su código, marca en un calendario los días que puede (sí, regular o no) y ve la disponibilidad de todos.

- `/`: calendario. Se entra con el código o con el enlace personal `/?c=CODIGO`.
- `/admin`: generar códigos, ponerles nombre y copiar los enlaces. Pide la clave `ADMIN_KEY`.

## Ejecutar

```sh
ADMIN_KEY=una-clave node server.js
```

Sin dependencias. Los datos se guardan en `data/db.json` (en Docker, en el volumen `/data`). La primera vez se crean 12 códigos.

Variables opcionales: `PORT` (3000), `DATA_DIR`, `START_DATE` (2026-11-25), `END_DATE` (2026-12-31), `INITIAL_CODES` (12).

## Despliegue

`docker-compose.yml` listo para Dokploy. Define `ADMIN_KEY` en las variables de entorno del servicio.
