using System;
using System.ComponentModel.DataAnnotations;

namespace PantryManager.API.Models
{

    public class Product
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        public string ImageUrl { get; set; }
        public decimal Quantity { get; set; }
        public decimal Price { get; set; }
        public int StockType { get; set; }
        

        public string UnitOfMeasure => StockType switch
        {
            1 => "kg",
            2 => "L",
            _ => "unidades"
        };

        public string FormattedImageUrl 
    {
        get 
        {
            if (!string.IsNullOrEmpty(ImageUrl) && ImageUrl.StartsWith("https://drive.google.com/file/d/"))
            {
                var fileId = ImageUrl.Split("/d/")[1]?.Split('/')[0];
                return $"https://drive.google.com/uc?export=view&id={fileId}";
            }
            return ImageUrl;
        }
    }
    }
}