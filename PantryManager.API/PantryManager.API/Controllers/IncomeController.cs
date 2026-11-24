using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Models;
using System.Security.Claims;

namespace PantryManager.API.Controllers
{
    // Ingresos: sueldos, quincenas y pagos únicos. Sirven para planear los pagos de las tarjetas.
    [Authorize]
    [ApiController]
    [Route("api/income")]
    public class IncomeController : ControllerBase
    {
        private const decimal MaxAmount = 99999999;

        private readonly PantryContext _context;

        public IncomeController(PantryContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<List<IncomeDto>>> GetIncome()
        {
            var sources = await _context.IncomeSources.OrderBy(s => s.Name).ToListAsync();
            return sources.Select(ToDto).ToList();
        }

        [HttpPost]
        public async Task<ActionResult<IncomeDto>> Create([FromBody] IncomeRequest request)
        {
            var source = new IncomeSource
            {
                CreatedBy = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "",
                CreatedAt = DateTime.UtcNow
            };

            var error = await ApplyAsync(source, request);
            if (error != null) return BadRequest(new { Message = error });

            _context.IncomeSources.Add(source);
            await _context.SaveChangesAsync();
            return Ok(ToDto(source));
        }

        [HttpPut("{id:int}")]
        public async Task<ActionResult<IncomeDto>> Update(int id, [FromBody] IncomeRequest request)
        {
            var source = await _context.IncomeSources.FindAsync(id);
            if (source == null) return NotFound();

            var error = await ApplyAsync(source, request);
            if (error != null) return BadRequest(new { Message = error });

            await _context.SaveChangesAsync();
            return Ok(ToDto(source));
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var source = await _context.IncomeSources.FindAsync(id);
            if (source == null) return NotFound();

            _context.IncomeSources.Remove(source);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // Valida el cuerpo y lo copia al ingreso. Devuelve el mensaje de error o null.
        private async Task<string?> ApplyAsync(IncomeSource source, IncomeRequest request)
        {
            var name = request.Name?.Trim() ?? "";
            if (name.Length == 0 || name.Length > 80) return "El nombre es obligatorio (máximo 80 caracteres)";

            if (request.Amount <= 0) return "El monto debe ser mayor a 0";
            if (request.Amount > MaxAmount) return "El monto es demasiado grande";

            var kind = request.Kind ?? "";
            if (kind != "semimonthly" && kind != "monthly" && kind != "once")
                return "El tipo debe ser semimensual, mensual o único";

            int? day1 = null;
            int? day2 = null;
            DateOnly? date = null;

            if (kind == "semimonthly")
            {
                if (!IsValidDay(request.Day1) || !IsValidDay(request.Day2)) return "Los días de pago deben estar entre 1 y 31";
                if (request.Day1 == request.Day2) return "Los dos días de pago deben ser distintos";
                day1 = request.Day1;
                day2 = request.Day2;
            }
            else if (kind == "monthly")
            {
                if (!IsValidDay(request.Day1)) return "El día de pago debe estar entre 1 y 31";
                day1 = request.Day1;
            }
            else
            {
                if (request.Date is null) return "Indica la fecha del pago";
                date = request.Date;
            }

            if (request.CardId.HasValue)
            {
                var card = await _context.Cards.FindAsync(request.CardId.Value);
                if (card == null) return "La tarjeta no existe";
                if (card.Kind != "voucher") return "El ingreso solo se puede depositar en una tarjeta de vales";
            }

            source.Name = name;
            source.Amount = Math.Round(request.Amount, 2, MidpointRounding.AwayFromZero);
            source.Kind = kind;
            source.Day1 = day1;
            source.Day2 = day2;
            source.Date = date;
            source.IsActive = request.IsActive;
            source.CardId = request.CardId;
            return null;
        }

        private static bool IsValidDay(int? day) => day is >= 1 and <= 31;

        private static IncomeDto ToDto(IncomeSource s) => new IncomeDto
        {
            Id = s.Id,
            Name = s.Name,
            Amount = s.Amount,
            Kind = s.Kind,
            Day1 = s.Day1,
            Day2 = s.Day2,
            Date = s.Date,
            IsActive = s.IsActive,
            CardId = s.CardId
        };
    }
}
