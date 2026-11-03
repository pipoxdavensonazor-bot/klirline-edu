#!/usr/bin/env python3
"""Régénère les icônes Android à partir des visuels déjà dans le dépôt.

Source du lanceur et de l'écran de démarrage : src/icon-512.png (N blanc sur fond marine).
Source de la bannière Play Console : src/noria-logo.png (mot-symbole).
Aucune image n'est dessinée à la main : on recadre et on redimensionne.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
APP_RES = Path(__file__).resolve().parents[1] / "app" / "src" / "main" / "res"
PLAY = Path(__file__).resolve().parents[1] / "play"

# Densités historiques (avant les icônes adaptatives, Android 7 et 7.1).
DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def main():
    icon = Image.open(ROOT / "src" / "icon-512.png").convert("RGBA")
    for folder, size in DENSITIES.items():
        out = APP_RES / folder
        out.mkdir(parents=True, exist_ok=True)
        icon.resize((size, size), Image.Resampling.LANCZOS).save(out / "ic_launcher.png")
    # Premier plan adaptatif : le carré complet. Le fond (colors.xml, iconBackground)
    # reprend le pixel du coin, donc le masque du lanceur ne laisse pas de liseré.
    fg = APP_RES / "drawable-nodpi"
    fg.mkdir(parents=True, exist_ok=True)
    icon.save(fg / "ic_launcher_foreground.png")
    icon.save(fg / "splash.png")

    PLAY.mkdir(parents=True, exist_ok=True)
    icon.save(PLAY / "icone-512.png")

    logo = Image.open(ROOT / "src" / "noria-logo.png").convert("RGBA")
    # Fond de page du manifeste web (#f3f2ef), pour une bannière lisible sur la fiche Play.
    banner = Image.new("RGBA", (1024, 500), (243, 242, 239, 255))
    scale = min(760 / logo.width, 280 / logo.height)
    resized = logo.resize((round(logo.width * scale), round(logo.height * scale)), Image.Resampling.LANCZOS)
    banner.alpha_composite(resized, ((1024 - resized.width) // 2, (500 - resized.height) // 2))
    banner.convert("RGB").save(PLAY / "banniere-1024x500.png", quality=95)
    corner = icon.getpixel((0, 0))
    print(f"fond icône #{corner[0]:02X}{corner[1]:02X}{corner[2]:02X}")


if __name__ == "__main__":
    main()
