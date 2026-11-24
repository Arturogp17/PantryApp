using System;
using System.Collections.Generic;

namespace PantryManager.API.Models
{
    // Tarjeta de crédito o débito. El efectivo no es una tarjeta: un gasto sin CardId se pagó en efectivo.
    public class Card
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public string Bank { get; set; } = "";
        // "credit", "debit" o "voucher" (vales de despensa). Solo las de crédito tienen fechas y tasa.
        public string Kind { get; set; } = "credit";
        public string? Last4 { get; set; }
        public string Color { get; set; } = "#3A7CA5";
        // Tasa anual en porcentaje (50.82 = 50.82%). Solo tarjetas de crédito.
        public decimal? AnnualRate { get; set; }
        public int? CutoffDay { get; set; }
        public int? DueDay { get; set; }
        public bool IsActive { get; set; } = true;
    }

    // Categoría de gasto con un nivel de subcategorías (Servicios > Luz).
    public class ExpenseCategory
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public int? ParentId { get; set; }
        public ExpenseCategory? Parent { get; set; }
        public string? Color { get; set; }
        public int SortOrder { get; set; }
    }

    public class Expense
    {
        public int Id { get; set; }
        public DateOnly Date { get; set; }
        public decimal Amount { get; set; }
        public string Merchant { get; set; } = "";
        public string? Note { get; set; }
        public int CategoryId { get; set; }
        public ExpenseCategory Category { get; set; } = null!;
        public int? CardId { get; set; }
        public Card? Card { get; set; }
        public string CreatedBy { get; set; } = "";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Lo genera el cliente para que reenviar un gasto no lo registre dos veces.
        public Guid? ClientRequestId { get; set; }

        // Compra de la que sale este gasto (una parte de su pago). Null si se capturó a mano.
        public int? PurchaseId { get; set; }
        public Purchase? Purchase { get; set; }

        // Clave del movimiento al importar un estado de cuenta; evita importarlo dos veces.
        public string? ImportKey { get; set; }
    }

    public class CardDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public string Bank { get; set; } = "";
        public string Kind { get; set; } = "credit";
        public string? Last4 { get; set; }
        public string Color { get; set; } = "";
        public decimal? AnnualRate { get; set; }
        public int? CutoffDay { get; set; }
        public int? DueDay { get; set; }
        public bool IsActive { get; set; }
    }

    public class CardRequest
    {
        public string? Name { get; set; }
        public string? Bank { get; set; }
        public string? Kind { get; set; }
        public string? Last4 { get; set; }
        public string? Color { get; set; }
        public decimal? AnnualRate { get; set; }
        public int? CutoffDay { get; set; }
        public int? DueDay { get; set; }
        public bool IsActive { get; set; } = true;
    }

    public class ExpenseCategoryDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public int? ParentId { get; set; }
        public string? Color { get; set; }
        public int SortOrder { get; set; }
    }

    public class ExpenseCategoryRequest
    {
        public string? Name { get; set; }
        public int? ParentId { get; set; }
        public string? Color { get; set; }
    }

    public class ExpenseDto
    {
        public int Id { get; set; }
        public DateOnly Date { get; set; }
        public decimal Amount { get; set; }
        public string Merchant { get; set; } = "";
        public string? Note { get; set; }
        public int CategoryId { get; set; }
        public string CategoryName { get; set; } = "";
        public string? ParentCategoryName { get; set; }
        public int? CardId { get; set; }
        public string MethodName { get; set; } = "Efectivo";
        public string? CardLast4 { get; set; }
        public string MethodColor { get; set; } = "";
        public string CreatedBy { get; set; } = "";
        public int? PurchaseId { get; set; }
    }

    public class ExpenseRequest
    {
        public Guid? ClientRequestId { get; set; }
        public DateOnly? Date { get; set; }
        public decimal Amount { get; set; }
        public string? Merchant { get; set; }
        public string? Note { get; set; }
        public int CategoryId { get; set; }
        public int? CardId { get; set; }
    }

    public class ExpenseSummaryDto
    {
        // Mes pedido, "2026-11".
        public string Month { get; set; } = "";
        public decimal Total { get; set; }
        public int Count { get; set; }
        public decimal PreviousMonthTotal { get; set; }
        // Los seis meses que terminan en el pedido, del más viejo al más nuevo.
        public List<MonthSpendDto> ByMonth { get; set; } = new List<MonthSpendDto>();
        public List<CategorySpendDto> ByCategory { get; set; } = new List<CategorySpendDto>();
        public List<MethodSpendDto> ByMethod { get; set; } = new List<MethodSpendDto>();
    }

    public class MonthSpendDto
    {
        public string Month { get; set; } = "";
        public decimal Total { get; set; }
        // Por categoría de primer nivel (las subcategorías se suman a su categoría).
        public List<AmountByIdDto> ByCategory { get; set; } = new List<AmountByIdDto>();
    }

    public class AmountByIdDto
    {
        public int Id { get; set; }
        public decimal Total { get; set; }
    }

    public class CategorySpendDto
    {
        public int CategoryId { get; set; }
        public string Name { get; set; } = "";
        public string Color { get; set; } = "";
        public decimal Total { get; set; }
        public List<SubcategorySpendDto> Children { get; set; } = new List<SubcategorySpendDto>();
    }

    public class SubcategorySpendDto
    {
        public int CategoryId { get; set; }
        public string Name { get; set; } = "";
        public decimal Total { get; set; }
    }

    public class MethodSpendDto
    {
        public int? CardId { get; set; }
        public string Name { get; set; } = "";
        public string Color { get; set; } = "";
        public decimal Total { get; set; }
    }
}
