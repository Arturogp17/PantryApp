namespace PantryManager.API.Models
{
    public class PurchaseItem
    {
        public int Id { get; set; }
        public int PurchaseId { get; set; }
        public int ProductId { get; set; }
        public decimal Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        
        // Relaciones
        public Purchase Purchase { get; set; }
        public Product Product { get; set; }
    }
}