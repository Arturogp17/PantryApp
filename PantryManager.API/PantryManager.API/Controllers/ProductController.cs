using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Models;
using PantryManager.API.Services;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace PantryManager.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class ProductsController : ControllerBase
    {
        private readonly PantryContext _context;

        public ProductsController(PantryContext context)
        {
            _context = context;
        }

        // GET: api/Products?search=<término>
        // Cualquier usuario autenticado puede consultar el catálogo.
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Product>>> GetProducts([FromQuery] string? search = null)
        {
            IQueryable<Product> query = _context.Products;

            // Filtrar productos por nombre si se proporciona un término de búsqueda
            if (!string.IsNullOrEmpty(search))
            {
                query = query.Where(p => p.Name.ToLower().Contains(search.ToLower()));
            }

            return await query.OrderBy(p => p.Name).ToListAsync();
        }

        // GET: api/Products/5
        [HttpGet("{id:int}")]
        public async Task<ActionResult<Product>> GetProduct(int id)
        {
            var product = await _context.Products.FindAsync(id);

            if (product == null)
            {
                return NotFound();
            }

            return product;
        }

        // GET: api/Products/suggestions
        // Productos que conviene agregar a la lista: sin existencias o que ya toca recomprar
        // según el intervalo medio entre compras (se necesitan al menos 3 compras).
        [HttpGet("suggestions")]
        public async Task<ActionResult<IEnumerable<SuggestionDto>>> GetSuggestions()
        {
            var inList = await _context.ShoppingListItems.Select(s => s.ProductId).ToListAsync();

            var history = await _context.PurchaseItems
                .Select(pi => new { pi.ProductId, pi.Purchase.PurchaseDate })
                .ToListAsync();

            var datesByProduct = history
                .GroupBy(h => h.ProductId)
                .ToDictionary(
                    g => g.Key,
                    g => g.Select(h => h.PurchaseDate.Date).Distinct().OrderBy(d => d).ToList());

            var products = await _context.Products.Where(p => !inList.Contains(p.Id)).ToListAsync();
            var today = DateTime.UtcNow.Date;
            var result = new List<SuggestionDto>();

            foreach (var product in products)
            {
                if (!datesByProduct.TryGetValue(product.Id, out var dates))
                    continue;

                if (product.Quantity <= 0)
                {
                    result.Add(new SuggestionDto(product.Id, product.Name, "Sin existencias"));
                    continue;
                }

                if (dates.Count >= 3)
                {
                    var averageDays = (dates[dates.Count - 1] - dates[0]).TotalDays / (dates.Count - 1);
                    var daysSince = (today - dates[dates.Count - 1]).TotalDays;

                    if (averageDays >= 1 && daysSince >= averageDays * 0.9)
                    {
                        result.Add(new SuggestionDto(
                            product.Id,
                            product.Name,
                            $"Se compra cada {Math.Round(averageDays)} días, van {Math.Round(daysSince)}"));
                    }
                }
            }

            return result.Take(12).ToList();
        }

        // POST: api/Products/CreateProduct (solo admin)
        [Authorize(Roles = "Admin")]
        [HttpPost]
        [Route("CreateProduct")]
        public async Task<ActionResult<Product>> PostProduct(Product product)
        {
            Normalize(product);

            try
            {
                _context.Products.Add(product);
                await _context.SaveChangesAsync();

                return CreatedAtAction(nameof(GetProduct), new { id = product.Id }, product);
            }
            catch (DbUpdateException)
            {
                return Conflict(new { Message = "Ya existe un producto con ese código de barras" });
            }
            catch (Exception ex)
            {
                // Log de error
                Console.WriteLine("Error al guardar el producto: " + ex.Message);
                return StatusCode(500, "Error interno del servidor.");
            }
        }

        // PUT: api/Products/5 (solo admin)
        [Authorize(Roles = "Admin")]
        [HttpPut("{id:int}")]
        public async Task<IActionResult> PutProduct(int id, Product product)
        {
            if (id != product.Id)
            {
                return BadRequest(); // El ID en la URL no coincide con el ID del producto
            }

            Normalize(product);
            _context.Entry(product).State = EntityState.Modified;

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!_context.Products.Any(p => p.Id == id))
                {
                    return NotFound(); // El producto no existe
                }
                else
                {
                    throw;
                }
            }
            catch (DbUpdateException)
            {
                return Conflict(new { Message = "Ya existe un producto con ese código de barras" });
            }

            return NoContent(); // 204 No Content, indica que la actualización fue exitosa
        }

        // PATCH: api/Products/5/stock
        // Ajuste manual de inventario. Lo puede hacer cualquier usuario autenticado.
        [HttpPatch("{id:int}/stock")]
        public async Task<ActionResult<Product>> UpdateStock(int id, [FromBody] StockRequest request)
        {
            if (request.Quantity < 0)
            {
                return BadRequest(new { Message = "La cantidad no puede ser negativa" });
            }

            var product = await _context.Products.FindAsync(id);
            if (product == null)
            {
                return NotFound();
            }

            product.Quantity = request.Quantity;
            await _context.SaveChangesAsync();

            return product;
        }

        // DELETE: api/Products/5 (solo admin)
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> DeleteProduct(int id)
        {
            var product = await _context.Products.FindAsync(id);
            if (product == null)
            {
                return NotFound();
            }

            // Borrar un producto con compras borraría también sus renglones de compra
            // (la relación es en cascada) y los totales históricos dejarían de cuadrar.
            if (await _context.PurchaseItems.AnyAsync(pi => pi.ProductId == id))
            {
                return Conflict(new { Message = "El producto tiene compras registradas y no se puede borrar" });
            }

            _context.Products.Remove(product);
            await _context.SaveChangesAsync();

            return NoContent(); // 204 No Content, indica que la eliminación fue exitosa
        }

        private static void Normalize(Product product)
        {
            product.Barcode = ProductResolver.NormalizeBarcode(product.Barcode);
            product.Description ??= "";
            product.ImageUrl ??= "";
        }
    }
}
