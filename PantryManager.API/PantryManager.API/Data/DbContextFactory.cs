using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace PantryManager.API.Data
{
    // Solo lo usan las herramientas de EF (dotnet ef). La cadena de conexión sale de
    // user-secrets o de la variable de entorno ConnectionStrings__PantryConnection.
    public class PantryContextFactory : IDesignTimeDbContextFactory<PantryContext>
    {
        public PantryContext CreateDbContext(string[] args)
        {
            var configuration = new ConfigurationBuilder()
                .SetBasePath(Directory.GetCurrentDirectory())
                .AddJsonFile("appsettings.json", optional: true)
                .AddUserSecrets<PantryContextFactory>(optional: true)
                .AddEnvironmentVariables()
                .Build();

            var connectionString = configuration.GetConnectionString("PantryConnection")
                ?? throw new InvalidOperationException(
                    "Falta ConnectionStrings:PantryConnection. Defínela con user-secrets o con la variable de entorno ConnectionStrings__PantryConnection.");

            var optionsBuilder = new DbContextOptionsBuilder<PantryContext>();
            optionsBuilder.UseSqlServer(connectionString);

            return new PantryContext(optionsBuilder.Options);
        }
    }
}
