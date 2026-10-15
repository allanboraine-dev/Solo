Add-Type -AssemblyName System.Drawing

function Draw-SoloIcon {
    param(
        [int]$Size,
        [string]$FilePath,
        [string]$AccentColorHex,
        [string]$BadgeText = "",
        [bool]$IsMaskable = $false
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Background
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#09090b'))
    $g.FillRectangle($bgBrush, 0, 0, $Size, $Size)

    $scale = $Size / 512.0
    $margin = if ($IsMaskable) { 65.0 * $scale } else { 25.0 * $scale }
    $innerSize = $Size - ($margin * 2)

    # Accent ring / circle
    $accentColor = [System.Drawing.ColorTranslator]::FromHtml($AccentColorHex)
    $ringPen = New-Object System.Drawing.Pen($accentColor, (10.0 * $scale))
    $rect = New-Object System.Drawing.RectangleF($margin, $margin, $innerSize, $innerSize)
    $g.DrawEllipse($ringPen, $rect)

    # Gradient-like inner circle
    $centerMargin = $margin + (24.0 * $scale)
    $centerSize = $innerSize - (48.0 * $scale)
    $centerRect = New-Object System.Drawing.RectangleF($centerMargin, $centerMargin, $centerSize, $centerSize)
    $fillColor = [System.Drawing.Color]::FromArgb(35, $accentColor.R, $accentColor.G, $accentColor.B)
    $fillBrush = New-Object System.Drawing.SolidBrush($fillColor)
    $g.FillEllipse($fillBrush, $centerRect)

    # Draw SOLO Navigation Chevron / Arrow
    $arrowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $cx = $Size / 2.0
    $cy = ($Size / 2.0) - (20.0 * $scale)

    $p1 = New-Object System.Drawing.PointF($cx, ($cy - (65.0 * $scale)))
    $p2 = New-Object System.Drawing.PointF(($cx + (55.0 * $scale)), ($cy + (50.0 * $scale)))
    $p3 = New-Object System.Drawing.PointF($cx, ($cy + (20.0 * $scale)))
    $p4 = New-Object System.Drawing.PointF(($cx - (55.0 * $scale)), ($cy + (50.0 * $scale)))
    $points = [System.Drawing.PointF[]]@($p1, $p2, $p3, $p4)
    $g.FillPolygon($arrowBrush, $points)

    # Inner accent polygon highlight
    $accentBrush = New-Object System.Drawing.SolidBrush($accentColor)
    $ap1 = New-Object System.Drawing.PointF($cx, ($cy - (38.0 * $scale)))
    $ap2 = New-Object System.Drawing.PointF(($cx + (32.0 * $scale)), ($cy + (35.0 * $scale)))
    $ap3 = New-Object System.Drawing.PointF($cx, ($cy + (16.0 * $scale)))
    $accentPoints = [System.Drawing.PointF[]]@($ap1, $ap2, $ap3)
    $g.FillPolygon($accentBrush, $accentPoints)

    # Text 'SOLO'
    $fontFamily = [System.Drawing.FontFamily]::GenericSansSerif
    $fontSize = 44.0 * $scale
    $font = New-Object System.Drawing.Font($fontFamily, $fontSize, [System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center

    $textY = $cy + (90.0 * $scale)
    $textRect = New-Object System.Drawing.RectangleF(0, $textY, $Size, (60.0 * $scale))
    $g.DrawString('SOLO', $font, $textBrush, $textRect, $sf)

    # Optional Sub-Badge (e.g. 'DRIVER' or 'RIDER')
    if ($BadgeText -ne "") {
        $badgeFontSize = 18.0 * $scale
        $badgeFont = New-Object System.Drawing.Font($fontFamily, $badgeFontSize, [System.Drawing.FontStyle]::Bold)
        $badgeBrush = New-Object System.Drawing.SolidBrush($accentColor)
        $badgeY = $textY + (48.0 * $scale)
        $badgeRect = New-Object System.Drawing.RectangleF(0, $badgeY, $Size, (30.0 * $scale))
        $g.DrawString($BadgeText, $badgeFont, $badgeBrush, $badgeRect, $sf)
        $badgeFont.Dispose()
        $badgeBrush.Dispose()
    }

    # Save
    $dir = [System.IO.Path]::GetDirectoryName($FilePath)
    if ($dir -and (-not (Test-Path $dir))) { New-Item -ItemType Directory -Path $dir | Out-Null }
    $bmp.Save($FilePath, [System.Drawing.Imaging.ImageFormat]::Png)

    # Cleanup
    $font.Dispose()
    $textBrush.Dispose()
    $arrowBrush.Dispose()
    $accentBrush.Dispose()
    $fillBrush.Dispose()
    $ringPen.Dispose()
    $bgBrush.Dispose()
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Generated: $FilePath ($Size x $Size)"
}

# 1. Main SOLO Icons
Draw-SoloIcon -Size 192 -FilePath 'public\icon-192.png' -AccentColorHex '#3b82f6'
Draw-SoloIcon -Size 512 -FilePath 'public\icon-512.png' -AccentColorHex '#3b82f6'
Draw-SoloIcon -Size 512 -FilePath 'public\icon-maskable.png' -AccentColorHex '#3b82f6' -IsMaskable $true
Draw-SoloIcon -Size 180 -FilePath 'public\apple-touch-icon.png' -AccentColorHex '#3b82f6'

# 2. Driver-Specific Icons (Green Accent #22c55e)
Draw-SoloIcon -Size 192 -FilePath 'public\driver-icon-192.png' -AccentColorHex '#22c55e' -BadgeText 'DRIVER'
Draw-SoloIcon -Size 512 -FilePath 'public\driver-icon-512.png' -AccentColorHex '#22c55e' -BadgeText 'DRIVER'

# 3. Rider-Specific Icons (Blue Accent #3b82f6)
Draw-SoloIcon -Size 192 -FilePath 'public\rider-icon-192.png' -AccentColorHex '#3b82f6' -BadgeText 'RIDER'
Draw-SoloIcon -Size 512 -FilePath 'public\rider-icon-512.png' -AccentColorHex '#3b82f6' -BadgeText 'RIDER'
