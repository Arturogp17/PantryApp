using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Models;
using System.Text.RegularExpressions;

namespace PantryManager.API.Controllers
{
    // Tarjetas compartidas: las dos personas ven y editan las mismas.
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class CardsController : ControllerBase
    {
        private static readonly Regex ColorPattern = new Regex("^#[0-9A-Fa-f]{6}$");
        private static readonly Regex Last4Pattern = new Regex("^[0-9]{4}$");

        private readonly PantryContext _context;

        public CardsController(PantryContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<List<CardDto>>> GetCards()
        {
            var cards = await _context.Cards.OrderByDescending(c => c.IsActive).ThenBy(c => c.Name).ToListAsync();
            return cards.Select(ToDto).ToList();
        }

        [HttpPost]
        public async Task<ActionResult<CardDto>> Create([FromBody] CardRequest request)
        {
            var card = new Card();
            var error = Apply(card, request);
            if (error != null) return BadRequest(new { Message = error });

            _context.Cards.Add(card);
            await _context.SaveChangesAsync();
            return Ok(ToDto(card));
        }

        [HttpPut("{id:int}")]
        public async Task<ActionResult<CardDto>> Update(int id, [FromBody] CardRequest request)
        {
            var card = await _context.Cards.FindAsync(id);
            if (card == null) return NotFound();

            var error = Apply(card, request);
            if (error != null) return BadRequest(new { Message = error });

            await _context.SaveChangesAsync();
            return Ok(ToDto(card));
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var card = await _context.Cards.FindAsync(id);
            if (card == null) return NotFound();

            if (await _context.Expenses.AnyAsync(e => e.CardId == id)
                || await _context.InstallmentPlans.AnyAsync(p => p.CardId == id)
                || await _context.RecurringCharges.AnyAsync(c => c.CardId == id)
                || await _context.CardStatements.AnyAsync(s => s.CardId == id)
                || await _context.CardPayments.AnyAsync(p => p.CardId == id)
                || await _context.IncomeSources.AnyAsync(s => s.CardId == id))
            {
                return Conflict(new { Message = "La tarjeta tiene gastos, meses sin intereses, cargos recurrentes, pagos o ingresos. Desactívala en lugar de borrarla." });
            }

            _context.Cards.Remove(card);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        private static string? Apply(Card card, CardRequest request)
        {
            var name = request.Name?.Trim() ?? "";
            if (name.Length == 0 || name.Length > 80) return "El nombre es obligatorio (máximo 80 caracteres)";

            var bank = request.Bank?.Trim() ?? "";
            if (bank.Length > 40) return "El banco es demasiado largo";

            var kind = request.Kind ?? "credit";
            if (kind != "credit" && kind != "debit" && kind != "voucher") return "El tipo debe ser crédito, débito o vales";

            var last4 = string.IsNullOrWhiteSpace(request.Last4) ? null : request.Last4.Trim();
            if (last4 != null && !Last4Pattern.IsMatch(last4)) return "Los últimos 4 dígitos deben ser 4 números";

            var color = request.Color ?? "#3A7CA5";
            if (!ColorPattern.IsMatch(color)) return "El color no es válido";

            if (request.CutoffDay is < 1 or > 31 || request.DueDay is < 1 or > 31) return "El día debe estar entre 1 y 31";
            if (request.AnnualRate < 0 || request.AnnualRate > 500) return "La tasa anual debe estar entre 0 y 500";

            card.Name = name;
            card.Bank = bank;
            card.Kind = kind;
            card.Last4 = last4;
            card.Color = color;
            card.CutoffDay = kind == "credit" ? request.CutoffDay : null;
            card.DueDay = kind == "credit" ? request.DueDay : null;
            card.AnnualRate = kind == "credit" ? RoundRateOrNull(request.AnnualRate) : null;
            card.IsActive = request.IsActive;
            return null;
        }

        private static decimal? RoundRateOrNull(decimal? rate) => rate.HasValue ? Math.Round(rate.Value, 4, MidpointRounding.AwayFromZero) : null;

        private static CardDto ToDto(Card c) => new CardDto
        {
            Id = c.Id,
            Name = c.Name,
            Bank = c.Bank,
            Kind = c.Kind,
            Last4 = c.Last4,
            Color = c.Color,
            CutoffDay = c.CutoffDay,
            DueDay = c.DueDay,
            AnnualRate = c.AnnualRate,
            IsActive = c.IsActive
        };
    }
}
