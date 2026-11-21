using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Models;
using PantryManager.API.Services;
using System.Security.Claims;

namespace PantryManager.API.Controllers
{
    // Lista de compras compartida: todos los usuarios ven y modifican la misma lista.
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class ShoppingListController : ControllerBase
    {
        private readonly PantryContext _context;
        private readonly ProductResolver _resolver;

        public ShoppingListController(PantryContext context, ProductResolver resolver)
        {
            _context = context;
            _resolver = resolver;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<ShoppingListItemDto>>> GetList()
        {
            var items = await _context.ShoppingListItems
                .Include(s => s.Product)
                .OrderBy(s => s.CreatedAt)
                .ToListAsync();

            return items.Select(ToDto).ToList();
        }

        [HttpPost]
        public async Task<ActionResult<ShoppingListItemDto>> AddItem([FromBody] AddListItemRequest request)
        {
            if (request.Quantity <= 0)
            {
                return BadRequest(new { Message = "La cantidad debe ser mayor a 0" });
            }

            var product = await _resolver.ResolveOrCreateAsync(
                request.ProductId, request.Name, request.Barcode, request.StockType, request.ImageUrl);

            if (product == null)
            {
                return BadRequest(new { Message = "Indica un producto o un nombre" });
            }

            var existing = await _context.ShoppingListItems
                .Include(s => s.Product)
                .FirstOrDefaultAsync(s => s.ProductId == product.Id);

            if (existing != null)
            {
                existing.Quantity += request.Quantity;
                await _context.SaveChangesAsync();
                return ToDto(existing);
            }

            var item = new ShoppingListItem
            {
                ProductId = product.Id,
                Product = product,
                Quantity = request.Quantity,
                AddedBy = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "",
                CreatedAt = DateTime.UtcNow
            };

            _context.ShoppingListItems.Add(item);
            await _context.SaveChangesAsync();

            return ToDto(item);
        }

        [HttpPut("{id:int}")]
        public async Task<ActionResult<ShoppingListItemDto>> UpdateItem(int id, [FromBody] UpdateListItemRequest request)
        {
            if (request.Quantity <= 0)
            {
                return BadRequest(new { Message = "La cantidad debe ser mayor a 0" });
            }

            var item = await _context.ShoppingListItems
                .Include(s => s.Product)
                .FirstOrDefaultAsync(s => s.Id == id);

            if (item == null)
            {
                return NotFound();
            }

            item.Quantity = request.Quantity;
            await _context.SaveChangesAsync();

            return ToDto(item);
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> DeleteItem(int id)
        {
            var item = await _context.ShoppingListItems.FindAsync(id);
            if (item == null)
            {
                return NotFound();
            }

            _context.ShoppingListItems.Remove(item);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        private static ShoppingListItemDto ToDto(ShoppingListItem item)
        {
            return new ShoppingListItemDto
            {
                Id = item.Id,
                ProductId = item.ProductId,
                Name = item.Product.Name,
                Barcode = item.Product.Barcode,
                ImageUrl = item.Product.FormattedImageUrl,
                Quantity = item.Quantity,
                StockType = item.Product.StockType,
                UnitOfMeasure = item.Product.UnitOfMeasure,
                LastPrice = item.Product.Price,
                Stock = item.Product.Quantity,
                AddedBy = item.AddedBy
            };
        }
    }
}
