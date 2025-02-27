using Microsoft.AspNetCore.Mvc;
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
    }
}