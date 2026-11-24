using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Models;
using System.Globalization;
using System.Security.Claims;

namespace PantryManager.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class ExpensesController : ControllerBase
    {
        private readonly PantryContext _context;

        public ExpensesController(PantryContext context)
        {
            _context = context;
        }

        [HttpPost]
        public async Task<ActionResult<ExpenseDto>> Create([FromBody] ExpenseRequest request)
        {
            if (request.ClientRequestId.HasValue)
            {
                var existing = await _context.Expenses
                    .Include(e => e.Category).ThenInclude(c => c.Parent)
                    .Include(e => e.Card)
                    .FirstOrDefaultAsync(e => e.ClientRequestId == request.ClientRequestId);
                if (existing != null) return Ok(ToDto(existing));
            }

            var expense = new Expense
            {
                CreatedBy = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "",
                ClientRequestId = request.ClientRequestId
            };

            var error = await ApplyAsync(expense, request);
            if (error != null) return BadRequest(new { Message = error });

            _context.Expenses.Add(expense);

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException) when (request.ClientRequestId.HasValue)
            {
                // Dos envíos simultáneos del mismo gasto: gana el primero.
                _context.ChangeTracker.Clear();
                var existing = await _context.Expenses
                    .Include(e => e.Category).ThenInclude(c => c.Parent)
                    .Include(e => e.Card)
                    .FirstOrDefaultAsync(e => e.ClientRequestId == request.ClientRequestId);
                if (existing != null) return Ok(ToDto(existing));
                throw;
            }

            return Ok(await LoadDtoAsync(expense.Id));
        }

        [HttpPut("{id:int}")]
        public async Task<ActionResult<ExpenseDto>> Update(int id, [FromBody] ExpenseRequest request)
        {
            var expense = await _context.Expenses.FindAsync(id);
            if (expense == null) return NotFound();

            var error = await ApplyAsync(expense, request);
            if (error != null) return BadRequest(new { Message = error });

            await _context.SaveChangesAsync();
            return Ok(await LoadDtoAsync(id));
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var expense = await _context.Expenses.FindAsync(id);
            if (expense == null) return NotFound();

            _context.Expenses.Remove(expense);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // GET api/expenses?from=2026-11-01&to=2026-12-01&cardId=3&cash=true&categoryId=6&skip=0&take=30
        // "from" entra y "to" no. cash=true trae solo efectivo. Una categoría principal incluye sus subcategorías.
        [HttpGet]
        public async Task<ActionResult<List<ExpenseDto>>> GetExpenses(
            [FromQuery(Name = "from")] DateOnly? fromDate, [FromQuery(Name = "to")] DateOnly? toDate, int? cardId, bool cash = false, int? categoryId = null, int skip = 0, int take = 30)
        {
            skip = Math.Max(skip, 0);
            take = Math.Clamp(take, 1, 100);

            var query = _context.Expenses.AsQueryable();
            if (fromDate.HasValue) query = query.Where(e => e.Date >= fromDate.Value);
            if (toDate.HasValue) query = query.Where(e => e.Date < toDate.Value);
            if (cash) query = query.Where(e => e.CardId == null);
            else if (cardId.HasValue) query = query.Where(e => e.CardId == cardId.Value);
            if (categoryId.HasValue)
            {
                var id = categoryId.Value;
                query = query.Where(e => e.CategoryId == id || e.Category.ParentId == id);
            }

            var expenses = await query
                .Include(e => e.Category).ThenInclude(c => c.Parent)
                .Include(e => e.Card)
                .OrderByDescending(e => e.Date).ThenByDescending(e => e.Id)
                .Skip(skip).Take(take)
                .ToListAsync();

            return expenses.Select(ToDto).ToList();
        }

        // GET api/expenses/summary?month=2026-11
        // shortcut: se agrupa en memoria; con decenas de miles de gastos habría que agrupar en SQL.
        [HttpGet("summary")]
        public async Task<ActionResult<ExpenseSummaryDto>> GetSummary(string? month)
        {
            DateOnly start;
            if (string.IsNullOrWhiteSpace(month))
            {
                var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-6));
                start = new DateOnly(today.Year, today.Month, 1);
            }
            else if (!DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out start))
            {
                return BadRequest(new { Message = "El mes debe tener el formato 2026-11" });
            }

            var end = start.AddMonths(1);
            var firstMonth = start.AddMonths(-5);

            var categories = await _context.ExpenseCategories.ToListAsync();
            var byId = categories.ToDictionary(c => c.Id);
            var cards = await _context.Cards.ToDictionaryAsync(c => c.Id);

            var rows = await _context.Expenses
                .Where(e => e.Date >= firstMonth && e.Date < end)
                .Select(e => new { e.Date, e.Amount, e.CategoryId, e.CardId })
                .ToListAsync();

            int TopLevel(int categoryId) =>
                byId.TryGetValue(categoryId, out var c) ? c.ParentId ?? c.Id : categoryId;

            var summary = new ExpenseSummaryDto { Month = MonthKey(start) };

            for (var m = firstMonth; m < end; m = m.AddMonths(1))
            {
                var next = m.AddMonths(1);
                var inMonth = rows.Where(r => r.Date >= m && r.Date < next).ToList();

                summary.ByMonth.Add(new MonthSpendDto
                {
                    Month = MonthKey(m),
                    Total = inMonth.Sum(r => r.Amount),
                    ByCategory = inMonth
                        .GroupBy(r => TopLevel(r.CategoryId))
                        .Select(g => new AmountByIdDto { Id = g.Key, Total = g.Sum(r => r.Amount) })
                        .OrderByDescending(a => a.Total)
                        .ToList()
                });
            }

            var current = rows.Where(r => r.Date >= start).ToList();
            summary.Total = current.Sum(r => r.Amount);
            summary.Count = current.Count;
            summary.PreviousMonthTotal = rows.Where(r => r.Date >= start.AddMonths(-1) && r.Date < start).Sum(r => r.Amount);

            summary.ByCategory = current
                .GroupBy(r => TopLevel(r.CategoryId))
                .Select(g =>
                {
                    byId.TryGetValue(g.Key, out var top);
                    return new CategorySpendDto
                    {
                        CategoryId = g.Key,
                        Name = top?.Name ?? "Sin categoría",
                        Color = top?.Color ?? "#A9A56F",
                        Total = g.Sum(r => r.Amount),
                        Children = g
                            .Where(r => r.CategoryId != g.Key)
                            .GroupBy(r => r.CategoryId)
                            .Select(cg => new SubcategorySpendDto
                            {
                                CategoryId = cg.Key,
                                Name = byId.TryGetValue(cg.Key, out var sub) ? sub.Name : "",
                                Total = cg.Sum(r => r.Amount)
                            })
                            .OrderByDescending(s => s.Total)
                            .ToList()
                    };
                })
                .OrderByDescending(c => c.Total)
                .ToList();

            summary.ByMethod = current
                .GroupBy(r => r.CardId)
                .Select(g =>
                {
                    Card? card = null;
                    if (g.Key.HasValue) cards.TryGetValue(g.Key.Value, out card);
                    return new MethodSpendDto
                    {
                        CardId = g.Key,
                        Name = card == null ? "Efectivo" : MethodName(card),
                        Color = card?.Color ?? CashColor,
                        Total = g.Sum(r => r.Amount)
                    };
                })
                .OrderByDescending(m => m.Total)
                .ToList();

            return summary;
        }

        private const string CashColor = "#E0B13D";

        private static string MonthKey(DateOnly d) => $"{d.Year:D4}-{d.Month:D2}";

        private static string MethodName(Card card) =>
            string.IsNullOrEmpty(card.Last4) ? card.Name : $"{card.Name} ·{card.Last4}";

        // Valida el cuerpo y lo copia al gasto. Devuelve el mensaje de error o null.
        private async Task<string?> ApplyAsync(Expense expense, ExpenseRequest request)
        {
            if (request.Amount <= 0) return "El monto debe ser mayor a 0";
            if (request.Amount > 99999999) return "El monto es demasiado grande";

            var merchant = request.Merchant?.Trim() ?? "";
            if (merchant.Length > 120) return "El comercio es demasiado largo (máximo 120 caracteres)";

            var note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
            if (note != null && note.Length > 300) return "La nota es demasiado larga (máximo 300 caracteres)";

            if (!await _context.ExpenseCategories.AnyAsync(c => c.Id == request.CategoryId))
                return "La categoría no existe";

            if (request.CardId.HasValue)
            {
                var card = await _context.Cards.FindAsync(request.CardId.Value);
                if (card == null) return "La tarjeta no existe";
                // Una tarjeta desactivada solo se puede seguir usando en gastos que ya la tenían.
                if (!card.IsActive && expense.CardId != card.Id) return "La tarjeta está desactivada";
            }

            expense.Date = request.Date ?? DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-6));
            expense.Amount = Math.Round(request.Amount, 2, MidpointRounding.AwayFromZero);
            expense.Merchant = merchant;
            expense.Note = note;
            expense.CategoryId = request.CategoryId;
            expense.CardId = request.CardId;
            return null;
        }

        private async Task<ExpenseDto> LoadDtoAsync(int id)
        {
            var expense = await _context.Expenses
                .Include(e => e.Category).ThenInclude(c => c.Parent)
                .Include(e => e.Card)
                .FirstAsync(e => e.Id == id);
            return ToDto(expense);
        }

        private static ExpenseDto ToDto(Expense e) => new ExpenseDto
        {
            Id = e.Id,
            Date = e.Date,
            Amount = e.Amount,
            Merchant = e.Merchant,
            Note = e.Note,
            CategoryId = e.CategoryId,
            CategoryName = e.Category.Name,
            ParentCategoryName = e.Category.Parent?.Name,
            CardId = e.CardId,
            MethodName = e.Card == null ? "Efectivo" : MethodName(e.Card),
            CardLast4 = e.Card?.Last4,
            MethodColor = e.Card?.Color ?? CashColor,
            CreatedBy = e.CreatedBy,
            PurchaseId = e.PurchaseId
        };
    }
}
