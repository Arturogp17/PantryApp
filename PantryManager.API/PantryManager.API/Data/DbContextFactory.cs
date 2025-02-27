using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace PantryManager.API.Data
{
    public class PantryContextFactory : IDesignTimeDbContextFactory<PantryContext>
    {
        public PantryContext CreateDbContext(string[] args)
        {
            var optionsBuilder = new DbContextOptionsBuilder<PantryContext>();
            optionsBuilder.UseSqlServer("Server=CPC-AGarc-6N5JM\\AGARCIA8;Database=PantryDB;User Id=sa;Password=Nada2254;TrustServerCertificate=True;");

            return new PantryContext(optionsBuilder.Options);
        }
    }
}