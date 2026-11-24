using System;

namespace PantryManager.API.Models
{
    // Ingreso. Kind: "semimonthly" (dos pagos al mes en Day1 y Day2), "monthly" (un pago al mes en Day1)
    // o "once" (un pago en Date). Los campos que no aplican al tipo se guardan null.
    public class IncomeSource
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public decimal Amount { get; set; }
        public string Kind { get; set; } = "monthly";
        public int? Day1 { get; set; }
        public int? Day2 { get; set; }
        public DateOnly? Date { get; set; }
        public bool IsActive { get; set; } = true;

        // Tarjeta de vales donde se deposita el ingreso. Null = no se deposita en una tarjeta.
        public int? CardId { get; set; }
        public Card? Card { get; set; }

        public string CreatedBy { get; set; } = "";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class IncomeDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public decimal Amount { get; set; }
        public string Kind { get; set; } = "";
        public int? Day1 { get; set; }
        public int? Day2 { get; set; }
        public DateOnly? Date { get; set; }
        public bool IsActive { get; set; }
        public int? CardId { get; set; }
    }

    public class IncomeRequest
    {
        public string? Name { get; set; }
        public decimal Amount { get; set; }
        public string? Kind { get; set; }
        public int? Day1 { get; set; }
        public int? Day2 { get; set; }
        public DateOnly? Date { get; set; }
        public bool IsActive { get; set; } = true;
        public int? CardId { get; set; }
    }
}
