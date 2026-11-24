using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Models;

namespace PantryManager.API.Services
{
    // Categorías iniciales. Se crean la primera vez que se piden, si la tabla está vacía;
    // después se editan desde la app.
    public static class ExpenseCategorySeeder
    {
        private static readonly (string Name, string Color, string[] Children)[] Defaults =
        {
            ("Súper", "#3B4517", Array.Empty<string>()),
            ("Costco", "#B5483A", Array.Empty<string>()),
            ("Comida fuera", "#D9822B", Array.Empty<string>()),
            ("Gasolina", "#3A7CA5", Array.Empty<string>()),
            ("Transporte", "#6C8EAD", Array.Empty<string>()),
            ("Servicios", "#8E6AA8", new[]
            {
                "Luz", "Agua", "Gas", "Internet", "Celular", "Teléfono fijo", "Televisión de paga",
                "Suscripciones", "Basura y mantenimiento de la colonia", "Predial", "Otros servicios"
            }),
            ("Hogar", "#7A8F3A", Array.Empty<string>()),
            ("Salud", "#C25B7E", Array.Empty<string>()),
            ("Ropa", "#4C9C94", Array.Empty<string>()),
            ("Entretenimiento", "#E0B13D", Array.Empty<string>()),
            ("Lujos", "#5E4B8B", Array.Empty<string>()),
            ("Regalos", "#E58F7C", Array.Empty<string>()),
            ("Viajes", "#2C7A5B", Array.Empty<string>()),
            ("Comisiones e intereses", "#8A5A44", Array.Empty<string>()),
            ("Otros", "#A9A56F", Array.Empty<string>()),
        };

        public static async Task EnsureAsync(PantryContext context)
        {
            if (await context.ExpenseCategories.AnyAsync()) return;

            var order = 0;
            foreach (var (name, color, children) in Defaults)
            {
                var parent = new ExpenseCategory { Name = name, Color = color, SortOrder = order++ };
                context.ExpenseCategories.Add(parent);

                var childOrder = 0;
                foreach (var child in children)
                {
                    context.ExpenseCategories.Add(new ExpenseCategory
                    {
                        Name = child,
                        Parent = parent,
                        SortOrder = childOrder++
                    });
                }
            }

            await context.SaveChangesAsync();
        }
    }
}
