using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using PantryManager.API.Models;
using PantryManager.API.Services;

namespace PantryManager.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AuthService _authService;

        public AuthController(AuthService authService)
        {
            _authService = authService;
        }

        [EnableRateLimiting("login")]
        [HttpPost("login")]
        public IActionResult Login([FromBody] LoginRequest loginRequest)
        {
            // Autenticar al usuario
            var user = _authService.Authenticate(loginRequest);

            if (user == null)
                return Unauthorized("Credenciales inválidas");

            // Generar token JWT
            var token = _authService.GenerateToken(user);

            return Ok(new { Token = token });
        }

        // Crear un usuario nuevo (solo admin)
        [Authorize(Roles = "Admin")]
        [HttpPost("users")]
        public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request)
        {
            var (user, error) = await _authService.CreateUserAsync(request.Username, request.Password, request.IsAdmin);

            if (user == null)
                return BadRequest(new { Message = error });

            return Ok(new { user.Id, user.Username, user.IsAdmin });
        }
    }
}
