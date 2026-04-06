$ErrorActionPreference = "Stop"
$root = "c:\Users\hp\OneDrive\Desktop\WEB dev\projects\Metaverse\frontend\public\assets"
$tmxPath = Join-Path $root "maps\PixelOfficeMap.tmx"
$outPath = Join-Path $root "maps\PixelOfficeMap.json"
[xml]$tmx = Get-Content -Raw $tmxPath

function Get-AttrInt($node, $name, $default = 0) {
  $v = $node.GetAttribute($name)
  if ([string]::IsNullOrWhiteSpace($v)) { return $default }
  return [int]([double]$v)
}

function Get-AttrNum($node, $name, $default = 0.0) {
  $v = $node.GetAttribute($name)
  if ([string]::IsNullOrWhiteSpace($v)) { return $default }
  return [double]$v
}

function Parse-Tsx($tsxPath, $firstGid) {
  [xml]$tsx = Get-Content -Raw $tsxPath
  $ts = $tsx.tileset
  $img = $ts.image
  $imgSource = [System.IO.Path]::GetFileNameWithoutExtension($img.source) + ".png"
  return [ordered]@{
    firstgid   = [int]$firstGid
    columns    = Get-AttrInt $ts "columns"
    image      = "../tiles/$imgSource"
    imagewidth = Get-AttrInt $img "width"
    imageheight= Get-AttrInt $img "height"
    margin     = 0
    name       = $ts.GetAttribute("name")
    spacing    = 0
    tilecount  = Get-AttrInt $ts "tilecount"
    tilewidth  = Get-AttrInt $ts "tilewidth"
    tileheight = Get-AttrInt $ts "tileheight"
  }
}

$tilesets = @()
foreach ($ts in $tmx.map.tileset) {
  $firstGid = Get-AttrInt $ts "firstgid"
  $source = $ts.GetAttribute("source")
  if (-not [string]::IsNullOrWhiteSpace($source)) {
    $base = [System.IO.Path]::GetFileName($source)
    $tsxLocal = Join-Path $root ("tiles\\$base")
    if (Test-Path $tsxLocal) {
      $tilesets += Parse-Tsx $tsxLocal $firstGid
    } else {
      $tilesets += [ordered]@{ firstgid = $firstGid; source = $source }
    }
    continue
  }

  $img = $ts.image
  $imgSource = [System.IO.Path]::GetFileNameWithoutExtension($img.source) + ".png"
  $tilesets += [ordered]@{
    firstgid   = $firstGid
    columns    = Get-AttrInt $ts "columns"
    image      = "../tiles/$imgSource"
    imagewidth = Get-AttrInt $img "width"
    imageheight= Get-AttrInt $img "height"
    margin     = 0
    name       = $ts.GetAttribute("name")
    spacing    = 0
    tilecount  = Get-AttrInt $ts "tilecount"
    tilewidth  = Get-AttrInt $ts "tilewidth"
    tileheight = Get-AttrInt $ts "tileheight"
  }
}

$layers = @()
foreach ($layer in $tmx.map.layer) {
  $csv = ($layer.data."#text" | Out-String).Trim()
  $data = @()
  if (-not [string]::IsNullOrWhiteSpace($csv)) {
    $data = $csv -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" } | ForEach-Object { [int]$_ }
  }

  $properties = @()
  if ($layer.properties -and $layer.properties.property) {
    foreach ($p in $layer.properties.property) {
      $raw = $p.GetAttribute("value")
      $isBool = $raw -eq "true" -or $raw -eq "false"
      $properties += [ordered]@{
        name  = $p.GetAttribute("name")
        type  = $(if ($isBool) { "bool" } else { "string" })
        value = $(if ($isBool) { [bool]::Parse($raw) } else { $raw })
      }
    }
  }

  $entry = [ordered]@{
    id      = Get-AttrInt $layer "id"
    name    = $layer.GetAttribute("name")
    type    = "tilelayer"
    x       = 0
    y       = 0
    width   = Get-AttrInt $layer "width"
    height  = Get-AttrInt $layer "height"
    opacity = 1
    visible = $true
    data    = $data
  }
  if ($properties.Count -gt 0) { $entry.properties = $properties }
  $layers += $entry
}

foreach ($og in $tmx.map.objectgroup) {
  $objects = @()
  foreach ($o in $og.object) {
    $objects += [ordered]@{
      id       = Get-AttrInt $o "id"
      name     = $o.GetAttribute("name")
      type     = "object"
      x        = Get-AttrNum $o "x"
      y        = Get-AttrNum $o "y"
      width    = Get-AttrNum $o "width"
      height   = Get-AttrNum $o "height"
      rotation = 0
      visible  = $true
    }
  }

  $layers += [ordered]@{
    id         = Get-AttrInt $og "id"
    name       = $og.GetAttribute("name")
    type       = "objectgroup"
    draworder  = "topdown"
    opacity    = 1
    visible    = $true
    x          = 0
    y          = 0
    objects    = $objects
  }
}

$map = $tmx.map
$jsonObj = [ordered]@{
  compressionlevel = -1
  height           = Get-AttrInt $map "height"
  width            = Get-AttrInt $map "width"
  infinite         = (Get-AttrInt $map "infinite") -eq 1
  layers           = $layers
  nextlayerid      = Get-AttrInt $map "nextlayerid"
  nextobjectid     = Get-AttrInt $map "nextobjectid"
  orientation      = $map.GetAttribute("orientation")
  renderorder      = $map.GetAttribute("renderorder")
  tiledversion     = $map.GetAttribute("tiledversion")
  tilewidth        = Get-AttrInt $map "tilewidth"
  tileheight       = Get-AttrInt $map "tileheight"
  type             = "map"
  version          = [double]($map.GetAttribute("version"))
  tilesets         = $tilesets
}

($jsonObj | ConvertTo-Json -Depth 100) | Set-Content -Encoding UTF8 $outPath
Write-Host "Converted TMX to JSON at $outPath"
