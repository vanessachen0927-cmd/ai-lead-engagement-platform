using Microsoft.EntityFrameworkCore;
namespace AspenLead.Api;

public sealed class Lead {
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Source { get; set; } = "website";
    public string Message { get; set; } = "";
    public int Score { get; set; }
    public string Reason { get; set; } = "";
    public string Status { get; set; } = "new";
    public DateTimeOffset CreatedAt { get; set; }
}
public sealed class Followup {
    public int Id { get; set; }
    public int LeadId { get; set; }
    public Lead? Lead { get; set; }
    public string Body { get; set; } = "";
    public string Status { get; set; } = "scheduled";
    public DateTimeOffset ScheduledAt { get; set; }
}
public record CreateLead(string Name, string Email, string Source, string? Message);
public record FollowupRequest(DateTimeOffset ScheduledAt, string Body);
public record Qualification(int Score, string Reason);
public class LeadDb(DbContextOptions<LeadDb> options) : DbContext(options) {
    public DbSet<Lead> Leads => Set<Lead>();
    public DbSet<Followup> Followups => Set<Followup>();
    public DbSet<ConversationMessage> ConversationMessages => Set<ConversationMessage>();
    protected override void OnModelCreating(ModelBuilder model) {
        model.Entity<Lead>().HasIndex(x => x.Email);
        model.Entity<ConversationMessage>().HasIndex(x => new { x.LeadId, x.CreatedAt });
        model.Entity<ConversationMessage>().Property(x => x.Body).HasMaxLength(5000);
        model.Entity<Lead>().Property(x => x.Name).HasMaxLength(160);
        model.Entity<Lead>().Property(x => x.Email).HasMaxLength(320);
        model.Entity<Followup>().HasOne(x => x.Lead).WithMany().HasForeignKey(x => x.LeadId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public record UpdateLeadStatus(string? Status);

public sealed class ConversationMessage {
    public int Id { get; set; }
    public int LeadId { get; set; }
    public string Direction { get; set; } = "inbound";
    public string Body { get; set; } = "";
    public string DeliveryStatus { get; set; } = "recorded";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public record CreateConversationMessage(string Direction, string Body);
public record AutomationRequest(int DelayHours = 24);
public record SuggestionResult(string Suggestion, string Reason, string Mode);

public record LoginRequest(string? Password);
