namespace PantryManager.API.Models
{
    public class CreateUserRequest
    {
        public string Username { get; set; } = "";
        public string Password { get; set; } = "";
        public bool IsAdmin { get; set; }
    }
}
