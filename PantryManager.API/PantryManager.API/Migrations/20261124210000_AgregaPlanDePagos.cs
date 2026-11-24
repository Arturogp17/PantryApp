using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using PantryManager.API.Data;

#nullable disable

namespace PantryManager.API.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(PantryContext))]
    [Migration("20261124210000_AgregaPlanDePagos")]
    public partial class AgregaPlanDePagos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "AnnualRate",
                table: "Cards",
                type: "decimal(9,4)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "AnnualRate",
                table: "CardStatements",
                type: "decimal(9,4)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AvailableFunds",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    AsOf = table.Column<DateOnly>(type: "date", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AvailableFunds", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "IncomeSources",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(12)", maxLength: 12, nullable: false),
                    Day1 = table.Column<int>(type: "int", nullable: true),
                    Day2 = table.Column<int>(type: "int", nullable: true),
                    Date = table.Column<DateOnly>(type: "date", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IncomeSources", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "IncomeSources");

            migrationBuilder.DropTable(name: "AvailableFunds");

            migrationBuilder.DropColumn(
                name: "AnnualRate",
                table: "CardStatements");

            migrationBuilder.DropColumn(
                name: "AnnualRate",
                table: "Cards");
        }
    }
}
