# joiner

Web sencilla para organizar La Navidad de los uVes. Cada persona entra con su código y tiene cuatro pestañas:

- **Anuncios:** los planes ya cerrados (fecha, hora, dirección y notas), con botón para añadirlos al calendario (`.ics`, sirve en iPhone) o a Google Calendar.
- **Fechas:** marca en un calendario los días que puede (sí, regular o no) y ve la disponibilidad de todos.
- **Amigo invisible:** se apunta si quiere y, tras el sorteo, ve solo a quién le toca regalar.
- **Votaciones:** vota en las encuestas abiertas (una o varias opciones) y puede cambiar el voto hasta el cierre. Si una opción lleva enlace (por ejemplo, la ficha de un restaurante), se abre con "Ver ↗".

Rutas:

- `/`: la web. Se entra con el código o con el enlace personal `/?c=CODIGO`.
- `/admin`: pide la clave `ADMIN_KEY`. Gestiona los códigos y sus nombres, activa el amigo invisible, define exclusiones, lanza el sorteo crea votaciones y publica anuncios. Los emparejamientos del sorteo no se muestran nunca en el panel.

## Ejecutar

```sh
ADMIN_KEY=una-clave node server.js
```

Sin dependencias. Los datos se guardan en `data/db.json` (en Docker, en el volumen `/data`). La primera vez se crean 12 códigos.

Variables opcionales: `PORT` (3000), `DATA_DIR`, `START_DATE` (2026-11-25), `END_DATE` (2026-12-31), `INITIAL_CODES` (12).

## Despliegue

`docker-compose.yml` listo para Dokploy. Define `ADMIN_KEY` en las variables de entorno del servicio.
