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

            // Reintento de una acción que ya se aplicó (la respuesta se perdió en el camino): no se vuelve a sumar.
            if (await SolicitudProcesadaAsync(request.ClientRequestId))
            {
                return await ItemActualAsync(product.Id);
            }

            var existing = await _context.ShoppingListItems
                .Include(s => s.Product)
                .FirstOrDefaultAsync(s => s.ProductId == product.Id);

            if (existing != null)
            {
                existing.Quantity += request.Quantity;
                await AgregaSolicitudAsync(request.ClientRequestId);
                try
                {
                    await _context.SaveChangesAsync();
                }
                catch (DbUpdateException)
                {
                    // Dos envíos simultáneos con el mismo clientRequestId: gana el primero.
                    _context.ChangeTracker.Clear();
                    if (await SolicitudProcesadaAsync(request.ClientRequestId))
                    {
                        return await ItemActualAsync(product.Id);
                    }

                    throw;
                }

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
            await AgregaSolicitudAsync(request.ClientRequestId);
            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                // Dos envíos simultáneos del mismo clientRequestId: gana el primero.
                // Otra persona también pudo agregar el mismo producto en el mismo instante y el índice
                // único lo rechazó: la cantidad se suma al renglón que ya existe.
                _context.ChangeTracker.Clear();
                if (await SolicitudProcesadaAsync(request.ClientRequestId))
                {
                    return await ItemActualAsync(product.Id);
                }

                var concurrent = await _context.ShoppingListItems
                    .Include(s => s.Product)
                    .FirstOrDefaultAsync(s => s.ProductId == product.Id);
                if (concurrent == null)
                {
                    throw;
                }

                concurrent.Quantity += request.Quantity;
                await AgregaSolicitudAsync(request.ClientRequestId);
                await _context.SaveChangesAsync();
                return ToDto(concurrent);
            }

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

        private async Task<bool> SolicitudProcesadaAsync(Guid? clientRequestId)
        {
            return clientRequestId.HasValue
                && await _context.ProcessedRequests.AnyAsync(p => p.Id == clientRequestId.Value);
        }

        // Registra el clientRequestId para que un reenvío no vuelva a sumar. Antes de insertar se borran
        // las solicitudes de más de 30 días para que la tabla no crezca sin límite.
        private async Task AgregaSolicitudAsync(Guid? clientRequestId)
        {
            if (!clientRequestId.HasValue)
            {
                return;
            }

            await _context.ProcessedRequests
                .Where(p => p.CreatedAt < DateTime.UtcNow.AddDays(-30))
                .ExecuteDeleteAsync();

            _context.ProcessedRequests.Add(new ProcessedRequest
            {
                Id = clientRequestId.Value,
                CreatedAt = DateTime.UtcNow
            });
        }

        // Estado actual del producto en la lista, igual que si la acción acabara de aplicarse.
        private async Task<ShoppingListItemDto> ItemActualAsync(int productId)
        {
            var row = await _context.ShoppingListItems
                .Include(s => s.Product)
                .FirstOrDefaultAsync(s => s.ProductId == productId);

            if (row != null)
            {
                return ToDto(row);
            }

            // Si el producto ya salió de la lista (se compró), se responde con cantidad 0 y sin Id.
            var product = await _context.Products.FirstAsync(p => p.Id == productId);
            return ToDto(new ShoppingListItem { ProductId = productId, Product = product, Quantity = 0 });
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
