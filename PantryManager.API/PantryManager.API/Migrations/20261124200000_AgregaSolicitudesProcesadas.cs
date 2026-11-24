using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using PantryManager.API.Data;

#nullable disable

namespace PantryManager.API.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(PantryContext))]
    [Migration("20261124200000_AgregaSolicitudesProcesadas")]
    public partial class AgregaSolicitudesProcesadas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ProcessedRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProcessedRequests", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProcessedRequests_CreatedAt",
                table: "ProcessedRequests",
                column: "CreatedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "ProcessedRequests");
        }
    }
}
