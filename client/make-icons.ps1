# Draws the app icons in client/public: an indigo square with a white hiragana "o".
# Only needed again if the design changes. On Windows:  powershell -ExecutionPolicy Bypass -File client/make-icons.ps1

Add-Type -AssemblyName System.Drawing

$indigo = [Drawing.ColorTranslator]::FromHtml('#264d73') # --accent in styles.css
$letter = [string][char]0x304A # the letter as a number, so the encoding of this file doesn't matter
$font = New-Object Drawing.FontFamily 'Yu Gothic UI'

# $part = how much of the square the letter fills
function New-Icon($file, $size, $part) {
  $image = New-Object Drawing.Bitmap $size, $size
  $canvas = [Drawing.Graphics]::FromImage($image)
  $canvas.SmoothingMode = 'AntiAlias'
  $canvas.Clear($indigo)

  # The letter as a shape, so that it can be scaled and centered exactly.
  $shape = New-Object Drawing.Drawing2D.GraphicsPath
  $shape.AddString($letter, $font, [int][Drawing.FontStyle]::Bold, 100, (New-Object Drawing.PointF 0, 0), [Drawing.StringFormat]::GenericTypographic)
  $box = $shape.GetBounds()
  $scale = $size * $part / [Math]::Max($box.Width, $box.Height)
  $place = New-Object Drawing.Drawing2D.Matrix
  $place.Translate($size / 2, $size / 2)
  $place.Scale($scale, $scale)
  $place.Translate(-($box.X + $box.Width / 2), -($box.Y + $box.Height / 2))
  $shape.Transform($place)
  $canvas.FillPath([Drawing.Brushes]::White, $shape)

  $image.Save((Join-Path $PSScriptRoot "public\$file"), [Drawing.Imaging.ImageFormat]::Png)
}

New-Item -ItemType Directory -Force (Join-Path $PSScriptRoot 'public') | Out-Null
New-Icon 'icon-192.png' 192 0.62
New-Icon 'icon-512.png' 512 0.62
# Phones cut maskable icons into a circle or another shape: the letter stays away from the edge.
New-Icon 'icon-maskable-512.png' 512 0.46
