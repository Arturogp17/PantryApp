using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Models;

namespace PantryManager.API.Services
{
    // Encuentra un producto por id, código de barras o nombre y, si no existe, lo crea.
    // Así la lista y las compras pueden mandar un producto nuevo sin pasar antes por el panel de administración.
    public class ProductResolver
    {
        private readonly PantryContext _context;

        public ProductResolver(PantryContext context)
        {
            _context = context;
        }

        public static string? NormalizeBarcode(string? barcode)
        {
            if (string.IsNullOrWhiteSpace(barcode))
                return null;

            var digits = new string(barcode.Where(char.IsDigit).ToArray());
            if (digits.Length == 0 || digits.Length > 32)
                return null;

            // Un UPC-A (12 dígitos) es un EAN-13 con un cero al inicio.
            return digits.Length == 12 ? "0" + digits : digits;
        }

        public async Task<Product?> ResolveOrCreateAsync(int? productId, string? name, string? barcode, int stockType, string? imageUrl)
        {
            var normalizedBarcode = NormalizeBarcode(barcode);
            var trimmedName = (name ?? "").Trim();

            Product? product = null;

            if (productId.HasValue)
            {
                product = await _context.Products.FindAsync(productId.Value);
                if (product == null)
                    return null;
            }

            if (product == null && normalizedBarcode != null)
            {
                product = await _context.Products.FirstOrDefaultAsync(p => p.Barcode == normalizedBarcode);
            }

            if (product == null && trimmedName.Length > 0)
            {
                var lowered = trimmedName.ToLower();
                product = await _context.Products.FirstOrDefaultAsync(p => p.Name.ToLower() == lowered);
            }

            if (product != null)
            {
                // Si el producto ya existía sin código y ahora lo escanearon, se aprende.
                if (product.Barcode == null && normalizedBarcode != null)
                {
                    var taken = await _context.Products.AnyAsync(p => p.Barcode == normalizedBarcode);
                    if (!taken)
                    {
                        product.Barcode = normalizedBarcode;
                        await _context.SaveChangesAsync();
                    }
                }
                return product;
            }

            if (trimmedName.Length == 0)
                return null;

            product = new Product
            {
                Name = trimmedName,
                Description = "",
                ImageUrl = imageUrl ?? "",
                Barcode = normalizedBarcode,
                StockType = stockType is >= 0 and <= 2 ? stockType : 0,
                Quantity = 0,
                Price = 0
            };

            _context.Products.Add(product);
            await _context.SaveChangesAsync();
            return product;
        }
    }
}
