using PantryManager.API.Models;

namespace PantryManager.API.Services
{
    // Precio de un renglón con promoción. Las mismas reglas están en pantrymanager.app/src/lib/promo.ts:
    // si se cambia una hay que cambiar la otra.
    public static class PromoCalculator
    {
        public const string NxM = "nxm";         // lleva Buy, paga Value (2x1, 3x2)
        public const string Pack = "pack";       // Buy por un precio total de Value (2 por $50)
        public const string Second = "second";   // el segundo de cada par con Value % de descuento
        public const string Percent = "percent"; // Value % de descuento en todo

        public static decimal Round(decimal amount) => Math.Round(amount, 2, MidpointRounding.AwayFromZero);

        // Devuelve null si la promoción no es válida.
        public static decimal? Total(decimal quantity, decimal unitPrice, PromoDto? promo)
        {
            if (promo == null)
            {
                return Round(quantity * unitPrice);
            }

            var value = promo.Value;

            switch (promo.Type)
            {
                case NxM:
                {
                    if (promo.Buy is not int buy || buy < 2 || value < 1 || value >= buy) return null;
                    var groups = Math.Floor(quantity / buy);
                    var rest = quantity - groups * buy;
                    return Round((groups * value + rest) * unitPrice);
                }
                case Pack:
                {
                    if (promo.Buy is not int buy || buy < 2 || value <= 0) return null;
                    var groups = Math.Floor(quantity / buy);
                    var rest = quantity - groups * buy;
                    return Round(groups * value + rest * unitPrice);
                }
                case Second:
                {
                    if (value <= 0 || value >= 100) return null;
                    var pairs = Math.Floor(quantity / 2);
                    var rest = quantity - pairs * 2;
                    return Round(pairs * (unitPrice + unitPrice * (1 - value / 100)) + rest * unitPrice);
                }
                case Percent:
                {
                    if (value <= 0 || value >= 100) return null;
                    return Round(quantity * unitPrice * (1 - value / 100));
                }
                default:
                    return null;
            }
        }
    }
}
