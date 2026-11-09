FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY AspenLead.Api/*.csproj AspenLead.Api/
RUN dotnet restore AspenLead.Api/AspenLead.Api.csproj
COPY AspenLead.Api/ AspenLead.Api/
RUN dotnet publish AspenLead.Api/AspenLead.Api.csproj -c Release -o /out --no-restore
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "AspenLead.Api.dll"]
