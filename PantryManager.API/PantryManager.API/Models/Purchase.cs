using System;
using System.Collections.Generic;

namespace PantryManager.API.Models
{
    public class Purchase
    {
        public int Id { get; set; }
        public DateTime PurchaseDate { get; set; } = DateTime.UtcNow; // Fecha de la compra
        public decimal TotalAmount { get; set; } // Total de la compra
        public ICollection<PurchaseItem> PurchaseItems { get; set; } = new List<PurchaseItem>(); // Relación con los productos comprados
    }
}