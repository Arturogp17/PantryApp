using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Models;
using PantryManager.API.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace PantryManager.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class PurchasesController : ControllerBase
    {
        private readonly PantryContext _context;
        private readonly ProductResolver _resolver;
        private readonly ILogger<PurchasesController> _logger;

        public PurchasesController(PantryContext context, ProductResolver resolver, ILogger<PurchasesController> logger)
        {
            _context = context;
            _resolver = resolver;
            _logger = logger;
        }

        [HttpPost]
        public async Task<IActionResult> CreatePurchase([FromBody] PurchaseRequest request)
        {
            if (request.Items == null || request.Items.Count == 0)
            {
                return BadRequest(new { Message = "La compra no tiene productos" });
            }

            if (request.Items.Any(i => i.Quantity <= 0 || i.UnitPrice <= 0))
            {
                return BadRequest(new { Message = "Todas las cantidades y precios deben ser mayores a 0" });
            }

            if (request.Items.Any(i => PromoCalculator.Total(i.Quantity, i.UnitPrice, i.Promo) == null))
            {
                return BadRequest(new { Message = "Hay una promoción que no es válida" });
            }

            // Reintento de una compra que ya se guardó: se devuelve la existente.
            if (request.ClientRequestId.HasValue)
            {
                var existing = await FindByClientRequestIdAsync(request.ClientRequestId.Value);
                if (existing != null)
                {
                    return Ok(ToDto(existing));
                }
            }

            await using var transaction = await _context.Database.BeginTransactionAsync();

            try
            {
                var purchaseItems = new List<PurchaseItem>();
                var totalAmount = 0m;

                foreach (var item in request.Items)
                {
                    var product = await _resolver.ResolveOrCreateAsync(
                        item.ProductId, item.Name, item.Barcode, item.StockType, null);

                    if (product == null)
                    {
                        await transaction.RollbackAsync();
                        return NotFound(new
                        {
                            Message = item.ProductId.HasValue
                                ? $"Producto con ID {item.ProductId} no encontrado"
                                : "Hay un producto sin nombre",
                            ProductId = item.ProductId
                        });
                    }

                    // El precio del producto pasa a ser el de la última compra y el stock suma lo comprado.
                    product.Price = item.UnitPrice;
                    product.Quantity += item.Quantity;

                    var lineTotal = PromoCalculator.Total(item.Quantity, item.UnitPrice, item.Promo)!.Value;
                    totalAmount += lineTotal;

                    purchaseItems.Add(new PurchaseItem
                    {
                        Product = product,
                        Quantity = item.Quantity,
                        UnitPrice = item.UnitPrice,
                        LineTotal = lineTotal,
                        PromoType = item.Promo?.Type,
                        PromoBuy = item.Promo?.Buy,
                        PromoValue = item.Promo?.Value
                    });
                }

                var purchase = new Purchase
                {
                    PurchaseDate = DateTime.UtcNow,
                    TotalAmount = PromoCalculator.Round(totalAmount),
                    ClientRequestId = request.ClientRequestId,
                    PurchaseItems = purchaseItems
                };

                _context.Purchases.Add(purchase);
                await _context.SaveChangesAsync();

                // Lo comprado sale de la lista compartida.
                var boughtProductIds = purchaseItems.Select(i => i.ProductId).ToList();
                var listRows = await _context.ShoppingListItems
                    .Where(s => boughtProductIds.Contains(s.ProductId))
                    .ToListAsync();

                if (listRows.Count > 0)
                {
                    _context.ShoppingListItems.RemoveRange(listRows);
                    await _context.SaveChangesAsync();
                }

                await transaction.CommitAsync();

                return CreatedAtAction(nameof(GetPurchase), new { id = purchase.Id }, ToDto(purchase));
            }
            catch (DbUpdateException ex)
            {
                await transaction.RollbackAsync();
                _context.ChangeTracker.Clear();

                // Dos envíos simultáneos de la misma compra: gana el primero.
                if (request.ClientRequestId.HasValue)
                {
                    var existing = await FindByClientRequestIdAsync(request.ClientRequestId.Value);
                    if (existing != null)
                    {
                        return Ok(ToDto(existing));
                    }
                }

                _logger.LogError(ex, "Error al guardar la compra");
                return StatusCode(500, new { Message = "Error al procesar la compra" });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Error al procesar la compra");
                return StatusCode(500, new { Message = "Error al procesar la compra" });
            }
        }

        // GET: api/Purchases?skip=0&take=20 (las más recientes primero)
        [HttpGet]
        public async Task<ActionResult<List<PurchaseDto>>> GetPurchases(int skip = 0, int take = 20)
        {
            skip = Math.Max(skip, 0);
            take = Math.Clamp(take, 1, 100);

            var purchases = await _context.Purchases
                .Include(p => p.PurchaseItems).ThenInclude(pi => pi.Product)
                .OrderByDescending(p => p.PurchaseDate)
                .Skip(skip)
                .Take(take)
                .ToListAsync();

            return purchases.Select(p => ToDto(p)).ToList();
        }

        // GET: api/Purchases/summary?from=2026-11-01T06:00:00Z&to=2026-12-01T06:00:00Z
        // Sin fechas resume todas las compras. shortcut: se agrupa en memoria; con miles de compras
        // habría que agrupar en SQL.
        [HttpGet("summary")]
        public async Task<ActionResult<PurchaseSummaryDto>> GetSummary([FromQuery(Name = "from")] DateTime? fromDate, [FromQuery(Name = "to")] DateTime? toDate)
        {
            var query = _context.Purchases.AsQueryable();
            if (fromDate.HasValue) query = query.Where(p => p.PurchaseDate >= fromDate.Value.ToUniversalTime());
            if (toDate.HasValue) query = query.Where(p => p.PurchaseDate < toDate.Value.ToUniversalTime());

            var purchases = await query
                .Include(p => p.PurchaseItems).ThenInclude(pi => pi.Product)
                .ToListAsync();

            var items = purchases.SelectMany(p => p.PurchaseItems).ToList();

            return new PurchaseSummaryDto
            {
                TotalSpent = purchases.Sum(p => p.TotalAmount),
                PurchaseCount = purchases.Count,
                Savings = items.Sum(pi => PromoCalculator.Round(pi.Quantity * pi.UnitPrice) - LineTotalOf(pi)),
                ByProduct = items
                    .GroupBy(pi => pi.ProductId)
                    .Select(g => new ProductSpendDto
                    {
                        ProductId = g.Key,
                        Name = g.First().Product?.Name ?? "",
                        StockType = g.First().Product?.StockType ?? 0,
                        Spent = g.Sum(pi => LineTotalOf(pi)),
                        Quantity = g.Sum(pi => pi.Quantity),
                        Times = g.Count()
                    })
                    .OrderByDescending(p => p.Spent)
                    .ToList()
            };
        }

        [HttpGet("{id:int}")]
        public async Task<ActionResult<PurchaseDto>> GetPurchase(int id)
        {
            var purchase = await _context.Purchases
                .Include(p => p.PurchaseItems).ThenInclude(pi => pi.Product)
                .FirstOrDefaultAsync(p => p.Id == id);

            if (purchase == null) return NotFound();

            return ToDto(purchase);
        }

        private Task<Purchase?> FindByClientRequestIdAsync(Guid clientRequestId)
        {
            return _context.Purchases
                .Include(p => p.PurchaseItems).ThenInclude(pi => pi.Product)
                .FirstOrDefaultAsync(p => p.ClientRequestId == clientRequestId);
        }

        private static PurchaseDto ToDto(Purchase purchase)
        {
            return new PurchaseDto
            {
                Id = purchase.Id,
                // EF devuelve la fecha sin zona; se marca como UTC para que el navegador la convierta bien.
                PurchaseDate = DateTime.SpecifyKind(purchase.PurchaseDate, DateTimeKind.Utc),
                TotalAmount = purchase.TotalAmount,
                Items = purchase.PurchaseItems.Select(pi => ToItemDto(pi)).ToList()
            };
        }

        private static decimal LineTotalOf(PurchaseItem pi) =>
            pi.LineTotal ?? PromoCalculator.Round(pi.Quantity * pi.UnitPrice);

        private static PurchaseItemDto ToItemDto(PurchaseItem pi) => new PurchaseItemDto
        {
            ProductId = pi.ProductId,
            ProductName = pi.Product?.Name ?? "",
            StockType = pi.Product?.StockType ?? 0,
            Quantity = pi.Quantity,
            UnitPrice = pi.UnitPrice,
            LineTotal = LineTotalOf(pi),
            Promo = pi.PromoType == null
                ? null
                : new PromoDto { Type = pi.PromoType, Buy = pi.PromoBuy, Value = pi.PromoValue ?? 0 }
        };

        // DTOs
        public class PurchaseRequest
        {
            public Guid? ClientRequestId { get; set; }
            public List<PurchaseItemRequest> Items { get; set; } = new List<PurchaseItemRequest>();
        }

        public class PurchaseItemRequest
        {
            // Se identifica el producto por id, por código de barras o por nombre; si no existe se crea.
            public int? ProductId { get; set; }
            public string? Name { get; set; }
            public string? Barcode { get; set; }
            public int StockType { get; set; }
            public decimal Quantity { get; set; }
            public decimal UnitPrice { get; set; }
            public PromoDto? Promo { get; set; }
        }
    }
}
