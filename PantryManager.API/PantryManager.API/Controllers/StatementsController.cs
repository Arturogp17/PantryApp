using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Models;
using System.Security.Claims;

namespace PantryManager.API.Controllers
{
    // Estados de cuenta de tarjetas de crédito. El navegador lee el PDF y manda lo que el usuario confirmó;
    // aquí solo se valida y se guarda.
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class StatementsController : ControllerBase
    {
        private const int MaxExpensesPerImport = 500;
        private const int MaxPlansPerImport = 50;
        private const decimal MaxAmount = 99999999;

        private readonly PantryContext _context;

        public StatementsController(PantryContext context)
        {
            _context = context;
        }

        // POST api/statements/import
        // Todo se guarda en una transacción. Reimportar un movimiento con la misma importKey lo omite.
        [HttpPost("import")]
        public async Task<ActionResult<StatementImportResultDto>> Import([FromBody] StatementImportRequest request)
        {
            var data = request.Statement;
            if (data == null) return BadRequest(new { Message = "Falta el estado de cuenta" });

            var statementError = ValidateStatement(data);
            if (statementError != null) return BadRequest(new { Message = statementError });

            var installments = request.Installments ?? new List<StatementInstallmentRequest>();
            var expenses = request.Expenses ?? new List<StatementExpenseRequest>();
            if (installments.Count > MaxPlansPerImport) return BadRequest(new { Message = "Máximo 50 planes por importación" });
            if (expenses.Count > MaxExpensesPerImport) return BadRequest(new { Message = "Máximo 500 gastos por importación" });

            foreach (var plan in installments)
            {
                var error = ValidateInstallment(plan);
                if (error != null) return BadRequest(new { Message = error });
            }

            foreach (var expense in expenses)
            {
                var error = ValidateExpense(expense);
                if (error != null) return BadRequest(new { Message = error });
            }

            var importedBy = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";

            await using var tx = await _context.Database.BeginTransactionAsync();

            var card = await _context.Cards.FindAsync(request.CardId);
            if (card == null) return BadRequest(new { Message = "La tarjeta no existe" });
            if (card.Kind != "credit") return BadRequest(new { Message = "Los estados de cuenta solo se pueden importar a una tarjeta de crédito" });
            if (!card.IsActive) return BadRequest(new { Message = "La tarjeta está desactivada" });

            var categoryIds = installments.Where(p => p.CategoryId.HasValue).Select(p => p.CategoryId!.Value)
                .Concat(expenses.Select(e => e.CategoryId))
                .Distinct()
                .ToList();
            var foundCategoryIds = await _context.ExpenseCategories
                .Where(c => categoryIds.Contains(c.Id))
                .Select(c => c.Id)
                .ToListAsync();
            if (categoryIds.Any(id => !foundCategoryIds.Contains(id))) return BadRequest(new { Message = "La categoría no existe" });

            var expenseKeys = expenses.Select(e => ImportKeyOf(e.ImportKey)).Distinct().ToList();
            var existingExpenseKeys = (await _context.Expenses
                .Where(e => e.ImportKey != null && expenseKeys.Contains(e.ImportKey))
                .Select(e => e.ImportKey)
                .ToListAsync()).ToHashSet();

            var planKeys = installments.Select(p => ImportKeyOf(p.ImportKey)).Distinct().ToList();
            var existingPlanKeys = (await _context.InstallmentPlans
                .Where(p => p.ImportKey != null && planKeys.Contains(p.ImportKey))
                .Select(p => p.ImportKey)
                .ToListAsync()).ToHashSet();

            // Un estado por tarjeta y fecha de corte: reimportar el mismo lo actualiza.
            var periodEnd = data.PeriodEnd;
            var statement = await _context.CardStatements
                .FirstOrDefaultAsync(s => s.CardId == request.CardId && s.PeriodEnd == periodEnd);
            if (statement == null)
            {
                statement = new CardStatement { CardId = request.CardId };
                _context.CardStatements.Add(statement);
            }

            CopyStatement(statement, data);
            statement.ImportedAt = DateTime.UtcNow;
            statement.ImportedBy = importedBy;

            card.CutoffDay = data.PeriodEnd.Day;
            card.DueDay = data.DueDate.Day;
            if (data.AnnualRate.HasValue) card.AnnualRate = RoundRateOrNull(data.AnnualRate);

            var seenExpenseKeys = new HashSet<string>();
            var expensesCreated = 0;
            var expensesSkipped = 0;
            foreach (var item in expenses)
            {
                var key = ImportKeyOf(item.ImportKey);
                if (existingExpenseKeys.Contains(key) || !seenExpenseKeys.Add(key))
                {
                    expensesSkipped++;
                    continue;
                }

                _context.Expenses.Add(new Expense
                {
                    Date = item.Date,
                    Amount = RoundMoney(item.Amount),
                    Merchant = TrimMerchant(item.Merchant),
                    Note = TrimNote(item.Note),
                    CategoryId = item.CategoryId,
                    CardId = request.CardId,
                    CreatedBy = importedBy,
                    ImportKey = key
                });
                expensesCreated++;
            }

            var seenPlanKeys = new HashSet<string>();
            var plansCreated = 0;
            var plansSkipped = 0;
            foreach (var item in installments)
            {
                var key = ImportKeyOf(item.ImportKey);
                if (existingPlanKeys.Contains(key) || !seenPlanKeys.Add(key))
                {
                    plansSkipped++;
                    continue;
                }

                _context.InstallmentPlans.Add(new InstallmentPlan
                {
                    Name = item.Name?.Trim() ?? "",
                    CardId = request.CardId,
                    TotalAmount = RoundMoney(item.TotalAmount),
                    Months = item.Months,
                    FirstPaymentDate = item.FirstPaymentDate,
                    CategoryId = item.CategoryId,
                    Note = TrimNote(item.Note),
                    CreatedBy = importedBy,
                    ImportKey = key
                });
                plansCreated++;
            }

            try
            {
                await _context.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch (DbUpdateException)
            {
                // Otra importación del mismo estado guardó sus movimientos al mismo tiempo.
                return Conflict(new { Message = "Otra importación guardó movimientos de este estado al mismo tiempo. Vuelve a intentarlo." });
            }

            return Ok(new StatementImportResultDto
            {
                StatementId = statement.Id,
                ExpensesCreated = expensesCreated,
                ExpensesSkipped = expensesSkipped,
                PlansCreated = plansCreated,
                PlansSkipped = plansSkipped
            });
        }

        // GET api/statements/latest: el estado más reciente de cada tarjeta de crédito que tenga alguno.
        [HttpGet("latest")]
        public async Task<ActionResult<List<StatementDto>>> GetLatest()
        {
            var rows = await _context.CardStatements
                .Where(s => s.Card.Kind == "credit")
                .OrderByDescending(s => s.PeriodEnd)
                .ToListAsync();

            return rows
                .GroupBy(s => s.CardId)
                .Select(g => ToDto(g.First()))
                .OrderBy(d => d.CardId)
                .ToList();
        }

        // GET api/statements?cardId=3: historial de una tarjeta, del más reciente al más viejo (máximo 24).
        [HttpGet]
        public async Task<ActionResult<List<StatementDto>>> GetHistory(int? cardId)
        {
            if (!cardId.HasValue) return BadRequest(new { Message = "Indica la tarjeta" });

            var rows = await _context.CardStatements
                .Where(s => s.CardId == cardId.Value)
                .OrderByDescending(s => s.PeriodEnd)
                .Take(24)
                .ToListAsync();

            return rows.Select(ToDto).ToList();
        }

        // Borra solo el registro del estado. Los gastos y planes ya importados se quedan.
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var statement = await _context.CardStatements.FindAsync(id);
            if (statement == null) return NotFound();

            _context.CardStatements.Remove(statement);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        private static string? ValidateStatement(StatementDataRequest data)
        {
            if (data.PeriodStart == default || data.PeriodEnd == default || data.DueDate == default)
                return "Indica las fechas del estado de cuenta";
            if (data.PeriodStart > data.PeriodEnd) return "El periodo del estado de cuenta es inválido";

            if (!data.PayToAvoidInterest.HasValue || !data.MinimumPayment.HasValue)
                return "Indica el pago para no generar intereses y el pago mínimo";
            if (data.PayToAvoidInterest < 0 || data.MinimumPayment < 0) return "Los pagos no pueden ser negativos";

            if (AmountOutOfRange(data.PayToAvoidInterest) || AmountOutOfRange(data.MinimumPayment)
                || AmountOutOfRange(data.MinimumPlusInstallments) || AmountOutOfRange(data.TotalBalance)
                || AmountOutOfRange(data.RegularBalance) || AmountOutOfRange(data.InstallmentBalance)
                || AmountOutOfRange(data.CreditLimit) || AmountOutOfRange(data.AvailableCredit))
                return "Un monto del estado de cuenta es demasiado grande";

            if (data.AnnualRate < 0 || data.AnnualRate > 500) return "La tasa anual debe estar entre 0 y 500";

            return null;
        }

        private static string? ValidateInstallment(StatementInstallmentRequest item)
        {
            var key = ImportKeyOf(item.ImportKey);
            if (key.Length == 0 || key.Length > 100) return "Cada plan necesita una clave de importación (máximo 100 caracteres)";

            var name = item.Name?.Trim() ?? "";
            if (name.Length == 0 || name.Length > 120) return "El nombre es obligatorio (máximo 120 caracteres)";

            if (item.TotalAmount <= 0) return "El monto debe ser mayor a 0";
            if (item.TotalAmount > MaxAmount) return "El monto es demasiado grande";

            if (item.Months < 2 || item.Months > 60) return "Los meses deben estar entre 2 y 60";
            if (item.FirstPaymentDate == default) return "Indica la fecha del primer pago";

            if (TrimNote(item.Note)?.Length > 300) return "La nota es demasiado larga (máximo 300 caracteres)";

            return null;
        }

        private static string? ValidateExpense(StatementExpenseRequest item)
        {
            var key = ImportKeyOf(item.ImportKey);
            if (key.Length == 0 || key.Length > 100) return "Cada gasto necesita una clave de importación (máximo 100 caracteres)";

            if (item.Date == default) return "Indica la fecha de cada gasto";

            if (item.Amount <= 0) return "El monto debe ser mayor a 0";
            if (item.Amount > MaxAmount) return "El monto es demasiado grande";

            var merchant = item.Merchant?.Trim() ?? "";
            if (merchant.Length == 0 || merchant.Length > 120) return "El comercio es obligatorio (máximo 120 caracteres)";

            if (item.CategoryId <= 0) return "Indica la categoría de cada gasto";

            if (TrimNote(item.Note)?.Length > 300) return "La nota es demasiado larga (máximo 300 caracteres)";

            return null;
        }

        private static void CopyStatement(CardStatement target, StatementDataRequest data)
        {
            target.PeriodStart = data.PeriodStart;
            target.PeriodEnd = data.PeriodEnd;
            target.DueDate = data.DueDate;
            target.PayToAvoidInterest = RoundMoney(data.PayToAvoidInterest.GetValueOrDefault());
            target.MinimumPayment = RoundMoney(data.MinimumPayment.GetValueOrDefault());
            target.MinimumPlusInstallments = RoundMoneyOrNull(data.MinimumPlusInstallments);
            target.TotalBalance = RoundMoneyOrNull(data.TotalBalance);
            target.RegularBalance = RoundMoneyOrNull(data.RegularBalance);
            target.InstallmentBalance = RoundMoneyOrNull(data.InstallmentBalance);
            target.CreditLimit = RoundMoneyOrNull(data.CreditLimit);
            target.AvailableCredit = RoundMoneyOrNull(data.AvailableCredit);
            target.AnnualRate = RoundRateOrNull(data.AnnualRate);
        }

        private static bool AmountOutOfRange(decimal? amount) => amount.HasValue && Math.Abs(amount.Value) > MaxAmount;

        private static decimal RoundMoney(decimal amount) => Math.Round(amount, 2, MidpointRounding.AwayFromZero);

        private static decimal? RoundMoneyOrNull(decimal? amount) => amount.HasValue ? RoundMoney(amount.Value) : null;

        private static decimal? RoundRateOrNull(decimal? rate) => rate.HasValue ? Math.Round(rate.Value, 4, MidpointRounding.AwayFromZero) : null;

        private static string ImportKeyOf(string? key) => key?.Trim() ?? "";

        private static string? TrimNote(string? note) => string.IsNullOrWhiteSpace(note) ? null : note.Trim();

        // La longitud ya se validó en ValidateExpense.
        private static string TrimMerchant(string? merchant) => merchant?.Trim() ?? "";

        private static StatementDto ToDto(CardStatement s) => new StatementDto
        {
            Id = s.Id,
            CardId = s.CardId,
            PeriodStart = s.PeriodStart,
            PeriodEnd = s.PeriodEnd,
            DueDate = s.DueDate,
            PayToAvoidInterest = s.PayToAvoidInterest,
            MinimumPayment = s.MinimumPayment,
            MinimumPlusInstallments = s.MinimumPlusInstallments,
            TotalBalance = s.TotalBalance,
            RegularBalance = s.RegularBalance,
            InstallmentBalance = s.InstallmentBalance,
            CreditLimit = s.CreditLimit,
            AvailableCredit = s.AvailableCredit,
            AnnualRate = s.AnnualRate,
            ImportedAt = s.ImportedAt
        };
    }
}
