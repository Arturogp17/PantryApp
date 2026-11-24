using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Models;
using PantryManager.API.Services;
using System.Security.Claims;

namespace PantryManager.API.Controllers
{
    // Meses sin intereses: cada plan es una compra a plazos cargada a una tarjeta de crédito.
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class InstallmentsController : ControllerBase
    {
        private readonly PantryContext _context;

        public InstallmentsController(PantryContext context)
        {
            _context = context;
        }

        // Los planes sin terminar van primero, y dentro de cada grupo, por fecha del último pago.
        [HttpGet]
        public async Task<ActionResult<List<InstallmentDto>>> GetInstallments()
        {
            var plans = await _context.InstallmentPlans
                .Include(p => p.Card)
                .ToListAsync();

            var today = InstallmentSchedule.TodayInMexico();
            return plans
                .Select(p => ToDto(p, today))
                .OrderBy(d => d.IsFinished)
                .ThenBy(d => d.LastPaymentDate)
                .ThenBy(d => d.Id)
                .ToList();
        }

        [HttpPost]
        public async Task<ActionResult<InstallmentDto>> Create([FromBody] InstallmentRequest request)
        {
            var plan = new InstallmentPlan
            {
                CreatedBy = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? ""
            };

            var error = await ApplyAsync(plan, request);
            if (error != null) return BadRequest(new { Message = error });

            _context.InstallmentPlans.Add(plan);
            await _context.SaveChangesAsync();

            return Ok(await LoadDtoAsync(plan.Id));
        }

        [HttpPut("{id:int}")]
        public async Task<ActionResult<InstallmentDto>> Update(int id, [FromBody] InstallmentRequest request)
        {
            var plan = await _context.InstallmentPlans.FindAsync(id);
            if (plan == null) return NotFound();

            var error = await ApplyAsync(plan, request);
            if (error != null) return BadRequest(new { Message = error });

            await _context.SaveChangesAsync();
            return Ok(await LoadDtoAsync(id));
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var plan = await _context.InstallmentPlans.FindAsync(id);
            if (plan == null) return NotFound();

            _context.InstallmentPlans.Remove(plan);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // Valida el cuerpo y lo copia al plan. Devuelve el mensaje de error o null.
        private async Task<string?> ApplyAsync(InstallmentPlan plan, InstallmentRequest request)
        {
            var name = request.Name?.Trim() ?? "";
            if (name.Length == 0 || name.Length > 120) return "El nombre es obligatorio (máximo 120 caracteres)";

            if (request.TotalAmount <= 0) return "El monto debe ser mayor a 0";
            if (request.TotalAmount > 99999999) return "El monto es demasiado grande";

            if (request.Months < 2 || request.Months > 60) return "Los meses deben estar entre 2 y 60";

            if (request.MonthlyPayment.HasValue
                && (request.MonthlyPayment.Value <= 0 || request.MonthlyPayment.Value > 99999999))
                return "La mensualidad debe ser mayor a 0 y menor a 99999999";
            if (request.InterestRate.HasValue && (request.InterestRate.Value < 0 || request.InterestRate.Value > 500))
                return "La tasa de interés debe estar entre 0 y 500";

            // Al editar no se pone una fecha por defecto: una fecha omitida no debe mover el cronograma.
            if (!request.FirstPaymentDate.HasValue) return "Indica la fecha del primer pago";

            var note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
            if (note != null && note.Length > 300) return "La nota es demasiado larga (máximo 300 caracteres)";

            if (!request.CardId.HasValue) return "Elige una tarjeta";
            var card = await _context.Cards.FindAsync(request.CardId.Value);
            if (card == null) return "La tarjeta no existe";
            if (card.Kind != "credit") return "Los meses sin intereses solo se pueden cargar a una tarjeta de crédito";

            if (request.CategoryId.HasValue
                && !await _context.ExpenseCategories.AnyAsync(c => c.Id == request.CategoryId.Value))
                return "La categoría no existe";

            plan.Name = name;
            plan.TotalAmount = Math.Round(request.TotalAmount, 2, MidpointRounding.AwayFromZero);
            plan.Months = request.Months;
            plan.MonthlyPayment = request.MonthlyPayment.HasValue
                ? Math.Round(request.MonthlyPayment.Value, 2, MidpointRounding.AwayFromZero)
                : null;
            plan.InterestRate = request.InterestRate.HasValue
                ? Math.Round(request.InterestRate.Value, 4, MidpointRounding.AwayFromZero)
                : null;
            plan.FirstPaymentDate = request.FirstPaymentDate.Value;
            plan.CardId = request.CardId.Value;
            plan.CategoryId = request.CategoryId;
            plan.Note = note;
            return null;
        }

        private async Task<InstallmentDto> LoadDtoAsync(int id)
        {
            var plan = await _context.InstallmentPlans
                .Include(p => p.Card)
                .FirstAsync(p => p.Id == id);
            return ToDto(plan, InstallmentSchedule.TodayInMexico());
        }

        private static InstallmentDto ToDto(InstallmentPlan p, DateOnly today)
        {
            var paidCount = InstallmentSchedule.CountDue(p.FirstPaymentDate, p.Months, today);

            var paidAmount = 0m;
            for (var i = 0; i < paidCount; i++)
            {
                paidAmount += InstallmentSchedule.PaymentAmount(p.TotalAmount, p.Months, i, p.MonthlyPayment);
            }

            var totalToPay = InstallmentSchedule.TotalToPay(p.TotalAmount, p.Months, p.MonthlyPayment);

            return new InstallmentDto
            {
                Id = p.Id,
                Name = p.Name,
                CardId = p.CardId,
                CardName = p.Card.Name,
                CardColor = p.Card.Color,
                TotalAmount = p.TotalAmount,
                Months = p.Months,
                MonthlyPayment = p.MonthlyPayment,
                InterestRate = p.InterestRate,
                TotalToPay = totalToPay,
                MonthlyAmount = InstallmentSchedule.MonthlyAmount(p.TotalAmount, p.Months, p.MonthlyPayment),
                FirstPaymentDate = p.FirstPaymentDate,
                CategoryId = p.CategoryId,
                Note = p.Note,
                PaidCount = paidCount,
                RemainingAmount = totalToPay - paidAmount,
                LastPaymentDate = InstallmentSchedule.PaymentDate(p.FirstPaymentDate, p.Months - 1),
                IsFinished = paidCount == p.Months
            };
        }
    }
}
