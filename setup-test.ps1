$pw = "Tecnopova5pro"

$base = "http://localhost:3000"
$json = "application/json"
$admin = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# 1. Log in
$lb = @{ password = $pw } | ConvertTo-Json
Invoke-RestMethod "$base/api/auth/admin-login" -Method Post -WebSession $admin -ContentType $json -Body $lb

# 2. Create the election
$eb = @{
  title = "Student Council 2026"
  description = "Test election"
  theme = @{ primary = "#1e66f5"; accent = "#f5a623"; logo = "" }
} | ConvertTo-Json -Depth 5
$e = Invoke-RestMethod "$base/api/admin/elections" -Method Post -WebSession $admin -ContentType $json -Body $eb
Write-Host "Election ID: $($e.id)"

# 3. Positions
$pb1 = @{ title = "President"; sort_order = 1 } | ConvertTo-Json
$pb2 = @{ title = "Treasurer"; sort_order = 2 } | ConvertTo-Json
$pres  = Invoke-RestMethod "$base/api/admin/elections/$($e.id)/positions" -Method Post -WebSession $admin -ContentType $json -Body $pb1
$treas = Invoke-RestMethod "$base/api/admin/elections/$($e.id)/positions" -Method Post -WebSession $admin -ContentType $json -Body $pb2

# 4. Candidates
function Add-Cand($posId, $name, $grade) {
  $b = @{ name = $name; grade_section = $grade; bio = "Test bio for $name" } | ConvertTo-Json
  Invoke-RestMethod "$base/api/admin/positions/$posId/candidates" -Method Post -WebSession $admin -ContentType $json -Body $b | Out-Null
}
Add-Cand $pres.id  "Alice Reyes" "Grade 12-A"
Add-Cand $pres.id  "Ben Santos"  "Grade 11-B"
Add-Cand $pres.id  "Carla Cruz"  "Grade 12-C"
Add-Cand $treas.id "Dan Lim"     "Grade 11-A"
Add-Cand $treas.id "Ella Tan"    "Grade 12-B"
Add-Cand $treas.id "Finn Go"     "Grade 10-A"

# 5. Five test students
$students = 1..5 | ForEach-Object { @{ studentId = "S00$_"; fullName = "Test Student $_" } }
$sb = @{ students = $students } | ConvertTo-Json -Depth 5
$codes = Invoke-RestMethod "$base/api/admin/elections/$($e.id)/voters" -Method Post -WebSession $admin -ContentType $json -Body $sb
$codes | Format-Table
$codes | Export-Csv codes.csv -NoTypeInformation

# 6. Open the election
$ob = @{ status = "open" } | ConvertTo-Json
Invoke-RestMethod "$base/api/admin/elections/$($e.id)" -Method Patch -WebSession $admin -ContentType $json -Body $ob | Out-Null
Write-Host "Election is open. Codes saved to codes.csv"