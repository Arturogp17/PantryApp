using System;

namespace PantryManager.API.Models
{
    // Lista de compras compartida por todos los usuarios. Una fila por producto.
    public class ShoppingListItem
    {
        public int Id { get; set; }
        public int ProductId { get; set; }
        public Product Product { get; set; } = null!;
        public decimal Quantity { get; set; } = 1;
        public string AddedBy { get; set; } = "";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class ShoppingListItemDto
    {
        public int Id { get; set; }
        public int ProductId { get; set; }
        public string Name { get; set; } = "";
        public string? Barcode { get; set; }
        public string ImageUrl { get; set; } = "";
        public decimal Quantity { get; set; }
        public int StockType { get; set; }
        public string UnitOfMeasure { get; set; } = "";
        public decimal LastPrice { get; set; }
        public decimal Stock { get; set; }
        public string AddedBy { get; set; } = "";
    }

    public class AddListItemRequest
    {
        public int? ProductId { get; set; }
        public string? Name { get; set; }
        public string? Barcode { get; set; }
        public int StockType { get; set; }
        public string? ImageUrl { get; set; }
        public decimal Quantity { get; set; } = 1;
    }

    public class UpdateListItemRequest
    {
        public decimal Quantity { get; set; }
    }
}
