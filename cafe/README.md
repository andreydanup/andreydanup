# Moth & Moka: interactive 3D café site

A landing page for a fictional late-night coffee bar. All 3D objects are built in code with Three.js (r128), so there are no model files.

## Interactive pieces
- **Latte cup (hero):** drag to spin it. Tap it, or press Enter, to pour new latte art (rosetta, heart or tulip). Steam rises from the cup.
- **Build a drink:** a 3D glass fills layer by layer as you pick a classic (espresso, cortado, flat white, latte, cappuccino, americano, iced latte) or adjust shots, milk, foam, hot water, syrup and ice.
  - The ticket shows the drink name, price, caffeine (63 mg per shot) and ratio.
  - The glass holds 360 ml and won't overflow.
  - "Stir it" blends the layers into one colour.
- **Roast lab:** drag the temperature from 150 °C to 240 °C, or run a full roast, and watch the beans change from green to dark. Beans jump at first crack (196 °C) and second crack (224 °C), and the tasting notes update for each stage.
- Menu, opening hours and address.

## Run locally
```bash
cd cafe
python3 -m http.server 8000
# open http://localhost:8000
```

## Files
- `index.html`: page structure and copy
- `style.css`: night-café styling
- `app.js`: the three Three.js scenes plus the drink builder and roast logic
