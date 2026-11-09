using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using AspenLead.Api;

var builder = WebApplication.CreateBuilder(args);
var adminPassword = builder.Configuration["ADMIN_PASSWORD"];
if (string.IsNullOrWhiteSpace(adminPassword) || adminPassword.Length < 16 || adminPassword == "change-this-before-running")
    throw new InvalidOperationException("ADMIN_PASSWORD must be a unique secret of at least 16 characters");
var keyDirectory = builder.Configuration["KEY_STORAGE_PATH"];
if (!string.IsNullOrWhiteSpace(keyDirectory)) {
    Directory.CreateDirectory(keyDirectory);
    builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(keyDirectory));
}
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options => {
        options.Cookie.Name = "leadflow_session";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.ExpireTimeSpan = TimeSpan.FromHours(4);
        options.SlidingExpiration = false;
        options.Events.OnRedirectToLogin = context => {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context => {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options => {
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("login", httpContext => RateLimitPartition.GetFixedWindowLimiter(
        httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions {
            PermitLimit = 5, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true
        }));
});
builder.Services.AddDbContext<LeadDb>(options => {
    var sqlServer = builder.Configuration.GetConnectionString("SqlServer");
    if (!string.IsNullOrEmpty(sqlServer)) options.UseSqlServer(sqlServer);
    else options.UseSqlite(builder.Configuration.GetConnectionString("Sqlite") ?? "Data Source=leads.db");
});
builder.Services.AddHttpClient("qualifier", c => {
    c.BaseAddress = new Uri(builder.Configuration["AI_SERVICE_URL"] ?? "http://localhost:8001");
    c.Timeout = TimeSpan.FromSeconds(3);
});
builder.Services.AddCors(o => o.AddPolicy("frontend", p => p.WithOrigins(
    builder.Configuration["FRONTEND_ORIGIN"] ?? "http://localhost:5173").AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();
app.UseRouting();
app.UseCors("frontend");
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.Use(async (context, next) => {
    if (context.Request.Method is not ("GET" or "HEAD" or "OPTIONS") &&
        context.Request.Path.StartsWithSegments("/api") ||
        context.Request.Method is not ("GET" or "HEAD" or "OPTIONS") &&
        (context.Request.Path == "/auth/logout" || context.Request.Path == "/auth/login")) {
        var origin = context.Request.Headers.Origin.ToString();
        if (!string.IsNullOrEmpty(origin)) {
            var configuredOrigin = builder.Configuration["FRONTEND_ORIGIN"] ?? "http://localhost:5173";
            var requestOrigin = $"{context.Request.Scheme}://{context.Request.Host}";
            if (!string.Equals(origin, configuredOrigin, StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(origin, requestOrigin, StringComparison.OrdinalIgnoreCase)) {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return;
            }
        }
    }
    await next();
});
if (app.Environment.IsDevelopment()) {
    app.UseSwagger();
    app.UseSwaggerUI();
}
using (var scope = app.Services.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<LeadDb>();
    db.Database.EnsureCreated();
    if (db.Database.IsSqlite()) {
        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS ConversationMessages (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                LeadId INTEGER NOT NULL,
                Direction TEXT NOT NULL,
                Body TEXT NOT NULL,
                DeliveryStatus TEXT NOT NULL,
                CreatedAt TEXT NOT NULL,
                FOREIGN KEY (LeadId) REFERENCES Leads(Id) ON DELETE CASCADE
            );
            """);
        db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS IX_ConversationMessages_LeadId_CreatedAt ON ConversationMessages(LeadId, CreatedAt);");
    } else if (db.Database.IsSqlServer()) {
        db.Database.ExecuteSqlRaw("""
            IF OBJECT_ID(N'dbo.ConversationMessages', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.ConversationMessages (
                    Id int IDENTITY(1,1) PRIMARY KEY,
                    LeadId int NOT NULL REFERENCES dbo.Leads(Id) ON DELETE CASCADE,
                    Direction nvarchar(20) NOT NULL,
                    Body nvarchar(5000) NOT NULL,
                    DeliveryStatus nvarchar(40) NOT NULL,
                    CreatedAt datetimeoffset NOT NULL
                );
                CREATE INDEX IX_ConversationMessages_LeadId_CreatedAt ON dbo.ConversationMessages(LeadId, CreatedAt);
            END
            """);
    }
}
app.MapPost("/auth/login", async (LoginRequest request, HttpContext context) => {
    var supplied = SHA256.HashData(Encoding.UTF8.GetBytes(request.Password ?? ""));
    var expected = SHA256.HashData(Encoding.UTF8.GetBytes(adminPassword));
    if (!CryptographicOperations.FixedTimeEquals(supplied, expected))
        return Results.Unauthorized();
    var principal = new ClaimsPrincipal(new ClaimsIdentity(
        [new Claim(ClaimTypes.Name, "demo-admin"), new Claim(ClaimTypes.Role, "admin")],
        CookieAuthenticationDefaults.AuthenticationScheme));
    await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal);
    return Results.Ok(new { authenticated = true, user = "demo-admin" });
}).RequireRateLimiting("login");
app.MapGet("/auth/me", (ClaimsPrincipal principal) => principal.Identity?.IsAuthenticated == true
    ? Results.Ok(new { authenticated = true, user = principal.Identity.Name })
    : Results.Unauthorized());
app.MapPost("/auth/logout", async (HttpContext context) => {
    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.Ok(new { authenticated = false });
});
app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "lead-api" }));
var api = app.MapGroup("/api").RequireAuthorization();

api.MapGet("/leads", async (LeadDb db) => {
    var leads = await db.Leads.AsNoTracking().ToListAsync();
    return Results.Ok(leads.OrderByDescending(l => l.CreatedAt).ToList());
});

api.MapGet("/leads/{id:int}", async (int id, LeadDb db) =>
    await db.Leads.AsNoTracking().FirstOrDefaultAsync(l => l.Id == id) is { } lead
        ? Results.Ok(lead) : Results.NotFound());

api.MapPost("/leads", async (CreateLead request, LeadDb db, IHttpClientFactory clients, CancellationToken ct) => {
    if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Email)
        || !System.Net.Mail.MailAddress.TryCreate(request.Email, out _))
        return Results.BadRequest(new { error = "Valid name and email required" });
    var lead = new Lead { Name = request.Name.Trim(), Email = request.Email.Trim(),
        Source = string.IsNullOrWhiteSpace(request.Source) ? "website" : request.Source.Trim(),
        Message = request.Message?.Trim() ?? "", CreatedAt = DateTimeOffset.UtcNow };
    try {
        using var response = await clients.CreateClient("qualifier").PostAsJsonAsync("/qualify",
            new { message = lead.Message, source = lead.Source }, ct);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<Qualification>(cancellationToken: ct);
        lead.Score = Math.Clamp(result?.Score ?? 0, 0, 100);
        lead.Reason = result?.Reason ?? "unknown";
    } catch (HttpRequestException) { lead.Score = 10; lead.Reason = "AI service unavailable; manual review"; }
      catch (TaskCanceledException) when (!ct.IsCancellationRequested) { lead.Score = 10; lead.Reason = "AI service timeout; manual review"; }
    lead.Status = lead.Score >= 60 ? "qualified" : "new";
    db.Leads.Add(lead); await db.SaveChangesAsync(ct);
    return Results.Created($"/api/leads/{lead.Id}", lead);
});

api.MapPatch("/leads/{id:int}/status", async (int id, UpdateLeadStatus request, LeadDb db, CancellationToken ct) => {
    var status = request.Status?.Trim().ToLowerInvariant();
    if (status is not ("new" or "qualified" or "contacted" or "converted" or "lost"))
        return Results.BadRequest(new { error = "Status must be new, qualified, contacted, converted, or lost" });
    var lead = await db.Leads.FindAsync([id], ct);
    if (lead is null) return Results.NotFound();
    lead.Status = status;
    await db.SaveChangesAsync(ct);
    return Results.Ok(lead);
});

api.MapPost("/leads/{id:int}/followups", async (int id, FollowupRequest request, LeadDb db, CancellationToken ct) => {
    var lead = await db.Leads.FindAsync([id], ct);
    if (lead is null) return Results.NotFound();
    if (request.ScheduledAt <= DateTimeOffset.UtcNow) return Results.BadRequest(new { error = "Schedule in the future" });
    if (string.IsNullOrWhiteSpace(request.Body)) return Results.BadRequest(new { error = "Message required" });
    var followup = new Followup { LeadId = id, ScheduledAt = request.ScheduledAt,
        Body = request.Body.Trim(), Status = "scheduled" };
    db.Followups.Add(followup); await db.SaveChangesAsync(ct);
    return Results.Created($"/api/leads/{id}/followups/{followup.Id}", followup);
});
api.MapGet("/leads/{id:int}/followups", async (int id, LeadDb db) => {
    var followups = await db.Followups.AsNoTracking().Where(x => x.LeadId == id).ToListAsync();
    return Results.Ok(followups.OrderBy(x => x.ScheduledAt).ToList());
});


api.MapGet("/leads/{id:int}/messages", async (int id, LeadDb db, CancellationToken ct) => {
    if (!await db.Leads.AnyAsync(l => l.Id == id, ct)) return Results.NotFound();
    var messages = await db.ConversationMessages.AsNoTracking().Where(x => x.LeadId == id).ToListAsync(ct);
    return Results.Ok(messages.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).ToList());
});

api.MapPost("/leads/{id:int}/messages", async (int id, CreateConversationMessage request, LeadDb db, CancellationToken ct) => {
    if (!await db.Leads.AnyAsync(l => l.Id == id, ct)) return Results.NotFound();
    var direction = request.Direction?.Trim().ToLowerInvariant();
    if (direction is not ("inbound" or "outbound")) return Results.BadRequest(new { error = "Direction must be inbound or outbound" });
    if (string.IsNullOrWhiteSpace(request.Body) || request.Body.Length > 5000)
        return Results.BadRequest(new { error = "Message must contain 1–5000 characters" });
    var message = new ConversationMessage { LeadId = id, Direction = direction, Body = request.Body.Trim(),
        DeliveryStatus = direction == "outbound" ? "draft" : "recorded", CreatedAt = DateTimeOffset.UtcNow };
    db.ConversationMessages.Add(message);
    await db.SaveChangesAsync(ct);
    return Results.Created($"/api/leads/{id}/messages/{message.Id}", message);
});

api.MapPost("/leads/{id:int}/suggest", async (int id, LeadDb db, IHttpClientFactory clients, CancellationToken ct) => {
    var lead = await db.Leads.AsNoTracking().FirstOrDefaultAsync(l => l.Id == id, ct);
    if (lead is null) return Results.NotFound();
    var recent = await db.ConversationMessages.AsNoTracking().Where(m => m.LeadId == id).ToListAsync(ct);
    var history = recent.OrderByDescending(m => m.CreatedAt).Take(6).Reverse()
        .Select(m => new { direction = m.Direction, body = m.Body }).ToArray();
    try {
        using var response = await clients.CreateClient("qualifier").PostAsJsonAsync("/suggest", new {
            name = lead.Name, status = lead.Status, score = lead.Score,
            message = lead.Message, history
        }, ct);
        response.EnsureSuccessStatusCode();
        var suggestion = await response.Content.ReadFromJsonAsync<SuggestionResult>(cancellationToken: ct);
        return suggestion is null ? Results.Problem("Suggestion service returned no data", statusCode: 502) : Results.Ok(suggestion);
    } catch (HttpRequestException) {
        return Results.Problem("Suggestion service unavailable", statusCode: 503);
    } catch (TaskCanceledException) when (!ct.IsCancellationRequested) {
        return Results.Problem("Suggestion service timed out", statusCode: 504);
    }
});

api.MapPost("/leads/{id:int}/automation/preview", async (int id, AutomationRequest request, LeadDb db, CancellationToken ct) => {
    var lead = await db.Leads.AsNoTracking().FirstOrDefaultAsync(l => l.Id == id, ct);
    if (lead is null) return Results.NotFound();
    if (request.DelayHours is < 1 or > 720) return Results.BadRequest(new { error = "Delay must be 1–720 hours" });
    if (lead.Status is "converted" or "lost") return Results.BadRequest(new { error = "Closed leads cannot be automatically followed up" });
    return Results.Ok(new { leadId = id, scheduledAt = DateTimeOffset.UtcNow.AddHours(request.DelayHours),
        body = $"Hi {lead.Name}, thanks for your interest. Would you like to arrange a quick consultation?",
        mode = "preview_only", sendsExternally = false });
});

api.MapPost("/leads/{id:int}/automation/apply", async (int id, AutomationRequest request, LeadDb db, CancellationToken ct) => {
    var lead = await db.Leads.FirstOrDefaultAsync(l => l.Id == id, ct);
    if (lead is null) return Results.NotFound();
    if (request.DelayHours is < 1 or > 720) return Results.BadRequest(new { error = "Delay must be 1–720 hours" });
    if (lead.Status is "converted" or "lost") return Results.BadRequest(new { error = "Closed leads cannot be automatically followed up" });
    var body = $"Hi {lead.Name}, thanks for your interest. Would you like to arrange a quick consultation?";
    var existing = await db.Followups.AsNoTracking().Where(f => f.LeadId == id && f.Status == "scheduled" && f.Body == body).ToListAsync(ct);
    if (existing.Any(f => f.ScheduledAt > DateTimeOffset.UtcNow))
        return Results.Conflict(new { error = "An active automatic follow-up already exists for this lead" });
    var followup = new Followup { LeadId = id, ScheduledAt = DateTimeOffset.UtcNow.AddHours(request.DelayHours), Body = body, Status = "scheduled" };
    db.Followups.Add(followup);
    await db.SaveChangesAsync(ct);
    return Results.Created($"/api/leads/{id}/followups/{followup.Id}", followup);
});

app.Run();
public partial class Program { }
