# ===========================================================================
#  download-vendor.ps1  —  run ONCE on a machine WITH internet to make the app
#  fully offline. Fetches MediaPipe (model + wasm + bundle), Three.js, and an
#  Earth texture into ./vendor, ./models, ./textures.
#  AFTER running: set  export const OFFLINE = true;  in src/config.js
# ===========================================================================
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$MP = '0.10.35'
$THREE = '0.184.0'
$mpBase = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@$MP"
$threeBase = "https://cdn.jsdelivr.net/npm/three@$THREE"

function Get-File($url, $dest) {
  $dir = Split-Path -Parent $dest
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  Write-Host "  -> $dest"
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
}

Write-Host "Downloading MediaPipe Tasks Vision $MP ..."
Get-File "$mpBase/vision_bundle.mjs" "vendor/tasks-vision/vision_bundle.mjs"
Get-File "$mpBase/wasm/vision_wasm_internal.js" "vendor/tasks-vision/wasm/vision_wasm_internal.js"
Get-File "$mpBase/wasm/vision_wasm_internal.wasm" "vendor/tasks-vision/wasm/vision_wasm_internal.wasm"
Get-File "$mpBase/wasm/vision_wasm_nosimd_internal.js" "vendor/tasks-vision/wasm/vision_wasm_nosimd_internal.js"
Get-File "$mpBase/wasm/vision_wasm_nosimd_internal.wasm" "vendor/tasks-vision/wasm/vision_wasm_nosimd_internal.wasm"

Write-Host "Downloading hand_landmarker.task model ..."
Get-File "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task" "models/hand_landmarker.task"

Write-Host "Downloading Three.js $THREE ..."
Get-File "$threeBase/build/three.module.js" "vendor/three/build/three.module.js"
Get-File "$threeBase/build/three.core.js" "vendor/three/build/three.core.js"

Write-Host "Downloading Earth textures (three.js examples, public-domain NASA source) ..."
try {
  Get-File "$threeBase/examples/textures/planets/earth_atmos_2048.jpg" "textures/earth_day_2048.jpg"
  Get-File "$threeBase/examples/textures/planets/earth_specular_2048.jpg" "textures/earth_specular_2048.jpg"
  Get-File "$threeBase/examples/textures/planets/earth_clouds_1024.png" "textures/earth_clouds_1024.png"
} catch { Write-Host "  (textures optional — a procedural Earth is used if missing)" }

@"
Earth texture: earth_atmos_2048.jpg from the three.js examples
(https://github.com/mrdoob/three.js), built from public-domain NASA Blue Marble
imagery. three.js is MIT licensed. MediaPipe Tasks Vision is Apache-2.0.
"@ | Out-File -FilePath "ATTRIBUTION.txt" -Encoding utf8

Write-Host ""
Write-Host "Done. Now set  OFFLINE = true  in src/config.js, then verify with"
Write-Host "DevTools -> Network -> Offline that nothing loads cross-origin."
