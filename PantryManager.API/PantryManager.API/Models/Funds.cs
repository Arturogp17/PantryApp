using System;

namespace PantryManager.API.Models
{
    // Dinero disponible capturado por la pareja. Es una sola fila con Id 1.
    public class AvailableFunds
    {
        public int Id { get; set; }
        public decimal Amount { get; set; }
        public DateOnly AsOf { get; set; }
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public string UpdatedBy { get; set; } = "";
    }

    public class FundsDto
    {
        public decimal Amount { get; set; }
        public DateOnly? AsOf { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public class FundsRequest
    {
        public decimal Amount { get; set; }
        public DateOnly AsOf { get; set; }
    }
}
