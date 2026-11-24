using System;
using System.Collections.Generic;

namespace PantryManager.API.Models
{
    public class Purchase
    {
        public int Id { get; set; }
        public DateTime PurchaseDate { get; set; } = DateTime.UtcNow;
        public decimal TotalAmount { get; set; }

        // Lo genera el cliente para que reenviar una compra (por ejemplo tras perder señal)
        // no la registre dos veces.
        public Guid? ClientRequestId { get; set; }

        // Gastos creados con la compra: uno por cada método de pago. Vacía si la compra no generó gastos.
        public List<Expense> Expenses { get; set; } = new List<Expense>();

        public List<PurchaseItem> PurchaseItems { get; set; } = new List<PurchaseItem>();
    }

    public class PurchaseDto
    {
        public int Id { get; set; }
        public DateTime PurchaseDate { get; set; }
        public decimal TotalAmount { get; set; }
        public List<int> ExpenseIds { get; set; } = new List<int>();
        public List<PurchaseItemDto> Items { get; set; } = new List<PurchaseItemDto>();
    }

    public class PurchaseItemDto
    {
        public int ProductId { get; set; }
        public string ProductName { get; set; } = "";
        public int StockType { get; set; }
        public decimal Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal LineTotal { get; set; }
        public PromoDto? Promo { get; set; }
    }

    public class PromoDto
    {
        public string Type { get; set; } = "";
        public int? Buy { get; set; }
        public decimal Value { get; set; }
    }

    public class PurchaseSummaryDto
    {
        public decimal TotalSpent { get; set; }
        public int PurchaseCount { get; set; }
        // Lo que se dejó de pagar gracias a las promociones.
        public decimal Savings { get; set; }
        public List<ProductSpendDto> ByProduct { get; set; } = new List<ProductSpendDto>();
    }

    public class ProductSpendDto
    {
        public int ProductId { get; set; }
        public string Name { get; set; } = "";
        public int StockType { get; set; }
        public decimal Spent { get; set; }
        public decimal Quantity { get; set; }
        public int Times { get; set; }
    }
}
