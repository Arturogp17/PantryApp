using System;
using System.ComponentModel.DataAnnotations;

namespace PantryManager.API.Models
{
    public enum StockType
    {
        Units = 0,
        Kilograms = 1,
        Liters = 2
    }

    public class Product
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        public string ImageUrl { get; set; }
        public decimal Quantity { get; set; }
        public decimal Price { get; set; }
        public StockType StockType { get; set; }
        
        [Timestamp]
        public byte[] RowVersion { get; set; }

        public string UnitOfMeasure => StockType switch
        {
            StockType.Kilograms => "kg",
            StockType.Liters => "L",
            _ => "unidades"
        };
    }
}