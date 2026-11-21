namespace PantryManager.API.Models
{
    public class PurchaseItem
    {
        public int Id { get; set; }
        public int PurchaseId { get; set; }
        public int ProductId { get; set; }
        public decimal Quantity { get; set; }
        public decimal UnitPrice { get; set; }

        // Importe del renglón con la promoción aplicada. Es nulo en las compras anteriores a las
        // promociones: en ese caso vale Quantity * UnitPrice.
        public decimal? LineTotal { get; set; }

        // Promoción usada: "nxm", "pack", "second" o "percent" (ver PromoCalculator).
        [System.ComponentModel.DataAnnotations.MaxLength(16)]
        public string? PromoType { get; set; }
        public int? PromoBuy { get; set; }
        public decimal? PromoValue { get; set; }
        
        // Relaciones
        public Purchase Purchase { get; set; } = null!;
        public Product Product { get; set; } = null!;
    }
}