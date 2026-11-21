# PantryApp

App personal para la lista del súper y el inventario de la despensa. La usan dos personas con los mismos datos.

- **Súper**: pantalla pensada para el teléfono. Se agregan productos al carrito (por código de barras o por nombre) y el total se actualiza al momento. Al terminar se registra la compra y se quitan los productos de la lista compartida. Si no hay señal, la compra queda guardada en el teléfono y se envía al volver la conexión.
- **Promociones**: al poner un producto en el carrito se puede marcar 2x1, 3x2, N por un precio, segundo con descuento o porcentaje. El total y el ahorro se calculan con la promoción y se guardan en la compra.
- **Compras**: historial con lo gastado por periodo, en qué productos y cuánto se ahorró con promociones.
- **Lista compartida** y **sugeridos**: productos que se acabaron o que según el historial toca volver a comprar.
- **Inventario**: se ajusta a mano (botones + y -, o escribiendo la cantidad). "Se acabó" deja el stock en 0 y lo agrega a la lista.
- **Códigos de barras**: se leen con la cámara. El producto se busca primero en el catálogo propio y después en Open Food Facts; lo que se compra se guarda y la próxima vez se reconoce solo.
- **Diseño**: cinco temas elegibles en Ajustes (Mercado es el predeterminado).

## Estructura

- `PantryManager.API`: ASP.NET Core 10, EF Core 10, SQL Server, JWT.
- `pantrymanager.app`: React 19, TypeScript, MUI 9, Vite.

## Desarrollo local

### API

Las credenciales no están en el repositorio. Se guardan con user-secrets:

```
cd PantryManager.API/PantryManager.API
dotnet user-secrets set "ConnectionStrings:PantryConnection" "Server=localhost;Database=PantryManager;User Id=...;Password=...;TrustServerCertificate=True"
dotnet user-secrets set "Jwt:Key" "<texto aleatorio de al menos 32 caracteres>"
dotnet user-secrets set "Seed:AdminUser" "admin"
dotnet user-secrets set "Seed:AdminPassword" "<contraseña de al menos 8 caracteres>"
dotnet ef database update
dotnet run
```

Se necesita el SDK de .NET 10. El API escucha en `http://localhost:5163` y, en Development, publica el documento OpenAPI en `/openapi/v1.json`. Con `Database:MigrateOnStartup` en `true` aplica las migraciones al arrancar y crea el usuario administrador si no hay usuarios.

No hay registro abierto: el administrador crea las cuentas desde Ajustes.

### Frontend

```
cd pantrymanager.app
npm install
npm run dev
```

Se necesita Node 20.19 o superior (o 22.12 o superior). Se abre en `http://localhost:3000`. `VITE_API_URL` define la dirección del API (ver `.env.example`). Para probarlo desde el teléfono hay que apuntarla a la IP de la computadora y permitir ese origen en `Cors:AllowedOrigins`.

La cámara solo funciona con HTTPS (o en localhost). Probar el escáner desde el teléfono requiere un túnel HTTPS o el despliegue.

## Despliegue en Azure

Variables de entorno del API (App Service, en "Configuración"):

| Variable | Contenido |
| --- | --- |
| `ConnectionStrings__PantryConnection` | Cadena de conexión de Azure SQL |
| `Jwt__Key` | Texto aleatorio de al menos 32 caracteres |
| `Cors__AllowedOrigins__0` | URL del frontend, por ejemplo `https://pantry.azurestaticapps.net` |
| `Database__MigrateOnStartup` | `true` en el primer arranque |
| `Seed__AdminUser`, `Seed__AdminPassword` | Primer usuario administrador |

Una combinación que cabe en los planes gratuitos: Azure Static Web Apps para el frontend, App Service F1 para el API y Azure SQL con la oferta gratuita. En el frontend, `VITE_API_URL` se fija al construir (`npm run build`, que deja los archivos en `dist`).

## Pruebas

```
cd pantrymanager.app
npm test
```

Cubren el carrito, los códigos de barras, el redondeo de dinero y la cola de compras sin conexión.
