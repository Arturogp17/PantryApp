using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PantryManager.API.Migrations
{
    /// <inheritdoc />
    public partial class AgregaPlanesConIntereses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "InterestRate",
                table: "InstallmentPlans",
                type: "decimal(9,4)",
                precision: 9,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "MonthlyPayment",
                table: "InstallmentPlans",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "InterestRate",
                table: "InstallmentPlans");

            migrationBuilder.DropColumn(
                name: "MonthlyPayment",
                table: "InstallmentPlans");
        }
    }
}
