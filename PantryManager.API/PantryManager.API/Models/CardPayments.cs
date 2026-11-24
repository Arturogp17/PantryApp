using System;

namespace PantryManager.API.Models
{
    // Pago hecho a una tarjeta de crédito. Si al registrarlo se descontó de los fondos disponibles, eso
    // quedó en la misma operación; borrar el pago no devuelve ese dinero a fondos.
    public class CardPayment
    {
        public int Id { get; set; }
        public int CardId { get; set; }
        public Card Card { get; set; } = null!;
        public DateOnly Date { get; set; }
        public decimal Amount { get; set; }
        public string? Note { get; set; }

        // Lo genera el cliente para que reenviar un pago no lo registre dos veces.
        public Guid? ClientRequestId { get; set; }
        public string CreatedBy { get; set; } = "";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class CardPaymentDto
    {
        public int Id { get; set; }
        public int CardId { get; set; }
        public DateOnly Date { get; set; }
        public decimal Amount { get; set; }
        public string? Note { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class CardPaymentRequest
    {
        public int CardId { get; set; }
        public DateOnly? Date { get; set; }
        public decimal Amount { get; set; }
        public string? Note { get; set; }
        public Guid? ClientRequestId { get; set; }
        public bool DeductFromFunds { get; set; }
    }

    // Lo pagado a una tarjeta después de la fecha de corte de su estado más reciente.
    public class CardCutoffPaymentDto
    {
        public int CardId { get; set; }
        public decimal Paid { get; set; }
        public DateOnly PeriodEnd { get; set; }
    }
}
