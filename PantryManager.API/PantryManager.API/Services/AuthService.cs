using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PantryManager.API.Data;
using PantryManager.API.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace PantryManager.API.Services
{
    public class AuthService
    {
        private readonly PantryContext _context;
        private readonly IConfiguration _configuration;
        private readonly PasswordHasher<User> _passwordHasher;

        public AuthService(PantryContext context, IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
            _passwordHasher = new PasswordHasher<User>();
        }

        public User? Authenticate(LoginRequest loginRequest)
        {
            if (string.IsNullOrWhiteSpace(loginRequest.Username) || string.IsNullOrEmpty(loginRequest.Password))
                return null;

            var user = _context.Users.FirstOrDefault(u => u.Username == loginRequest.Username);

            if (user == null)
                return null;

            var result = _passwordHasher.VerifyHashedPassword(user, user.Password, loginRequest.Password);
            return result == PasswordVerificationResult.Success ? user : null;
        }

        public async Task<(User? User, string? Error)> CreateUserAsync(string username, string password, bool isAdmin)
        {
            username = (username ?? "").Trim();

            if (username.Length < 3 || username.Length > 50)
                return (null, "El usuario debe tener entre 3 y 50 caracteres");

            if (string.IsNullOrEmpty(password) || password.Length < 8)
                return (null, "La contraseña debe tener al menos 8 caracteres");

            if (await _context.Users.AnyAsync(u => u.Username == username))
                return (null, "Ya existe un usuario con ese nombre");

            var user = new User { Username = username, IsAdmin = isAdmin, Password = "" };
            user.Password = _passwordHasher.HashPassword(user, password);

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            return (user, null);
        }

        public string GenerateToken(User user)
        {
            var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_configuration["Jwt:Key"]!));
            var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Username),
                new Claim(ClaimTypes.Role, user.IsAdmin ? "Admin" : "User")
            };

            var expireMinutes = _configuration.GetValue<double?>("Jwt:ExpireMinutes") ?? 43200;

            var token = new JwtSecurityToken(
                issuer: _configuration["Jwt:Issuer"],
                audience: _configuration["Jwt:Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddMinutes(expireMinutes),
                signingCredentials: credentials
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
