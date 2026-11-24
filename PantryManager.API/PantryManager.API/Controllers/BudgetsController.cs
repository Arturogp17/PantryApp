using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Models;

namespace PantryManager.API.Controllers
{
    // Presupuesto mensual por categoría de gasto. Una categoría tiene cero o un presupuesto.
    [Authorize]
    [ApiController]
    [Route("api/budgets")]
    public class BudgetsController : ControllerBase
    {
        private const decimal MaxAmount = 99999999;

        private readonly PantryContext _context;

        public BudgetsController(PantryContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<List<CategoryBudgetDto>>> GetBudgets()
        {
            var budgets = await _context.CategoryBudgets.OrderBy(b => b.CategoryId).ToListAsync();
            return budgets.Select(ToDto).ToList();
        }

        // PUT api/budgets/6: crea el presupuesto de la categoría o cambia su monto.
        [HttpPut("{categoryId:int}")]
        public async Task<ActionResult<CategoryBudgetDto>> Save(int categoryId, [FromBody] CategoryBudgetRequest request)
        {
            if (request.MonthlyAmount <= 0) return BadRequest(new { Message = "El monto debe ser mayor a 0" });
            if (request.MonthlyAmount > MaxAmount) return BadRequest(new { Message = "El monto es demasiado grande" });

            if (!await _context.ExpenseCategories.AnyAsync(c => c.Id == categoryId))
                return BadRequest(new { Message = "La categoría no existe" });

            var budget = await _context.CategoryBudgets.FirstOrDefaultAsync(b => b.CategoryId == categoryId);
            if (budget == null)
            {
                budget = new CategoryBudget { CategoryId = categoryId };
                _context.CategoryBudgets.Add(budget);
            }

            budget.MonthlyAmount = Math.Round(request.MonthlyAmount, 2, MidpointRounding.AwayFromZero);

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                // Dos guardados simultáneos de la misma categoría: el índice único deja solo uno.
                return Conflict(new { Message = "Otro cambio guardó el presupuesto de esta categoría al mismo tiempo. Vuelve a intentarlo." });
            }

            return Ok(ToDto(budget));
        }

        [HttpDelete("{categoryId:int}")]
        public async Task<IActionResult> Delete(int categoryId)
        {
            var budget = await _context.CategoryBudgets.FirstOrDefaultAsync(b => b.CategoryId == categoryId);
            if (budget == null) return NotFound();

            _context.CategoryBudgets.Remove(budget);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        private static CategoryBudgetDto ToDto(CategoryBudget b) => new CategoryBudgetDto
        {
            CategoryId = b.CategoryId,
            MonthlyAmount = b.MonthlyAmount
        };
    }
}
