# Sistema de tickets

Aplicacion cliente-servidor con:

- Node.js + Express
- MongoDB + Mongoose
- Cliente estatico en `public/`
- Autenticacion por JWT en cookie
- Roles `admin` y `consultant`

## Funcionalidades

- Registro y login de usuarios
- Consultores asociados a una web
- Creacion de tickets con gravedad, asunto y descripcion
- Listado de tickets abiertos y cerrados
- Filtro por web para admins
- Admin principal por ticket
- Invitaciones a otros admins y union como soporte
- Timeline con mensajes e historial de acciones
- Cierre de tickets por admins o consultores

## Configuracion

1. Copia `.env.example` a `.env`
2. Ajusta `MONGO_URI`, `JWT_SECRET` y `ADMIN_REGISTRATION_CODE`
3. Instala dependencias:

```bash
npm install
```

4. Arranca el proyecto:

```bash
npm run dev
```

## Seed opcional

Para cargar datos de ejemplo:

```bash
npm run seed
```

Credenciales del seed:

- `admin@tickets.local` / `Admin1234!`
- `soporte@tickets.local` / `Admin1234!`
- `consultor@acme.local` / `Consultor1234!`

## Estructura

- `server.js`: arranque del servidor
- `routes/`: rutas separadas por dominio
- `models/`: esquemas de MongoDB
- `middleware/`: autenticacion y utilidades
- `public/`: HTML, CSS y JS del cliente
