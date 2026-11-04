#!/usr/bin/env python3
"""Régénère les icônes Android à partir du mot-symbole NORIA.

Source : src/noria-logo.png (mot-symbole + slogan, fond transparent).
On ne garde que la bande « NORIA ». Le slogan (« Une école, une famille
et un avenir ») disparaît à la taille d'une icône.

Le fichier « blanc » joint à la demande est le même mot-symbole bleu posé
sur une plaque blanche, pas un glyphe clair. Le glyphe blanc est donc
dérivé ici : on garde l'alpha du logo et on peint les pixels en blanc.

Fond retenu : bleu marine #123048 (déjà iconBackground, favicon, ancien N).
À 48 px le blanc sur marine reste plus lisible que le bleu sur blanc :
les traits clairs tiennent, et le carré ne se fond pas dans un lanceur clair.

Zone sûre adaptative : cercle de 66 dp dans un calque de 108 dp. Le
rectangle du mot-symbole est inscrit dans ce cercle (marge comprise).
Les mipmap historiques (Android 7) et la fiche Play n'ont pas ce calque :
le mot-symbole y est inscrit dans le cercle du carré, pour rester lisible
de 48 à 192 px.
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

# Bleu marine du favicon et de l'ancien N (src/favicon.svg, colors.xml).
NAVY = (0x12, 0x30, 0x48, 255)

# Marge à l'intérieur du cercle, pour que l'anticrénelage ne touche pas le masque.
SAFE_MARGIN = 0.96


def wordmark():
    """Bande NORIA seule, glyphe blanc, alpha d'origine."""
    logo = Image.open(ROOT / "src" / "noria-logo.png").convert("RGBA")
    # Le slogan commence vers y=96 (fichier 253×136). On coupe avant.
    band = logo.crop((0, 0, logo.width, 90))
    alpha = band.getchannel("A")
    bbox = alpha.point(lambda p: 255 if p > 20 else 0).getbbox()
    if bbox is None:
        raise SystemExit("mot-symbole introuvable dans src/noria-logo.png")
    cropped = band.crop(bbox)
    white = Image.new("RGBA", cropped.size, (255, 255, 255, 0))
    white.putalpha(cropped.getchannel("A"))
    return white


def max_width_fraction(aspect, diameter_fraction):
    """Plus grande largeur d'un rectangle (aspect largeur/hauteur) inscrit dans un cercle."""
    radius = diameter_fraction / 2
    return (2 * radius / (1 + 1 / aspect**2) ** 0.5) * SAFE_MARGIN


def compose(size, mark, width_fraction, background):
    canvas = Image.new("RGBA", (size, size), background)
    tw = max(1, round(size * width_fraction))
    th = max(1, round(tw * mark.height / mark.width))
    resized = mark.resize((tw, th), Image.Resampling.LANCZOS)
    canvas.alpha_composite(resized, ((size - tw) // 2, (size - th) // 2))
    return canvas


def save_png(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def main():
    mark = wordmark()
    aspect = mark.width / mark.height
    # Calque adaptatif : cercle de 66 dp sur 108. Mipmap et fiche Play :
    # cercle du carré lui-même (pas de calque élargi).
    adaptive_fraction = max_width_fraction(aspect, 66 / 108)
    legacy_fraction = max_width_fraction(aspect, 1.0)
    # Splash en ScaleType.CENTER, sans mise à l'échelle (drawable-nodpi).
    # Un écran étroit (~320 px) rogne une image de 512 px : le mot reste
    # dans la bande centrale.
    splash_fraction = min(legacy_fraction, 300 / 512)

    for folder, size in DENSITIES.items():
        icon = compose(size, mark, legacy_fraction, NAVY)
        save_png(icon, APP_RES / folder / "ic_launcher.png")

    # Premier plan adaptatif. 432 px = 108 dp × 4 (xxxhdpi). Fond transparent :
    # la couleur vient de colors.xml (iconBackground), donc le masque n'a pas de liseré.
    foreground = compose(432, mark, adaptive_fraction, (0, 0, 0, 0))
    save_png(foreground, APP_RES / "drawable-nodpi" / "ic_launcher_foreground.png")

    splash = compose(512, mark, splash_fraction, NAVY)
    save_png(splash, APP_RES / "drawable-nodpi" / "splash.png")

    PLAY.mkdir(parents=True, exist_ok=True)
    save_png(compose(512, mark, legacy_fraction, NAVY), PLAY / "icone-512.png")

    # Bannière Play : mot-symbole complet (avec slogan) sur le fond de page du manifeste web.
    logo = Image.open(ROOT / "src" / "noria-logo.png").convert("RGBA")
    banner = Image.new("RGBA", (1024, 500), (243, 242, 239, 255))
    scale = min(760 / logo.width, 280 / logo.height)
    resized = logo.resize(
        (round(logo.width * scale), round(logo.height * scale)),
        Image.Resampling.LANCZOS,
    )
    banner.alpha_composite(resized, ((1024 - resized.width) // 2, (500 - resized.height) // 2))
    # Même enregistrement qu'avant : ne pas changer l'encodage, la bannière ne bouge pas.
    banner.convert("RGB").save(PLAY / "banniere-1024x500.png", quality=95)

    print(f"mot-symbole {mark.width}×{mark.height} px")
    print(f"fond #123048")
    print(f"largeur adaptative {adaptive_fraction:.3f} du calque, historique {legacy_fraction:.3f}")


if __name__ == "__main__":
    main()
