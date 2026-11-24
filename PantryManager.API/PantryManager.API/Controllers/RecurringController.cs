using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Models;
using PantryManager.API.Services;

namespace PantryManager.API.Controllers
{
    // Cargos recurrentes: suscripciones y pagos que se repiten cada mes o cada año.
    [Authorize]
    [ApiController]
    [Route("api/recurring")]
    public class RecurringController : ControllerBase
    {
        private readonly PantryContext _context;

        public RecurringController(PantryContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<List<RecurringDto>>> GetRecurring()
        {
            var charges = await _context.RecurringCharges
                .Include(c => c.Card)
                .Include(c => c.Category)
                .ToListAsync();

            var today = InstallmentSchedule.TodayInMexico();
            return charges
                .Select(c => ToDto(c, today))
                .OrderByDescending(d => d.IsActive)
                .ThenBy(d => d.NextDate)
                .ThenBy(d => d.Name)
                .ToList();
        }

        [HttpPost]
        public async Task<ActionResult<RecurringDto>> Create([FromBody] RecurringRequest request)
        {
            var charge = new RecurringCharge();

            var error = await ApplyAsync(charge, request);
            if (error != null) return BadRequest(new { Message = error });

            _context.RecurringCharges.Add(charge);
            await _context.SaveChangesAsync();

            return Ok(await LoadDtoAsync(charge.Id));
        }

        [HttpPut("{id:int}")]
        public async Task<ActionResult<RecurringDto>> Update(int id, [FromBody] RecurringRequest request)
        {
            var charge = await _context.RecurringCharges.FindAsync(id);
            if (charge == null) return NotFound();

            var error = await ApplyAsync(charge, request);
            if (error != null) return BadRequest(new { Message = error });

            await _context.SaveChangesAsync();
            return Ok(await LoadDtoAsync(id));
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var charge = await _context.RecurringCharges.FindAsync(id);
            if (charge == null) return NotFound();

            _context.RecurringCharges.Remove(charge);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // Valida el cuerpo y lo copia al cargo. Devuelve el mensaje de error o null.
        private async Task<string?> ApplyAsync(RecurringCharge charge, RecurringRequest request)
        {
            var name = request.Name?.Trim() ?? "";
            if (name.Length == 0 || name.Length > 120) return "El nombre es obligatorio (máximo 120 caracteres)";

            if (request.Amount <= 0) return "El monto debe ser mayor a 0";
            if (request.Amount > 99999999) return "El monto es demasiado grande";

            var frequency = request.Frequency ?? "";
            if (frequency != "monthly" && frequency != "yearly") return "La frecuencia debe ser mensual o anual";

            if (request.DayOfMonth is < 1 or > 31) return "El día debe estar entre 1 y 31";

            int? monthOfYear = null;
            if (frequency == "yearly")
            {
                if (request.MonthOfYear is not (>= 1 and <= 12)) return "El mes debe estar entre 1 y 12";
                monthOfYear = request.MonthOfYear;
            }

            if (request.CardId.HasValue
                && !await _context.Cards.AnyAsync(c => c.Id == request.CardId.Value))
                return "La tarjeta no existe";

            if (request.CategoryId.HasValue
                && !await _context.ExpenseCategories.AnyAsync(c => c.Id == request.CategoryId.Value))
                return "La categoría no existe";

            charge.Name = name;
            charge.Amount = Math.Round(request.Amount, 2, MidpointRounding.AwayFromZero);
            charge.Frequency = frequency;
            charge.DayOfMonth = request.DayOfMonth;
            charge.MonthOfYear = monthOfYear;
            charge.CardId = request.CardId;
            charge.CategoryId = request.CategoryId;
            charge.IsActive = request.IsActive;
            return null;
        }

        private async Task<RecurringDto> LoadDtoAsync(int id)
        {
            var charge = await _context.RecurringCharges
                .Include(c => c.Card)
                .Include(c => c.Category)
                .FirstAsync(c => c.Id == id);
            return ToDto(charge, InstallmentSchedule.TodayInMexico());
        }

        private static RecurringDto ToDto(RecurringCharge c, DateOnly today) => new RecurringDto
        {
            Id = c.Id,
            Name = c.Name,
            Amount = c.Amount,
            Frequency = c.Frequency,
            DayOfMonth = c.DayOfMonth,
            MonthOfYear = c.MonthOfYear,
            CardId = c.CardId,
            CardName = c.Card?.Name,
            CardColor = c.Card?.Color,
            CategoryId = c.CategoryId,
            CategoryName = c.Category?.Name,
            IsActive = c.IsActive,
            NextDate = InstallmentSchedule.NextRecurringDate(c, today)
        };
    }
}
