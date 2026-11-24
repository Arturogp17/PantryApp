using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Models;
using PantryManager.API.Services;
using System.Text.RegularExpressions;

namespace PantryManager.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/expense-categories")]
    public class ExpenseCategoriesController : ControllerBase
    {
        private static readonly Regex ColorPattern = new Regex("^#[0-9A-Fa-f]{6}$");

        private readonly PantryContext _context;

        public ExpenseCategoriesController(PantryContext context)
        {
            _context = context;
        }

        // Lista plana; las subcategorías traen el id de su categoría en parentId.
        [HttpGet]
        public async Task<ActionResult<List<ExpenseCategoryDto>>> GetCategories()
        {
            await ExpenseCategorySeeder.EnsureAsync(_context);

            var categories = await _context.ExpenseCategories
                .OrderBy(c => c.SortOrder).ThenBy(c => c.Name)
                .ToListAsync();

            return categories.Select(ToDto).ToList();
        }

        [HttpPost]
        public async Task<ActionResult<ExpenseCategoryDto>> Create([FromBody] ExpenseCategoryRequest request)
        {
            var name = request.Name?.Trim() ?? "";
            if (name.Length == 0 || name.Length > 60) return BadRequest(new { Message = "El nombre es obligatorio (máximo 60 caracteres)" });

            if (request.Color != null && !ColorPattern.IsMatch(request.Color))
                return BadRequest(new { Message = "El color no es válido" });

            if (request.ParentId.HasValue)
            {
                var parent = await _context.ExpenseCategories.FindAsync(request.ParentId.Value);
                if (parent == null) return BadRequest(new { Message = "La categoría principal no existe" });
                if (parent.ParentId != null) return BadRequest(new { Message = "Solo hay un nivel de subcategorías" });
            }

            if (await _context.ExpenseCategories.AnyAsync(c => c.ParentId == request.ParentId && c.Name == name))
                return Conflict(new { Message = "Ya existe una categoría con ese nombre" });

            var siblings = await _context.ExpenseCategories.Where(c => c.ParentId == request.ParentId).ToListAsync();
            var category = new ExpenseCategory
            {
                Name = name,
                ParentId = request.ParentId,
                Color = request.ParentId.HasValue ? null : request.Color ?? "#A9A56F",
                SortOrder = siblings.Count == 0 ? 0 : siblings.Max(c => c.SortOrder) + 1
            };

            _context.ExpenseCategories.Add(category);
            await _context.SaveChangesAsync();
            return Ok(ToDto(category));
        }

        [HttpPut("{id:int}")]
        public async Task<ActionResult<ExpenseCategoryDto>> Update(int id, [FromBody] ExpenseCategoryRequest request)
        {
            var category = await _context.ExpenseCategories.FindAsync(id);
            if (category == null) return NotFound();

            var name = request.Name?.Trim() ?? "";
            if (name.Length == 0 || name.Length > 60) return BadRequest(new { Message = "El nombre es obligatorio (máximo 60 caracteres)" });

            if (request.Color != null && !ColorPattern.IsMatch(request.Color))
                return BadRequest(new { Message = "El color no es válido" });

            if (await _context.ExpenseCategories.AnyAsync(c => c.Id != id && c.ParentId == category.ParentId && c.Name == name))
                return Conflict(new { Message = "Ya existe una categoría con ese nombre" });

            category.Name = name;
            if (category.ParentId == null && request.Color != null) category.Color = request.Color;

            await _context.SaveChangesAsync();
            return Ok(ToDto(category));
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var category = await _context.ExpenseCategories.FindAsync(id);
            if (category == null) return NotFound();

            if (await _context.ExpenseCategories.AnyAsync(c => c.ParentId == id))
                return Conflict(new { Message = "Tiene subcategorías. Bórralas primero." });

            if (await _context.Expenses.AnyAsync(e => e.CategoryId == id)
                || await _context.InstallmentPlans.AnyAsync(p => p.CategoryId == id)
                || await _context.RecurringCharges.AnyAsync(c => c.CategoryId == id))
                return Conflict(new { Message = "Tiene gastos, meses sin intereses o cargos recurrentes, no se puede borrar." });

            _context.ExpenseCategories.Remove(category);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        private static ExpenseCategoryDto ToDto(ExpenseCategory c) => new ExpenseCategoryDto
        {
            Id = c.Id,
            Name = c.Name,
            ParentId = c.ParentId,
            Color = c.Color,
            SortOrder = c.SortOrder
        };
    }
}
