using Microsoft.AspNetCore.Identity;
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

        public User Authenticate(LoginRequest loginRequest)
        {
            var user = _context.Users.FirstOrDefault(u => u.Username == loginRequest.Username);

            if (user == null)
                return null;

            // Debug: Mostrar el hash almacenado
            Console.WriteLine($"Hash almacenado: {user.Password}");
            Console.WriteLine($"Longitud del hash: {user.Password.Length}");
            var hasher = new PasswordHasher<User>();
            var isValid = hasher.VerifyHashedPassword(null, user.Password, loginRequest.Password);
            Console.WriteLine($"¿Hash válido? {isValid}");

            var result = _passwordHasher.VerifyHashedPassword(user, user.Password, loginRequest.Password);
            return result == PasswordVerificationResult.Success ? user : null;
        }

        public string GenerateToken(User user)
        {
            var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_configuration["Jwt:Key"]));
            var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Username),
                new Claim(ClaimTypes.Role, user.IsAdmin ? "Admin" : "User")
            };

            var token = new JwtSecurityToken(
                issuer: _configuration["Jwt:Issuer"],
                audience: _configuration["Jwt:Audience"],
                claims: claims,
                expires: DateTime.Now.AddMinutes(Convert.ToDouble(_configuration["Jwt:ExpireMinutes"])),
                signingCredentials: credentials
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}