$targetZip = 'C:\Users\ADITYA TIWARI\Downloads\Ashutosh_Umar_Science_Diagram_Maker.zip'
$stagingDir = 'C:\Users\ADITYA TIWARI\Downloads\staging_ashutosh_project'

if (Test-Path $stagingDir) { Remove-Item -Recurse -Force $stagingDir }
if (Test-Path $targetZip) { Remove-Item -Force $targetZip }

New-Item -ItemType Directory -Path $stagingDir | Out-Null

# Copy root files
$rootFiles = @('package.json', 'package-lock.json', 'index.html', 'README.md', 'results.json', '.env.example', '.gitignore', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js')
foreach ($f in $rootFiles) {
  if (Test-Path $f) { Copy-Item $f $stagingDir }
}

# Copy directories
$dirs = @('src', 'dist', 'scripts', 'tests', 'docs')
foreach ($d in $dirs) {
  if (Test-Path $d) { Copy-Item -Recurse $d (Join-Path $stagingDir $d) }
}

# Copy server directory selectively (exclude node_modules and secret .env)
$serverStaging = Join-Path $stagingDir 'server'
New-Item -ItemType Directory -Path $serverStaging | Out-Null

$serverFiles = @('package.json', 'package-lock.json', 'tsconfig.json', '.env.example')
foreach ($sf in $serverFiles) {
  $srcPath = Join-Path 'server' $sf
  if (Test-Path $srcPath) { Copy-Item $srcPath $serverStaging }
}

$serverDirs = @('src', 'tests', 'dist', 'data')
foreach ($sd in $serverDirs) {
  $srcPath = Join-Path 'server' $sd
  if (Test-Path $srcPath) { Copy-Item -Recurse $srcPath (Join-Path $serverStaging $sd) }
}

# Remove any test databases from staged server/data if present
Get-ChildItem -Path (Join-Path $serverStaging 'data') -Filter '*test*' | Remove-Item -Force -ErrorAction SilentlyContinue

# Create ZIP
Compress-Archive -Path (Join-Path $stagingDir '*') -DestinationPath $targetZip -CompressionLevel Optimal

# Copy also to workspace root for convenience
Copy-Item $targetZip 'C:\Users\ADITYA TIWARI\Downloads\ashutoshproject\Ashutosh_Umar_Science_Diagram_Maker.zip' -Force

# Clean staging directory
Remove-Item -Recurse -Force $stagingDir

Get-Item $targetZip | Select-Object Name, Length, LastWriteTime
