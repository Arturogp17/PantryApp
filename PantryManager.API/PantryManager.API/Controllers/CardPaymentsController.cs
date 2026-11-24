using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Models;
using System.Security.Claims;

namespace PantryManager.API.Controllers
{
    // Pagos a tarjetas de crédito. Con deductFromFunds, el monto también sale de los fondos disponibles.
    [Authorize]
    [ApiController]
    [Route("api/card-payments")]
    public class CardPaymentsController : ControllerBase
    {
        private const int SingleFundsRowId = 1;
        private const decimal MaxAmount = 99999999;

        private readonly PantryContext _context;

        public CardPaymentsController(PantryContext context)
        {
            _context = context;
        }

        // GET api/card-payments?cardId=3&from=2026-11-01&to=2026-12-01
        // "from" entra y "to" no. Máximo 200, del más reciente al más viejo.
        [HttpGet]
        public async Task<ActionResult<List<CardPaymentDto>>> GetPayments(
            int? cardId, [FromQuery(Name = "from")] DateOnly? fromDate, [FromQuery(Name = "to")] DateOnly? toDate)
        {
            var query = _context.CardPayments.AsQueryable();
            if (cardId.HasValue) query = query.Where(p => p.CardId == cardId.Value);
            if (fromDate.HasValue) query = query.Where(p => p.Date >= fromDate.Value);
            if (toDate.HasValue) query = query.Where(p => p.Date < toDate.Value);

            var payments = await query
                .OrderByDescending(p => p.Date).ThenByDescending(p => p.Id)
                .Take(200)
                .ToListAsync();

            return payments.Select(ToDto).ToList();
        }

        // GET api/card-payments/since-cutoff: por cada tarjeta con estado de cuenta, lo pagado después de la
        // fecha de corte de su estado más reciente. Dos consultas; el cruce se hace en memoria.
        [HttpGet("since-cutoff")]
        public async Task<ActionResult<List<CardCutoffPaymentDto>>> GetSinceCutoff()
        {
            var latest = (await _context.CardStatements
                    .Select(s => new { s.CardId, s.PeriodEnd })
                    .ToListAsync())
                .GroupBy(s => s.CardId)
                .ToDictionary(g => g.Key, g => g.Max(s => s.PeriodEnd));

            if (latest.Count == 0) return new List<CardCutoffPaymentDto>();

            var cardIds = latest.Keys.ToList();
            var oldestCutoff = latest.Values.Min();

            var payments = await _context.CardPayments
                .Where(p => cardIds.Contains(p.CardId) && p.Date > oldestCutoff)
                .Select(p => new { p.CardId, p.Date, p.Amount })
                .ToListAsync();

            return latest
                .OrderBy(kv => kv.Key)
                .Select(kv => new CardCutoffPaymentDto
                {
                    CardId = kv.Key,
                    PeriodEnd = kv.Value,
                    Paid = payments
                        .Where(p => p.CardId == kv.Key && p.Date > kv.Value)
                        .Sum(p => p.Amount)
                })
                .ToList();
        }

        [HttpPost]
        public async Task<ActionResult<CardPaymentDto>> Create([FromBody] CardPaymentRequest request)
        {
            if (request.ClientRequestId.HasValue)
            {
                var existing = await FindByRequestIdAsync(request.ClientRequestId.Value);
                if (existing != null) return Ok(ToDto(existing));
            }

            var error = await ValidateAsync(request);
            if (error != null) return BadRequest(new { Message = error });

            var payment = new CardPayment
            {
                CardId = request.CardId,
                Date = request.Date!.Value,
                Amount = RoundMoney(request.Amount),
                Note = TrimNote(request.Note),
                ClientRequestId = request.ClientRequestId,
                CreatedBy = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "",
                CreatedAt = DateTime.UtcNow
            };
            _context.CardPayments.Add(payment);

            // El pago y el descuento de fondos se guardan en la misma SaveChanges (una transacción).
            if (request.DeductFromFunds)
            {
                var funds = await _context.AvailableFunds.FindAsync(SingleFundsRowId);
                if (funds != null)
                {
                    funds.Amount = Math.Max(0m, funds.Amount - payment.Amount);
                    funds.UpdatedAt = DateTime.UtcNow;
                    funds.UpdatedBy = payment.CreatedBy;
                }
            }

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException) when (request.ClientRequestId.HasValue)
            {
                // Dos envíos simultáneos del mismo pago: gana el primero. Si se descontó fondos, se revirtió con la transacción.
                _context.ChangeTracker.Clear();
                var existing = await FindByRequestIdAsync(request.ClientRequestId.Value);
                if (existing != null) return Ok(ToDto(existing));
                throw;
            }

            return Ok(ToDto(payment));
        }

        // Borra solo el pago. El dinero no regresa a fondos disponibles.
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var payment = await _context.CardPayments.FindAsync(id);
            if (payment == null) return NotFound();

            _context.CardPayments.Remove(payment);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // Valida el cuerpo. Devuelve el mensaje de error o null.
        private async Task<string?> ValidateAsync(CardPaymentRequest request)
        {
            if (request.Date is null || request.Date.Value == default) return "Indica la fecha del pago";

            if (request.Amount <= 0) return "El monto debe ser mayor a 0";
            if (request.Amount > MaxAmount) return "El monto es demasiado grande";

            var note = TrimNote(request.Note);
            if (note != null && note.Length > 300) return "La nota es demasiado larga (máximo 300 caracteres)";

            var card = await _context.Cards.FindAsync(request.CardId);
            if (card == null) return "La tarjeta no existe";
            if (card.Kind != "credit") return "Los pagos solo se pueden registrar a una tarjeta de crédito";
            if (!card.IsActive) return "La tarjeta está desactivada";

            return null;
        }

        private async Task<CardPayment?> FindByRequestIdAsync(Guid clientRequestId) =>
            await _context.CardPayments.FirstOrDefaultAsync(p => p.ClientRequestId == clientRequestId);

        private static decimal RoundMoney(decimal amount) => Math.Round(amount, 2, MidpointRounding.AwayFromZero);

        private static string? TrimNote(string? note) => string.IsNullOrWhiteSpace(note) ? null : note.Trim();

        private static CardPaymentDto ToDto(CardPayment p) => new CardPaymentDto
        {
            Id = p.Id,
            CardId = p.CardId,
            Date = p.Date,
            Amount = p.Amount,
            Note = p.Note,
            CreatedAt = p.CreatedAt
        };
    }
}
