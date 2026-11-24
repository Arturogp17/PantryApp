using System;
using System.Collections.Generic;

namespace PantryManager.API.Models
{
    // Estado de cuenta de una tarjeta de crédito. Hay uno por tarjeta y fecha de corte (PeriodEnd).
    public class CardStatement
    {
        public int Id { get; set; }
        public int CardId { get; set; }
        public Card Card { get; set; } = null!;
        public DateOnly PeriodStart { get; set; }
        public DateOnly PeriodEnd { get; set; }
        public DateOnly DueDate { get; set; }
        public decimal PayToAvoidInterest { get; set; }
        public decimal MinimumPayment { get; set; }
        public decimal? MinimumPlusInstallments { get; set; }
        public decimal? TotalBalance { get; set; }
        public decimal? RegularBalance { get; set; }
        public decimal? InstallmentBalance { get; set; }
        public decimal? CreditLimit { get; set; }
        public decimal? AvailableCredit { get; set; }
        // Tasa anual en porcentaje del estado (50.82 = 50.82%).
        public decimal? AnnualRate { get; set; }
        public DateTime ImportedAt { get; set; } = DateTime.UtcNow;
        public string ImportedBy { get; set; } = "";
    }

    public class StatementDto
    {
        public int Id { get; set; }
        public int CardId { get; set; }
        public DateOnly PeriodStart { get; set; }
        public DateOnly PeriodEnd { get; set; }
        public DateOnly DueDate { get; set; }
        public decimal PayToAvoidInterest { get; set; }
        public decimal MinimumPayment { get; set; }
        public decimal? MinimumPlusInstallments { get; set; }
        public decimal? TotalBalance { get; set; }
        public decimal? RegularBalance { get; set; }
        public decimal? InstallmentBalance { get; set; }
        public decimal? CreditLimit { get; set; }
        public decimal? AvailableCredit { get; set; }
        public decimal? AnnualRate { get; set; }
        public DateTime ImportedAt { get; set; }
    }

    // Lo que el usuario confirmó después de leer el PDF en el navegador.
    public class StatementImportRequest
    {
        public int CardId { get; set; }
        public StatementDataRequest? Statement { get; set; }
        public List<StatementInstallmentRequest>? Installments { get; set; }
        public List<StatementExpenseRequest>? Expenses { get; set; }
    }

    public class StatementDataRequest
    {
        public DateOnly PeriodStart { get; set; }
        public DateOnly PeriodEnd { get; set; }
        public DateOnly DueDate { get; set; }
        public decimal? PayToAvoidInterest { get; set; }
        public decimal? MinimumPayment { get; set; }
        public decimal? MinimumPlusInstallments { get; set; }
        public decimal? TotalBalance { get; set; }
        public decimal? RegularBalance { get; set; }
        public decimal? InstallmentBalance { get; set; }
        public decimal? CreditLimit { get; set; }
        public decimal? AvailableCredit { get; set; }
        // Tasa anual en porcentaje del estado. Si viene, se copia a la tarjeta al importar.
        public decimal? AnnualRate { get; set; }
    }

    public class StatementInstallmentRequest
    {
        public string? ImportKey { get; set; }
        public string? Name { get; set; }
        public decimal TotalAmount { get; set; }
        public int Months { get; set; }
        public DateOnly FirstPaymentDate { get; set; }
        public int? CategoryId { get; set; }
        public string? Note { get; set; }
    }

    public class StatementExpenseRequest
    {
        public string? ImportKey { get; set; }
        public DateOnly Date { get; set; }
        public decimal Amount { get; set; }
        public string? Merchant { get; set; }
        public int CategoryId { get; set; }
        public string? Note { get; set; }
    }

    public class StatementImportResultDto
    {
        public int StatementId { get; set; }
        public int ExpensesCreated { get; set; }
        public int ExpensesSkipped { get; set; }
        public int PlansCreated { get; set; }
        public int PlansSkipped { get; set; }
    }
}
