using System;
using System.Collections.Generic;

namespace PantryManager.API.Models
{
    // Compra a plazos que se paga en "Months" cargos a una tarjeta de crédito: meses sin intereses,
    // o con intereses si MonthlyPayment tiene valor.
    // Los pagos son "comprometido": no cuentan en los totales de Gastos.
    public class InstallmentPlan
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public int CardId { get; set; }
        public Card Card { get; set; } = null!;
        public decimal TotalAmount { get; set; }
        public int Months { get; set; }
        // Mensualidad fija de un plan con intereses. Null en meses sin intereses.
        public decimal? MonthlyPayment { get; set; }
        // Tasa anual en porcentaje (45 = 45 %). Informativa: no cambia el cálculo.
        public decimal? InterestRate { get; set; }
        // El pago i (base 0) vence en FirstPaymentDate.AddMonths(i).
        public DateOnly FirstPaymentDate { get; set; }
        public int? CategoryId { get; set; }
        public ExpenseCategory? Category { get; set; }
        public string? Note { get; set; }
        public string CreatedBy { get; set; } = "";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Clave del plan al importar un estado de cuenta; evita importarlo dos veces.
        public string? ImportKey { get; set; }
    }

    // Cargo que se repite: cada mes (monthly) o una vez al año en MonthOfYear (yearly).
    public class RecurringCharge
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public decimal Amount { get; set; }
        // "monthly" o "yearly"
        public string Frequency { get; set; } = "monthly";
        public int DayOfMonth { get; set; }
        // Obligatorio si es yearly; null si es monthly.
        public int? MonthOfYear { get; set; }
        public int? CardId { get; set; }
        public Card? Card { get; set; }
        public int? CategoryId { get; set; }
        public ExpenseCategory? Category { get; set; }
        public bool IsActive { get; set; } = true;
    }

    public class InstallmentDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public int CardId { get; set; }
        public string CardName { get; set; } = "";
        public string CardColor { get; set; } = "";
        public decimal TotalAmount { get; set; }
        public int Months { get; set; }
        public decimal? MonthlyPayment { get; set; }
        public decimal? InterestRate { get; set; }
        public decimal TotalToPay { get; set; }
        public decimal MonthlyAmount { get; set; }
        public DateOnly FirstPaymentDate { get; set; }
        public int? CategoryId { get; set; }
        public string? Note { get; set; }
        public int PaidCount { get; set; }
        public decimal RemainingAmount { get; set; }
        public DateOnly LastPaymentDate { get; set; }
        public bool IsFinished { get; set; }
    }

    public class InstallmentRequest
    {
        public string? Name { get; set; }
        public int? CardId { get; set; }
        public decimal TotalAmount { get; set; }
        public int Months { get; set; }
        public decimal? MonthlyPayment { get; set; }
        public decimal? InterestRate { get; set; }
        public DateOnly? FirstPaymentDate { get; set; }
        public int? CategoryId { get; set; }
        public string? Note { get; set; }
    }

    public class RecurringDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public decimal Amount { get; set; }
        public string Frequency { get; set; } = "";
        public int DayOfMonth { get; set; }
        public int? MonthOfYear { get; set; }
        public int? CardId { get; set; }
        public string? CardName { get; set; }
        public string? CardColor { get; set; }
        public int? CategoryId { get; set; }
        public string? CategoryName { get; set; }
        public bool IsActive { get; set; }
        public DateOnly NextDate { get; set; }
    }

    public class RecurringRequest
    {
        public string? Name { get; set; }
        public decimal Amount { get; set; }
        public string? Frequency { get; set; }
        public int DayOfMonth { get; set; }
        public int? MonthOfYear { get; set; }
        public int? CardId { get; set; }
        public int? CategoryId { get; set; }
        public bool IsActive { get; set; } = true;
    }

    public class CommitmentsDto
    {
        public List<CommitmentMonthDto> Months { get; set; } = new List<CommitmentMonthDto>();
    }

    public class CommitmentMonthDto
    {
        // "2026-12"
        public string Month { get; set; } = "";
        public decimal InstallmentsTotal { get; set; }
        public decimal RecurringTotal { get; set; }
        public decimal Total { get; set; }
        // Solo pagos de meses sin intereses; los cargos recurrentes sin tarjeta no entran aquí.
        public List<CommitmentCardDto> ByCard { get; set; } = new List<CommitmentCardDto>();
    }

    public class CommitmentCardDto
    {
        public int CardId { get; set; }
        public string CardName { get; set; } = "";
        public string Color { get; set; } = "";
        public decimal Total { get; set; }
    }
}
