using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PantryManager.API.Data;
using PantryManager.API.Models;
using System.Security.Claims;

namespace PantryManager.API.Controllers
{
    // Dinero disponible: una sola fila que se crea la primera vez que se captura.
    [Authorize]
    [ApiController]
    [Route("api/funds")]
    public class FundsController : ControllerBase
    {
        private const int SingleRowId = 1;
        private const decimal MaxAmount = 99999999;

        private readonly PantryContext _context;

        public FundsController(PantryContext context)
        {
            _context = context;
        }

        // GET api/funds: si nunca se capturó, devuelve cero y sin fecha.
        [HttpGet]
        public async Task<ActionResult<FundsDto>> GetFunds()
        {
            var row = await _context.AvailableFunds.FindAsync(SingleRowId);
            if (row == null) return new FundsDto { Amount = 0, AsOf = null, UpdatedAt = null };
            return ToDto(row);
        }

        // PUT api/funds: crea la fila o la actualiza.
        [HttpPut]
        public async Task<ActionResult<FundsDto>> UpdateFunds([FromBody] FundsRequest request)
        {
            if (request.Amount < 0) return BadRequest(new { Message = "El monto no puede ser negativo" });
            if (request.Amount > MaxAmount) return BadRequest(new { Message = "El monto es demasiado grande" });
            if (request.AsOf == default) return BadRequest(new { Message = "Indica la fecha del monto" });

            var row = await _context.AvailableFunds.FindAsync(SingleRowId);
            if (row == null)
            {
                row = new AvailableFunds { Id = SingleRowId };
                _context.AvailableFunds.Add(row);
            }

            row.Amount = Math.Round(request.Amount, 2, MidpointRounding.AwayFromZero);
            row.AsOf = request.AsOf;
            row.UpdatedAt = DateTime.UtcNow;
            row.UpdatedBy = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";

            await _context.SaveChangesAsync();
            return ToDto(row);
        }

        private static FundsDto ToDto(AvailableFunds row) => new FundsDto
        {
            Amount = row.Amount,
            AsOf = row.AsOf,
            UpdatedAt = row.UpdatedAt
        };
    }
}
