using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Models;
using PantryManager.API.Services;
using System.Globalization;

namespace PantryManager.API.Controllers
{
    // Compromisos: pagos de meses sin intereses y cargos recurrentes, mes por mes.
    // Son "comprometido": no se suman a los gastos de la sección Gastos.
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class CommitmentsController : ControllerBase
    {
        private readonly PantryContext _context;

        public CommitmentsController(PantryContext context)
        {
            _context = context;
        }

        // GET api/commitments?month=2026-12&count=6
        // Devuelve "count" meses a partir de "month", del más cercano al más lejano.
        [HttpGet]
        public async Task<ActionResult<CommitmentsDto>> GetCommitments(string? month, int count = 6)
        {
            count = Math.Clamp(count, 1, 24);

            DateOnly start;
            if (string.IsNullOrWhiteSpace(month))
            {
                var today = InstallmentSchedule.TodayInMexico();
                start = new DateOnly(today.Year, today.Month, 1);
            }
            else if (!DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out start))
            {
                return BadRequest(new { Message = "El mes debe tener el formato 2026-11" });
            }

            var plans = await _context.InstallmentPlans
                .Include(p => p.Card)
                .ToListAsync();

            var charges = await _context.RecurringCharges
                .Where(c => c.IsActive)
                .ToListAsync();

            var result = new CommitmentsDto();
            for (var k = 0; k < count; k++)
            {
                var first = start.AddMonths(k);
                var summary = new CommitmentMonthDto { Month = MonthKey(first) };
                var byCard = new Dictionary<int, CommitmentCardDto>();

                foreach (var plan in plans)
                {
                    var index = InstallmentSchedule.PaymentIndexInMonth(plan.FirstPaymentDate, plan.Months, first.Year, first.Month);
                    if (index == null) continue;

                    var amount = InstallmentSchedule.PaymentAmount(plan.TotalAmount, plan.Months, index.Value, plan.MonthlyPayment);
                    summary.InstallmentsTotal += amount;

                    if (!byCard.TryGetValue(plan.CardId, out var cardRow))
                    {
                        cardRow = new CommitmentCardDto
                        {
                            CardId = plan.CardId,
                            CardName = plan.Card.Name,
                            Color = plan.Card.Color
                        };
                        byCard[plan.CardId] = cardRow;
                    }
                    cardRow.Total += amount;
                }

                foreach (var charge in charges)
                {
                    if (InstallmentSchedule.RecurringOccursInMonth(charge, first.Year, first.Month))
                    {
                        summary.RecurringTotal += charge.Amount;
                    }
                }

                summary.ByCard = byCard.Values.OrderByDescending(c => c.Total).ToList();
                summary.Total = summary.InstallmentsTotal + summary.RecurringTotal;
                result.Months.Add(summary);
            }

            return result;
        }

        private static string MonthKey(DateOnly d) => $"{d.Year:D4}-{d.Month:D2}";
    }
}
