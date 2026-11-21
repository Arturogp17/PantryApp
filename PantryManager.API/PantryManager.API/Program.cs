using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PantryManager.API.Data;
using PantryManager.API.Services;
using System.Text;
using System.Threading.RateLimiting;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// Los secretos (Jwt:Key y la cadena de conexión) no van en el repositorio:
// en local salen de user-secrets y en Azure de la configuración de la aplicación
// (variables Jwt__Key y ConnectionStrings__PantryConnection).
var connectionString = builder.Configuration.GetConnectionString("PantryConnection");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException(
        "Falta ConnectionStrings:PantryConnection. Consulta el README para configurarla.");
}

var jwtSettings = builder.Configuration.GetSection("Jwt");
var jwtKey = jwtSettings["Key"];
if (string.IsNullOrWhiteSpace(jwtKey) || jwtKey.Length < 32)
{
    throw new InvalidOperationException(
        "Falta Jwt:Key o tiene menos de 32 caracteres. Consulta el README para configurarla.");
}
var key = Encoding.UTF8.GetBytes(jwtKey);

// 1. Configurar CORS (orígenes desde la configuración: Cors:AllowedOrigins)
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    });

builder.Services.AddCors(options =>
{
    options.AddPolicy("MyCorsPolicy", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

// Límite de intentos de login por IP. shortcut: contador en memoria, vale para una sola instancia;
// con más de una instancia hay que moverlo a un almacén compartido.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("login", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "desconocida",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(15),
                QueueLimit = 0
            }));
});

// Detrás del proxy de Azure la IP real llega en X-Forwarded-For. shortcut: se confía en cualquier proxy,
// así que quien llame directo al API puede falsear la IP; cerrar con KnownProxies si se expone sin Azure delante.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

// 2. Configurar DbContext y servicios
builder.Services.AddDbContext<PantryContext>(options =>
    options.UseSqlServer(connectionString));
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<ProductResolver>();

// Cliente para consultar códigos de barras en Open Food Facts
builder.Services.AddHttpClient("openfoodfacts", client =>
{
    client.BaseAddress = new Uri("https://world.openfoodfacts.org/");
    client.Timeout = TimeSpan.FromSeconds(6);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("PantryApp/1.0 (uso-personal)");
});

// 3. Configurar Autenticación JWT
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings["Issuer"],
        ValidAudience = jwtSettings["Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(key)
    };
});

// 4. Documento OpenAPI (solo se expone en Development)
builder.Services.AddOpenApi();

var app = builder.Build();

// 5. Migraciones y usuario inicial (útil en Azure, donde la base arranca vacía)
if (builder.Configuration.GetValue<bool>("Database:MigrateOnStartup"))
{
    using var scope = app.Services.CreateScope();
    var context = scope.ServiceProvider.GetRequiredService<PantryContext>();
    await context.Database.MigrateAsync();

    var adminUser = builder.Configuration["Seed:AdminUser"];
    var adminPassword = builder.Configuration["Seed:AdminPassword"];
    if (!string.IsNullOrWhiteSpace(adminUser) && !string.IsNullOrEmpty(adminPassword)
        && !await context.Users.AnyAsync())
    {
        var authService = scope.ServiceProvider.GetRequiredService<AuthService>();
        var (_, error) = await authService.CreateUserAsync(adminUser, adminPassword, true);
        if (error != null)
        {
            app.Logger.LogWarning("No se pudo crear el usuario inicial: {Error}", error);
        }
    }
}

// 6. Configurar Middleware (ORDEN CRÍTICO)
app.UseForwardedHeaders();

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    await next();
});

app.UseRouting();
app.UseRateLimiter();

// Mover la política CORS antes de la autenticación
app.UseCors("MyCorsPolicy");

app.UseAuthentication();
app.UseAuthorization();

// 7. Documento OpenAPI en /openapi/v1.json solo en desarrollo
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapControllers();

app.Run();
