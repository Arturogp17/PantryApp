namespace PantryManager.API.Models
{
    public class PurchaseItem
    {
        public int Id { get; set; }
        public int PurchaseId { get; set; } // Clave foránea para la compra
        public Purchase Purchase { get; set; } // Relación con la compra
        public int ProductId { get; set; } // Clave foránea para el producto
        public Product Product { get; set; } // Relación con el producto
        public decimal Quantity { get; set; } // Cantidad comprada
        public decimal UnitPrice { get; set; } // Precio unitario del producto
    }
}