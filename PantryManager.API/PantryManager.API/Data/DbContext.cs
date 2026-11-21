using Microsoft.EntityFrameworkCore;
using PantryManager.API.Models;

namespace PantryManager.API.Data
{
    public class PantryContext : DbContext
    {
        public PantryContext(DbContextOptions<PantryContext> options) : base(options) { }

        public DbSet<User> Users { get; set; }
        public DbSet<Product> Products { get; set; }
        public DbSet<Purchase> Purchases { get; set; }
        public DbSet<PurchaseItem> PurchaseItems { get; set; }
        public DbSet<ShoppingListItem> ShoppingListItems { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {

            modelBuilder.Entity<PurchaseItem>()
                .HasOne(pi => pi.Product)
                .WithMany()
                .HasForeignKey(pi => pi.ProductId);

            modelBuilder.Entity<PurchaseItem>()
                .HasOne(pi => pi.Purchase)
                .WithMany(p => p.PurchaseItems)
                .HasForeignKey(pi => pi.PurchaseId);

            // Dinero con centavos y cantidades con 3 decimales (0.125 kg); sin esto EF usa decimal(18,2)
            // y recorta las cantidades a 2 decimales.
            modelBuilder.Entity<Product>().Property(p => p.Price).HasPrecision(18, 2);
            modelBuilder.Entity<Product>().Property(p => p.Quantity).HasPrecision(18, 3);
            modelBuilder.Entity<Purchase>().Property(p => p.TotalAmount).HasPrecision(18, 2);
            modelBuilder.Entity<PurchaseItem>().Property(pi => pi.Quantity).HasPrecision(18, 3);
            modelBuilder.Entity<PurchaseItem>().Property(pi => pi.UnitPrice).HasPrecision(18, 2);
            modelBuilder.Entity<PurchaseItem>().Property(pi => pi.LineTotal).HasPrecision(18, 2);
            modelBuilder.Entity<PurchaseItem>().Property(pi => pi.PromoValue).HasPrecision(18, 2);
            modelBuilder.Entity<ShoppingListItem>().Property(s => s.Quantity).HasPrecision(18, 3);

            modelBuilder.Entity<Product>()
                .Property(p => p.Barcode)
                .HasMaxLength(32);

            modelBuilder.Entity<Product>()
                .HasIndex(p => p.Barcode)
                .IsUnique()
                .HasFilter("[Barcode] IS NOT NULL");

            modelBuilder.Entity<Purchase>()
                .HasIndex(p => p.ClientRequestId)
                .IsUnique()
                .HasFilter("[ClientRequestId] IS NOT NULL");

            modelBuilder.Entity<ShoppingListItem>()
                .HasOne(s => s.Product)
                .WithMany()
                .HasForeignKey(s => s.ProductId);

            modelBuilder.Entity<ShoppingListItem>()
                .HasIndex(s => s.ProductId)
                .IsUnique();
        }
    }
}
