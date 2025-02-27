using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Models;
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

        public PurchasesController(PantryContext context)
        {
            _context = context;
        }

        [HttpPost]
        public async Task<IActionResult> CreatePurchase([FromBody] PurchaseRequest request)
        {
            using var transaction = await _context.Database.BeginTransactionAsync();

            try
            {
                var purchaseItems = new List<PurchaseItem>();
                var totalAmount = 0m;

                foreach (var item in request.Items)
                {
                    var product = await _context.Products
                        .FirstOrDefaultAsync(p => p.Id == item.ProductId);

                    if (product == null)
                    {
                        return NotFound(new
                        {
                            Message = $"Producto con ID {item.ProductId} no encontrado",
                            ProductId = item.ProductId
                        });
                    }

                    // Verificar concurrencia
                    if (product.Quantity != item.CurrentStock)
                    {
                        return Conflict(new
                        {
                            Message = "El inventario ha cambiado. Actualice la página e intente nuevamente",
                            ProductId = product.Id,
                            CurrentStock = product.Quantity,
                            ReceivedStock = item.CurrentStock
                        });
                    }

                    // Actualizar precio y stock
                    product.Price = item.UnitPrice; // Actualizar precio con el de la compra
                    product.Quantity += item.Quantity;

                    // Calcular total
                    totalAmount += item.Quantity * item.UnitPrice;

                    // Crear ítem de compra
                    purchaseItems.Add(new PurchaseItem
                    {
                        ProductId = item.ProductId,
                        Quantity = item.Quantity,
                        UnitPrice = item.UnitPrice // Asegúrate de guardar el precio
                    });
                }

                // Crear registro de compra
                var purchase = new Purchase
                {
                    PurchaseDate = DateTime.UtcNow,
                    TotalAmount = totalAmount, // Usar el total calculado
                    PurchaseItems = purchaseItems
                };

                _context.Purchases.Add(purchase);
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return CreatedAtAction("GetPurchase", new { id = purchase.Id }, purchase);
            }
            catch (DbUpdateConcurrencyException ex)
            {
                await transaction.RollbackAsync();
                return Conflict(new
                {
                    Message = "Conflicto de concurrencia. Los datos han sido modificados por otro usuario",
                    Details = ex.Entries.Select(e => e.Entity.GetType().Name)
                });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new
                {
                    Message = "Error al procesar la compra",
                    Details = ex.Message
                });
            }
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<PurchaseDto>> GetPurchase(int id)
        {
            var purchase = await _context.Purchases
                .Include(p => p.PurchaseItems)
                .FirstOrDefaultAsync(p => p.Id == id);

            if (purchase == null) return NotFound();

            return new PurchaseDto
            {
                Id = purchase.Id,
                PurchaseDate = purchase.PurchaseDate,
                TotalAmount = purchase.TotalAmount,
                Items = purchase.PurchaseItems.Select(pi => new PurchaseItemDto
                {
                    ProductId = pi.ProductId,
                    Quantity = pi.Quantity,
                    UnitPrice = pi.UnitPrice
                }).ToList()
            };
        }

        // DTOs
        public class PurchaseRequest
        {
            public List<PurchaseItemRequest> Items { get; set; }
        }

        public class PurchaseItemRequest
        {
            public int ProductId { get; set; }
            public decimal Quantity { get; set; }
            public decimal UnitPrice { get; set; }
            public decimal CurrentStock { get; set; }
        }
    }
}