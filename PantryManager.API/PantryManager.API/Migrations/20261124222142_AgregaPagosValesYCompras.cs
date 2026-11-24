using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PantryManager.API.Migrations
{
    /// <inheritdoc />
    public partial class AgregaPagosValesYCompras : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CardId",
                table: "IncomeSources",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PurchaseId",
                table: "Expenses",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CardPayments",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CardId = table.Column<int>(type: "int", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    ClientRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedBy = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CardPayments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CardPayments_Cards_CardId",
                        column: x => x.CardId,
                        principalTable: "Cards",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CategoryBudgets",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CategoryId = table.Column<int>(type: "int", nullable: false),
                    MonthlyAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CategoryBudgets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CategoryBudgets_ExpenseCategories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "ExpenseCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_IncomeSources_CardId",
                table: "IncomeSources",
                column: "CardId");

            migrationBuilder.CreateIndex(
                name: "IX_Expenses_PurchaseId",
                table: "Expenses",
                column: "PurchaseId");

            migrationBuilder.CreateIndex(
                name: "IX_CardPayments_CardId_Date",
                table: "CardPayments",
                columns: new[] { "CardId", "Date" });

            migrationBuilder.CreateIndex(
                name: "IX_CardPayments_ClientRequestId",
                table: "CardPayments",
                column: "ClientRequestId",
                unique: true,
                filter: "[ClientRequestId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CategoryBudgets_CategoryId",
                table: "CategoryBudgets",
                column: "CategoryId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Expenses_Purchases_PurchaseId",
                table: "Expenses",
                column: "PurchaseId",
                principalTable: "Purchases",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_IncomeSources_Cards_CardId",
                table: "IncomeSources",
                column: "CardId",
                principalTable: "Cards",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Expenses_Purchases_PurchaseId",
                table: "Expenses");

            migrationBuilder.DropForeignKey(
                name: "FK_IncomeSources_Cards_CardId",
                table: "IncomeSources");

            migrationBuilder.DropTable(
                name: "CardPayments");

            migrationBuilder.DropTable(
                name: "CategoryBudgets");

            migrationBuilder.DropIndex(
                name: "IX_IncomeSources_CardId",
                table: "IncomeSources");

            migrationBuilder.DropIndex(
                name: "IX_Expenses_PurchaseId",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "CardId",
                table: "IncomeSources");

            migrationBuilder.DropColumn(
                name: "PurchaseId",
                table: "Expenses");
        }
    }
}
