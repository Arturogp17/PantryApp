using System;

namespace PantryManager.API.Models
{
    // Solicitudes de la lista de compras ya aplicadas. El cliente manda el Id (clientRequestId) y así
    // un reenvío de la misma acción no vuelve a sumar la cantidad.
    public class ProcessedRequest
    {
        public Guid Id { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
