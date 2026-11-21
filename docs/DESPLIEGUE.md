# Despliegue en Azure

Tres recursos, los tres con plan gratuito:

- Azure SQL Database con la oferta gratuita (serverless, se pausa sola).
- App Service F1 en Linux para el API.
- Static Web Apps (Free) para el frontend.

El código se despliega con GitHub Actions al hacer push a `main`: `api.yml` publica el API y `frontend.yml` compila y sube el frontend. Los comandos de abajo se pueden pegar en Azure Cloud Shell (Bash), que ya trae `az`.

Dos avisos antes de empezar:

- Las suscripciones de tipo "Free Trial" no dejan crear App Service (error de cuota 0). Si te pasa, hay que pasar la suscripción a pago por uso; los recursos de abajo siguen costando cero.
- Con F1 el API se duerme tras unos 20 minutos sin uso. La primera petición después tarda varios segundos, y si además la base estaba pausada puede tardar cerca de un minuto. La app no pierde compras en ese caso porque las encola y las reintenta.

## 1. Variables

Cambia los nombres: el del API y el del servidor SQL tienen que ser únicos en todo Azure.

```bash
RG=pantry-rg
LOC=centralus
SQLSRV=pantry-sql-arturo
SQLUSER=pantryadmin
APIAPP=pantry-api-arturo
PLAN=pantry-plan
SWA=pantry-web
```

## 2. Base de datos

La oferta gratuita se activa desde el portal, con un solo clic:

1. Portal de Azure, "SQL databases", Crear.
2. En "Aplicar oferta gratuita" elige "Aplicar oferta". Grupo de recursos nuevo `pantry-rg`, nombre de base `pantry`.
3. Servidor nuevo: nombre `SQLSRV`, la misma región que `LOC`, autenticación SQL con usuario `SQLUSER` y una contraseña nueva (no reutilices la de tu SQL Server local).
4. En "Comportamiento al llegar al límite gratuito" elige "Poner la base en pausa hasta el mes siguiente", para que nunca genere cargos.
5. En redes, marca "Permitir que los servicios y recursos de Azure accedan a este servidor".

Todas las bases gratuitas de una suscripción quedan en la región de la primera, así que usa la misma región para todo.

Cadena de conexión (guárdala, se usa en el paso 4):

```
Server=tcp:SQLSRV.database.windows.net,1433;Initial Catalog=pantry;User ID=pantryadmin;Password=TU_CONTRASEÑA;Encrypt=True;TrustServerCertificate=False;Connect Timeout=60;
```

`Connect Timeout=60` da tiempo a que la base despierte cuando estaba pausada.

## 3. Frontend (Static Web Apps)

Se crea primero porque su dirección hace falta para CORS en el API.

```bash
az staticwebapp create -n $SWA -g $RG -l $LOC --sku Free
az staticwebapp show -n $SWA -g $RG --query defaultHostname -o tsv
az staticwebapp secrets list -n $SWA -g $RG --query properties.apiKey -o tsv
```

El segundo comando da la dirección (`algo.azurestaticapps.net`) y el tercero el token de despliegue. Sin repositorio enlazado, el despliegue lo hace el workflow con ese token.

## 4. API (App Service)

```bash
az appservice plan create -n $PLAN -g $RG --is-linux --sku F1
az webapp list-runtimes --os linux | grep -i dotnet
az webapp create -n $APIAPP -g $RG -p $PLAN --runtime "DOTNETCORE:10.0"
```

Si `DOTNETCORE:10.0` no aparece en la lista de runtimes, usa el nombre exacto que muestre el segundo comando.

Configuración. Usa comillas simples en la cadena de conexión y genera la clave JWT con `openssl rand -base64 48`:

```bash
az webapp config appsettings set -n $APIAPP -g $RG --settings \
  'ConnectionStrings__PantryConnection=PEGA_LA_CADENA_DEL_PASO_2' \
  'Jwt__Key=PEGA_LA_CLAVE_GENERADA' \
  'Cors__AllowedOrigins__0=https://DIRECCION_DEL_PASO_3' \
  'Database__MigrateOnStartup=true' \
  'Seed__AdminUser=arturo' \
  'Seed__AdminPassword=UNA_CONTRASEÑA_NUEVA'
```

Con `MigrateOnStartup` en `true` el API aplica las migraciones al arrancar, así que cada despliegue deja la base al día. `Seed__*` solo se usa si la tabla de usuarios está vacía; después puedes quitar esas dos variables.

El workflow despliega con el perfil de publicación, que necesita las credenciales básicas del sitio activadas:

```bash
az resource update -g $RG --namespace Microsoft.Web --resource-type basicPublishingCredentialsPolicies \
  --parent sites/$APIAPP --name scm --set properties.allow=true
az webapp deployment list-publishing-profiles -n $APIAPP -g $RG --xml
```

El último comando imprime el XML del perfil de publicación.

## 5. GitHub

En el repositorio, Settings, Secrets and variables, Actions (o con `gh` desde tu máquina):

```bash
gh secret set AZURE_WEBAPP_PUBLISH_PROFILE          # pega el XML del paso 4
gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN       # pega el token del paso 3
gh variable set AZURE_WEBAPP_NAME --body pantry-api-arturo
gh variable set VITE_API_URL --body https://pantry-api-arturo.azurewebsites.net/api
```

`frontend.yml` usa `npm ci`, así que `pantrymanager.app/package-lock.json` tiene que estar en el repositorio y al día con `package.json`.

## 6. Publicar

Mezcla la rama a `main` (pull request o `git merge`) y haz push. Los dos workflows corren solos; se ven en la pestaña Actions. Para repetir uno sin cambios: Actions, el workflow, "Run workflow".

Prueba abriendo la dirección de Static Web Apps, entrando con el usuario de `Seed__AdminUser` y agregando algo a la lista.

## 7. Instalar en el teléfono

Con la dirección HTTPS fija ya funciona el service worker y la instalación. En Chrome para Android: menú, "Instalar aplicación". En Safari de iPhone: Compartir, "Agregar a inicio". La cámara pide permiso la primera vez.

## Cosas que conviene saber

- El límite de login (10 intentos cada 15 minutos por IP) está en memoria. Con una sola instancia basta.
- Los datos de tu SQL Server local no pasan solos: la base de Azure empieza vacía y el catálogo se vuelve a aprender al escanear.
- Para borrar todo: `az group delete -n pantry-rg`.
