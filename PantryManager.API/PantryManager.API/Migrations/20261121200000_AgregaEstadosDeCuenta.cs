using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using PantryManager.API.Data;

#nullable disable

namespace PantryManager.API.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(PantryContext))]
    [Migration("20261121200000_AgregaEstadosDeCuenta")]
    public partial class AgregaEstadosDeCuenta : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ImportKey",
                table: "Expenses",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImportKey",
                table: "InstallmentPlans",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Expenses_ImportKey",
                table: "Expenses",
                column: "ImportKey",
                unique: true,
                filter: "[ImportKey] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_InstallmentPlans_ImportKey",
                table: "InstallmentPlans",
                column: "ImportKey",
                unique: true,
                filter: "[ImportKey] IS NOT NULL");

            migrationBuilder.CreateTable(
                name: "CardStatements",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CardId = table.Column<int>(type: "int", nullable: false),
                    PeriodStart = table.Column<DateOnly>(type: "date", nullable: false),
                    PeriodEnd = table.Column<DateOnly>(type: "date", nullable: false),
                    DueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    PayToAvoidInterest = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    MinimumPayment = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    MinimumPlusInstallments = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    TotalBalance = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    RegularBalance = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    InstallmentBalance = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    CreditLimit = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    AvailableCredit = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    ImportedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ImportedBy = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CardStatements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CardStatements_Cards_CardId",
                        column: x => x.CardId,
                        principalTable: "Cards",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CardStatements_CardId_PeriodEnd",
                table: "CardStatements",
                columns: new[] { "CardId", "PeriodEnd" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "CardStatements");

            migrationBuilder.DropIndex(
                name: "IX_InstallmentPlans_ImportKey",
                table: "InstallmentPlans");

            migrationBuilder.DropIndex(
                name: "IX_Expenses_ImportKey",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "ImportKey",
                table: "InstallmentPlans");

            migrationBuilder.DropColumn(
                name: "ImportKey",
                table: "Expenses");
        }
    }
}
