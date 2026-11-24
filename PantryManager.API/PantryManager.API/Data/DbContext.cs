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
        public DbSet<Card> Cards { get; set; }
        public DbSet<ExpenseCategory> ExpenseCategories { get; set; }
        public DbSet<Expense> Expenses { get; set; }
        public DbSet<InstallmentPlan> InstallmentPlans { get; set; }
        public DbSet<RecurringCharge> RecurringCharges { get; set; }
        public DbSet<CardStatement> CardStatements { get; set; }
        public DbSet<ProcessedRequest> ProcessedRequests { get; set; }
        public DbSet<IncomeSource> IncomeSources { get; set; }
        public DbSet<AvailableFunds> AvailableFunds { get; set; }
        public DbSet<CardPayment> CardPayments { get; set; }
        public DbSet<CategoryBudget> CategoryBudgets { get; set; }

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

            // Gastos. Una categoría o tarjeta con gastos no se puede borrar (Restrict).
            modelBuilder.Entity<Card>().Property(c => c.Name).HasMaxLength(80);
            modelBuilder.Entity<Card>().Property(c => c.Bank).HasMaxLength(40);
            modelBuilder.Entity<Card>().Property(c => c.Kind).HasMaxLength(10);
            modelBuilder.Entity<Card>().Property(c => c.Last4).HasMaxLength(4);
            modelBuilder.Entity<Card>().Property(c => c.Color).HasMaxLength(7);
            modelBuilder.Entity<Card>().Property(c => c.AnnualRate).HasPrecision(9, 4);

            modelBuilder.Entity<ExpenseCategory>().Property(c => c.Name).HasMaxLength(60);
            modelBuilder.Entity<ExpenseCategory>().Property(c => c.Color).HasMaxLength(7);
            modelBuilder.Entity<ExpenseCategory>()
                .HasOne(c => c.Parent)
                .WithMany()
                .HasForeignKey(c => c.ParentId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Expense>().Property(e => e.Amount).HasPrecision(18, 2);
            modelBuilder.Entity<Expense>().Property(e => e.Merchant).HasMaxLength(120);
            modelBuilder.Entity<Expense>().Property(e => e.Note).HasMaxLength(300);
            modelBuilder.Entity<Expense>().Property(e => e.CreatedBy).HasMaxLength(60);
            modelBuilder.Entity<Expense>()
                .HasOne(e => e.Category)
                .WithMany()
                .HasForeignKey(e => e.CategoryId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<Expense>()
                .HasOne(e => e.Card)
                .WithMany()
                .HasForeignKey(e => e.CardId)
                .OnDelete(DeleteBehavior.Restrict);
            // Gasto de compra: al borrar la compra, el gasto queda sin compra (SetNull).
            modelBuilder.Entity<Expense>()
                .HasOne(e => e.Purchase)
                .WithMany(p => p.Expenses)
                .HasForeignKey(e => e.PurchaseId)
                .OnDelete(DeleteBehavior.SetNull);
            modelBuilder.Entity<Expense>().HasIndex(e => e.PurchaseId);
            modelBuilder.Entity<Expense>().HasIndex(e => e.Date);
            modelBuilder.Entity<Expense>()
                .HasIndex(e => e.ClientRequestId)
                .IsUnique()
                .HasFilter("[ClientRequestId] IS NOT NULL");

            // Compromisos: meses sin intereses y cargos recurrentes. No son gastos; tarjeta y categoría
            // con registros no se pueden borrar (Restrict).
            modelBuilder.Entity<InstallmentPlan>().Property(p => p.Name).HasMaxLength(120);
            modelBuilder.Entity<InstallmentPlan>().Property(p => p.TotalAmount).HasPrecision(18, 2);
            modelBuilder.Entity<InstallmentPlan>().Property(p => p.MonthlyPayment).HasPrecision(18, 2);
            modelBuilder.Entity<InstallmentPlan>().Property(p => p.InterestRate).HasPrecision(9, 4);
            modelBuilder.Entity<InstallmentPlan>().Property(p => p.Note).HasMaxLength(300);
            modelBuilder.Entity<InstallmentPlan>().Property(p => p.CreatedBy).HasMaxLength(60);
            modelBuilder.Entity<InstallmentPlan>()
                .HasOne(p => p.Card)
                .WithMany()
                .HasForeignKey(p => p.CardId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<InstallmentPlan>()
                .HasOne(p => p.Category)
                .WithMany()
                .HasForeignKey(p => p.CategoryId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<RecurringCharge>().Property(c => c.Name).HasMaxLength(120);
            modelBuilder.Entity<RecurringCharge>().Property(c => c.Amount).HasPrecision(18, 2);
            modelBuilder.Entity<RecurringCharge>().Property(c => c.Frequency).HasMaxLength(10);
            modelBuilder.Entity<RecurringCharge>()
                .HasOne(c => c.Card)
                .WithMany()
                .HasForeignKey(c => c.CardId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<RecurringCharge>()
                .HasOne(c => c.Category)
                .WithMany()
                .HasForeignKey(c => c.CategoryId)
                .OnDelete(DeleteBehavior.Restrict);

            // Importación de estados de cuenta. La clave evita importar dos veces el mismo movimiento.
            modelBuilder.Entity<Expense>().Property(e => e.ImportKey).HasMaxLength(100);
            modelBuilder.Entity<Expense>()
                .HasIndex(e => e.ImportKey)
                .IsUnique()
                .HasFilter("[ImportKey] IS NOT NULL");
            modelBuilder.Entity<InstallmentPlan>().Property(p => p.ImportKey).HasMaxLength(100);
            modelBuilder.Entity<InstallmentPlan>()
                .HasIndex(p => p.ImportKey)
                .IsUnique()
                .HasFilter("[ImportKey] IS NOT NULL");

            // Estados de cuenta: uno por tarjeta y fecha de corte. La tarjeta con estados no se puede borrar (Restrict).
            modelBuilder.Entity<CardStatement>().Property(s => s.PayToAvoidInterest).HasPrecision(18, 2);
            modelBuilder.Entity<CardStatement>().Property(s => s.MinimumPayment).HasPrecision(18, 2);
            modelBuilder.Entity<CardStatement>().Property(s => s.MinimumPlusInstallments).HasPrecision(18, 2);
            modelBuilder.Entity<CardStatement>().Property(s => s.TotalBalance).HasPrecision(18, 2);
            modelBuilder.Entity<CardStatement>().Property(s => s.RegularBalance).HasPrecision(18, 2);
            modelBuilder.Entity<CardStatement>().Property(s => s.InstallmentBalance).HasPrecision(18, 2);
            modelBuilder.Entity<CardStatement>().Property(s => s.CreditLimit).HasPrecision(18, 2);
            modelBuilder.Entity<CardStatement>().Property(s => s.AvailableCredit).HasPrecision(18, 2);
            modelBuilder.Entity<CardStatement>().Property(s => s.AnnualRate).HasPrecision(9, 4);
            modelBuilder.Entity<CardStatement>().Property(s => s.ImportedBy).HasMaxLength(60);
            modelBuilder.Entity<CardStatement>()
                .HasOne(s => s.Card)
                .WithMany()
                .HasForeignKey(s => s.CardId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<CardStatement>()
                .HasIndex(s => new { s.CardId, s.PeriodEnd })
                .IsUnique();

            // Pagos a tarjetas: la tarjeta con pagos no se puede borrar (Restrict). ClientRequestId evita registrar dos veces un pago.
            modelBuilder.Entity<CardPayment>().Property(p => p.Amount).HasPrecision(18, 2);
            modelBuilder.Entity<CardPayment>().Property(p => p.Note).HasMaxLength(300);
            modelBuilder.Entity<CardPayment>().Property(p => p.CreatedBy).HasMaxLength(60);
            modelBuilder.Entity<CardPayment>()
                .HasOne(p => p.Card)
                .WithMany()
                .HasForeignKey(p => p.CardId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<CardPayment>()
                .HasIndex(p => new { p.CardId, p.Date });
            modelBuilder.Entity<CardPayment>()
                .HasIndex(p => p.ClientRequestId)
                .IsUnique()
                .HasFilter("[ClientRequestId] IS NOT NULL");

            // Presupuesto mensual: una fila por categoría. Si se borra la categoría, se borra su presupuesto (Cascade).
            modelBuilder.Entity<CategoryBudget>().Property(b => b.MonthlyAmount).HasPrecision(18, 2);
            modelBuilder.Entity<CategoryBudget>()
                .HasOne(b => b.Category)
                .WithMany()
                .HasForeignKey(b => b.CategoryId)
                .OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<CategoryBudget>()
                .HasIndex(b => b.CategoryId)
                .IsUnique();

            // Solicitudes ya aplicadas de la lista de compras. El Id lo manda el cliente (no se autogenera).
            modelBuilder.Entity<ProcessedRequest>()
                .Property(p => p.Id)
                .ValueGeneratedNever();
            modelBuilder.Entity<ProcessedRequest>()
                .HasIndex(p => p.CreatedAt);

            // Plan de pagos: ingresos y dinero disponible. El ingreso no tiene relaciones; la fila de
            // dinero disponible es única (Id 1, lo asigna la API).
            modelBuilder.Entity<IncomeSource>().Property(i => i.Name).HasMaxLength(80);
            modelBuilder.Entity<IncomeSource>().Property(i => i.Amount).HasPrecision(18, 2);
            modelBuilder.Entity<IncomeSource>().Property(i => i.Kind).HasMaxLength(12);
            modelBuilder.Entity<IncomeSource>().Property(i => i.CreatedBy).HasMaxLength(60);
            // Vales: el ingreso se deposita en una tarjeta. La tarjeta con ingresos no se puede borrar (Restrict).
            modelBuilder.Entity<IncomeSource>()
                .HasOne(i => i.Card)
                .WithMany()
                .HasForeignKey(i => i.CardId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<IncomeSource>().HasIndex(i => i.CardId);

            modelBuilder.Entity<AvailableFunds>().Property(f => f.Id).ValueGeneratedNever();
            modelBuilder.Entity<AvailableFunds>().Property(f => f.Amount).HasPrecision(18, 2);
            modelBuilder.Entity<AvailableFunds>().Property(f => f.UpdatedBy).HasMaxLength(60);
        }
    }
}
