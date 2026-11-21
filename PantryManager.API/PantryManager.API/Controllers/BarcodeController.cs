using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Services;
using System.Text.Json;

namespace PantryManager.API.Controllers
{
    // Resuelve un código de barras: primero en el catálogo propio y, si no está,
    // en Open Food Facts (base abierta, sin llave). No guarda nada; el producto
    // se crea cuando se agrega a la lista o a una compra.
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class BarcodeController : ControllerBase
    {
        private readonly PantryContext _context;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<BarcodeController> _logger;

        public BarcodeController(PantryContext context, IHttpClientFactory httpClientFactory, ILogger<BarcodeController> logger)
        {
            _context = context;
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        [HttpGet("{code}")]
        public async Task<IActionResult> Lookup(string code, CancellationToken cancellationToken)
        {
            var barcode = ProductResolver.NormalizeBarcode(code);
            if (barcode == null || barcode.Length < 8)
            {
                return BadRequest(new { Message = "Código de barras no válido" });
            }

            var product = await _context.Products.FirstOrDefaultAsync(p => p.Barcode == barcode, cancellationToken);
            if (product != null)
            {
                return Ok(new
                {
                    Source = "catalog",
                    ProductId = (int?)product.Id,
                    product.Name,
                    product.StockType,
                    product.Price,
                    ImageUrl = product.FormattedImageUrl
                });
            }

            try
            {
                var client = _httpClientFactory.CreateClient("openfoodfacts");
                using var response = await client.GetAsync(
                    $"api/v2/product/{barcode}.json?fields=product_name,product_name_es,brands,quantity,image_front_small_url",
                    cancellationToken);

                if (!response.IsSuccessStatusCode)
                {
                    return NotFound(new { Message = "No se encontró el código en Open Food Facts" });
                }

                using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
                using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
                var root = document.RootElement;

                if (!root.TryGetProperty("product", out var found) || found.ValueKind != JsonValueKind.Object)
                {
                    return NotFound(new { Message = "No se encontró el código en Open Food Facts" });
                }

                var name = ReadString(found, "product_name_es") ?? ReadString(found, "product_name");
                if (name == null)
                {
                    return NotFound(new { Message = "El código existe pero no trae nombre" });
                }

                var brand = ReadString(found, "brands")?.Split(',')[0].Trim();
                var quantity = ReadString(found, "quantity");

                var parts = new List<string> { name };
                if (!string.IsNullOrEmpty(brand) && !name.Contains(brand, StringComparison.OrdinalIgnoreCase))
                    parts.Add(brand);
                if (!string.IsNullOrEmpty(quantity) && !name.Contains(quantity, StringComparison.OrdinalIgnoreCase))
                    parts.Add(quantity);

                return Ok(new
                {
                    Source = "openfoodfacts",
                    ProductId = (int?)null,
                    Name = string.Join(" ", parts),
                    StockType = 0,
                    ImageUrl = ReadString(found, "image_front_small_url")
                });
            }
            catch (Exception ex) when (ex is HttpRequestException || ex is TaskCanceledException || ex is JsonException)
            {
                _logger.LogWarning(ex, "No se pudo consultar Open Food Facts para {Barcode}", barcode);
                return StatusCode(503, new { Message = "No se pudo consultar la base de códigos de barras" });
            }
        }

        private static string? ReadString(JsonElement element, string property)
        {
            if (element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String)
            {
                var text = value.GetString()?.Trim();
                return string.IsNullOrEmpty(text) ? null : text;
            }
            return null;
        }
    }
}
