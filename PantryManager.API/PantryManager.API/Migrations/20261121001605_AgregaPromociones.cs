using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PantryManager.API.Migrations
{
    /// <inheritdoc />
    public partial class AgregaPromociones : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "LineTotal",
                table: "PurchaseItems",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PromoBuy",
                table: "PurchaseItems",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PromoType",
                table: "PurchaseItems",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PromoValue",
                table: "PurchaseItems",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LineTotal",
                table: "PurchaseItems");

            migrationBuilder.DropColumn(
                name: "PromoBuy",
                table: "PurchaseItems");

            migrationBuilder.DropColumn(
                name: "PromoType",
                table: "PurchaseItems");

            migrationBuilder.DropColumn(
                name: "PromoValue",
                table: "PurchaseItems");
        }
    }
}
