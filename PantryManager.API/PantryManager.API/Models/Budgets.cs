namespace PantryManager.API.Models
{
    // Presupuesto mensual de una categoría de gasto. Una categoría tiene cero o un presupuesto.
    // Si se borra la categoría, su presupuesto se borra con ella (Cascade).
    public class CategoryBudget
    {
        public int Id { get; set; }
        public int CategoryId { get; set; }
        public ExpenseCategory Category { get; set; } = null!;
        public decimal MonthlyAmount { get; set; }
    }

    public class CategoryBudgetDto
    {
        public int CategoryId { get; set; }
        public decimal MonthlyAmount { get; set; }
    }

    public class CategoryBudgetRequest
    {
        public decimal MonthlyAmount { get; set; }
    }
}
